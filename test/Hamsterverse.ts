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

    async function deployFixture() {
        ;[owner, addr1, addr2, addr3] = await ethers.getSigners()

        // Deploy MockERC20
        const MockERC20 = await ethers.getContractFactory("MockERC20")
        governanceToken = await MockERC20.deploy()

        // Deploy HamsterverseStakingNFT
        const HamsterverseStakingNFT = await ethers.getContractFactory(
            "HamsterverseStakingNFT"
        )
        nft = await HamsterverseStakingNFT.deploy(
            await governanceToken.getAddress(),
            DISTRIBUTION_RATE,
            await owner.getAddress()
        )

        // Mint initial supply to owner
        await governanceToken.mint(await owner.getAddress(), INITIAL_SUPPLY)

        // Approve NFT contract to spend tokens
        await governanceToken.approve(await nft.getAddress(), ethers.MaxUint256)

        // Deposit rewards
        await nft.depositRewards(REWARD_DEPOSIT)

        // Transfer some tokens to addr1 and approve for testing
        await governanceToken.transfer(
            await addr1.getAddress(),
            STAKE_AMOUNT * 2n
        )
        await governanceToken
            .connect(addr1)
            .approve(await nft.getAddress(), ethers.MaxUint256)

        return { governanceToken, nft, owner, addr1, addr2, addr3 }
    }

    beforeEach(async function () {
        const { governanceToken: gt, nft: n } = await loadFixture(deployFixture)
        governanceToken = gt
        nft = n
    })

    describe("Deployment", function () {
        it("Should set the correct name and symbol", async function () {
            expect(await nft.name()).to.equal("Hamsterverse")
            expect(await nft.symbol()).to.equal("HAM")
        })

        it("Should set the correct governance token", async function () {
            expect(await nft.governanceToken()).to.equal(
                await governanceToken.getAddress()
            )
        })

        it("Should set the correct reward rate", async function () {
            expect(await nft.rewardRate()).to.equal(DISTRIBUTION_RATE)
        })

        it("Should revert if initialized with zero address for governance token", async function () {
            const HamsterverseStakingNFT = await ethers.getContractFactory(
                "HamsterverseStakingNFT"
            )
            await expect(
                HamsterverseStakingNFT.deploy(
                    ZeroAddress,
                    DISTRIBUTION_RATE,
                    await owner.getAddress()
                )
            ).to.be.reverted
        })

        it("Should revert if initialized with zero reward rate", async function () {
            const HamsterverseStakingNFT = await ethers.getContractFactory(
                "HamsterverseStakingNFT"
            )
            await expect(
                HamsterverseStakingNFT.deploy(
                    await governanceToken.getAddress(),
                    0,
                    await owner.getAddress()
                )
            ).to.be.reverted
        })
    })

    describe("Minting and Staking", function () {
        it("Should mint a new NFT with staked tokens", async function () {
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

            const tokenId = 0
            expect(await nft.ownerOf(tokenId)).to.equal(
                await addr1.getAddress()
            )

            const [stakedAmount] = await nft.getStakeInfo(tokenId)
            expect(stakedAmount).to.equal(STAKE_AMOUNT)
        })

        it("Should allow adding more stake to an existing position", async function () {
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)

            await nft.connect(addr1).addStake(0, ADDITIONAL_STAKE)

            const [stakedAmount] = await nft.getStakeInfo(0)
            expect(stakedAmount).to.equal(STAKE_AMOUNT + ADDITIONAL_STAKE)
        })

        it("Should revert if minting with zero stake amount", async function () {
            await expect(
                nft.connect(addr1).mint(await addr1.getAddress(), 0, TEST_URI)
            ).to.be.revertedWithCustomError(nft, "InvalidAmount")
        })

        it("Should revert if minting to zero address", async function () {
            await expect(
                nft.connect(addr1).mint(ZeroAddress, STAKE_AMOUNT, TEST_URI)
            ).to.be.revertedWithCustomError(nft, "InvalidAddress")
        })
    })

    describe("Withdrawals", function () {
        beforeEach(async function () {
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)
        })

        it("Should allow partial withdrawal of staked tokens", async function () {
            const withdrawAmount = ethers.parseEther("50")
            await nft.connect(addr1).withdraw(0, withdrawAmount)

            const [stakedAmount] = await nft.getStakeInfo(0)
            expect(stakedAmount).to.equal(STAKE_AMOUNT - withdrawAmount)
        })

        it("Should allow full withdrawal of staked tokens", async function () {
            await nft.connect(addr1).withdraw(0, STAKE_AMOUNT)

            const [stakedAmount] = await nft.getStakeInfo(0)
            expect(stakedAmount).to.equal(0)
        })

        it("Should revert if withdrawal amount is zero", async function () {
            await expect(
                nft.connect(addr1).withdraw(0, 0)
            ).to.be.revertedWithCustomError(nft, "InvalidAmount")
        })

        it("Should revert if withdrawal amount exceeds staked amount", async function () {
            const excessAmount = STAKE_AMOUNT + 1n
            await expect(
                nft.connect(addr1).withdraw(0, excessAmount)
            ).to.be.revertedWithCustomError(nft, "InsufficientStake")
        })

        it("Should revert if caller is not the token owner", async function () {
            await expect(
                nft.connect(addr2).withdraw(0, STAKE_AMOUNT)
            ).to.be.revertedWithCustomError(nft, "NotTokenOwner")
        })
    })

    describe("Delegation", function () {
        beforeEach(async function () {
            await nft
                .connect(addr1)
                .mint(await addr1.getAddress(), STAKE_AMOUNT, TEST_URI)
        })

        it("Should allow token owner to delegate voting power", async function () {
            await nft
                .connect(addr1)
                .delegateStakedTokens(0, await addr2.getAddress())

            // Get the stake proxy address
            const [, , , proxyAddress] = await nft.getStakeInfo(0)

            // Check delegation through the governance token
            expect(await governanceToken.delegates(proxyAddress)).to.equal(
                await addr2.getAddress()
            )
        })

        it("Should revert delegation if caller is not token owner", async function () {
            await expect(
                nft
                    .connect(addr2)
                    .delegateStakedTokens(0, await addr3.getAddress())
            ).to.be.revertedWithCustomError(nft, "NotTokenOwner")
        })

        it("Should revert if delegating to zero address", async function () {
            await expect(
                nft.connect(addr1).delegateStakedTokens(0, ZeroAddress)
            ).to.be.revertedWithCustomError(nft, "InvalidAddress")
        })
    })

    describe("Admin Functions", function () {
        it("Should allow owner to update reward rate", async function () {
            const newRate = ethers.parseEther("2")
            await nft.setRewardRate(newRate)
            expect(await nft.rewardRate()).to.equal(newRate)
        })

        it("Should revert if non-owner tries to update reward rate", async function () {
            const newRate = ethers.parseEther("2")
            await expect(
                nft.connect(addr1).setRewardRate(newRate)
            ).to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount")
        })

        it("Should allow owner to use escape hatch", async function () {
            const escapeAmount = await governanceToken.balanceOf(
                await nft.getAddress()
            )
            await nft.escapeHatch(await addr2.getAddress())
            expect(
                await governanceToken.balanceOf(await addr2.getAddress())
            ).to.equal(escapeAmount)
        })

        it("Should revert if non-owner tries to use escape hatch", async function () {
            await expect(
                nft.connect(addr1).escapeHatch(await addr2.getAddress())
            ).to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount")
        })
    })
})
