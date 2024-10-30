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
    const TOTAL_NEEDED = STAKE_AMOUNT + ADDITIONAL_STAKE

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

    describe("Minting with Staking", function () {
        beforeEach(async function () {
            // Transfer tokens to addr1 and approve NFT contract
            await governanceToken.transfer(
                await addr1.getAddress(),
                TOTAL_NEEDED
            )
            await governanceToken
                .connect(addr1)
                .approve(await nft.getAddress(), TOTAL_NEEDED)
        })

        it("Should mint NFT and stake tokens in one transaction", async function () {
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), TEST_URI, STAKE_AMOUNT)

            // Check NFT ownership
            expect(await nft.ownerOf(0)).to.equal(await addr1.getAddress())
            expect(await nft.tokenURI(0)).to.equal(TEST_URI)

            // Check staked amount
            expect(await nft.stakedAmount(0)).to.equal(STAKE_AMOUNT)
        })

        it("Should emit both Transfer and Staked events", async function () {
            const tx = await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), TEST_URI, STAKE_AMOUNT)

            await expect(tx)
                .to.emit(nft, "Transfer")
                .withArgs(ZeroAddress, await addr1.getAddress(), 0)

            await expect(tx)
                .to.emit(nft, "Staked")
                .withArgs(0, await governanceToken.getAddress(), STAKE_AMOUNT)
        })

        it("Should revert if minting with zero stake amount", async function () {
            await expect(
                nft.connect(addr1).mint(await addr1.getAddress(), TEST_URI, 0)
            ).to.be.revertedWith("Amount must be greater than 0")
        })

        it("Should revert if minting to zero address", async function () {
            await expect(
                nft.connect(addr1).mint(ZeroAddress, TEST_URI, STAKE_AMOUNT)
            ).to.be.revertedWith("Cannot mint to zero address")
        })

        it("Should revert if trying to mint without sufficient token approval", async function () {
            // Reset approval to 0
            await governanceToken
                .connect(addr1)
                .approve(await nft.getAddress(), 0)

            await expect(
                nft
                    .connect(addr1)
                    .mint(await addr1.getAddress(), TEST_URI, STAKE_AMOUNT)
            ).to.be.reverted
        })

        it("Should revert if trying to mint without sufficient token balance", async function () {
            const largeAmount = ethers.parseEther("20000")
            await expect(
                nft
                    .connect(addr1)
                    .mint(await addr1.getAddress(), TEST_URI, largeAmount)
            ).to.be.reverted
        })

        it("Should increment token IDs correctly", async function () {
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), TEST_URI, STAKE_AMOUNT)
            await governanceToken.transfer(
                await addr2.getAddress(),
                STAKE_AMOUNT
            )
            await governanceToken
                .connect(addr2)
                .approve(await nft.getAddress(), STAKE_AMOUNT)
            await nft
                .connect(addr2)
                .mint(await addr2.getAddress(), TEST_URI, STAKE_AMOUNT)

            expect(await nft.ownerOf(0)).to.equal(await addr1.getAddress())
            expect(await nft.ownerOf(1)).to.equal(await addr2.getAddress())
        })
    })

    describe("Staking", function () {
        beforeEach(async function () {
            // Transfer tokens to addr1 and approve NFT contract
            await governanceToken.transfer(
                await addr1.getAddress(),
                TOTAL_NEEDED
            )
            await governanceToken
                .connect(addr1)
                .approve(await nft.getAddress(), TOTAL_NEEDED)

            // Mint NFT with initial stake
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), TEST_URI, STAKE_AMOUNT)
        })

        it("Should allow additional staking of tokens", async function () {
            await nft.connect(addr1).stake(0, ADDITIONAL_STAKE)
            const expectedTotal = STAKE_AMOUNT + ADDITIONAL_STAKE
            expect(await nft.stakedAmount(0)).to.equal(expectedTotal)
        })

        it("Should emit Staked event for additional stakes", async function () {
            await expect(nft.connect(addr1).stake(0, ADDITIONAL_STAKE))
                .to.emit(nft, "Staked")
                .withArgs(
                    0,
                    await governanceToken.getAddress(),
                    ADDITIONAL_STAKE
                )
        })

        it("Should revert if non-owner tries to stake", async function () {
            await expect(
                nft.connect(addr2).stake(0, ADDITIONAL_STAKE)
            ).to.be.revertedWith("Not token owner")
        })

        it("Should revert if trying to stake zero amount", async function () {
            await expect(nft.connect(addr1).stake(0, 0)).to.be.revertedWith(
                "Amount must be greater than 0"
            )
        })
    })

    describe("Withdrawing", function () {
        beforeEach(async function () {
            // Transfer tokens to addr1 and approve NFT contract
            await governanceToken.transfer(
                await addr1.getAddress(),
                STAKE_AMOUNT
            )
            await governanceToken
                .connect(addr1)
                .approve(await nft.getAddress(), STAKE_AMOUNT)

            // Mint NFT with initial stake
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), TEST_URI, STAKE_AMOUNT)
        })

        describe("Partial Withdrawals", function () {
            it("Should allow partial withdrawal of staked tokens", async function () {
                await nft.connect(addr1).withdraw(0, PARTIAL_WITHDRAW)
                const expectedRemaining = STAKE_AMOUNT - PARTIAL_WITHDRAW
                expect(await nft.stakedAmount(0)).to.equal(expectedRemaining)
            })

            xit("Should emit Withdrawn event for partial withdrawals", async function () {
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

            it("Should revert if trying to withdraw zero amount", async function () {
                await expect(
                    nft.connect(addr1).withdraw(0, 0)
                ).to.be.revertedWith("Amount must be greater than 0")
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
    })

    describe("Delegation", function () {
        beforeEach(async function () {
            // Transfer tokens to addr1 and approve NFT contract
            await governanceToken.transfer(
                await addr1.getAddress(),
                STAKE_AMOUNT
            )
            await governanceToken
                .connect(addr1)
                .approve(await nft.getAddress(), STAKE_AMOUNT)

            // Mint NFT with initial stake
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), TEST_URI, STAKE_AMOUNT)
        })

        it("Should allow NFT owner to delegate staked tokens", async function () {
            const delegateTx = nft
                .connect(addr1)
                .delegateStakedTokens(0, await addr2.getAddress())

            // Check for DelegatedToken event from main contract
            await expect(delegateTx)
                .to.emit(nft, "DelegatedToken")
                .withArgs(
                    0, // tokenId
                    await governanceToken.getAddress(),
                    await addr2.getAddress()
                )

            // Get proxy address
            const proxyAddress = await nft.stakeProxies(0)

            // Check for DelegatedFromProxy event from proxy contract
            await expect(delegateTx)
                .to.emit(
                    await ethers.getContractAt("StakeProxy", proxyAddress),
                    "DelegatedFromProxy"
                )
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

        it("Should revert if non-owner tries to delegate", async function () {
            await expect(
                nft
                    .connect(addr2)
                    .delegateStakedTokens(0, await addr3.getAddress())
            ).to.be.revertedWith("Not token owner")
        })
    })

    describe("View Functions", function () {
        beforeEach(async function () {
            await governanceToken.transfer(
                await addr1.getAddress(),
                STAKE_AMOUNT
            )
            await governanceToken
                .connect(addr1)
                .approve(await nft.getAddress(), STAKE_AMOUNT)
        })

        it("Should correctly return staked amount", async function () {
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), TEST_URI, STAKE_AMOUNT)
            expect(await nft.stakedAmount(0)).to.equal(STAKE_AMOUNT)
        })

        it("Should return zero for non-existent token", async function () {
            expect(await nft.stakedAmount(999)).to.equal(0)
        })
    })
    // Add this new describe block after your existing tests in Hamsterverse.ts

    describe("Reward Security", function () {
        let proxyAddress: string

        beforeEach(async function () {
            // Setup initial stake and get proxy address
            const REQUIRED_TOKENS = TOTAL_NEEDED * 2n
            await governanceToken.transfer(
                await addr1.getAddress(),
                REQUIRED_TOKENS
            )
            await governanceToken
                .connect(addr1)
                .approve(await nft.getAddress(), REQUIRED_TOKENS)

            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), TEST_URI, STAKE_AMOUNT)

            proxyAddress = await nft.stakeProxies(0)
        })

        it("Should maintain accurate stake time tracking", async function () {
            // Get initial stake info
            const initialInfo = await nft.getStakeInfo(0)

            // Advance time
            await ethers.provider.send("evm_increaseTime", [86400]) // 1 day
            await ethers.provider.send("evm_mine", [])

            // Add more stake
            await nft.connect(addr1).stake(0, ADDITIONAL_STAKE)

            const afterInfo = await nft.getStakeInfo(0)
            expect(afterInfo.accumulatedStakeSeconds).to.be.gt(
                initialInfo.accumulatedStakeSeconds
            )
        })

        xit("Should emit Withdrawn event for partial withdrawals", async function () {
            // Get the pending reward before withdrawal
            const { pendingReward } = await nft.getStakeInfo(0)

            await expect(nft.connect(addr1).withdraw(0, PARTIAL_WITHDRAW))
                .to.emit(nft, "Withdrawn")
                .withArgs(
                    0, // tokenId
                    await governanceToken.getAddress(), // token address
                    PARTIAL_WITHDRAW, // withdrawn amount
                    pendingReward // reward amount - this was missing
                )
        })

        it("Should reset accumulated stake seconds after reward claim", async function () {
            // Advance time
            await ethers.provider.send("evm_increaseTime", [86400])
            await ethers.provider.send("evm_mine", [])

            // Withdraw partial amount to claim rewards
            await nft.connect(addr1).withdraw(0, PARTIAL_WITHDRAW)

            const { accumulatedStakeSeconds } = await nft.getStakeInfo(0)
            expect(accumulatedStakeSeconds).to.equal(0)
        })

        it("Should fairly distribute rewards between multiple stakers", async function () {
            // Setup second staker
            await governanceToken.transfer(
                await addr2.getAddress(),
                STAKE_AMOUNT
            )
            await governanceToken
                .connect(addr2)
                .approve(await nft.getAddress(), STAKE_AMOUNT)
            await nft
                .connect(addr2)
                .mint(await addr2.getAddress(), TEST_URI, STAKE_AMOUNT)

            // Advance time
            await ethers.provider.send("evm_increaseTime", [86400])
            await ethers.provider.send("evm_mine", [])

            // Get rewards for both NFTs
            const [info1, info2] = await Promise.all([
                nft.getStakeInfo(0),
                nft.getStakeInfo(1)
            ])

            // With equal stakes and time, rewards should be equal
            expect(info1.pendingReward).to.equal(info2.pendingReward)
        })

        it("Should not allow reward manipulation through direct proxy access", async function () {
            const proxy = await ethers.getContractAt("StakeProxy", proxyAddress)

            // Try to manipulate accumulated time through unauthorized withdrawal
            await expect(
                proxy
                    .connect(addr2)
                    .withdraw(await addr2.getAddress(), PARTIAL_WITHDRAW)
            ).to.be.revertedWith("Only NFT contract can call")

            // Verify reward calculation remains unchanged
            const { pendingReward: rewardAfter } = await nft.getStakeInfo(0)
            expect(rewardAfter).to.equal(0) // Should be 0 since no time has passed
        })

        it("Should correctly track rewards through multiple operations", async function () {
            // Initial stake time
            await ethers.provider.send("evm_increaseTime", [43200]) // 12 hours
            await ethers.provider.send("evm_mine", [])

            // Add more stake
            await nft.connect(addr1).stake(0, ADDITIONAL_STAKE)

            // More time passes
            await ethers.provider.send("evm_increaseTime", [43200]) // Another 12 hours
            await ethers.provider.send("evm_mine", [])

            // Partial withdrawal with reward claim
            // const { pendingReward } = await nft.getStakeInfo(0)
            await expect(nft.connect(addr1).withdraw(0, PARTIAL_WITHDRAW))
                .to.emit(nft, "Withdrawn")
                .withArgs(
                    0,
                    await governanceToken.getAddress(),
                    PARTIAL_WITHDRAW
                )

            // Verify stake tracking reset
            const { accumulatedStakeSeconds } = await nft.getStakeInfo(0)
            expect(accumulatedStakeSeconds).to.equal(0)
        })

        it("Should maintain reward isolation between different NFTs", async function () {
            // Setup second NFT with different stake amount
            await governanceToken.transfer(
                await addr2.getAddress(),
                STAKE_AMOUNT * 2n
            )
            await governanceToken
                .connect(addr2)
                .approve(await nft.getAddress(), STAKE_AMOUNT * 2n)
            await nft
                .connect(addr2)
                .mint(await addr2.getAddress(), TEST_URI, STAKE_AMOUNT * 2n)

            // Advance time
            await ethers.provider.send("evm_increaseTime", [86400])
            await ethers.provider.send("evm_mine", [])

            // Get rewards
            const [info1, info2] = await Promise.all([
                nft.getStakeInfo(0),
                nft.getStakeInfo(1)
            ])

            // NFT with double stake should have double rewards
            expect(info2.pendingReward).to.equal(info1.pendingReward * 2n)
        })
    })
})
