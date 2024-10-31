import "@nomiclabs/hardhat-ethers"
import color from "cli-color"
const msg = color.xterm(39).bgXterm(128)
import hre, { network } from "hardhat"

function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

const GOVERNANCE_TOKEN_ADDRESS = "0x11dc980faf34a1d082ae8a6a883db3a950a3c6e8"
const DISTRIBUTION_RATE = hre.ethers.parseEther("0.1") // 0.1 tokens per second

export default async ({ getNamedAccounts, deployments }: any) => {
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()
    console.log("Deployer:", deployer)

    const verificationConfig = {
        sepolia: {
            waitTime: 90,
            explorerUrl: "https://sepolia.etherscan.io/address/",
            needsMockToken: true
        },
        optimism: {
            waitTime: 20,
            explorerUrl: "https://optimistic.etherscan.io/address/",
            needsMockToken: false
        },
        "op-sepolia": {
            waitTime: 90,
            explorerUrl: "https://sepolia-optimism.etherscan.io/address/",
            needsMockToken: true
        },
        base: {
            waitTime: 20,
            explorerUrl: "https://basescan.org/address/",
            needsMockToken: false
        }
    }

    const currentNetwork = hre.network.name as keyof typeof verificationConfig

    if (!(currentNetwork in verificationConfig)) {
        throw new Error(`Unsupported network: ${currentNetwork}`)
    }

    let governanceTokenAddress: string

    // Deploy MockToken only on test networks
    if (verificationConfig[currentNetwork].needsMockToken) {
        const mockToken = await deploy("MockERC20", {
            from: deployer,
            args: [],
            log: true,
            waitConfirmations: 1
        })

        governanceTokenAddress = mockToken.address

        console.log(
            "\nMockERC20 token contract deployed to",
            currentNetwork + ":",
            msg(mockToken.address)
        )
        console.log(
            "View on block explorer:",
            verificationConfig[currentNetwork].explorerUrl + mockToken.address
        )

        // Verify MockToken
        try {
            console.log("\nEtherscan verification in progress...")
            await wait(verificationConfig[currentNetwork].waitTime * 1000)

            await hre.run("verify:verify", {
                network: network.name,
                address: mockToken.address,
                constructorArguments: []
            })

            console.log("MockToken verification done. ✅")
        } catch (error) {
            console.error("MockToken verification error:", error)
        }

        // For test networks, mint initial supply and deposit rewards
        if (verificationConfig[currentNetwork].needsMockToken) {
            const tokenContract = await hre.ethers.getContractAt(
                "MockERC20",
                mockToken.address
            )
            const amount = hre.ethers.parseEther("10000")
            const mintTx = await tokenContract.mint(deployer, amount)
            await mintTx.wait(1)
            console.log(
                `\nMinted ${hre.ethers.formatEther(
                    amount
                )} tokens to ${deployer}`
            )
        }
    } else {
        // Use existing governance token on mainnet networks
        governanceTokenAddress = GOVERNANCE_TOKEN_ADDRESS
    }

    // Deploy HamsterverseStakingNFT
    const hamsterverse = await deploy("HamsterverseStakingNFT", {
        from: deployer,
        args: [governanceTokenAddress, DISTRIBUTION_RATE, deployer],
        log: true,
        waitConfirmations: 1
    })

    console.log(
        "\nHamsterverse contract deployed to",
        currentNetwork + ":",
        msg(hamsterverse.address)
    )
    console.log(
        "View on block explorer:",
        verificationConfig[currentNetwork].explorerUrl + hamsterverse.address
    )

    // Deposit initial rewards only on test networks
    if (verificationConfig[currentNetwork].needsMockToken) {
        console.log("\nDepositing initial rewards...")
        const tokenContract = await hre.ethers.getContractAt(
            "MockERC20",
            governanceTokenAddress
        )
        const nftContract = await hre.ethers.getContractAt(
            "HamsterverseStakingNFT",
            hamsterverse.address
        )

        const rewardAmount = hre.ethers.parseEther("1000")
        const approveTx = await tokenContract.approve(
            hamsterverse.address,
            rewardAmount
        )
        await approveTx.wait(1)

        const depositTx = await nftContract.depositRewards(rewardAmount)
        await depositTx.wait(1)
        console.log(
            `Deposited ${hre.ethers.formatEther(
                rewardAmount
            )} tokens as rewards`
        )
    }

    // Verify HamsterverseStakingNFT
    try {
        console.log("\nEtherscan verification in progress...")
        await wait(verificationConfig[currentNetwork].waitTime * 1000)

        await hre.run("verify:verify", {
            network: network.name,
            address: hamsterverse.address,
            constructorArguments: [
                governanceTokenAddress,
                DISTRIBUTION_RATE,
                deployer
            ]
        })

        console.log("HamsterverseStakingNFT verification done. ✅")
    } catch (error) {
        console.error("HamsterverseStakingNFT verification error:", error)
    }
}

export const tags = ["Hamsterverse"]
