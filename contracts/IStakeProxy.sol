// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

/**
 * @title IStakeProxy
 * @dev Interface for the StakeProxy contract
 */
interface IStakeProxy {
    function delegate(address delegatee) external;

    function withdraw(address to, uint256 amount) external;

    function getBalance() external view returns (uint256);
}
