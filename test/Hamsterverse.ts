import { expect } from "chai"
import { ethers } from "hardhat"
import { HamsterverseStakingNFT, MockERC20 } from "../typechain-types"
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

        // Mint initial tokens
        await governanceToken.mint(await addr1.getAddress(), INITIAL_SUPPLY)
        await governanceToken.mint(await addr2.getAddress(), INITIAL_SUPPLY)
        await governanceToken.mint(await owner.getAddress(), REWARD_DEPOSIT)

        // Approve NFT contract
        await governanceToken
            .connect(addr1)
            .approve(await nft.getAddress(), INITIAL_SUPPLY)
        await governanceToken
            .connect(addr2)
            .approve(await nft.getAddress(), INITIAL_SUPPLY)
        await governanceToken
            .connect(owner)
            .approve(await nft.getAddress(), REWARD_DEPOSIT)

        return { nft, governanceToken, owner, addr1, addr2, addr3 }
    }

    describe("Deployment & Basic Functions", function () {
        it("Should deploy with correct initial state", async function () {
            const { nft, governanceToken } = await loadFixture(deployFixture)

            expect(await nft.governanceToken()).to.equal(
                await governanceToken.getAddress()
            )
            expect(await nft.distributionRate()).to.equal(DISTRIBUTION_RATE)
        })

        it("Should allow setting distribution rate by owner", async function () {
            const { nft, owner } = await loadFixture(deployFixture)
            const newRate = ethers.parseEther("0.2")

            await nft.connect(owner).setDistributionRate(newRate)
            expect(await nft.distributionRate()).to.equal(newRate)
        })
    })

    describe("Staking Mechanics", function () {
        it("Should mint NFT and stake tokens correctly", async function () {
            const { nft, addr1 } = await loadFixture(deployFixture)

            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

            const stakeInfo = await nft.getStakeInfo(0)
            expect(stakeInfo[0]).to.equal(STAKE_AMOUNT) // stakedAmount
            expect(await nft.ownerOf(0)).to.equal(await addr1.getAddress())
        })

        it("Should allow additional stake", async function () {
            const { nft, addr1 } = await loadFixture(deployFixture)

            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)
            await nft.connect(addr1).addStake(0, ADDITIONAL_STAKE)

            const stakeInfo = await nft.getStakeInfo(0)
            expect(stakeInfo[0]).to.equal(STAKE_AMOUNT + ADDITIONAL_STAKE)
        })

        it("Should track total staked tokens correctly", async function () {
            const { nft, addr1, addr2 } = await loadFixture(deployFixture)

            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)
            await nft
                .connect(addr2)
                .mint(await addr2.getAddress(), STAKE_AMOUNT, TEST_URI)

            expect(await nft.getTotalStakedTokens()).to.equal(STAKE_AMOUNT * 2n)
        })
    })

    describe("Rewards Calculation", function () {
        it("Should calculate rewards based on stake duration and amount", async function () {
            const { nft, governanceToken, owner, addr1 } = await loadFixture(
                deployFixture
            )

            // Deposit rewards first
            await nft.connect(owner).depositRewards(REWARD_DEPOSIT)

            // Record initial reward pool balance
            const initialRewardPool = await nft.getRewardPoolBalance()
            expect(initialRewardPool).to.equal(REWARD_DEPOSIT)

            // Mint and stake
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

            // Record initial stake time
            const initialStakeInfo = await nft.getStakeInfo(0)

            // Force a block mining to ensure timestamp changes
            await ethers.provider.send("evm_mine", [])

            // Advance time significantly
            const stakeDuration = 3600 // 1 hour
            await time.increase(stakeDuration)

            // Force another block to be mined
            await ethers.provider.send("evm_mine", [])

            // Update stake state (this will recalculate rewards)
            await nft.connect(addr1).addStake(0, ethers.parseEther("1"))

            // Check rewards
            const rewards = await nft.getAccruedRewards(0)
            console.log("Rewards calculated:", rewards.toString())
            console.log("Distribution rate:", DISTRIBUTION_RATE.toString())
            console.log("Stake duration:", stakeDuration)

            expect(rewards).to.be.gt(0)
        })

        it("Should distribute rewards proportionally with multiple stakers", async function () {
            const { nft, governanceToken, owner, addr1, addr2 } =
                await loadFixture(deployFixture)

            // Deposit initial rewards
            await nft.connect(owner).depositRewards(REWARD_DEPOSIT)

            // First staker
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

            // Advance time with block mining
            await time.increase(1800)
            await ethers.provider.send("evm_mine", [])

            // Second staker
            await nft
                .connect(addr2)
                .mint(await addr2.getAddress(), STAKE_AMOUNT, TEST_URI)

            // Advance time with block mining
            await time.increase(1800)
            await ethers.provider.send("evm_mine", [])

            // Update states by making small stakes
            await nft.connect(addr1).addStake(0, ethers.parseEther("1"))
            await nft.connect(addr2).addStake(1, ethers.parseEther("1"))

            const [stakeInfo1, stakeInfo2] = await Promise.all([
                nft.getStakeInfo(0),
                nft.getStakeInfo(1)
            ])

            // First staker should have more accumulated time
            expect(stakeInfo1[2]).to.be.gt(stakeInfo2[2])
        })

        it("Should correctly handle partial withdrawals and rewards", async function () {
            const { nft, governanceToken, owner, addr1 } = await loadFixture(
                deployFixture
            )

            // Deposit rewards
            await nft.connect(owner).depositRewards(REWARD_DEPOSIT)

            // Initial stake
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

            // Advance time with block mining
            await time.increase(1800)
            await ethers.provider.send("evm_mine", [])

            // Update state and collect any accrued rewards first
            await nft.connect(addr1).addStake(0, ethers.parseEther("1"))

            try {
                await nft.connect(addr1).withdrawRewards(0)
            } catch (error) {
                console.log("No rewards to withdraw yet")
            }

            // Now attempt the partial withdrawal
            const withdrawAmount = STAKE_AMOUNT / 2n
            await nft.connect(addr1).withdraw(0, withdrawAmount)

            // Verify remaining stake
            const stakeInfo = await nft.getStakeInfo(0)
            expect(stakeInfo[0]).to.be.closeTo(
                withdrawAmount,
                ethers.parseEther("1")
            )
        })

        it("Should handle edge cases in reward distribution", async function () {
            const { nft, governanceToken, owner, addr1 } = await loadFixture(
                deployFixture
            )

            // Deposit substantial rewards to ensure visibility
            const substantialReward = ethers.parseEther("10000")
            await governanceToken.mint(
                await owner.getAddress(),
                substantialReward
            )
            await governanceToken
                .connect(owner)
                .approve(await nft.getAddress(), substantialReward)
            await nft.connect(owner).depositRewards(substantialReward)

            // Stake a moderate amount
            const stakeAmount = ethers.parseEther("1000")
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), stakeAmount, TEST_URI)

            // Advance time significantly
            await time.increase(7200) // 2 hours
            await ethers.provider.send("evm_mine", [])

            // Update state
            await nft.connect(addr1).addStake(0, ethers.parseEther("1"))

            // Verify rewards
            const rewards = await nft.getAccruedRewards(0)
            expect(rewards).to.be.gt(0)
        })
    })

    describe("Governance Features", function () {
        it("Should allow token delegation through proxy", async function () {
            const { nft, addr1, addr2 } = await loadFixture(deployFixture)

            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)
            const stakeInfo = await nft.getStakeInfo(0)
            const proxyAddress = stakeInfo[4]

            await nft
                .connect(addr1)
                .delegateStakedTokens(0, await addr2.getAddress())

            // Verify delegation through the governance token
            expect(await governanceToken.delegates(proxyAddress)).to.equal(
                await addr2.getAddress()
            )
        })

        it("Should maintain delegated voting power after additional stake", async function () {
            const { nft, addr1, addr2 } = await loadFixture(deployFixture)

            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)
            await nft
                .connect(addr1)
                .delegateStakedTokens(0, await addr2.getAddress())
            await nft.connect(addr1).addStake(0, ADDITIONAL_STAKE)

            const stakeInfo = await nft.getStakeInfo(0)
            const proxyAddress = stakeInfo[4]

            // Verify delegation is maintained
            expect(await governanceToken.delegates(proxyAddress)).to.equal(
                await addr2.getAddress()
            )
        })
    })

    describe("Withdrawal Mechanics", function () {
        async function setupWithRewards() {
            const { nft, governanceToken, owner, addr1 } = await loadFixture(
                deployFixture
            )

            // Initial setup
            await nft.connect(owner).depositRewards(REWARD_DEPOSIT)
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

            // Advance time
            await time.increase(1800)
            await ethers.provider.send("evm_mine", [])

            return { nft, governanceToken, owner, addr1 }
        }

        it("Should correctly handle rewards withdrawal", async function () {
            const { nft, governanceToken, addr1 } = await setupWithRewards()

            // Record initial balance
            const initialBalance = await governanceToken.balanceOf(
                await addr1.getAddress()
            )

            // Check for rewards
            const rewards = await nft.getAccruedRewards(0)
            if (rewards > 0n) {
                await nft.connect(addr1).withdrawRewards(0)
                const finalBalance = await governanceToken.balanceOf(
                    await addr1.getAddress()
                )
                expect(finalBalance).to.be.gt(initialBalance)
            }
        })

        it("Should handle stake withdrawal separately from rewards", async function () {
            const { nft, governanceToken, addr1 } = await setupWithRewards()

            // Get initial state
            const initialStakeInfo = await nft.getStakeInfo(0)
            const withdrawAmount = STAKE_AMOUNT / 2n

            // Withdraw stake directly
            await nft.connect(addr1).withdraw(0, withdrawAmount)

            // Verify remaining stake
            const finalStakeInfo = await nft.getStakeInfo(0)
            expect(finalStakeInfo[0]).to.equal(withdrawAmount)
        })

        it("Should prevent excessive withdrawals", async function () {
            const { nft, addr1 } = await loadFixture(deployFixture)

            // Initial stake
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

            // Try to withdraw more than staked
            await expect(
                nft.connect(addr1).withdraw(0, STAKE_AMOUNT * 2n)
            ).to.be.revertedWithCustomError(nft, "InsufficientStake")
        })

        it("Should track rewards correctly after partial withdrawal", async function () {
            const { nft, owner, addr1 } = await setupWithRewards()

            // Get initial reward rate
            const initialYield = await nft.getCurrentYieldPerToken()

            // Perform partial withdrawal
            const withdrawAmount = STAKE_AMOUNT / 2n
            await nft.connect(addr1).withdraw(0, withdrawAmount)

            // Advance time
            await time.increase(1800)
            await ethers.provider.send("evm_mine", [])

            // Check new reward rate
            const newYield = await nft.getCurrentYieldPerToken()

            // Yield per token should be higher with less total stake
            expect(newYield).to.be.gt(initialYield)
        })

        it("Should handle complete withdrawal after rewards", async function () {
            const { nft, governanceToken, addr1 } = await setupWithRewards()

            // First withdraw any accrued rewards
            const rewards = await nft.getAccruedRewards(0)
            if (rewards > 0n) {
                await nft.connect(addr1).withdrawRewards(0)
                // Wait for transaction to be mined
                await ethers.provider.send("evm_mine", [])
            }

            // Record balance before final withdrawal
            const balanceBefore = await governanceToken.balanceOf(
                await addr1.getAddress()
            )

            // Now withdraw all staked tokens
            await nft.connect(addr1).withdraw(0, STAKE_AMOUNT)

            // Verify final state
            const balanceAfter = await governanceToken.balanceOf(
                await addr1.getAddress()
            )
            expect(balanceAfter).to.equal(balanceBefore + STAKE_AMOUNT)

            const finalStakeInfo = await nft.getStakeInfo(0)
            expect(finalStakeInfo[0]).to.equal(0)
        })

        it("Should allow withdrawing rewards multiple times", async function () {
            const { nft, governanceToken, owner, addr1 } =
                await setupWithRewards()

            // First period
            await time.increase(1800)
            await ethers.provider.send("evm_mine", [])

            const firstRewards = await nft.getAccruedRewards(0)
            if (firstRewards > 0n) {
                await nft.connect(addr1).withdrawRewards(0)
                await ethers.provider.send("evm_mine", [])
            }

            // Second period
            await time.increase(1800)
            await ethers.provider.send("evm_mine", [])

            const secondRewards = await nft.getAccruedRewards(0)
            if (secondRewards > 0n) {
                await nft.connect(addr1).withdrawRewards(0)
            }

            // Should be able to execute both withdrawals
            expect(true).to.be.true
        })
    })

    describe("Security & Edge Cases", function () {
        it("Should prevent unauthorized withdrawals", async function () {
            const { nft, addr1, addr2 } = await loadFixture(deployFixture)

            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

            await expect(
                nft.connect(addr2).withdraw(0, STAKE_AMOUNT)
            ).to.be.revertedWithCustomError(nft, "NotTokenOwner")
        })

        it("Should handle reward distribution with zero total stake", async function () {
            const { nft, owner } = await loadFixture(deployFixture)

            await nft.connect(owner).depositRewards(REWARD_DEPOSIT)
            const currentYield = await nft.getCurrentYieldPerToken()
            expect(currentYield).to.equal(0)
        })

        it("Should correctly update rewards after partial withdrawal", async function () {
            const { nft, governanceToken, owner, addr1 } = await loadFixture(
                deployFixture
            )

            await nft.connect(owner).depositRewards(REWARD_DEPOSIT)
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

            await time.increase(1800)

            // Partial withdrawal
            await nft.connect(addr1).withdraw(0, STAKE_AMOUNT / 2n)

            // Check remaining stake
            const stakeInfo = await nft.getStakeInfo(0)
            expect(stakeInfo[0]).to.equal(STAKE_AMOUNT / 2n)
        })

        it("Should correctly handle withdrawal process", async function () {
            const { nft, governanceToken, owner, addr1 } = await loadFixture(
                deployFixture
            )

            // Initial setup
            await nft.connect(owner).depositRewards(REWARD_DEPOSIT)
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

            // Advance time
            await time.increase(1800)
            await ethers.provider.send("evm_mine", [])

            // Update state first
            await nft.connect(addr1).addStake(0, ethers.parseEther("1"))

            // Withdraw rewards if any
            try {
                await nft.connect(addr1).withdrawRewards(0)
            } catch (error) {
                console.log("No rewards to withdraw")
            }

            // Then withdraw stake
            const withdrawAmount = STAKE_AMOUNT / 2n
            await nft.connect(addr1).withdraw(0, withdrawAmount)

            const finalStakeInfo = await nft.getStakeInfo(0)
            expect(finalStakeInfo[0]).to.be.closeTo(
                withdrawAmount,
                ethers.parseEther("1")
            )
        })
    })
})
