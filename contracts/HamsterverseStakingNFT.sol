// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "./StakeProxy.sol";

contract HamsterverseStakingNFT is
    ERC721,
    ERC721Enumerable,
    ERC721URIStorage,
    ReentrancyGuard,
    Ownable
{
    using SafeERC20 for IERC20;

    uint256 public constant SCALING_FACTOR = 1e18;

    struct StakeData {
        uint256 stakeTimestamp;
        uint256 lastRewardTimestamp;
        uint256 accumulatedStakeSeconds;
        uint256 rewardPerTokenPaid;
        uint256 rewards;
    }

    uint256 private _nextTokenId;
    address public governanceToken;
    uint256 public rewardRate;
    uint256 public rewardPerTokenStored;
    uint256 public lastUpdateTime;
    uint256 public totalStaked;

    mapping(uint256 => address) public stakeProxies;
    mapping(uint256 => StakeData) private _stakeData;

    event RewardDeposited(address indexed depositor, uint256 amount);
    event Staked(uint256 indexed tokenId, address indexed token, uint256 amount);
    event Withdrawn(uint256 indexed tokenId, address indexed token, uint256 amount);
    event RewardPaid(uint256 indexed tokenId, address indexed user, uint256 reward);
    event ProxyDeployed(uint256 indexed tokenId, address proxy);
    event EscapeHatchActivated(address indexed to, uint256 amount);
    event DelegatedToken(uint256 indexed tokenId, address indexed token, address indexed delegatee);
    event RewardRateUpdated(uint256 oldRate, uint256 newRate);

    constructor(
        address _governanceToken,
        uint256 _rewardRate,
        address _initialOwner
    ) ERC721("Hamsterverse", "HAM") Ownable(_initialOwner) {
        if (_governanceToken == address(0)) revert InvalidAddress();
        if (_rewardRate == 0) revert InvalidRate();

        governanceToken = _governanceToken;
        rewardRate = _rewardRate;
        lastUpdateTime = block.timestamp;
    }

    modifier updateReward(uint256 tokenId) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = block.timestamp;

        if (tokenId != type(uint256).max) {
            _stakeData[tokenId].rewards = earned(tokenId);
            _stakeData[tokenId].rewardPerTokenPaid = rewardPerTokenStored;
        }
        _;
    }

    modifier onlyTokenOwner(uint256 tokenId) {
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner(tokenId, msg.sender);
        _;
    }

    function rewardPerToken() public view returns (uint256) {
        if (totalStaked == 0) {
            return rewardPerTokenStored;
        }
        return
            rewardPerTokenStored +
            (((block.timestamp - lastUpdateTime) * rewardRate * SCALING_FACTOR) / totalStaked);
    }

    function earned(uint256 tokenId) public view returns (uint256) {
        StakeData storage data = _stakeData[tokenId];
        address proxy = stakeProxies[tokenId];
        uint256 balance = IERC20(governanceToken).balanceOf(proxy);

        return
            (balance * (rewardPerToken() - data.rewardPerTokenPaid)) /
            SCALING_FACTOR +
            data.rewards;
    }

    function mint(address to, uint256 amount, string memory uri) external {
        if (to == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();

        uint256 tokenId = _nextTokenId++;

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);

        StakeProxy proxy = new StakeProxy(address(this), governanceToken, tokenId);
        stakeProxies[tokenId] = address(proxy);
        emit ProxyDeployed(tokenId, address(proxy));

        _stakeData[tokenId] = StakeData({
            stakeTimestamp: block.timestamp,
            lastRewardTimestamp: block.timestamp,
            accumulatedStakeSeconds: 0,
            rewardPerTokenPaid: rewardPerTokenStored,
            rewards: 0
        });

        IERC20(governanceToken).safeTransferFrom(msg.sender, address(proxy), amount);
        totalStaked += amount;
        emit Staked(tokenId, governanceToken, amount);
    }

    function addStake(
        uint256 tokenId,
        uint256 amount
    ) external updateReward(tokenId) onlyTokenOwner(tokenId) {
        if (amount == 0) revert InvalidAmount();

        address proxy = stakeProxies[tokenId];
        if (proxy == address(0)) revert InvalidAddress();

        IERC20(governanceToken).safeTransferFrom(msg.sender, proxy, amount);
        totalStaked += amount;
        emit Staked(tokenId, governanceToken, amount);
    }

    function withdraw(
        uint256 tokenId,
        uint256 amount
    ) external nonReentrant updateReward(tokenId) onlyTokenOwner(tokenId) {
        if (amount == 0) revert InvalidAmount();

        address proxy = stakeProxies[tokenId];
        if (proxy == address(0)) revert InvalidAddress();

        uint256 currentStake = IERC20(governanceToken).balanceOf(proxy);
        if (amount > currentStake) {
            revert InsufficientStake(amount, currentStake);
        }

        IStakeProxy(proxy).withdraw(msg.sender, amount);
        totalStaked -= amount;
        emit Withdrawn(tokenId, governanceToken, amount);
    }

    function withdrawRewards(
        uint256 tokenId
    ) public nonReentrant updateReward(tokenId) onlyTokenOwner(tokenId) {
        uint256 reward = _stakeData[tokenId].rewards;
        if (reward == 0) revert NoRewardsAvailable();

        _stakeData[tokenId].rewards = 0;
        IERC20(governanceToken).safeTransfer(msg.sender, reward);
        emit RewardPaid(tokenId, msg.sender, reward);
    }

    function depositRewards(uint256 amount) external {
        if (amount == 0) revert InvalidAmount();
        IERC20(governanceToken).safeTransferFrom(msg.sender, address(this), amount);
        emit RewardDeposited(msg.sender, amount);
    }

    function setRewardRate(uint256 newRate) external onlyOwner {
        if (newRate == 0) revert InvalidRate();
        emit RewardRateUpdated(rewardRate, newRate);
        rewardRate = newRate;
    }

    function delegateStakedTokens(
        uint256 tokenId,
        address delegatee
    ) external onlyTokenOwner(tokenId) {
        if (delegatee == address(0)) revert InvalidAddress();

        address proxy = stakeProxies[tokenId];
        if (proxy == address(0)) revert InvalidAddress();

        IStakeProxy(proxy).delegate(delegatee);
        emit DelegatedToken(tokenId, governanceToken, delegatee);
    }

    function getStakeInfo(
        uint256 tokenId
    )
        external
        view
        returns (
            uint256 stakedAmount,
            uint256 pendingRewards,
            uint256 stakingTimestamp,
            address proxyAddress
        )
    {
        if (ownerOf(tokenId) == address(0)) revert InvalidTokenId();

        address proxy = stakeProxies[tokenId];
        StakeData storage data = _stakeData[tokenId];

        return (
            IERC20(governanceToken).balanceOf(proxy),
            earned(tokenId),
            data.stakeTimestamp,
            proxy
        );
    }

    function escapeHatch(address to) external onlyOwner {
        if (to == address(0)) revert InvalidAddress();
        uint256 balance = IERC20(governanceToken).balanceOf(address(this));
        if (balance == 0) revert NoRewardsAvailable();

        IERC20(governanceToken).safeTransfer(to, balance);
        emit EscapeHatchActivated(to, balance);
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
