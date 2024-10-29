// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";

/**
 * @title MockERC20
 * @dev Implementation of a mock ERC20 token with voting capabilities for testing purposes.
 * This contract combines ERC20 functionality with burning, permit, and voting features.
 */
contract MockERC20 is ERC20, ERC20Burnable, ERC20Permit, ERC20Votes {
    /**
     * @dev Constructor that sets up the token with name, and symbol
     */
    constructor() ERC20("MockERC20", "MOCK") ERC20Permit("MockERC20") {}

    /**
     * @dev Allows people to mint new tokens
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) public {
        require(to != address(0), "Cannot mint to zero address");
        require(amount > 0, "Amount must be greater than zero");
        _mint(to, amount);
    }

    /**
     * @dev Returns the current timestamp as required by ERC20Votes
     */
    function clock() public view override returns (uint48) {
        return uint48(block.timestamp);
    }

    /**
     * @dev Returns the clock mode for the contract
     */
    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public pure override returns (string memory) {
        return "mode=timestamp";
    }

    /**
     * @dev Hook that is called before any transfer of tokens
     * @param from Address tokens are transferred from
     * @param to Address tokens are transferred to
     * @param value Amount of tokens being transferred
     */
    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) {
        super._update(from, to, value);
    }

    /**
     * @dev Returns the current nonce for an address
     * @param owner Address to get nonce for
     */
    function nonces(address owner) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}
