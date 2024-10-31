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

/**
 * @title HamsterverseStakingNFT
 * @dev ERC721 NFT contract for staking governance tokens with dynamic yield based on total staked tokens.
 * Rewards decrease as more users stake, with a fixed reward distribution rate (tokens per second).
 */
contract HamsterverseStakingNFT is
    ERC721,
    ERC721Enumerable,
    ERC721URIStorage,
    ReentrancyGuard,
    Ownable
{
    uint256 public constant SCALING_FACTOR = 1e18;

    struct StakeData {
        uint256 stakeTimestamp; // Timestamp when staking began
        uint256 lastRewardTimestamp; // Timestamp of the last reward calculation
        uint256 accumulatedStakeSeconds; // Accumulated stake seconds for reward calculations
    }

    uint256 private _nextTokenId; // ID for the next NFT to be minted
    address public governanceToken; // ERC20 token used for staking and rewards
    uint256 public distributionRate; // Fixed tokens per second for reward distribution

    mapping(uint256 => address) public stakeProxies; // Maps each tokenId to its staking proxy contract
    mapping(uint256 => StakeData) private _stakeData; // Mapping to store staking data for each NFT
    uint256 public totalStakeSeconds; // Total accumulated stake seconds across all NFTs

    event RewardDeposited(address indexed depositor, uint256 amount);
    event Staked(uint256 indexed tokenId, address indexed token, uint256 amount);
    event Withdrawn(uint256 indexed tokenId, address indexed token, uint256 amount);
    event ProxyDeployed(uint256 indexed tokenId, address proxy);
    event EscapeHatchActivated(address indexed to, uint256 amount);
    event DelegatedToken(uint256 indexed tokenId, address indexed token, address indexed delegatee);

    /**
     * @dev Initializes the contract by setting the governance token address and initial distribution rate.
     * @param _governanceToken Address of the ERC20 governance token used for staking.
     * @param _initialDistributionRate Initial tokens per second for reward distribution.
     * @param _initialOwner Address of the initial contract owner.
     */
    constructor(
        address _governanceToken,
        uint256 _initialDistributionRate,
        address _initialOwner
    ) ERC721("Hamsterverse", "HAM") Ownable(_initialOwner) {
        if (_governanceToken == address(0)) revert InvalidAddress();
        governanceToken = _governanceToken;
        distributionRate = _initialDistributionRate;
    }

    modifier onlyTokenOwner(uint256 tokenId) {
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner(tokenId, msg.sender);
        _;
    }

    /**
     * @dev Internal function to update staking time for a specific NFT.
     * Should be called before any stake modifications or reward calculations.
     * @param tokenId The ID of the NFT whose staking time is being updated.
     */
    function _updateStakeTime(uint256 tokenId) internal {
        StakeData storage data = _stakeData[tokenId];
        address proxy = stakeProxies[tokenId];
        uint256 stakedAmount = IERC20(governanceToken).balanceOf(proxy);

        // Initialize lastRewardTimestamp if not set
        if (data.lastRewardTimestamp == 0) {
            data.lastRewardTimestamp = data.stakeTimestamp > 0
                ? data.stakeTimestamp
                : block.timestamp;
        }

        // Only update if there's a stake amount
        if (stakedAmount > 0) {
            uint256 duration = block.timestamp - data.lastRewardTimestamp;
            uint256 newStakeSeconds = stakedAmount * duration;

            // Update accumulated values
            data.accumulatedStakeSeconds += newStakeSeconds;
            totalStakeSeconds += newStakeSeconds;
        }

        // Always update the last reward timestamp
        data.lastRewardTimestamp = block.timestamp;
    }

    /**
     * @dev Returns the accrued rewards for a specific NFT.
     * @param tokenId The ID of the NFT for which rewards are being calculated.
     * @return The amount of accrued rewards.
     */
    function _getAccruedRewards(uint256 tokenId) internal view returns (uint256) {
        StakeData storage data = _stakeData[tokenId];
        if (totalStakeSeconds == 0) return 0;

        uint256 userStakeSeconds = data.accumulatedStakeSeconds;
        address proxy = stakeProxies[tokenId];
        uint256 stakedAmount = IERC20(governanceToken).balanceOf(proxy);

        if (stakedAmount > 0 && data.lastRewardTimestamp > 0) {
            uint256 duration = block.timestamp - data.lastRewardTimestamp;
            userStakeSeconds += (stakedAmount * duration);
        }

        // Calculate proportionate rewards with scaling
        uint256 rewardAmount = (distributionRate * userStakeSeconds * SCALING_FACTOR) /
            totalStakeSeconds;
        return rewardAmount / SCALING_FACTOR;
    }

    /**
     * @dev Calculates the reward for a given NFT based on accumulated stake seconds.
     * @param tokenId The ID of the NFT for which rewards are being calculated.
     * @return The amount of reward tokens the NFT is eligible to receive.
     */
    function _calculateReward(uint256 tokenId) internal view returns (uint256) {
        uint256 rewardAmount = _getAccruedRewards(tokenId);
        uint256 currentRewardPoolBalance = IERC20(governanceToken).balanceOf(address(this));
        return rewardAmount > currentRewardPoolBalance ? currentRewardPoolBalance : rewardAmount;
    }

    /**
     * @dev Internal function to handle reward calculations and transfers
     * @param tokenId The ID of the NFT for which rewards are being processed
     * @return The amount of rewards processed
     */
    function _processRewards(uint256 tokenId) internal returns (uint256) {
        StakeData storage data = _stakeData[tokenId];
        address proxy = stakeProxies[tokenId];
        uint256 stakedAmount = IERC20(governanceToken).balanceOf(proxy);

        // Calculate current period stake seconds
        uint256 currentPeriodStakeSeconds = 0;
        if (stakedAmount > 0 && data.lastRewardTimestamp > 0) {
            uint256 duration = block.timestamp - data.lastRewardTimestamp;
            currentPeriodStakeSeconds = stakedAmount * duration;
        }

        // Calculate total user stake seconds including current period
        uint256 totalUserStakeSeconds = data.accumulatedStakeSeconds + currentPeriodStakeSeconds;

        // Only proceed if there are stake seconds to process
        if (totalUserStakeSeconds > 0 && totalStakeSeconds > 0) {
            // Calculate rewards based on total stake seconds
            uint256 reward = (distributionRate * totalUserStakeSeconds * SCALING_FACTOR) /
                totalStakeSeconds;
            reward = reward / SCALING_FACTOR;

            // Check against available rewards
            uint256 availableRewards = IERC20(governanceToken).balanceOf(address(this));
            reward = reward > availableRewards ? availableRewards : reward;

            if (reward > 0) {
                // Update state before transfer
                totalStakeSeconds =
                    totalStakeSeconds +
                    currentPeriodStakeSeconds -
                    totalUserStakeSeconds;
                data.accumulatedStakeSeconds = 0;
                data.lastRewardTimestamp = block.timestamp;

                // Transfer rewards
                IERC20(governanceToken).transfer(msg.sender, reward);
                emit Withdrawn(tokenId, governanceToken, reward);

                return reward;
            }
        }

        // Update timestamp even if no rewards were processed
        data.lastRewardTimestamp = block.timestamp;
        return 0;
    }

    /**
     * @notice Allows users to mint an NFT and initiate their stake.
     * @param to The address to receive the minted NFT.
     * @param amount The initial amount of tokens to stake.
     * @param uri The URI for the NFT metadata.
     */
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
            accumulatedStakeSeconds: 0
        });

        IERC20(governanceToken).transferFrom(msg.sender, address(proxy), amount);
        emit Staked(tokenId, governanceToken, amount);
    }

    /**
     * @notice Allows delegation of staked tokens.
     * @param tokenId The NFT's token ID.
     * @param delegatee Address to delegate voting power to.
     */
    function delegateStakedTokens(
        uint256 tokenId,
        address delegatee
    ) external onlyTokenOwner(tokenId) {
        _updateStakeTime(tokenId);
        require(delegatee != address(0), "Invalid delegatee address");

        address proxy = stakeProxies[tokenId];
        require(proxy != address(0), "No proxy for token");

        IStakeProxy(proxy).delegate(delegatee);
        emit DelegatedToken(tokenId, governanceToken, delegatee);
    }

    /**
     * @notice Allows users to deposit tokens into the reward pool.
     * @param amount The amount of tokens to deposit.
     */
    function depositRewards(uint256 amount) external {
        if (amount == 0) revert InsufficientStake(1, 0);
        IERC20(governanceToken).transferFrom(msg.sender, address(this), amount);
        emit RewardDeposited(msg.sender, amount);
    }

    /**
     * @notice Allows contract owner to set the reward distribution rate.
     * @param rate The new tokens per second rate for reward distribution.
     */
    function setDistributionRate(uint256 rate) external onlyOwner {
        if (rate == 0) revert InvalidRate();
        distributionRate = rate;
    }

    function withdraw(
        uint256 tokenId,
        uint256 amount
    ) external nonReentrant onlyTokenOwner(tokenId) {
        _updateStakeTime(tokenId);

        if (amount == 0) revert InvalidAmount();

        address proxy = stakeProxies[tokenId];
        if (proxy == address(0)) revert InvalidAddress();

        uint256 currentStake = IERC20(governanceToken).balanceOf(proxy);
        if (amount > currentStake) {
            revert InsufficientStake(amount, currentStake);
        }

        // For complete withdrawals, clean up all state
        if (amount == currentStake) {
            // Update total stake seconds before deleting data
            if (currentStake > 0 && _stakeData[tokenId].lastRewardTimestamp > 0) {
                uint256 duration = block.timestamp - _stakeData[tokenId].lastRewardTimestamp;
                totalStakeSeconds -= (currentStake * duration);
            }
            delete _stakeData[tokenId];
        }

        // Perform the withdrawal
        IStakeProxy(proxy).withdraw(msg.sender, amount);
        emit Withdrawn(tokenId, governanceToken, amount);
    }

    /**
     * @notice Allows NFT owners to withdraw only accrued rewards.
     * @param tokenId The ID of the NFT for which rewards are being withdrawn.
     */
    function withdrawRewards(uint256 tokenId) public nonReentrant onlyTokenOwner(tokenId) {
        _updateStakeTime(tokenId);
        uint256 reward = _processRewards(tokenId);
        if (reward == 0) revert NoRewardsAvailable();
    }

    /**
     * @notice Allows NFT owners to add more tokens to their stake.
     * @param tokenId The ID of the NFT for which additional tokens are being staked.
     * @param amount The amount of tokens to add to the existing stake.
     */
    function addStake(uint256 tokenId, uint256 amount) external onlyTokenOwner(tokenId) {
        _updateStakeTime(tokenId);

        if (amount == 0) revert InvalidAmount();

        address proxy = stakeProxies[tokenId];
        if (proxy == address(0)) revert InvalidAddress();

        IERC20(governanceToken).transferFrom(msg.sender, proxy, amount);
        emit Staked(tokenId, governanceToken, amount);
    }

    /**
     * @notice Emergency function to withdraw remaining reward pool tokens.
     * @param to Address to receive the withdrawn tokens.
     */
    function escapeHatch(address to) external onlyOwner {
        require(to != address(0), "Invalid address");
        uint256 rewardPoolBalance = IERC20(governanceToken).balanceOf(address(this));
        if (rewardPoolBalance == 0) revert NoRewardsAvailable();
        IERC20(governanceToken).transfer(to, rewardPoolBalance);
        emit EscapeHatchActivated(to, rewardPoolBalance);
    }

    /**
     * @notice Provides staking information for a given NFT.
     * @param tokenId The ID of the NFT.
     */
    function getStakeInfo(
        uint256 tokenId
    )
        external
        view
        returns (
            uint256 stakedAmount,
            uint256 stakeTimestamp,
            uint256 accumulatedStakeSeconds,
            uint256 pendingReward,
            address proxyAddress
        )
    {
        if (ownerOf(tokenId) == address(0)) revert InvalidTokenId();

        address proxy = stakeProxies[tokenId];
        StakeData storage data = _stakeData[tokenId];
        uint256 currentStake = IERC20(governanceToken).balanceOf(proxy);

        // Calculate current accumulated stake seconds
        uint256 currentAccumulatedSeconds = data.accumulatedStakeSeconds;
        if (currentStake > 0 && data.lastRewardTimestamp > 0) {
            uint256 duration = block.timestamp - data.lastRewardTimestamp;
            currentAccumulatedSeconds += (currentStake * duration);
        }

        return (
            currentStake,
            data.stakeTimestamp,
            currentAccumulatedSeconds,
            _calculateReward(tokenId),
            proxy
        );
    }

    /**
     * @notice Returns global staking statistics.
     */
    function getStakingStats()
        external
        view
        returns (
            uint256 _totalStakeSeconds,
            uint256 _totalRewardPoolBalance,
            uint256 _distributionRate
        )
    {
        return (
            totalStakeSeconds,
            IERC20(governanceToken).balanceOf(address(this)),
            distributionRate
        );
    }

    /**
     * @notice Returns the current reward pool balance.
     */
    function getRewardPoolBalance() external view returns (uint256) {
        return IERC20(governanceToken).balanceOf(address(this));
    }

    /**
     * @notice Returns total tokens staked across all NFTs.
     */
    function getTotalStakedTokens() public view returns (uint256 totalStakedTokens) {
        totalStakedTokens = 0;
        uint256 nextId = _nextTokenId;

        for (uint256 i = 0; i < nextId; i++) {
            try this.ownerOf(i) returns (address owner) {
                if (owner != address(0)) {
                    address proxy = stakeProxies[i];
                    if (proxy != address(0)) {
                        totalStakedTokens += IERC20(governanceToken).balanceOf(proxy);
                    }
                }
            } catch {
                continue;
            }
        }
        return totalStakedTokens;
    }

    /**
     * @notice Returns accrued rewards for a specific NFT.
     * @param tokenId The NFT's ID.
     */
    function getAccruedRewards(uint256 tokenId) external view returns (uint256) {
        return _getAccruedRewards(tokenId);
    }

    /**
     * @notice Calculates current reward yield per staked token.
     * @return The current reward yield per staked token per second.
     */
    function getCurrentYieldPerToken() external view returns (uint256) {
        uint256 totalStakedTokens = getTotalStakedTokens();
        if (totalStakedTokens == 0) return 0;
        return (distributionRate * SCALING_FACTOR) / totalStakedTokens;
    }

    // OpenZeppelin contract overrides

    /**
     * @dev Update hook for ERC721 token transfers.
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override(ERC721, ERC721Enumerable) returns (address) {
        return super._update(to, tokenId, auth);
    }

    /**
     * @dev Hook for increasing token balance.
     */
    function _increaseBalance(
        address account,
        uint128 value
    ) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    /**
     * @dev Returns the token URI.
     */
    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    /**
     * @dev ERC165 interface support.
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, ERC721Enumerable, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
