// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

import "./StakeBurnProxy.sol";

/**
 * @title HamsterverseBurningNFT
 * @dev An NFT contract for staking tokens with a burn mechanic and delegation. Each NFT represents a stake in tokens that are slowly burned over time.
 */
contract HamsterverseBurningNFT is ERC721, ERC721Enumerable, ERC721URIStorage, ReentrancyGuard, Ownable {
    IERC20 public stakingToken;
    uint256 public burnRate; // Burn rate in basis points
    uint256 public decayFactor; // Controls burn rate decay over time

    mapping(uint256 => uint256) public lastBurnedTimestamp;
    mapping(uint256 => uint256) public totalBurned; // Tracks total burned for each NFT
    mapping(uint256 => address) public nftProxy;
    uint256 private _nextTokenId;

    event Withdrawn(uint256 indexed tokenId, address indexed owner, uint256 amount);
    event TokensBurned(uint256 indexed tokenId, uint256 amount, string graf);
    event DelegatedToken(uint256 indexed tokenId, address indexed token, address indexed delegatee);
    // no Staked event because funds and be directly deposited

    constructor(address _stakingToken, uint256 _burnRate, uint256 _decayFactor, address _initialOwner) 
        ERC721("BurntHam", "BHAM")
        Ownable(_initialOwner) 
    {
        stakingToken = IERC20(_stakingToken);
        burnRate = _burnRate;
        decayFactor = _decayFactor;
    }

    /**
     * @notice Sets the burn rate in basis points.
     * @dev Only the contract owner can call this.
     * @param _burnRate New burn rate in basis points.
     */
    function setBurnRate(uint256 _burnRate) external onlyOwner {
        burnRate = _burnRate;
    }

    /**
     * @notice Sets the decay factor for the burn rate curve.
     * @dev Only the contract owner can call this.
     * @param _decayFactor New decay factor.
     */
    function setDecayFactor(uint256 _decayFactor) external onlyOwner {
        decayFactor = _decayFactor;
    }

    /**
     * @notice Mints an NFT and stakes tokens into a proxy for gradual burning.
     * @param amount Amount of tokens to stake.
     * @param tokenUri URI for the NFT metadata.
     */
    function mintAndStake(uint256 amount, string memory tokenUri) external {
        if (amount == 0) revert InvalidTokenAmount();

        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, tokenUri);

        StakeProxyBurnNft proxy = new StakeProxyBurnNft(address(this), stakingToken, tokenId);
        nftProxy[tokenId] = address(proxy);

        stakingToken.transferFrom(msg.sender, address(proxy), amount);

        lastBurnedTimestamp[tokenId] = block.timestamp;
    }

    /**
     * @notice Add stake to any nft
     * @param tokenId id of the nft
     * @param amount Amount of tokens to stake.
     */
    function addStake(uint256 tokenId, uint256 amount) external {
        if (amount == 0) revert InvalidTokenAmount();

        StakeProxyBurnNft proxy = StakeProxyBurnNft(nftProxy[tokenId]);

        stakingToken.transferFrom(msg.sender, address(proxy), amount);

    }

    /**
     * @notice Burns a portion of the stake based on the elapsed time.
     * @param tokenId ID of the NFT whose stake is to be burned.
     * @param graf Optional identifier for the burn transaction.
     * @return totalBurnAmount The total amount burned.
     */
    function burnStake(uint256 tokenId, string memory graf) public returns(uint256 totalBurnAmount) {
        if (nftProxy[tokenId] == address(0)) revert ProxyNotSet();

        StakeProxyBurnNft proxy = StakeProxyBurnNft(nftProxy[tokenId]);
        totalBurnAmount = getNextBurnAmount(tokenId);

        if (totalBurnAmount == 0) revert NothingToBurn();

        proxy.burn(totalBurnAmount);

        // Update total burned and last burn timestamp
        totalBurned[tokenId] += totalBurnAmount;
        uint256 lastBurn = lastBurnedTimestamp[tokenId];
        uint256 secondsElapsed = (block.timestamp - lastBurn);
        lastBurnedTimestamp[tokenId] = lastBurn + secondsElapsed;

        emit TokensBurned(tokenId, totalBurnAmount, graf);
    }

    /**
     * @notice Batch burn for multiple NFTs in a given range.
     * @notice start and end allows pagination for large supplies
     * @notice start and end should be 0 if all is true
     * @param start Start of the range.
     * @param end End of the range.
     * @param all If true, burns for all NFTs.
     * @return totalBatchBurned Total tokens burned in the batch.
     */
    function burnBatch(uint256 start, uint256 end, bool all) public returns(uint256 totalBatchBurned) {
        uint256 balance = _nextTokenId;
        uint256 _start = all ? 0 : start;
        uint256 _end = all ? balance - 1 : end;

        if (_start > _end) revert InvalidTokenAmount();

        for (uint256 i = _start; i <= _end; i++) {
            totalBatchBurned += burnStake(i, "b");
        }
    }

    /**
     * @notice Withdraws remaining stake after burn.
     * @param tokenId ID of the NFT for withdrawal.
     * @param amount Amount to withdraw.
     * @param to Address to receive the withdrawn amount.
     */
    function withdrawRemainingStake(uint256 tokenId, uint256 amount, address to) external onlyNFTOwner(tokenId) {
        burnStake(tokenId, "w"); // Ensure burn is applied before any withdrawal

        StakeProxyBurnNft proxy = StakeProxyBurnNft(nftProxy[tokenId]);
        proxy.withdraw(to, amount);

        emit Withdrawn(tokenId, msg.sender, amount);
    }

    /**
     * @notice Gets the total amount burned for an NFT.
     * @param tokenId ID of the NFT.
     * @return The total burned amount for the NFT.
     */
    function getTotalBurned(uint256 tokenId) external view returns (uint256) {
        return totalBurned[tokenId];
    }

    /**
     * @notice Calculates the next burn amount based on time elapsed and remaining stake.
     * @param tokenId ID of the NFT.
     * @return Amount to be burned.
     */
    function getNextBurnAmount(uint256 tokenId) public view returns (uint256) {
        StakeProxyBurnNft proxy = StakeProxyBurnNft(nftProxy[tokenId]);
        uint256 stakedAmount = proxy.getBalance();
        uint256 lastBurn = lastBurnedTimestamp[tokenId];
        uint256 secondsElapsed = (block.timestamp - lastBurn);
        return (stakedAmount * burnRate * secondsElapsed) / (stakedAmount / decayFactor);
    }

    /**
     * @notice Calculates total tokens burned for all NFTs.
     * @return totalBurnedAll Total tokens burned across all NFTs.
     */
    function getTotalBurnedAll() public view returns (uint256 totalBurnedAll) {
        uint256 balance = _nextTokenId;
        for (uint256 i = 0; i < balance; i++) {
            totalBurnedAll += totalBurned[i];
        }
    }

    /**
     * @notice Calculates total tokens pending burn across all NFTs.
     * @return totalPendingBurnAll Total tokens pending burn for all NFTs.
     */
    function getTotalPendingBurnAll() public view returns (uint256 totalPendingBurnAll) {
        uint256 balance = _nextTokenId;
        for (uint256 i = 0; i < balance; i++) {
            totalPendingBurnAll += getNextBurnAmount(i);
        }
    }

    /**
     * @notice Delegate staked tokens to another address.
     * @param tokenId ID of the NFT.
     * @param delegatee Address to delegate to.
     */
    function delegateStakedTokens(uint256 tokenId, address delegatee) external onlyNFTOwner(tokenId) {
        if (delegatee == address(0)) revert InvalidDelegatee();
        address proxy = nftProxy[tokenId];
        if (proxy == address(0)) revert ProxyNotSet();

        IStakeBurnProxy(proxy).delegate(delegatee);
        emit DelegatedToken(tokenId, address(stakingToken), delegatee);
    }

    modifier onlyNFTOwner(uint256 tokenId) {
        if (ownerOf(tokenId) != msg.sender) revert NotNFTOwner(tokenId, msg.sender);
        _;
    }

    // Overrides for Solidity compatibility
    function _update(address to, uint256 tokenId, address auth) internal override(ERC721, ERC721Enumerable) returns (address) {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721Enumerable, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}