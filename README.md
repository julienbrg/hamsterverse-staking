# Hamsterverse

Allows users to stake governance tokens in an NFT.

Metadata: https://bafkreiglxpmys7hxse45nd3ajnjzq2vjjevrlwjphtcco3pd53eq6zqu5i.ipfs.w3s.link/

You can check out the [Admin Guide](https://github.com/julienbrg/hamsterverse-staking/blob/main/ADMIN.md) to learn how to setup your contract.

Nov 1, 2024 contract instance (used in UI for demo day): [0x41F1cC5574191482Ce5A60Df5aE90E37A41319a4](https://sepolia.etherscan.io/address/0x41F1cC5574191482Ce5A60Df5aE90E37A41319a4#code)

## Supported networks

-   [OP Mainnet](https://chainlist.org/chain/10) ([docs](https://docs.optimism.io/chain/networks#op-mainnet))
-   [Sepolia Testnet](https://chainlist.org/chain/11155111) ([docs](https://ethereum.org/nb/developers/docs/networks/#sepolia))
-   [OP Sepolia Testnet](https://chainlist.org/chain/11155420) ([docs](https://docs.optimism.io/chain/networks#op-sepolia))

## Install

```
pnpm install
```

Create a `.env` file:

```
cp .env.template .env
```

Add your own keys in the `.env` file.

## Test

```
pnpm test
```

## Deploy

```
pnpm deploy:<NETWORK_NAME>
```

## Check balance

You can check the current signer wallet balance:

```
pnpm bal <NETWORK_NAME>
```

## Versions

-   Node [v20.9.0](https://nodejs.org/uk/blog/release/v20.9.0/)
-   PNPM [v9.12.2](https://pnpm.io/pnpm-vs-npm)
-   Hardhat [v2.19.4](https://github.com/NomicFoundation/hardhat/releases/)
-   OpenZeppelin Contracts [v5.1.0](https://github.com/OpenZeppelin/openzeppelin-contracts/releases/tag/v5.1.0)
-   Ethers [v6.10.0](https://docs.ethers.org/v6/)

## Support

You can contact Julien via [Element](https://matrix.to/#/@julienbrg:matrix.org), [Farcaster](https://warpcast.com/julien-), [Telegram](https://t.me/julienbrg), [Twitter](https://twitter.com/julienbrg), [Discord](https://discordapp.com/users/julienbrg), or [LinkedIn](https://www.linkedin.com/in/julienberanger/).
