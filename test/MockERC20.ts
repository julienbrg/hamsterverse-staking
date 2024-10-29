import { expect } from "chai"
import { ethers } from "hardhat"
import { MockERC20 } from "../typechain-types"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"

describe("MockERC20", function () {
    let mockToken: MockERC20
    let owner: HardhatEthersSigner
    let addr1: HardhatEthersSigner
    let addr2: HardhatEthersSigner

    beforeEach(async function () {
        ;[owner, addr1, addr2] = await ethers.getSigners()
        const MockERC20Factory = await ethers.getContractFactory("MockERC20")
        mockToken = await MockERC20Factory.deploy(owner.address)
        await mockToken.waitForDeployment()
    })

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            expect(await mockToken.owner()).to.equal(owner.address)
        })

        it("Should have the correct name and symbol", async function () {
            expect(await mockToken.name()).to.equal("MockERC20")
            expect(await mockToken.symbol()).to.equal("MOCK")
        })

        it("Should have zero initial supply", async function () {
            expect(await mockToken.totalSupply()).to.equal(0)
        })
    })

    describe("Minting", function () {
        it("Should allow owner to mint tokens", async function () {
            await mockToken.mint(addr1.address, 1000)
            expect(await mockToken.balanceOf(addr1.address)).to.equal(1000)
            expect(await mockToken.totalSupply()).to.equal(1000)
        })

        it("Should emit Transfer event on mint", async function () {
            await expect(mockToken.mint(addr1.address, 1000))
                .to.emit(mockToken, "Transfer")
                .withArgs(ethers.ZeroAddress, addr1.address, 1000)
        })

        it("Should not allow non-owners to mint", async function () {
            await expect(
                mockToken.connect(addr1).mint(addr2.address, 1000)
            ).to.be.revertedWithCustomError(
                mockToken,
                "OwnableUnauthorizedAccount"
            )
        })
    })

    describe("Transfers", function () {
        beforeEach(async function () {
            await mockToken.mint(addr1.address, 1000)
        })

        it("Should transfer tokens between accounts", async function () {
            await mockToken.connect(addr1).transfer(addr2.address, 500)
            expect(await mockToken.balanceOf(addr1.address)).to.equal(500)
            expect(await mockToken.balanceOf(addr2.address)).to.equal(500)
        })

        it("Should emit Transfer event on transfer", async function () {
            await expect(mockToken.connect(addr1).transfer(addr2.address, 500))
                .to.emit(mockToken, "Transfer")
                .withArgs(addr1.address, addr2.address, 500)
        })

        it("Should fail if sender has insufficient balance", async function () {
            await expect(
                mockToken.connect(addr1).transfer(addr2.address, 1500)
            ).to.be.revertedWithCustomError(
                mockToken,
                "ERC20InsufficientBalance"
            )
        })
    })

    describe("ERC20Permit", function () {
        const amount = 100n
        let domain: {
            name: string
            version: string
            chainId: number
            verifyingContract: string
        }
        let types: {
            Permit: Array<{ name: string; type: string }>
        }

        beforeEach(async function () {
            await mockToken.mint(owner.address, 1000)

            const chainId = await ethers.provider
                .getNetwork()
                .then(n => n.chainId)
            domain = {
                name: "MockERC20",
                version: "1",
                chainId: Number(chainId),
                verifyingContract: await mockToken.getAddress()
            }

            types = {
                Permit: [
                    { name: "owner", type: "address" },
                    { name: "spender", type: "address" },
                    { name: "value", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                    { name: "deadline", type: "uint256" }
                ]
            }
        })

        it("Should permit and transferFrom", async function () {
            const deadline = ethers.MaxUint256
            const nonce = await mockToken.nonces(owner.address)

            const signature = await owner.signTypedData(domain, types, {
                owner: owner.address,
                spender: addr1.address,
                value: amount,
                nonce,
                deadline
            })

            const sig = ethers.Signature.from(signature)

            await mockToken.permit(
                owner.address,
                addr1.address,
                amount,
                deadline,
                sig.v,
                sig.r,
                sig.s
            )

            expect(
                await mockToken.allowance(owner.address, addr1.address)
            ).to.equal(amount)

            await mockToken
                .connect(addr1)
                .transferFrom(owner.address, addr2.address, amount)
            expect(await mockToken.balanceOf(addr2.address)).to.equal(amount)
        })
    })

    describe("ERC20Votes", function () {
        beforeEach(async function () {
            await mockToken.mint(addr1.address, 1000)
        })

        it("Should track voting power", async function () {
            await mockToken.connect(addr1).delegate(addr1.address)
            expect(await mockToken.getVotes(addr1.address)).to.equal(1000)
        })

        it("Should transfer voting power on token transfer", async function () {
            await mockToken.connect(addr1).delegate(addr1.address)
            await mockToken.connect(addr1).transfer(addr2.address, 600)

            expect(await mockToken.getVotes(addr1.address)).to.equal(400)

            await mockToken.connect(addr2).delegate(addr2.address)
            expect(await mockToken.getVotes(addr2.address)).to.equal(600)
        })

        it("Should allow delegation to another account", async function () {
            await mockToken.connect(addr1).delegate(addr2.address)
            expect(await mockToken.getVotes(addr2.address)).to.equal(1000)
            expect(await mockToken.getVotes(addr1.address)).to.equal(0)
        })
    })

    describe("Burning", function () {
        beforeEach(async function () {
            await mockToken.mint(addr1.address, 1000)
        })

        it("Should allow token holders to burn their tokens", async function () {
            await mockToken.connect(addr1).burn(500)
            expect(await mockToken.balanceOf(addr1.address)).to.equal(500)
            expect(await mockToken.totalSupply()).to.equal(500)
        })

        it("Should emit Transfer event on burn", async function () {
            await expect(mockToken.connect(addr1).burn(500))
                .to.emit(mockToken, "Transfer")
                .withArgs(addr1.address, ethers.ZeroAddress, 500)
        })

        it("Should not allow burning more than balance", async function () {
            await expect(
                mockToken.connect(addr1).burn(1500)
            ).to.be.revertedWithCustomError(
                mockToken,
                "ERC20InsufficientBalance"
            )
        })
    })
})
