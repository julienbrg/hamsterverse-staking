// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC1363.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "./IStakeProxy.sol";

/// Custom Errors
error InvalidTokenAmount();
error ProxyNotSet();
error NotNFTOwner(uint256 tokenId, address caller);
error InvalidDelegatee();
error InsufficientStakeBalance(uint256 available, uint256 requested);
error BurnFailed();
error NothingToBurn();

interface IStakeBurnProxy is IStakeProxy {
    function burn(uint256 amount) external;
}

contract StakeProxyBurnNft is IStakeBurnProxy {
    IERC20 public stakingToken;
    address public stakingContract;
    uint256 public tokenId;

    event DelegatedFromProxy(address indexed token, address indexed delegatee);

    modifier onlyNFT() {
        if (msg.sender != stakingContract) revert("Not NFT owner");
        _;
    }

    constructor(address _stakingContract, IERC20 _stakingToken, uint256 _tokenId) {
        stakingContract = _stakingContract;
        stakingToken = _stakingToken;
        tokenId = _tokenId;
    }


    function withdraw(address to, uint256 amount) external onlyNFT {
        if (getBalance() < amount) revert InsufficientStakeBalance(getBalance(), amount);
        stakingToken.transfer(to, amount);
    }

    function burn(uint256 amount) external onlyNFT {
        if (getBalance() < amount) revert InsufficientStakeBalance(getBalance(), amount);
        (bool success, ) = address(stakingToken).call(abi.encodeWithSignature("burn(uint256)", amount));
        if (!success) revert BurnFailed();
    }

    function getBalance() public view override returns (uint256) {
        return stakingToken.balanceOf(address(this));
    }

    function delegate(address delegatee) external override onlyNFT {
        if (delegatee == address(0)) revert InvalidDelegatee();
        (bool success, ) = address(stakingToken).call(abi.encodeWithSignature("delegate(address)", delegatee));
        if (!success) revert("Delegation failed");
        emit DelegatedFromProxy(address(stakingToken), delegatee);
    }
}
