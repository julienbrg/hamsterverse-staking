import "@nomiclabs/hardhat-ethers"
import color from "cli-color"
const msg = color.xterm(39).bgXterm(128)
import hre, { network } from "hardhat"

function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

export default async ({ getNamedAccounts, deployments }: any) => {
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()
    console.log("Deployer:", deployer)

    const mockToken = await deploy("MockERC20", {
        from: deployer,
        args: [],
        log: true
    })

    const verificationConfig = {
        sepolia: {
            waitTime: 90,
            explorerUrl: "https://sepolia.etherscan.io/address/"
        },
        optimism: {
            waitTime: 20,
            explorerUrl: "https://optimistic.etherscan.io/address/"
        },
        "op-sepolia": {
            waitTime: 90,
            explorerUrl: "https://sepolia-optimism.etherscan.io/address/"
        }
    }

    const currentNetwork = hre.network.name as keyof typeof verificationConfig

    if (currentNetwork in verificationConfig) {
        try {
            console.log(
                "\nMockERC20 token contract deployed to",
                currentNetwork + ":",
                msg(mockToken.address)
            )
            console.log(
                "View on block explorer:",
                verificationConfig[currentNetwork].explorerUrl +
                    mockToken.address
            )

            console.log("\nMinting initial tokens...")
            const contract = await hre.ethers.getContractAt(
                "MockERC20",
                mockToken.address
            )
            const amount = hre.ethers.parseEther("10000")
            await contract.mint(deployer, amount)
            console.log(
                `Minted ${hre.ethers.formatEther(amount)} tokens to ${deployer}`
            )

            console.log("\nEtherscan verification in progress...")
            await wait(verificationConfig[currentNetwork].waitTime * 1000)

            await hre.run("verify:verify", {
                network: network.name,
                address: mockToken.address,
                constructorArguments: []
            })

            console.log("Etherscan verification done. ✅")
        } catch (error) {
            console.error("Verification error:", error)
        }
    }

    const hamsterverse = await deploy("Hamsterverse", {
        from: deployer,
        args: [mockToken.address],
        log: true
    })

    if (currentNetwork in verificationConfig) {
        try {
            console.log(
                "\nHamsterverse contract deployed to",
                currentNetwork + ":",
                msg(hamsterverse.address)
            )
            console.log(
                "View on block explorer:",
                verificationConfig[currentNetwork].explorerUrl +
                    hamsterverse.address
            )

            console.log("\nUploading metadata and minting initial NFTs...")
            const contract = await hre.ethers.getContractAt(
                "Hamsterverse",
                hamsterverse.address
            )
            const uri =
                "ipfs://bafkreiglxpmys7hxse45nd3ajnjzq2vjjevrlwjphtcco3pd53eq6zqu5i"

            // Mint initial NFT
            // await contract.safeMint(deployer, uri, 200)
            // console.log(`Minted NFT #0`)

            console.log("\nEtherscan verification in progress...")
            await wait(verificationConfig[currentNetwork].waitTime * 1000)

            await hre.run("verify:verify", {
                network: network.name,
                address: hamsterverse.address,
                constructorArguments: [mockToken.address]
            })

            console.log("Etherscan verification done. ✅")
        } catch (error) {
            console.error("Verification error:", error)
        }
    }
}

export const tags = ["Hamsterverse"]
