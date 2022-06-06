// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

interface IDexAuction {
    enum Status {
        Pending,
        Open,
        Close
    }

    struct Auction {
        Status status;
        uint256 startBlock;
        uint256 endBlock;
        uint256 initialBidAmount;
        uint256 leaderboard;
        uint256 leaderboardThreshold;
    }

    struct BidInfo {
        uint256 totalAmount;
        bool hasClaimed;
    }

    // Only used for view
    struct Bid {
        address account;
        uint256 amount;
        bool hasClaimed;
    }

    function bid(uint256 _amount) external;

    function claimAuction(uint256 _auctionId) external;

    function addWhitelist(address[] calldata _bidders) external;

    function removeWhitelist(address[] calldata _bidders) external;

    function startAuction(
        uint256 _startBlock,
        uint256 _endBlock,
        uint256 _initialBidAmount,
        uint256 _leaderboard
    ) external;

    function closeAuction(uint256 _bidLimit) external;

    function claimAuctionLeaderboard(
        uint256 _auctionId,
        address[] calldata _bidders
    ) external;

    function recoverToken(address _token, uint256 _amount) external;

    function setOperatorAddress(address _operatorAddress) external;

    function setMaxAuctionLength(uint256 _maxAuctionLength) external;

    function viewAuctions(uint256 cursor, uint256 size)
        external
        view
        returns (Auction[] memory, uint256);

    function viewBidders(uint256 cursor, uint256 size)
        external
        view
        returns (address[] memory, uint256);

    function viewBidsPerAuction(
        uint256 auctionId,
        uint256 cursor,
        uint256 size
    ) external view returns (Bid[] memory, uint256);

    function claimable(uint256 auctionId, address bidder)
        external
        view
        returns (bool);

    function whitelisted(address bidder) external view returns (bool);

    function viewBidderAuctions(
        address bidder,
        uint256 cursor,
        uint256 size
    )
        external
        view
        returns (
            uint256[] memory,
            uint256[] memory,
            bool[] memory,
            uint256
        );
}
