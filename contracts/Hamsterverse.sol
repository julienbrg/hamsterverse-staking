// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./StakeProxy.sol";
import "./IStakeProxy.sol";

/**
 * @title Hamsterverse
 * @dev Implementation of an NFT contract that allows staking of governance tokens and delegation of voting power.
 */
contract Hamsterverse is ERC721, ERC721Enumerable, ERC721URIStorage {
    using SafeERC20 for IERC20;

    uint256 private _nextTokenId;
    address public governanceToken;

    // Mapping from token ID to its stake proxy
    mapping(uint256 => address) public stakeProxies;

    event Staked(uint256 indexed tokenId, address indexed token, uint256 amount);
    event Withdrawn(uint256 indexed tokenId, address indexed token, uint256 amount);
    event WithdrawnAll(uint256 indexed tokenId, address indexed token, uint256 amount);
    event DelegatedToken(uint256 indexed tokenId, address indexed token, address indexed delegatee);
    event ProxyDeployed(uint256 indexed tokenId, address proxy);

    constructor(address _governanceToken) ERC721("Hamsterverse", "HAM") {
        require(_governanceToken != address(0), "Invalid governance token address");
        governanceToken = _governanceToken;
    }

    function mint(address to, string memory uri, uint256 amount) public {
        require(to != address(0), "Cannot mint to zero address");
        require(amount > 0, "Amount must be greater than 0");

        uint256 tokenId = _nextTokenId++;

        StakeProxy proxy = new StakeProxy(address(this), governanceToken, tokenId);
        stakeProxies[tokenId] = address(proxy);
        emit ProxyDeployed(tokenId, address(proxy));

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);

        IERC20(governanceToken).safeTransferFrom(msg.sender, address(proxy), amount);
        emit Staked(tokenId, governanceToken, amount);
    }

    function stake(uint256 tokenId, uint256 amount) external {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        require(amount > 0, "Amount must be greater than 0");

        address proxy = stakeProxies[tokenId];
        require(proxy != address(0), "No proxy for token");

        IERC20(governanceToken).safeTransferFrom(msg.sender, proxy, amount);
        emit Staked(tokenId, governanceToken, amount);
    }

    function withdraw(uint256 tokenId, uint256 amount) external {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        require(amount > 0, "Amount must be greater than 0");

        address proxy = stakeProxies[tokenId];
        require(proxy != address(0), "No proxy for token");

        uint256 currentStake = IStakeProxy(proxy).getBalance();
        require(currentStake >= amount, "Insufficient staked amount");

        IStakeProxy(proxy).withdraw(msg.sender, amount);
        emit Withdrawn(tokenId, governanceToken, amount);
    }

    function withdrawAll(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");

        address proxy = stakeProxies[tokenId];
        require(proxy != address(0), "No proxy for token");

        uint256 amount = IStakeProxy(proxy).getBalance();
        require(amount > 0, "No stakes found");

        IStakeProxy(proxy).withdraw(msg.sender, amount);
        emit WithdrawnAll(tokenId, governanceToken, amount);
    }

    function stakedAmount(uint256 tokenId) external view returns (uint256) {
        address proxy = stakeProxies[tokenId];
        if (proxy == address(0)) return 0;
        return IStakeProxy(proxy).getBalance();
    }

    function delegateStakedTokens(uint256 tokenId, address delegatee) external {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        require(delegatee != address(0), "Invalid delegatee address");

        address proxy = stakeProxies[tokenId];
        require(proxy != address(0), "No proxy for token");

        IStakeProxy(proxy).delegate(delegatee);
        emit DelegatedToken(tokenId, governanceToken, delegatee);
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
