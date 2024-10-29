import { expect } from "chai"
import { ethers } from "hardhat"
import { Hamsterverse, MockERC20 } from "../typechain-types"
import { Signer } from "ethers"
import { ZeroAddress } from "ethers"
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers"

describe("Hamsterverse", function () {
    // Contract instances
    let nft: Hamsterverse
    let governanceToken: MockERC20

    // Signers
    let deployer: Signer
    let addr1: Signer
    let addr2: Signer
    let addr3: Signer

    // Constants
    const TEST_URI =
        "ipfs://bafkreiglxpmys7hxse45nd3ajnjzq2vjjevrlwjphtcco3pd53eq6zqu5i"
    const STAKE_AMOUNT = ethers.parseEther("200")
    const ADDITIONAL_STAKE = ethers.parseEther("100")
    const INITIAL_SUPPLY = ethers.parseEther("10000")
    const PARTIAL_WITHDRAW = ethers.parseEther("50")
    const TOTAL_NEEDED = STAKE_AMOUNT + ADDITIONAL_STAKE // Using BigInt addition

    async function deployContractFixture() {
        // Get signers
        ;[deployer, addr1, addr2, addr3] = await ethers.getSigners()

        // Deploy MockERC20
        const MockERC20Factory = await ethers.getContractFactory("MockERC20")
        governanceToken = await MockERC20Factory.deploy()
        await governanceToken.waitForDeployment()

        // Deploy Hamsterverse
        const HamsterverseFactory = await ethers.getContractFactory(
            "Hamsterverse"
        )
        nft = await HamsterverseFactory.deploy(
            await governanceToken.getAddress()
        )
        await nft.waitForDeployment()

        // Mint initial supply
        await governanceToken.mint(await deployer.getAddress(), INITIAL_SUPPLY)

        return { nft, governanceToken, deployer, addr1, addr2, addr3 }
    }

    beforeEach(async () => {
        const fixture = await loadFixture(deployContractFixture)
        nft = fixture.nft
        governanceToken = fixture.governanceToken
        deployer = fixture.deployer
        addr1 = fixture.addr1
        addr2 = fixture.addr2
        addr3 = fixture.addr3
    })

    describe("Deployment", function () {
        it("Should set the correct governance token address", async function () {
            expect(await nft.governanceToken()).to.equal(
                await governanceToken.getAddress()
            )
        })

        it("Should revert if deployed with zero address governance token", async function () {
            const HamsterverseFactory = await ethers.getContractFactory(
                "Hamsterverse"
            )
            await expect(
                HamsterverseFactory.deploy(ZeroAddress)
            ).to.be.revertedWith("Invalid governance token address")
        })
    })

    describe("Minting", function () {
        it("Should allow minting NFTs", async function () {
            await nft.safeMint(await addr1.getAddress(), TEST_URI)
            expect(await nft.ownerOf(0)).to.equal(await addr1.getAddress())
            expect(await nft.tokenURI(0)).to.equal(TEST_URI)
        })

        it("Should revert when minting to zero address", async function () {
            await expect(
                nft.safeMint(ZeroAddress, TEST_URI)
            ).to.be.revertedWith("Cannot mint to zero address")
        })

        it("Should increment token IDs correctly", async function () {
            await nft.safeMint(await addr1.getAddress(), TEST_URI)
            await nft.safeMint(await addr2.getAddress(), TEST_URI)
            expect(await nft.ownerOf(0)).to.equal(await addr1.getAddress())
            expect(await nft.ownerOf(1)).to.equal(await addr2.getAddress())
        })
    })

    describe("Staking", function () {
        beforeEach(async function () {
            // Mint NFT to addr1
            await nft.safeMint(await addr1.getAddress(), TEST_URI)
            // Transfer tokens to addr1
            await governanceToken.transfer(
                await addr1.getAddress(),
                TOTAL_NEEDED
            )
            // Approve NFT contract to spend tokens
            await governanceToken
                .connect(addr1)
                .approve(await nft.getAddress(), TOTAL_NEEDED)
        })

        it("Should allow initial staking of tokens", async function () {
            await nft.connect(addr1).stake(0, STAKE_AMOUNT)
            expect(await nft.stakedAmount(0)).to.equal(STAKE_AMOUNT)
        })

        it("Should allow additional staking of tokens", async function () {
            await nft.connect(addr1).stake(0, STAKE_AMOUNT)
            await nft.connect(addr1).stake(0, ADDITIONAL_STAKE)
            const expectedTotal = STAKE_AMOUNT + ADDITIONAL_STAKE
            expect(await nft.stakedAmount(0)).to.equal(expectedTotal)
        })

        it("Should emit Staked event", async function () {
            await expect(nft.connect(addr1).stake(0, STAKE_AMOUNT))
                .to.emit(nft, "Staked")
                .withArgs(0, await governanceToken.getAddress(), STAKE_AMOUNT)
        })

        it("Should revert if non-owner tries to stake", async function () {
            await expect(
                nft.connect(addr2).stake(0, STAKE_AMOUNT)
            ).to.be.revertedWith("Not token owner")
        })

        it("Should revert if trying to stake zero amount", async function () {
            await expect(nft.connect(addr1).stake(0, 0)).to.be.revertedWith(
                "Amount must be greater than 0"
            )
        })

        it("Should revert if trying to stake without sufficient balance", async function () {
            const largeAmount = ethers.parseEther("20000")
            await expect(nft.connect(addr1).stake(0, largeAmount)).to.be
                .reverted
        })
    })

    describe("Withdrawing", function () {
        beforeEach(async function () {
            // Setup: Mint NFT and stake tokens
            await nft.safeMint(await addr1.getAddress(), TEST_URI)
            await governanceToken.transfer(
                await addr1.getAddress(),
                STAKE_AMOUNT
            )
            await governanceToken
                .connect(addr1)
                .approve(await nft.getAddress(), STAKE_AMOUNT)
            await nft.connect(addr1).stake(0, STAKE_AMOUNT)
        })

        describe("Partial Withdrawals", function () {
            it("Should allow partial withdrawal of staked tokens", async function () {
                await nft.connect(addr1).withdraw(0, PARTIAL_WITHDRAW)
                const expectedRemaining = STAKE_AMOUNT - PARTIAL_WITHDRAW
                expect(await nft.stakedAmount(0)).to.equal(expectedRemaining)
            })

            it("Should emit Withdrawn event for partial withdrawals", async function () {
                await expect(nft.connect(addr1).withdraw(0, PARTIAL_WITHDRAW))
                    .to.emit(nft, "Withdrawn")
                    .withArgs(
                        0,
                        await governanceToken.getAddress(),
                        PARTIAL_WITHDRAW
                    )
            })

            it("Should revert if trying to withdraw more than staked amount", async function () {
                const tooMuch = STAKE_AMOUNT + ethers.parseEther("1")
                await expect(
                    nft.connect(addr1).withdraw(0, tooMuch)
                ).to.be.revertedWith("Insufficient staked amount")
            })
        })

        describe("Complete Withdrawals", function () {
            it("Should allow withdrawing all staked tokens", async function () {
                await nft.connect(addr1).withdrawAll(0)
                expect(await nft.stakedAmount(0)).to.equal(0)
            })

            it("Should emit WithdrawnAll event", async function () {
                await expect(nft.connect(addr1).withdrawAll(0))
                    .to.emit(nft, "WithdrawnAll")
                    .withArgs(
                        0,
                        await governanceToken.getAddress(),
                        STAKE_AMOUNT
                    )
            })

            it("Should revert if trying to withdraw with no stakes", async function () {
                await nft.connect(addr1).withdrawAll(0)
                await expect(
                    nft.connect(addr1).withdrawAll(0)
                ).to.be.revertedWith("No stakes found")
            })
        })

        it("Should revert if non-owner tries to withdraw", async function () {
            await expect(
                nft.connect(addr2).withdraw(0, PARTIAL_WITHDRAW)
            ).to.be.revertedWith("Not token owner")
        })

        it("Should revert if trying to withdraw zero amount", async function () {
            await expect(nft.connect(addr1).withdraw(0, 0)).to.be.revertedWith(
                "Amount must be greater than 0"
            )
        })
    })

    describe("Delegation", function () {
        beforeEach(async function () {
            // Setup: Mint NFT and stake tokens
            await nft.safeMint(await addr1.getAddress(), TEST_URI)
            await governanceToken.transfer(
                await addr1.getAddress(),
                STAKE_AMOUNT
            )
            await governanceToken
                .connect(addr1)
                .approve(await nft.getAddress(), STAKE_AMOUNT)
            await nft.connect(addr1).stake(0, STAKE_AMOUNT)
        })

        it("Should allow delegation of staked tokens", async function () {
            await expect(
                nft
                    .connect(addr1)
                    .delegateStakedTokens(0, await addr2.getAddress())
            )
                .to.emit(nft, "Delegated")
                .withArgs(
                    await governanceToken.getAddress(),
                    await addr2.getAddress()
                )
        })

        it("Should revert delegation to zero address", async function () {
            await expect(
                nft.connect(addr1).delegateStakedTokens(0, ZeroAddress)
            ).to.be.revertedWith("Invalid delegatee address")
        })

        it("Should revert if non-delegator tries to delegate", async function () {
            await expect(
                nft
                    .connect(addr2)
                    .delegateStakedTokens(0, await addr3.getAddress())
            ).to.be.revertedWith("Invalid delegator")
        })
    })

    describe("View Functions", function () {
        it("Should correctly return staked amount", async function () {
            await nft.safeMint(await addr1.getAddress(), TEST_URI)
            expect(await nft.stakedAmount(0)).to.equal(0)

            await governanceToken.transfer(
                await addr1.getAddress(),
                STAKE_AMOUNT
            )
            await governanceToken
                .connect(addr1)
                .approve(await nft.getAddress(), STAKE_AMOUNT)
            await nft.connect(addr1).stake(0, STAKE_AMOUNT)

            expect(await nft.stakedAmount(0)).to.equal(STAKE_AMOUNT)
        })
    })
})
