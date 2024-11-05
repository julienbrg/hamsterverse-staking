// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.22;

/** Custom Errors */
error NotTokenOwner(uint256 tokenId, address caller);
error InvalidAddress();
error InsufficientStake(uint256 requested, uint256 available);
error NoRewardsAvailable();
error InvalidRate();
error InvalidAmount();
error InvalidTokenId();

/**
 * @title IStakeProxy
 * @dev Interface for the StakeProxy contract
 */
interface IStakeProxy {
    function delegate(address delegatee) external;

    function withdraw(address to, uint256 amount) external;

    function getBalance() external view returns (uint256);
}
