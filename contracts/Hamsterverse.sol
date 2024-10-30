// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./StakeProxy.sol";
import "./IStakeProxy.sol";

contract Hamsterverse is ERC721, ERC721Enumerable, ERC721URIStorage, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct StakeData {
        uint256 stakeTimestamp;
        uint256 lastRewardTimestamp;
        uint256 accumulatedStakeSeconds;
    }

    uint256 private _nextTokenId;
    address public governanceToken;

    // Mapping from token ID to its stake proxy
    mapping(uint256 => address) public stakeProxies;
    // Track stake data per token
    mapping(uint256 => StakeData) private _stakeData;
    // Track total stake seconds across all NFTs
    uint256 public totalStakeSeconds;

    event Staked(uint256 indexed tokenId, address indexed token, uint256 amount);
    event Withdrawn(uint256 indexed tokenId, address indexed token, uint256 amount);
    event WithdrawnAll(uint256 indexed tokenId, address indexed token, uint256 amount);
    event DelegatedToken(uint256 indexed tokenId, address indexed token, address indexed delegatee);
    event ProxyDeployed(uint256 indexed tokenId, address proxy);

    constructor(address _governanceToken) ERC721("Hamsterverse", "HAM") {
        require(_governanceToken != address(0), "Invalid governance token address");
        governanceToken = _governanceToken;
    }

    function _updateStakeTime(uint256 tokenId) internal {
        StakeData storage data = _stakeData[tokenId];
        address proxy = stakeProxies[tokenId];
        uint256 stakedAmount = IERC20(governanceToken).balanceOf(proxy);

        if (stakedAmount > 0 && data.lastRewardTimestamp > 0) {
            uint256 duration = block.timestamp - data.lastRewardTimestamp;
            data.accumulatedStakeSeconds += (stakedAmount * duration);
            totalStakeSeconds += (stakedAmount * duration);
        }
        data.lastRewardTimestamp = block.timestamp;
    }

    function _calculateReward(uint256 tokenId) internal view returns (uint256) {
        StakeData storage data = _stakeData[tokenId];
        if (totalStakeSeconds == 0) return 0;

        uint256 currentBalance = IERC20(governanceToken).balanceOf(address(this));
        uint256 userStakeSeconds = data.accumulatedStakeSeconds;

        // Add current period
        address proxy = stakeProxies[tokenId];
        uint256 stakedAmount = IERC20(governanceToken).balanceOf(proxy);
        if (stakedAmount > 0 && data.lastRewardTimestamp > 0) {
            uint256 duration = block.timestamp - data.lastRewardTimestamp;
            userStakeSeconds += (stakedAmount * duration);
        }

        return (currentBalance * userStakeSeconds) / totalStakeSeconds;
    }

    function mint(address to, string memory uri, uint256 amount) public {
        require(to != address(0), "Cannot mint to zero address");
        require(amount > 0, "Amount must be greater than 0");

        uint256 tokenId = _nextTokenId++;

        // Deploy new proxy for this NFT
        StakeProxy proxy = new StakeProxy(address(this), governanceToken, tokenId);
        stakeProxies[tokenId] = address(proxy);
        emit ProxyDeployed(tokenId, address(proxy));

        // Initialize stake data
        _stakeData[tokenId] = StakeData({
            stakeTimestamp: block.timestamp,
            lastRewardTimestamp: block.timestamp,
            accumulatedStakeSeconds: 0
        });

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);

        // Transfer tokens to the proxy
        IERC20(governanceToken).safeTransferFrom(msg.sender, address(proxy), amount);
        emit Staked(tokenId, governanceToken, amount);
    }

    function stake(uint256 tokenId, uint256 amount) external {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        require(amount > 0, "Amount must be greater than 0");

        address proxy = stakeProxies[tokenId];
        require(proxy != address(0), "No proxy for token");

        _updateStakeTime(tokenId);

        IERC20(governanceToken).safeTransferFrom(msg.sender, proxy, amount);
        emit Staked(tokenId, governanceToken, amount);
    }

    function withdraw(uint256 tokenId, uint256 amount) external nonReentrant {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        require(amount > 0, "Amount must be greater than 0");

        address proxy = stakeProxies[tokenId];
        require(proxy != address(0), "No proxy for token");

        _updateStakeTime(tokenId);

        uint256 currentStake = IERC20(governanceToken).balanceOf(proxy);
        require(currentStake >= amount, "Insufficient staked amount");

        uint256 reward = _calculateReward(tokenId);
        _stakeData[tokenId].accumulatedStakeSeconds = 0; // Reset accumulated time after reward

        // Withdraw staked amount from proxy
        IStakeProxy(proxy).withdraw(msg.sender, amount);
        // Send reward from main contract
        if (reward > 0) {
            IERC20(governanceToken).safeTransfer(msg.sender, reward);
        }

        emit Withdrawn(tokenId, governanceToken, amount);
    }

    function withdrawAll(uint256 tokenId) external nonReentrant {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");

        address proxy = stakeProxies[tokenId];
        require(proxy != address(0), "No proxy for token");

        _updateStakeTime(tokenId);

        uint256 currentStake = IERC20(governanceToken).balanceOf(proxy);
        require(currentStake > 0, "No stakes found");

        uint256 reward = _calculateReward(tokenId);
        _stakeData[tokenId].accumulatedStakeSeconds = 0;

        // Withdraw all staked amount from proxy
        IStakeProxy(proxy).withdraw(msg.sender, currentStake);
        // Send reward from main contract
        if (reward > 0) {
            IERC20(governanceToken).safeTransfer(msg.sender, reward);
        }

        emit WithdrawnAll(tokenId, governanceToken, currentStake);
    }

    function delegateStakedTokens(uint256 tokenId, address delegatee) external {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        require(delegatee != address(0), "Invalid delegatee address");

        address proxy = stakeProxies[tokenId];
        require(proxy != address(0), "No proxy for token");

        IStakeProxy(proxy).delegate(delegatee);
        emit DelegatedToken(tokenId, governanceToken, delegatee);
    }

    function stakedAmount(uint256 tokenId) external view returns (uint256) {
        address proxy = stakeProxies[tokenId];
        if (proxy == address(0)) return 0;
        return IERC20(governanceToken).balanceOf(proxy);
    }

    function getStakeInfo(
        uint256 tokenId
    )
        external
        view
        returns (
            uint256 stakedAmount,
            uint256 stakeTimestamp,
            uint256 accumulatedStakeSeconds,
            uint256 pendingReward
        )
    {
        address proxy = stakeProxies[tokenId];
        StakeData storage data = _stakeData[tokenId];
        return (
            IERC20(governanceToken).balanceOf(proxy),
            data.stakeTimestamp,
            data.accumulatedStakeSeconds,
            _calculateReward(tokenId)
        );
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
