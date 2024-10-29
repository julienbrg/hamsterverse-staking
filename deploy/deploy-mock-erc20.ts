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
        args: [deployer],
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

            console.log("\nEtherscan verification in progress...")
            await wait(verificationConfig[currentNetwork].waitTime * 1000)

            await hre.run("verify:verify", {
                network: network.name,
                address: mockToken.address,
                constructorArguments: [deployer]
            })

            console.log("Etherscan verification done. ✅")
        } catch (error) {
            console.error("Verification error:", error)
        }
    }
}

export const tags = ["MockERC20"]
