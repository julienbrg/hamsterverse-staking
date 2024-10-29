import { expect } from "chai"
import { ethers } from "hardhat"
import { Hamsterverse } from "../typechain-types"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"

describe("Hamsterverse", function () {
    let nft: Hamsterverse
    let owner: HardhatEthersSigner
    let addr1: HardhatEthersSigner
    let addr2: HardhatEthersSigner

    beforeEach(async function () {
        ;[owner, addr1, addr2] = await ethers.getSigners()
        const NFTFactory = await ethers.getContractFactory("Hamsterverse")
        nft = await NFTFactory.deploy(owner.address)
        await nft.waitForDeployment()
    })

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            expect(await nft.owner()).to.equal(owner.address)
        })

        it("Should have the correct name and symbol", async function () {
            expect(await nft.name()).to.equal("Hamsterverse")
            expect(await nft.symbol()).to.equal("HAM")
        })

        it("Should mint initial token to owner", async function () {
            expect(await nft.ownerOf(1)).to.equal(owner.address)
            expect(await nft.balanceOf(owner.address)).to.equal(1)
        })
    })

    describe("Base URI", function () {
        it("Should return the correct token URI", async function () {
            expect(await nft.tokenURI(1)).to.equal("x1")
        })
    })

    describe("Transfers", function () {
        it("Should allow owner to transfer their token", async function () {
            await nft.transferFrom(owner.address, addr1.address, 1)
            expect(await nft.ownerOf(1)).to.equal(addr1.address)
            expect(await nft.balanceOf(addr1.address)).to.equal(1)
            expect(await nft.balanceOf(owner.address)).to.equal(0)
        })

        it("Should allow approved address to transfer token", async function () {
            await nft.approve(addr1.address, 1)
            await nft
                .connect(addr1)
                .transferFrom(owner.address, addr2.address, 1)
            expect(await nft.ownerOf(1)).to.equal(addr2.address)
        })

        it("Should clear approvals after transfer", async function () {
            await nft.approve(addr1.address, 1)
            await nft.transferFrom(owner.address, addr2.address, 1)
            expect(await nft.getApproved(1)).to.equal(ethers.ZeroAddress)
        })
    })

    describe("Approvals", function () {
        it("Should allow owner to approve another address", async function () {
            await nft.approve(addr1.address, 1)
            expect(await nft.getApproved(1)).to.equal(addr1.address)
        })

        it("Should not allow non-owner to approve", async function () {
            await expect(
                nft.connect(addr1).approve(addr2.address, 1)
            ).to.be.revertedWithCustomError(nft, "ERC721InvalidApprover")
        })

        it("Should allow owner to set approval for all", async function () {
            await nft.setApprovalForAll(addr1.address, true)
            expect(await nft.isApprovedForAll(owner.address, addr1.address)).to
                .be.true
        })

        it("Should emit Approval event", async function () {
            await expect(nft.approve(addr1.address, 1))
                .to.emit(nft, "Approval")
                .withArgs(owner.address, addr1.address, 1)
        })

        it("Should emit ApprovalForAll event", async function () {
            await expect(nft.setApprovalForAll(addr1.address, true))
                .to.emit(nft, "ApprovalForAll")
                .withArgs(owner.address, addr1.address, true)
        })
    })

    describe("Error cases", function () {
        it("Should revert when querying non-existent token", async function () {
            await expect(nft.ownerOf(2)).to.be.revertedWithCustomError(
                nft,
                "ERC721NonexistentToken"
            )
        })

        it("Should revert when transferring token that sender doesn't own", async function () {
            await expect(
                nft.connect(addr1).transferFrom(addr1.address, addr2.address, 1)
            ).to.be.revertedWithCustomError(nft, "ERC721InsufficientApproval")
        })

        it("Should revert when transferring to zero address", async function () {
            await expect(
                nft.transferFrom(owner.address, ethers.ZeroAddress, 1)
            ).to.be.revertedWithCustomError(nft, "ERC721InvalidReceiver")
        })
    })

    describe("Ownership", function () {
        it("Should allow owner to transfer ownership", async function () {
            await nft.transferOwnership(addr1.address)
            expect(await nft.owner()).to.equal(addr1.address)
        })

        it("Should prevent non-owner from transferring ownership", async function () {
            await expect(
                nft.connect(addr1).transferOwnership(addr2.address)
            ).to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount")
        })

        it("Should not allow transferring ownership to zero address", async function () {
            await expect(
                nft.transferOwnership(ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(nft, "OwnableInvalidOwner")
        })
    })

    describe("Interface Support", function () {
        it("Should support required interfaces", async function () {
            // ERC165 Interface ID
            expect(await nft.supportsInterface("0x01ffc9a7")).to.be.true
            // ERC721 Interface ID
            expect(await nft.supportsInterface("0x80ac58cd")).to.be.true
            // ERC721Metadata Interface ID
            expect(await nft.supportsInterface("0x5b5e139f")).to.be.true
        })

        it("Should not support random interface", async function () {
            expect(await nft.supportsInterface("0x12345678")).to.be.false
        })
    })
})
