import { expect } from "chai"
import { ethers } from "hardhat"
import {
    HamsterverseStakingNFT,
    MockERC20,
    StakeProxy
} from "../typechain-types"
import { Signer } from "ethers"
import { ZeroAddress } from "ethers"
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers"

describe("HamsterverseStakingNFT", function () {
    // Contract instances
    let nft: HamsterverseStakingNFT
    let governanceToken: MockERC20

    // Signers
    let owner: Signer
    let addr1: Signer
    let addr2: Signer
    let addr3: Signer

    // Constants
    const TEST_URI =
        "ipfs://bafkreiglxpmys7hxse45nd3ajnjzq2vjjevrlwjphtcco3pd53eq6zqu5i"
    const STAKE_AMOUNT = ethers.parseEther("200")
    const ADDITIONAL_STAKE = ethers.parseEther("100")
    const INITIAL_SUPPLY = ethers.parseEther("10000")
    const DISTRIBUTION_RATE = ethers.parseEther("0.1") // 0.1 tokens per second
    const REWARD_DEPOSIT = ethers.parseEther("1000") // 1000 tokens for rewards
    const ONE_DAY = 24 * 60 * 60
    const ONE_WEEK = 7 * ONE_DAY

    async function deployFixture() {
        ;[owner, addr1, addr2, addr3] = await ethers.getSigners()

        // Deploy governance token
        const MockERC20Factory = await ethers.getContractFactory("MockERC20")
        governanceToken = await MockERC20Factory.deploy()

        // Deploy NFT contract
        const HamsterverseFactory = await ethers.getContractFactory(
            "HamsterverseStakingNFT"
        )
        nft = await HamsterverseFactory.deploy(
            await governanceToken.getAddress(),
            DISTRIBUTION_RATE,
            await owner.getAddress()
        )

        // Setup initial token distribution
        await governanceToken.mint(await addr1.getAddress(), INITIAL_SUPPLY)
        await governanceToken.mint(await addr2.getAddress(), INITIAL_SUPPLY)
        await governanceToken.mint(await owner.getAddress(), REWARD_DEPOSIT)

        // Approve NFT contract for rewards
        await governanceToken.approve(await nft.getAddress(), REWARD_DEPOSIT)
        await nft.depositRewards(REWARD_DEPOSIT)

        return { nft, governanceToken, owner, addr1, addr2, addr3 }
    }

    describe("Deployment & Initial State", function () {
        it("Should deploy with correct initial state", async function () {
            const { nft, governanceToken } = await loadFixture(deployFixture)

            expect(await nft.governanceToken()).to.equal(
                await governanceToken.getAddress()
            )
            expect(await nft.distributionRate()).to.equal(DISTRIBUTION_RATE)
            expect(await nft.getRewardPoolBalance()).to.equal(REWARD_DEPOSIT)
            expect(await nft.symbol()).to.equal("HAM")
            expect(await nft.name()).to.equal("Hamsterverse")
        })

        it("Should not deploy with zero governance token address", async function () {
            const HamsterverseFactory = await ethers.getContractFactory(
                "HamsterverseStakingNFT"
            )
            await expect(
                HamsterverseFactory.deploy(
                    ZeroAddress,
                    DISTRIBUTION_RATE,
                    await owner.getAddress()
                )
            ).to.be.revertedWithCustomError(nft, "InvalidAddress")
        })
    })

    describe("Staking Operations", function () {
        describe("Minting & Initial Stake", function () {
            it("Should mint NFT and create stake proxy", async function () {
                const { nft, governanceToken, addr1 } = await loadFixture(
                    deployFixture
                )

                await governanceToken
                    .connect(addr1)
                    .approve(await nft.getAddress(), STAKE_AMOUNT)
                await nft
                    .connect(addr1)
                    .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

                const tokenId = 0
                const stakeInfo = await nft.getStakeInfo(tokenId)

                expect(stakeInfo.stakedAmount).to.equal(STAKE_AMOUNT)
                expect(await nft.ownerOf(tokenId)).to.equal(
                    await addr1.getAddress()
                )
            })

            it("Should fail minting with insufficient allowance", async function () {
                const { nft, addr1 } = await loadFixture(deployFixture)

                await expect(
                    nft
                        .connect(addr1)
                        .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)
                ).to.be.reverted
            })
        })

        describe("Additional Staking", function () {
            it("Should allow adding more stake to existing position", async function () {
                const { nft, governanceToken, addr1 } = await loadFixture(
                    deployFixture
                )

                // Initial stake
                await governanceToken
                    .connect(addr1)
                    .approve(await nft.getAddress(), STAKE_AMOUNT)
                await nft
                    .connect(addr1)
                    .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

                // Additional stake
                await governanceToken
                    .connect(addr1)
                    .approve(await nft.getAddress(), ADDITIONAL_STAKE)
                await nft.connect(addr1).addStake(0, ADDITIONAL_STAKE)

                const stakeInfo = await nft.getStakeInfo(0)
                expect(stakeInfo.stakedAmount).to.equal(
                    STAKE_AMOUNT + ADDITIONAL_STAKE
                )
            })

            it("Should fail adding stake from non-owner", async function () {
                const { nft, governanceToken, addr1, addr2 } =
                    await loadFixture(deployFixture)

                await governanceToken
                    .connect(addr1)
                    .approve(await nft.getAddress(), STAKE_AMOUNT)
                await nft
                    .connect(addr1)
                    .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

                await expect(
                    nft.connect(addr2).addStake(0, ADDITIONAL_STAKE)
                ).to.be.revertedWithCustomError(nft, "NotTokenOwner")
            })
        })

        describe("Withdrawals", function () {
            it("Should allow full withdrawal", async function () {
                const { nft, governanceToken, addr1 } = await loadFixture(
                    deployFixture
                )

                await governanceToken
                    .connect(addr1)
                    .approve(await nft.getAddress(), STAKE_AMOUNT)
                await nft
                    .connect(addr1)
                    .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

                const initialBalance = await governanceToken.balanceOf(
                    await addr1.getAddress()
                )
                await nft.connect(addr1).withdraw(0, STAKE_AMOUNT)

                const finalBalance = await governanceToken.balanceOf(
                    await addr1.getAddress()
                )
                expect(finalBalance - initialBalance).to.equal(STAKE_AMOUNT)
            })

            it("Should allow partial withdrawal", async function () {
                const { nft, governanceToken, addr1 } = await loadFixture(
                    deployFixture
                )

                await governanceToken
                    .connect(addr1)
                    .approve(await nft.getAddress(), STAKE_AMOUNT)
                await nft
                    .connect(addr1)
                    .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

                const withdrawAmount = STAKE_AMOUNT / 2n
                await nft.connect(addr1).withdraw(0, withdrawAmount)

                const stakeInfo = await nft.getStakeInfo(0)
                expect(stakeInfo.stakedAmount).to.equal(
                    STAKE_AMOUNT - withdrawAmount
                )
            })
        })

        describe("Rewards", function () {
            it("Should accumulate rewards over time", async function () {
                const { nft, governanceToken, addr1 } = await loadFixture(
                    deployFixture
                )

                // Initial stake setup
                await governanceToken
                    .connect(addr1)
                    .approve(await nft.getAddress(), STAKE_AMOUNT)
                await nft
                    .connect(addr1)
                    .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

                // Get initial stake data
                const tokenId = 0
                const initialStakeData = await nft.getStakeInfo(tokenId)

                console.log("\nInitial state:")
                console.log(
                    "- Stake timestamp:",
                    initialStakeData.stakeTimestamp
                )
                console.log(
                    "- Stake amount:",
                    ethers.formatEther(initialStakeData.stakedAmount)
                )
                console.log(
                    "- Total staked:",
                    ethers.formatEther(await nft.getTotalStakedTokens())
                )
                console.log(
                    "- Distribution rate:",
                    ethers.formatEther(DISTRIBUTION_RATE),
                    "tokens/second"
                )
                console.log(
                    "- Reward pool:",
                    ethers.formatEther(await nft.getRewardPoolBalance())
                )

                // Get initial rewards
                const initialRewards = await nft.getAccruedRewards(tokenId)
                console.log(
                    "Initial rewards:",
                    ethers.formatEther(initialRewards)
                )

                // Increase time
                const timeIncrease = ONE_DAY
                await time.increase(timeIncrease)
                console.log(`\nIncreased time by ${timeIncrease} seconds`)

                // Get rewards before state update
                const rewardsBeforeUpdate = await nft.getAccruedRewards(tokenId)
                console.log(
                    "Rewards before state update:",
                    ethers.formatEther(rewardsBeforeUpdate)
                )

                // Update state with a minimum stake addition
                const smallStake = ethers.parseEther("0.000001")
                await governanceToken
                    .connect(addr1)
                    .approve(await nft.getAddress(), smallStake)
                await nft.connect(addr1).addStake(tokenId, smallStake)

                // Get current rewards
                const rewardAmount = await nft.getAccruedRewards(tokenId)
                console.log(
                    "\nAccrued rewards:",
                    ethers.formatEther(rewardAmount)
                )

                // Verify rewards are accumulating
                expect(rewardAmount).to.be.gt(0)

                // Withdraw rewards and verify the amount
                const balanceBefore = await governanceToken.balanceOf(
                    await addr1.getAddress()
                )
                await nft.connect(addr1).withdrawRewards(tokenId)
                const balanceAfter = await governanceToken.balanceOf(
                    await addr1.getAddress()
                )

                const actualRewardReceived = balanceAfter - balanceBefore
                console.log(
                    "Actual rewards received:",
                    ethers.formatEther(actualRewardReceived)
                )

                // Define tolerance for comparison (0.000002 tokens)
                const tolerance = ethers.parseEther("0.000002")

                // Verify the received amount is close to the calculated amount
                expect(actualRewardReceived).to.be.closeTo(
                    rewardAmount,
                    tolerance,
                    "Reward received should be close to calculated reward"
                )

                // Additional verification
                expect(actualRewardReceived).to.be.gt(
                    0,
                    "Should receive positive rewards"
                )

                // Check that rewards were properly cleared
                const rewardsAfterWithdrawal = await nft.getAccruedRewards(
                    tokenId
                )
                expect(rewardsAfterWithdrawal).to.equal(
                    0,
                    "Rewards should be cleared after withdrawal"
                )
            })

            it("Should allow withdrawing rewards", async function () {
                const { nft, governanceToken, addr1 } = await loadFixture(
                    deployFixture
                )

                // Initial stake
                await governanceToken
                    .connect(addr1)
                    .approve(await nft.getAddress(), STAKE_AMOUNT)
                await nft
                    .connect(addr1)
                    .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

                // Advance time
                await time.increase(ONE_WEEK)

                // Update state with a minimum stake to trigger reward calculation
                const smallStake = ethers.parseEther("0.000001")
                await governanceToken
                    .connect(addr1)
                    .approve(await nft.getAddress(), smallStake)
                await nft.connect(addr1).addStake(0, smallStake)

                // Check initial reward amount
                const initialRewards = await nft.getAccruedRewards(0)
                console.log(
                    "\nAccrued rewards before withdrawal:",
                    ethers.formatEther(initialRewards)
                )

                // Get initial balance
                const initialBalance = await governanceToken.balanceOf(
                    await addr1.getAddress()
                )

                // Withdraw rewards
                await nft.connect(addr1).withdrawRewards(0)

                // Check final balance
                const finalBalance = await governanceToken.balanceOf(
                    await addr1.getAddress()
                )
                const rewardReceived = finalBalance - initialBalance

                console.log(
                    "Reward received:",
                    ethers.formatEther(rewardReceived)
                )
                expect(rewardReceived).to.be.gt(0)
                expect(rewardReceived).to.be.closeTo(
                    initialRewards,
                    ethers.parseEther("0.1")
                )
            })
        })

        describe("Delegation", function () {
            it("Should allow delegation of voting power", async function () {
                const { nft, governanceToken, addr1, addr2 } =
                    await loadFixture(deployFixture)

                await governanceToken
                    .connect(addr1)
                    .approve(await nft.getAddress(), STAKE_AMOUNT)
                await nft
                    .connect(addr1)
                    .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

                const delegatee = await addr2.getAddress()
                await nft.connect(addr1).delegateStakedTokens(0, delegatee)

                const proxyAddress = (await nft.getStakeInfo(0)).proxyAddress
                const proxy = await ethers.getContractAt(
                    "StakeProxy",
                    proxyAddress
                )
                const tokenContract = await ethers.getContractAt(
                    "MockERC20",
                    await governanceToken.getAddress()
                )

                expect(await tokenContract.delegates(proxyAddress)).to.equal(
                    delegatee
                )
            })
        })
    })

    describe("Admin Functions", function () {
        it("Should allow owner to update distribution rate", async function () {
            const { nft } = await loadFixture(deployFixture)

            const newRate = ethers.parseEther("0.2")
            await nft.setDistributionRate(newRate)

            expect(await nft.distributionRate()).to.equal(newRate)
        })

        it("Should allow owner to use escape hatch", async function () {
            const { nft, governanceToken, owner } = await loadFixture(
                deployFixture
            )

            const rewardPool = await nft.getRewardPoolBalance()
            await nft.escapeHatch(await owner.getAddress())

            expect(
                await governanceToken.balanceOf(await nft.getAddress())
            ).to.equal(0)
            expect(
                await governanceToken.balanceOf(await owner.getAddress())
            ).to.equal(rewardPool)
        })
    })
})
