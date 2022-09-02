// SPDX-License-Identifier: MIT
pragma solidity 0.8.15;

import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

import "./EndemicAuctionCore.sol";

abstract contract EndemicDutchAuction is
    ContextUpgradeable,
    ReentrancyGuardUpgradeable,
    EndemicAuctionCore
{
    using AddressUpgradeable for address;

    function createDutchAuction(
        address nftContract,
        uint256 tokenId,
        uint256 startingPrice,
        uint256 endingPrice,
        uint256 duration,
        uint256 amount,
        address paymentErc20TokenAddress,
        bytes4 assetClass
    ) external nonReentrant {
        _requireValidAuctionRequest(
            paymentErc20TokenAddress,
            nftContract,
            tokenId,
            amount,
            assetClass
        );

        bytes32 auctionId = _createAuctionId(
            nftContract,
            tokenId,
            _msgSender()
        );

        // seller cannot recreate auction
        // if it is already listed as reserve auction that is in progress or ended
        _requireIdleAuction(auctionId);

        Auction memory auction = Auction({
            auctionType: AuctionType.DUTCH,
            id: auctionId,
            nftContract: nftContract,
            seller: _msgSender(),
            highestBidder: address(0),
            paymentErc20TokenAddress: paymentErc20TokenAddress,
            tokenId: tokenId,
            duration: duration,
            amount: amount,
            startingPrice: startingPrice,
            endingPrice: endingPrice,
            startedAt: block.timestamp,
            endingAt: 0, // 0 because availability to bid doesn't relay on time in dutch auction
            assetClass: assetClass
        });

        _validateDutchAuction(auction);

        idToAuction[auctionId] = auction;

        emit AuctionCreated(
            nftContract,
            tokenId,
            auctionId,
            startingPrice,
            endingPrice,
            duration,
            _msgSender(),
            amount,
            paymentErc20TokenAddress,
            assetClass
        );
    }

    function bidForDutchAuction(bytes32 id, uint256 tokenAmount)
        external
        payable
        nonReentrant
    {
        Auction memory auction = idToAuction[id];

        _requireValidBidRequest(auction, AuctionType.DUTCH, tokenAmount);

        _detractByAssetClass(auction, tokenAmount);

        uint256 currentPrice = _calculateCurrentPrice(auction) * tokenAmount;

        if (currentPrice == 0) revert InvalidPrice();

        (
            uint256 makerCut,
            uint256 takerCut,
            address royaltiesRecipient,
            uint256 royaltieFee,
            uint256 totalCut
        ) = _calculateFees(
                auction.paymentErc20TokenAddress,
                auction.nftContract,
                auction.tokenId,
                currentPrice
            );

        _requireSufficientCurrencySupplied(
            currentPrice + takerCut,
            auction.paymentErc20TokenAddress,
            _msgSender()
        );

        _transferNFT(
            auction.seller,
            _msgSender(),
            auction.nftContract,
            auction.tokenId,
            tokenAmount,
            auction.assetClass
        );

        _distributeFunds(
            currentPrice,
            makerCut,
            totalCut,
            royaltieFee,
            royaltiesRecipient,
            auction.seller,
            _msgSender(),
            auction.paymentErc20TokenAddress
        );

        emit AuctionSuccessful(
            auction.id,
            currentPrice,
            _msgSender(),
            tokenAmount,
            totalCut
        );
    }

    function getCurrentPrice(bytes32 id) external view returns (uint256) {
        Auction memory auction = idToAuction[id];

        if (
            !_isActiveAuction(auction) ||
            !_isAuctionType(auction, AuctionType.DUTCH)
        ) revert InvalidAuction();

        return _calculateCurrentPrice(auction);
    }

    function _validateDutchAuction(Auction memory auction) internal pure {
        if (auction.duration < MIN_DURATION || MAX_DURATION < auction.duration)
            revert InvalidDuration();

        if (
            auction.startingPrice < MIN_PRICE ||
            auction.endingPrice < MIN_PRICE ||
            auction.startingPrice < auction.endingPrice
        ) revert InvalidPriceConfiguration();

        _validateAssetClass(auction);
    }

    function _calculateCurrentPrice(Auction memory auction)
        internal
        view
        returns (uint256)
    {
        uint256 secondsPassed = 0;

        if (block.timestamp > auction.startedAt) {
            secondsPassed = block.timestamp - auction.startedAt;
        }

        // NOTE: We don't use SafeMath (or similar) in this function because
        //  all of our public functions carefully cap the maximum values for
        //  time (at 64-bits) and currency (at 128-bits). _duration is
        //  also known to be non-zero (see the require() statement in
        //  _addAuction())
        if (secondsPassed >= auction.duration) {
            // We've reached the end of the dynamic pricing portion
            // of the auction, just return the end price.
            return auction.endingPrice;
        } else {
            // Starting price can be higher than ending price (and often is!), so
            // this delta can be negative.
            int256 totalPriceChange = int256(auction.endingPrice) -
                int256(auction.startingPrice);

            // This multiplication can't overflow, _secondsPassed will easily fit within
            // 64-bits, and totalPriceChange will easily fit within 128-bits, their product
            // will always fit within 256-bits.
            int256 currentPriceChange = (totalPriceChange *
                int256(secondsPassed)) / int256(auction.duration);

            // currentPriceChange can be negative, but if so, will have a magnitude
            // less that _startingPrice. Thus, this result will always end up positive.
            return uint256(int256(auction.startingPrice) + currentPriceChange);
        }
    }

    function _detractByAssetClass(Auction memory auction, uint256 tokenAmount)
        internal
    {
        if (auction.assetClass == ERC721_ASSET_CLASS) {
            _removeAuction(auction.id);
        } else if (auction.assetClass == ERC1155_ASSET_CLASS) {
            _deductFromAuction(auction, tokenAmount);
        } else {
            revert InvalidAssetClass();
        }
    }

    uint256[1000] private __gap;
}
