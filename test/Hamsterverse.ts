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

    describe("Security", function () {
        let proxyAddress: string

        beforeEach(async function () {
            // Transfer enough tokens to addr1 for all test operations
            const REQUIRED_TOKENS = TOTAL_NEEDED * 2n // Using BigInt multiplication
            await governanceToken.transfer(
                await addr1.getAddress(),
                REQUIRED_TOKENS
            )
            await governanceToken
                .connect(addr1)
                .approve(await nft.getAddress(), REQUIRED_TOKENS)

            // Mint NFT with initial stake to setup test environment
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), TEST_URI, STAKE_AMOUNT)

            // Get proxy address
            proxyAddress = await nft.stakeProxies(0)
        })

        describe("Proxy Access Control", function () {
            it("Should not allow direct withdrawals from non-NFT address", async function () {
                const proxy = await ethers.getContractAt(
                    "StakeProxy",
                    proxyAddress
                )
                await expect(
                    proxy
                        .connect(addr2)
                        .withdraw(await addr2.getAddress(), STAKE_AMOUNT)
                ).to.be.revertedWith("Only NFT contract can call")

                // Verify balance remained unchanged
                expect(await nft.stakedAmount(0)).to.equal(STAKE_AMOUNT)
            })

            it("Should not allow direct delegation from non-NFT address", async function () {
                const proxy = await ethers.getContractAt(
                    "StakeProxy",
                    proxyAddress
                )
                await expect(
                    proxy.connect(addr2).delegate(await addr2.getAddress())
                ).to.be.revertedWith("Only NFT contract can call")
            })

            it("Should protect against direct token transfers", async function () {
                const proxy = await ethers.getContractAt(
                    "StakeProxy",
                    proxyAddress
                )

                // Try to send additional tokens directly to proxy
                await governanceToken.transfer(
                    await addr2.getAddress(),
                    STAKE_AMOUNT
                )
                await governanceToken
                    .connect(addr2)
                    .transfer(proxyAddress, STAKE_AMOUNT)

                // Record total balance after direct transfer
                const totalProxyBalance = await governanceToken.balanceOf(
                    proxyAddress
                )

                // Verify tokens can't be withdrawn directly
                await expect(
                    proxy
                        .connect(addr2)
                        .withdraw(await addr2.getAddress(), STAKE_AMOUNT)
                ).to.be.revertedWith("Only NFT contract can call")

                // Verify only NFT owner can withdraw through proper channel
                await expect(
                    nft.connect(addr2).withdraw(0, STAKE_AMOUNT)
                ).to.be.revertedWith("Not token owner")

                // Verify balance remains unchanged after failed attempts
                expect(await governanceToken.balanceOf(proxyAddress)).to.equal(
                    totalProxyBalance
                )
            })
        })

        describe("Proxy Immutability", function () {
            it("Should have correct immutable state", async function () {
                const proxy = await ethers.getContractAt(
                    "StakeProxy",
                    proxyAddress
                )

                expect(await proxy.nft()).to.equal(await nft.getAddress())
                expect(await proxy.token()).to.equal(
                    await governanceToken.getAddress()
                )
                expect(await proxy.tokenId()).to.equal(0)
            })

            it("Should maintain token isolation between different NFTs", async function () {
                // Setup tokens for addr2
                await governanceToken.transfer(
                    await addr2.getAddress(),
                    STAKE_AMOUNT
                )
                await governanceToken
                    .connect(addr2)
                    .approve(await nft.getAddress(), STAKE_AMOUNT)

                // Mint a second NFT
                await nft
                    .connect(addr2)
                    .mint(await addr2.getAddress(), TEST_URI, STAKE_AMOUNT)
                const proxy2Address = await nft.stakeProxies(1)

                // Verify correct initial balances
                expect(await governanceToken.balanceOf(proxyAddress)).to.equal(
                    STAKE_AMOUNT
                )
                expect(await governanceToken.balanceOf(proxy2Address)).to.equal(
                    STAKE_AMOUNT
                )

                // Attempt cross-token access
                await expect(
                    nft.connect(addr1).withdraw(1, STAKE_AMOUNT)
                ).to.be.revertedWith("Not token owner")
                await expect(
                    nft.connect(addr2).withdraw(0, STAKE_AMOUNT)
                ).to.be.revertedWith("Not token owner")

                // Verify balances remained unchanged
                expect(await governanceToken.balanceOf(proxyAddress)).to.equal(
                    STAKE_AMOUNT
                )
                expect(await governanceToken.balanceOf(proxy2Address)).to.equal(
                    STAKE_AMOUNT
                )
            })
        })

        describe("Token Safety", function () {
            beforeEach(async function () {
                // Ensure fresh approval for additional operations
                await governanceToken
                    .connect(addr1)
                    .approve(await nft.getAddress(), ADDITIONAL_STAKE)
            })

            it("Should maintain correct balances through legitimate operations", async function () {
                // Initial balance check
                expect(await nft.stakedAmount(0)).to.equal(STAKE_AMOUNT)

                // Perform partial withdrawal
                await nft.connect(addr1).withdraw(0, PARTIAL_WITHDRAW)
                const expectedAfterWithdraw = STAKE_AMOUNT - PARTIAL_WITHDRAW
                expect(await nft.stakedAmount(0)).to.equal(
                    expectedAfterWithdraw
                )

                // Add more stake
                await nft.connect(addr1).stake(0, ADDITIONAL_STAKE)
                const expectedFinal = expectedAfterWithdraw + ADDITIONAL_STAKE
                expect(await nft.stakedAmount(0)).to.equal(expectedFinal)

                // Verify proxy balance matches
                expect(await governanceToken.balanceOf(proxyAddress)).to.equal(
                    expectedFinal
                )
            })

            it("Should never allow non-owner access even after multiple operations", async function () {
                const proxy = await ethers.getContractAt(
                    "StakeProxy",
                    proxyAddress
                )

                // Record initial balance
                const initialBalance = await nft.stakedAmount(0)

                // Perform legitimate operations
                await nft.connect(addr1).withdraw(0, PARTIAL_WITHDRAW)
                await nft.connect(addr1).stake(0, ADDITIONAL_STAKE)
                await nft
                    .connect(addr1)
                    .delegateStakedTokens(0, await addr2.getAddress())

                // Record final legitimate balance
                const finalBalance = await nft.stakedAmount(0)

                // Attempt unauthorized access
                await expect(
                    proxy
                        .connect(addr2)
                        .withdraw(await addr2.getAddress(), STAKE_AMOUNT)
                ).to.be.revertedWith("Only NFT contract can call")

                await expect(
                    proxy.connect(addr3).delegate(await addr3.getAddress())
                ).to.be.revertedWith("Only NFT contract can call")

                // Verify balance unchanged after attack attempts
                expect(await nft.stakedAmount(0)).to.equal(finalBalance)
                expect(await governanceToken.balanceOf(proxyAddress)).to.equal(
                    finalBalance
                )
            })

            it("Should maintain delegated voting power through token operations", async function () {
                // Initial delegation
                await nft
                    .connect(addr1)
                    .delegateStakedTokens(0, await addr2.getAddress())

                // Perform some token operations
                await nft.connect(addr1).withdraw(0, PARTIAL_WITHDRAW)
                await nft.connect(addr1).stake(0, ADDITIONAL_STAKE)

                // Attempt unauthorized delegation
                const proxy = await ethers.getContractAt(
                    "StakeProxy",
                    proxyAddress
                )
                await expect(
                    proxy.connect(addr2).delegate(await addr3.getAddress())
                ).to.be.revertedWith("Only NFT contract can call")
            })
        })
    })
})
