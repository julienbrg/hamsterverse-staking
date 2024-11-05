# Admin Guide

## Quick Start

### 1. Environment Setup
Copy `.env.template` to `.env` and fill in:
```env
# For Sepolia testnet
SEPOLIA_RPC_ENDPOINT_URL="https://ethereum-sepolia.publicnode.com"
SEPOLIA_PRIVATE_KEY="your-private-key"  # No 0x prefix
ETHERSCAN_API_KEY="your-etherscan-api-key"

# For Optimism mainnet
OPTIMISM_MAINNET_RPC_ENDPOINT_URL="https://mainnet.optimism.io"
OPTIMISM_MAINNET_PRIVATE_KEY="your-private-key"  # No 0x prefix
OP_ETHERSCAN_API_KEY="your-op-etherscan-api-key"
```

### 2. Installation
```bash
pnpm install
```

### 3. Deployment
Deploy to your chosen network:
```bash
pnpm deploy:sepolia        # Sepolia testnet
pnpm deploy:optimism      # Optimism mainnet
pnpm deploy:base         # Base mainnet
pnpm deploy:op-sepolia   # Optimism Sepolia testnet
```

## Admin Operations

### Check Wallet Balance
```bash
pnpm bal <network-name>
# Example: pnpm bal sepolia
```

### Managing Rewards

1. **Deposit Rewards**
   - Approve the NFT contract to spend your governance tokens
   - Call `depositRewards()` with the amount of tokens to add to the reward pool
   ```solidity
   // Example amounts
   depositRewards(ethers.parseEther("1000"))  // Deposit 1000 tokens
   ```

2. **Update Reward Rate**
   - Only owner can modify the distribution rate
   - Rate is tokens per second (in wei)
   ```solidity
   // Example: Set to 0.1 tokens per second
   setRewardRate(ethers.parseEther("0.1"))
   ```

3. **Emergency Withdrawal**
   - Use `escapeHatch()` to withdraw all rewards in case of emergency
   - Only callable by owner
   ```solidity
   escapeHatch(recipientAddress)
   ```

### NFT Configuration

1. **NFT Metadata**
   - Default URI points to IPFS: `ipfs://bafkreiglxpmys7hxse45nd3ajnjzq2vjjevrlwjphtcco3pd53eq6zqu5i`
   - Contains image and description of the staking NFT

2. **Ownership**
   - Contract uses OpenZeppelin's `Ownable`
   - Transfer ownership using:
   ```solidity
   transferOwnership(newOwnerAddress)
   ```

## Network Details

### Supported Networks
- Sepolia Testnet (Chain ID: 11155111)
- Optimism Mainnet (Chain ID: 10)
- Base Mainnet (Chain ID: 8453)
- OP Sepolia Testnet (Chain ID: 11155420)

### Contract Addresses

#### Sepolia Testnet
- MockERC20: `0x5E5Fa05c481175eAd804cbC14b2489F950316e6C`
- HamsterverseStakingNFT: [Check deployment output]

## Important Considerations

### Security
1. Keep private keys secure and never commit them to repositories
2. Use multisig for mainnet deployments
3. Test all operations on testnet first

### Best Practices
1. Monitor reward distribution rate and token balances
2. Keep sufficient rewards in the contract
3. Document all parameter changes
4. Test new reward rates on testnet before mainnet

### Limits & Constraints
1. Maximum stake period: Unlimited
2. Minimum stake amount: None
3. Maximum reward rate: No hard cap (be careful!)
4. Delegation: Supported through proxy contracts

## Troubleshooting

### Common Issues
1. **Transaction Failed**
   - Check gas prices
   - Verify wallet has enough ETH
   - Confirm contract has sufficient rewards

2. **Reward Distribution Issues**
   - Verify reward rate is set correctly
   - Check contract reward balance
   - Confirm staking timestamps

3. **Verification Failed**
   - Wait longer between deployment and verification
   - Double-check API keys
   - Ensure correct constructor arguments

# Staking Reward Scenarios

## Annual Reward Requirements

| Scenario | Rate (tokens/sec) | Users | Calculation | Daily/User | Annual/User | Total Required |
|----------|------------------|--------|-------------|------------|-------------|----------------|
| A | 1.0 | 100 | 1 × 86400 × 365 × 100 | 86,400 | 31,536,000 | 3,153,600,000 |
| B | 1.0 | 50 | 1 × 86400 × 365 × 50 | 86,400 | 31,536,000 | 1,576,800,000 |
| C | 0.1 | 50 | 0.1 × 86400 × 365 × 50 | 8,640 | 3,153,600 | 157,680,000 |
| D | 0.01 | 100 | 0.01 × 86400 × 365 × 100 | 864 | 315,360 | 31,536,000 |

## Setting the Reward Rate

```solidity
// Scenario A & B: 1 token per second
await nftContract.setRewardRate(ethers.parseEther("1.0"))

// Scenario C: 0.1 tokens per second
await nftContract.setRewardRate(ethers.parseEther("0.1"))

// Scenario D: 0.01 tokens per second
await nftContract.setRewardRate(ethers.parseEther("0.01"))
```

## Required Initial Deposits
To fund 1 month of rewards:
- Scenario A: 262,800,000 tokens
- Scenario B: 131,400,000 tokens
- Scenario C: 13,140,000 tokens
- Scenario D: 2,628,000 tokens

```solidity
// Example: Depositing 1 month of rewards for Scenario D
const monthlyRewards = ethers.parseEther("2628000")
await tokenContract.approve(nftContract.address, monthlyRewards)
await nftContract.depositRewards(monthlyRewards)
```

## Key Metrics Per Scenario

### Scenario A: 1 token/sec, 100 users
- Per user per day: 86,400 tokens
- Per user per month: 2,628,000 tokens
- Per user per year: 31,536,000 tokens
- Total protocol yearly: 3,153,600,000 tokens

### Scenario B: 1 token/sec, 50 users
- Per user per day: 86,400 tokens
- Per user per month: 2,628,000 tokens
- Per user per year: 31,536,000 tokens
- Total protocol yearly: 1,576,800,000 tokens

### Scenario C: 0.1 token/sec, 50 users
- Per user per day: 8,640 tokens
- Per user per month: 262,800 tokens
- Per user per year: 3,153,600 tokens
- Total protocol yearly: 157,680,000 tokens

### Scenario D: 0.01 token/sec, 100 users
- Per user per day: 864 tokens
- Per user per month: 26,280 tokens
- Per user per year: 315,360 tokens
- Total protocol yearly: 31,536,000 tokens

## Time Constants Used
- Seconds per day: 86,400
- Seconds per month: 2,592,000 (30 days)
- Seconds per year: 31,536,000 (365 days)

## Important Notes
1. All calculations assume:
   - Continuous staking (24/7)
   - Full year duration
   - All users staking equal amounts
   
2. Actual rewards may vary due to:
   - Users entering/exiting at different times
   - Network downtime
   - Transaction timing
   - Compounding effects if rewards are restaked

3. Monitor contract balance to ensure sufficient rewards are available:
```solidity
const balance = await tokenContract.balanceOf(nftContract.address)
console.log("Reward pool balance:", ethers.formatEther(balance))
```