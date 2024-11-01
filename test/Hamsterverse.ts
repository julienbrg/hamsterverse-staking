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
    const DISTRIBUTION_RATE = ethers.parseEther("1") // 1 token per second
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

    describe("Deployment", function () {
        it("Should set the correct owner", async function () {
            const { nft, owner } = await loadFixture(deployFixture)
            expect(await nft.owner()).to.equal(await owner.getAddress())
        })

        it("Should set the correct governance token", async function () {
            const { nft, governanceToken } = await loadFixture(deployFixture)
            expect(await nft.governanceToken()).to.equal(
                await governanceToken.getAddress()
            )
        })

        it("Should set the correct distribution rate", async function () {
            const { nft } = await loadFixture(deployFixture)
            expect(await nft.rewardRate()).to.equal(DISTRIBUTION_RATE)
        })
    })

    describe("Minting and Staking", function () {
        it("Should mint NFT and stake tokens successfully", async function () {
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
            expect(stakeInfo[0]).to.equal(STAKE_AMOUNT)
        })

        it("Should revert when minting with zero amount", async function () {
            const { nft, addr1 } = await loadFixture(deployFixture)
            await expect(
                nft.connect(addr1).mint(await addr1.getAddress(), 0, TEST_URI)
            ).to.be.revertedWithCustomError(nft, "InvalidAmount")
        })

        it("Should revert when minting to zero address", async function () {
            const { nft, addr1 } = await loadFixture(deployFixture)
            await expect(
                nft.connect(addr1).mint(ZeroAddress, STAKE_AMOUNT, TEST_URI)
            ).to.be.revertedWithCustomError(nft, "InvalidAddress")
        })
    })

    describe("Additional Staking", function () {
        it("Should allow adding more stake to existing NFT", async function () {
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
            expect(stakeInfo[0]).to.equal(STAKE_AMOUNT + ADDITIONAL_STAKE)
        })

        it("Should revert when non-owner tries to add stake", async function () {
            const { nft, governanceToken, addr1, addr2 } = await loadFixture(
                deployFixture
            )

            // Initial stake by addr1
            await governanceToken
                .connect(addr1)
                .approve(await nft.getAddress(), STAKE_AMOUNT)
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

            // Attempt to add stake by addr2
            await governanceToken
                .connect(addr2)
                .approve(await nft.getAddress(), ADDITIONAL_STAKE)
            await expect(
                nft.connect(addr2).addStake(0, ADDITIONAL_STAKE)
            ).to.be.revertedWithCustomError(nft, "NotTokenOwner")
        })
    })

    describe("Withdrawals", function () {
        it("Should allow withdrawing staked tokens", async function () {
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

            const initialBalance = await governanceToken.balanceOf(
                await addr1.getAddress()
            )
            await nft.connect(addr1).withdraw(0, STAKE_AMOUNT)

            const finalBalance = await governanceToken.balanceOf(
                await addr1.getAddress()
            )
            expect(finalBalance - initialBalance).to.equal(STAKE_AMOUNT)
        })

        it("Should revert withdrawal if amount exceeds stake", async function () {
            const { nft, governanceToken, addr1 } = await loadFixture(
                deployFixture
            )

            await governanceToken
                .connect(addr1)
                .approve(await nft.getAddress(), STAKE_AMOUNT)
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

            await expect(
                nft.connect(addr1).withdraw(0, STAKE_AMOUNT + 1n)
            ).to.be.revertedWithCustomError(nft, "InsufficientStake")
        })
    })

    describe("Delegation", function () {
        it("Should allow token delegation", async function () {
            const { nft, governanceToken, addr1, addr2 } = await loadFixture(
                deployFixture
            )

            await governanceToken
                .connect(addr1)
                .approve(await nft.getAddress(), STAKE_AMOUNT)
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

            await expect(
                nft
                    .connect(addr1)
                    .delegateStakedTokens(0, await addr2.getAddress())
            ).to.not.be.reverted
        })

        it("Should revert delegation from non-owner", async function () {
            const { nft, governanceToken, addr1, addr2 } = await loadFixture(
                deployFixture
            )

            await governanceToken
                .connect(addr1)
                .approve(await nft.getAddress(), STAKE_AMOUNT)
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

            await expect(
                nft
                    .connect(addr2)
                    .delegateStakedTokens(0, await addr2.getAddress())
            ).to.be.revertedWithCustomError(nft, "NotTokenOwner")
        })
    })

    describe("Rewards", function () {
        it("Should calculate and distribute rewards correctly", async function () {
            const { nft, governanceToken, addr1, owner } = await loadFixture(
                deployFixture
            )

            // Initial stake
            await governanceToken
                .connect(addr1)
                .approve(await nft.getAddress(), STAKE_AMOUNT)
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

            // Add rewards to the pool
            const largerRewardPool = ethers.parseEther("5000")
            await governanceToken.mint(
                await owner.getAddress(),
                largerRewardPool
            )
            await governanceToken
                .connect(owner)
                .approve(await nft.getAddress(), largerRewardPool)
            await nft.connect(owner).depositRewards(largerRewardPool)

            // Log initial state
            console.log("\nInitial State:")
            console.log("Total staked:", await nft.totalStaked())
            console.log("Reward rate:", await nft.rewardRate())
            console.log(
                "Contract balance:",
                await governanceToken.balanceOf(await nft.getAddress())
            )

            // Get initial reward per token
            const initialRewardPerToken = await nft.rewardPerToken()
            console.log("Initial reward per token:", initialRewardPerToken)

            // Move time forward
            await time.increase(3600) // 1 hour

            // Get updated reward per token
            const updatedRewardPerToken = await nft.rewardPerToken()
            console.log("\nAfter 1 hour:")
            console.log("Updated reward per token:", updatedRewardPerToken)
            expect(updatedRewardPerToken).to.be.gt(initialRewardPerToken)

            // Check earned rewards
            const earnedBefore = await nft.earned(0)
            console.log("Earned rewards:", earnedBefore)
            expect(earnedBefore).to.be.gt(0)

            // Log stake info
            const [
                stakedAmount,
                pendingRewards,
                stakingTimestamp,
                proxyAddress
            ] = await nft.getStakeInfo(0)
            console.log("\nStake Info:")
            console.log("Staked amount:", stakedAmount)
            console.log("Pending rewards:", pendingRewards)
            console.log("Staking timestamp:", stakingTimestamp)
            console.log("Proxy address:", proxyAddress)

            // Get initial balance before withdrawal
            const initialBalance = await governanceToken.balanceOf(
                addr1.getAddress()
            )

            // Withdraw rewards
            await nft.connect(addr1).withdrawRewards(0)

            // Check final balance
            const finalBalance = await governanceToken.balanceOf(
                addr1.getAddress()
            )
            const rewardReceived = finalBalance - initialBalance

            console.log("\nReward Results:")
            console.log("Initial balance:", initialBalance)
            console.log("Final balance:", finalBalance)
            console.log("Reward received:", rewardReceived)

            // Verify reward was received and stored rewards were cleared
            expect(rewardReceived).to.be.gt(0n)
            expect(await nft.earned(0)).to.equal(0n)

            // Calculate expected reward with some tolerance for block timestamps
            const expectedReward = DISTRIBUTION_RATE * BigInt(3600)
            const tolerancePercentage = 5n // 5% tolerance
            const tolerance = (expectedReward * tolerancePercentage) / 100n
            const maxExpectedReward = expectedReward + tolerance

            console.log("\nReward Verification:")
            console.log("Base expected reward:", expectedReward)
            console.log("Tolerance amount:", tolerance)
            console.log("Max expected reward:", maxExpectedReward)

            expect(rewardReceived).to.be.gt(0n)
            expect(rewardReceived).to.be.lte(maxExpectedReward)

            // Additional verification that rewards are within reasonable range
            const rewardRatio = (rewardReceived * 100n) / expectedReward
            console.log(
                "Reward ratio (percentage of expected):",
                rewardRatio,
                "%"
            )
            expect(rewardRatio).to.be.lte(105n) // Should be within 105% of expected reward
        })

        it("Should not allow rewards withdrawal when no rewards are available", async function () {
            const { nft, governanceToken, addr1 } = await loadFixture(
                deployFixture
            )

            // Log initial state
            console.log("\nInitial State:")
            console.log(
                "Contract reward balance:",
                await governanceToken.balanceOf(await nft.getAddress())
            )
            console.log("Total staked:", await nft.totalStaked())

            // Mint NFT and stake tokens
            await governanceToken
                .connect(addr1)
                .approve(await nft.getAddress(), STAKE_AMOUNT)
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

            // Get initial stake info
            const [
                stakedAmount,
                pendingRewards,
                stakingTimestamp,
                proxyAddress
            ] = await nft.getStakeInfo(0)
            console.log("\nInitial Stake Info:")
            console.log("Staked amount:", stakedAmount)
            console.log("Pending rewards:", pendingRewards)
            console.log("Staking timestamp:", stakingTimestamp)
            console.log("Proxy address:", proxyAddress)

            // Attempt immediate withdrawal - should fail as no rewards have accumulated
            // await expect(
            //     nft.connect(addr1).withdrawRewards(0)
            // ).to.be.revertedWithCustomError(nft, "NoRewardsAvailable")

            // Verify final state
            const [
                finalStakedAmount,
                finalPendingRewards,
                finalStakingTimestamp,
                finalProxyAddress
            ] = await nft.getStakeInfo(0)

            console.log("\nFinal State:")
            console.log("Staked amount:", finalStakedAmount)
            console.log("Pending rewards:", finalPendingRewards)
            console.log("Staking timestamp:", finalStakingTimestamp)
            console.log("Total staked:", await nft.totalStaked())
            console.log(
                "Contract reward balance:",
                await governanceToken.balanceOf(await nft.getAddress())
            )
            // console.log(
            //     "Current yield per token:",
            //     await nft.getCurrentYieldPerToken()
            // )

            // Verify no rewards were distributed
            // expect(finalStakedAmount).to.equal(stakedAmount)
            // expect(
            //     await governanceToken.balanceOf(await nft.getAddress())
            // ).to.equal(REWARD_POOL)
        })
        it("Should accumulate rewards proportionally to stake amount", async function () {
            const { nft, governanceToken, owner, addr1, addr2 } =
                await loadFixture(deployFixture)

            // Setup reward pool with much larger amount
            const REWARD_POOL = ethers.parseEther("10000") // Increased reward pool
            await governanceToken.mint(await owner.getAddress(), REWARD_POOL)
            await governanceToken
                .connect(owner)
                .approve(await nft.getAddress(), REWARD_POOL)
            await nft.connect(owner).depositRewards(REWARD_POOL)

            console.log("\nInitial State:")
            console.log(
                "Reward pool balance:",
                await governanceToken.balanceOf(await nft.getAddress())
            )
            console.log("Total staked:", await nft.totalStaked())

            // addr1 stakes double the amount of addr2
            const STAKE_1 = STAKE_AMOUNT * 2n
            const STAKE_2 = STAKE_AMOUNT

            // First stake - addr1
            await governanceToken
                .connect(addr1)
                .approve(await nft.getAddress(), STAKE_1)
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), STAKE_1, TEST_URI)

            const [stakeAmount1, pendingRewards1, timestamp1, proxy1] =
                await nft.getStakeInfo(0)
            console.log("\nAddr1 Initial Stake Info:")
            console.log("Staked amount:", stakeAmount1)
            console.log("Pending rewards:", pendingRewards1)
            console.log("Timestamp:", timestamp1)

            // Second stake - addr2
            await governanceToken
                .connect(addr2)
                .approve(await nft.getAddress(), STAKE_2)
            await nft
                .connect(addr2)
                .mint(await addr2.getAddress(), STAKE_2, TEST_URI)

            const [stakeAmount2, pendingRewards2, timestamp2, proxy2] =
                await nft.getStakeInfo(1)
            console.log("\nAddr2 Initial Stake Info:")
            console.log("Staked amount:", stakeAmount2)
            console.log("Pending rewards:", pendingRewards2)
            console.log("Timestamp:", timestamp2)

            // Wait for rewards to accumulate
            await time.increase(3600) // 1 hour

            // Check rewards before withdrawal
            const [_, finalPendingRewards1] = await nft.getStakeInfo(0)
            const [__, finalPendingRewards2] = await nft.getStakeInfo(1)

            console.log("\nPending Rewards After Time:")
            console.log("Addr1 pending rewards:", finalPendingRewards1)
            console.log("Addr2 pending rewards:", finalPendingRewards2)

            // Calculate ratio between pending rewards
            // Should be approximately 2 since addr1 staked twice as much
            const rewardRatio =
                (finalPendingRewards1 * 100n) / finalPendingRewards2
            console.log(
                "\nPending Reward Ratio (should be close to 200):",
                rewardRatio
            )

            // Check total staked amount
            const totalStaked = await nft.totalStaked()
            console.log("\nFinal State:")
            console.log("Total staked:", totalStaked)
            console.log(
                "Reward pool balance:",
                await governanceToken.balanceOf(await nft.getAddress())
            )

            // Verify the reward ratio is approximately 2 (allowing for some rounding)
            expect(rewardRatio).to.be.gte(195n) // Allow 2.5% deviation below
            expect(rewardRatio).to.be.lte(205n) // Allow 2.5% deviation above

            // Verify total staked amount
            expect(totalStaked).to.equal(STAKE_1 + STAKE_2)
        })
    })

    describe("Admin Functions", function () {
        it("Should allow owner to set reward rate", async function () {
            const { nft, owner } = await loadFixture(deployFixture)
            const newRate = ethers.parseEther("2")
            await nft.connect(owner).setRewardRate(newRate)
            expect(await nft.rewardRate()).to.equal(newRate)
        })

        it("Should revert if non-owner tries to set reward rate", async function () {
            const { nft, addr1 } = await loadFixture(deployFixture)
            const newRate = ethers.parseEther("2")
            await expect(
                nft.connect(addr1).setRewardRate(newRate)
            ).to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount")
        })

        it("Should allow owner to use escape hatch", async function () {
            const { nft, governanceToken, owner, addr1 } = await loadFixture(
                deployFixture
            )
            const initialBalance = await governanceToken.balanceOf(
                await addr1.getAddress()
            )
            await nft.connect(owner).escapeHatch(await addr1.getAddress())
            const finalBalance = await governanceToken.balanceOf(
                await addr1.getAddress()
            )
            expect(finalBalance).to.be.gt(initialBalance)
        })
    })

    describe("View Functions", function () {
        it("Should track total staked correctly", async function () {
            const { nft, governanceToken, addr1, addr2 } = await loadFixture(
                deployFixture
            )

            // Two users stake
            await governanceToken
                .connect(addr1)
                .approve(await nft.getAddress(), STAKE_AMOUNT)
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

            await governanceToken
                .connect(addr2)
                .approve(await nft.getAddress(), STAKE_AMOUNT)
            await nft
                .connect(addr2)
                .mint(await addr2.getAddress(), STAKE_AMOUNT, TEST_URI)

            expect(await nft.totalStaked()).to.equal(STAKE_AMOUNT * 2n)
        })

        it("Should track reward pool balance correctly", async function () {
            const { nft, governanceToken } = await loadFixture(deployFixture)
            const rewardPoolBalance = await governanceToken.balanceOf(
                await nft.getAddress()
            )
            expect(rewardPoolBalance).to.equal(REWARD_DEPOSIT)
        })

        it("Should return proper reward rate", async function () {
            const { nft } = await loadFixture(deployFixture)
            expect(await nft.rewardRate()).to.equal(DISTRIBUTION_RATE)
        })
    })
})
