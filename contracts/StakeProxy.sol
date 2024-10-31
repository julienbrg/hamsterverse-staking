// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC1363.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "./IStakeProxy.sol";

/**
 * @title StakeProxy
 * @dev Implementation of proxy contract to hold staked tokens
 */
contract StakeProxy is IStakeProxy {
    address public immutable nft;
    address public immutable token;
    uint256 public immutable tokenId;

    event DelegatedFromProxy(address indexed token, address indexed delegatee);

    modifier onlyNFT() {
        if (msg.sender != nft) revert NotTokenOwner(tokenId, msg.sender);
        _;
    }

    constructor(address _nft, address _token, uint256 _tokenId) {
        if (_nft == address(0) || _token == address(0)) revert InvalidAddress();
        nft = _nft;
        token = _token;
        tokenId = _tokenId;
    }

    function delegate(address delegatee) external override onlyNFT {
        if (delegatee == address(0)) revert InvalidAddress();

        (bool success, ) = token.call(abi.encodeWithSignature("delegate(address)", delegatee));
        require(success, "Delegation failed");

        emit DelegatedFromProxy(token, delegatee);
    }

    function withdraw(address to, uint256 amount) external override onlyNFT {
        if (to == address(0)) revert InvalidAddress();
        IERC20(token).transfer(to, amount);
    }

    function getBalance() external view override returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }
}
