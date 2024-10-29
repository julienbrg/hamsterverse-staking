// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Hamsterverse
 * @dev Implementation of an NFT contract that allows staking of governance tokens and delegation of voting power.
 */
contract Hamsterverse is ERC721, ERC721Enumerable, ERC721URIStorage {
    using SafeERC20 for IERC20;

    uint256 private _nextTokenId;
    address public governanceToken;

    mapping(uint256 => mapping(address => uint256)) public _stakes;
    mapping(uint256 => address) public _delegators;

    event Staked(uint256 indexed tokenId, address indexed token, uint256 amount);
    event Withdrawn(uint256 indexed tokenId, address indexed token, uint256 amount);
    event WithdrawnAll(uint256 indexed tokenId, address indexed token, uint256 amount);
    event Delegated(address indexed token, address indexed delegatee);

    /**
     * @dev Constructor initializes the NFT collection and sets the governance token address
     * @param _governanceToken Address of the ERC20 token that can be staked
     */
    constructor(address _governanceToken) ERC721("Hamsterverse", "HAM") {
        require(_governanceToken != address(0), "Invalid governance token address");
        governanceToken = _governanceToken;
    }

    /**
     * @dev Safely mints a new token
     * @param to The address that will own the minted token
     * @param uri The token URI for metadata
     */
    function safeMint(address to, string memory uri) public {
        require(to != address(0), "Cannot mint to zero address");
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
    }

    /**
     * @dev Stakes or adds more governance tokens to a specific NFT
     * @param tokenId The NFT token ID to stake against
     * @param amount The amount of governance tokens to stake
     */
    function stake(uint256 tokenId, uint256 amount) external {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        require(amount > 0, "Amount must be greater than 0");

        IERC20(governanceToken).safeTransferFrom(msg.sender, address(this), amount);
        _stakes[tokenId][governanceToken] += amount;

        // Only set delegator if not already set
        if (_delegators[tokenId] == address(0)) {
            _delegators[tokenId] = msg.sender;
        }

        emit Staked(tokenId, governanceToken, amount);
    }

    /**
     * @dev Withdraws a specific amount of staked governance tokens from an NFT
     * @param tokenId The NFT token ID to withdraw from
     * @param amount The amount of governance tokens to withdraw
     */
    function withdraw(uint256 tokenId, uint256 amount) external {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        require(amount > 0, "Amount must be greater than 0");

        uint256 currentStake = _stakes[tokenId][governanceToken];
        require(currentStake >= amount, "Insufficient staked amount");

        _stakes[tokenId][governanceToken] = currentStake - amount;
        IERC20(governanceToken).safeTransfer(msg.sender, amount);

        emit Withdrawn(tokenId, governanceToken, amount);
    }

    /**
     * @dev Withdraws all staked governance tokens from a specific NFT
     * @param tokenId The NFT token ID to withdraw all stakes from
     */
    function withdrawAll(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        uint256 amount = _stakes[tokenId][governanceToken];
        require(amount > 0, "No stakes found");

        _stakes[tokenId][governanceToken] = 0;
        IERC20(governanceToken).safeTransfer(msg.sender, amount);

        emit WithdrawnAll(tokenId, governanceToken, amount);
    }

    /**
     * @dev Returns the amount of tokens staked for a specific NFT
     * @param tokenId The NFT token ID to check
     * @return The amount of staked tokens
     */
    function stakedAmount(uint256 tokenId) external view returns (uint256) {
        return _stakes[tokenId][governanceToken];
    }

    /**
     * @dev Delegates the staked tokens' voting power to another address
     * @param tokenId The NFT token ID whose staked tokens are being delegated
     * @param delegatee The address to delegate voting power to
     */
    function delegateStakedTokens(uint256 tokenId, address delegatee) external {
        require(governanceToken != address(0), "Invalid token address");
        require(delegatee != address(0), "Invalid delegatee address");
        require(msg.sender == _delegators[tokenId], "Invalid delegator");

        (bool success, ) = governanceToken.call(
            abi.encodeWithSignature("delegate(address)", delegatee)
        );
        require(success, "Delegation failed");

        emit Delegated(governanceToken, delegatee);
    }

    // Required overrides
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override(ERC721, ERC721Enumerable) returns (address) {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(
        address account,
        uint128 value
    ) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, ERC721Enumerable, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
