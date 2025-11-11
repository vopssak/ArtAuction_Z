pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract ArtAuction_Z is ZamaEthereumConfig {
    struct Bid {
        address bidder;
        euint32 encryptedBidAmount;
        uint256 timestamp;
        bool isDecrypted;
        uint32 decryptedBidAmount;
    }

    struct Auction {
        string nftTokenId;
        uint256 startTime;
        uint256 endTime;
        address highestBidder;
        uint32 highestBidAmount;
        bool isActive;
        mapping(address => Bid) bids;
        address[] bidders;
    }

    mapping(string => Auction) public auctions;
    string[] public auctionIds;

    event AuctionCreated(string indexed auctionId, string nftTokenId, uint256 startTime, uint256 endTime);
    event BidPlaced(string indexed auctionId, address indexed bidder, euint32 encryptedBidAmount);
    event BidDecrypted(string indexed auctionId, address indexed bidder, uint32 decryptedBidAmount);
    event AuctionFinalized(string indexed auctionId, address winner, uint32 winningBid);

    modifier auctionOngoing(string calldata auctionId) {
        require(bytes(auctions[auctionId].nftTokenId).length > 0, "Auction does not exist");
        require(block.timestamp >= auctions[auctionId].startTime && block.timestamp <= auctions[auctionId].endTime, "Auction not active");
        require(auctions[auctionId].isActive, "Auction not active");
        _;
    }

    constructor() ZamaEthereumConfig() {}

    function createAuction(
        string calldata auctionId,
        string calldata nftTokenId,
        uint256 startTime,
        uint256 endTime
    ) external {
        require(bytes(auctions[auctionId].nftTokenId).length == 0, "Auction already exists");
        require(startTime >= block.timestamp, "Start time must be in future");
        require(endTime > startTime, "End time must be after start time");

        auctions[auctionId] = Auction({
        nftTokenId: nftTokenId,
        startTime: startTime,
        endTime: endTime,
        highestBidder: address(0),
        highestBidAmount: 0,
        isActive: true
        });

        auctionIds.push(auctionId);
        emit AuctionCreated(auctionId, nftTokenId, startTime, endTime);
    }

    function placeBid(
        string calldata auctionId,
        externalEuint32 encryptedBidAmount,
        bytes calldata inputProof
    ) external auctionOngoing(auctionId) {
        require(FHE.isInitialized(FHE.fromExternal(encryptedBidAmount, inputProof)), "Invalid encrypted input");

        Auction storage auction = auctions[auctionId];
        require(auction.bids[msg.sender].encryptedBidAmount == euint32(0), "Bid already placed");

        euint32 encryptedBid = FHE.fromExternal(encryptedBidAmount, inputProof);
        auction.bids[msg.sender] = Bid({
        bidder: msg.sender,
        encryptedBidAmount: encryptedBid,
        timestamp: block.timestamp,
        isDecrypted: false,
        decryptedBidAmount: 0
        });

        auction.bidders.push(msg.sender);
        FHE.allowThis(encryptedBid);
        FHE.makePubliclyDecryptable(encryptedBid);

        emit BidPlaced(auctionId, msg.sender, encryptedBid);
    }

    function decryptBid(
        string calldata auctionId,
        bytes memory abiEncodedClearValue,
        bytes memory decryptionProof
    ) external {
        require(bytes(auctions[auctionId].nftTokenId).length > 0, "Auction does not exist");
        require(block.timestamp > auctions[auctionId].endTime, "Auction not ended");

        Auction storage auction = auctions[auctionId];
        Bid storage bid = auction.bids[msg.sender];
        require(!bid.isDecrypted, "Bid already decrypted");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(bid.encryptedBidAmount);
        FHE.checkSignatures(cts, abiEncodedClearValue, decryptionProof);

        uint32 decryptedBidAmount = abi.decode(abiEncodedClearValue, (uint32));
        bid.decryptedBidAmount = decryptedBidAmount;
        bid.isDecrypted = true;

        if (decryptedBidAmount > auction.highestBidAmount) {
            auction.highestBidAmount = decryptedBidAmount;
            auction.highestBidder = msg.sender;
        }

        emit BidDecrypted(auctionId, msg.sender, decryptedBidAmount);
    }

    function finalizeAuction(string calldata auctionId) external {
        require(bytes(auctions[auctionId].nftTokenId).length > 0, "Auction does not exist");
        require(block.timestamp > auctions[auctionId].endTime, "Auction not ended");
        require(auctions[auctionId].isActive, "Auction already finalized");

        Auction storage auction = auctions[auctionId];
        require(auction.highestBidder != address(0), "No valid bids");

        auction.isActive = false;
        emit AuctionFinalized(auctionId, auction.highestBidder, auction.highestBidAmount);
    }

    function getAuctionDetails(string calldata auctionId) external view returns (
        string memory nftTokenId,
        uint256 startTime,
        uint256 endTime,
        address highestBidder,
        uint32 highestBidAmount,
        bool isActive
    ) {
        require(bytes(auctions[auctionId].nftTokenId).length > 0, "Auction does not exist");
        Auction storage auction = auctions[auctionId];

        return (
        auction.nftTokenId,
        auction.startTime,
        auction.endTime,
        auction.highestBidder,
        auction.highestBidAmount,
        auction.isActive
        );
    }

    function getBid(string calldata auctionId, address bidder) external view returns (
        euint32 encryptedBidAmount,
        uint256 timestamp,
        bool isDecrypted,
        uint32 decryptedBidAmount
    ) {
        require(bytes(auctions[auctionId].nftTokenId).length > 0, "Auction does not exist");
        Bid storage bid = auctions[auctionId].bids[bidder];

        return (
        bid.encryptedBidAmount,
        bid.timestamp,
        bid.isDecrypted,
        bid.decryptedBidAmount
        );
    }

    function getAllAuctionIds() external view returns (string[] memory) {
        return auctionIds;
    }

    function getAllBidders(string calldata auctionId) external view returns (address[] memory) {
        require(bytes(auctions[auctionId].nftTokenId).length > 0, "Auction does not exist");
        return auctions[auctionId].bidders;
    }
}

