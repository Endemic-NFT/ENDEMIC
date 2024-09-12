// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "./EndemicFundsDistributor.sol";
import "./EndemicExchangeCore.sol";
import "./EndemicEIP712.sol";
import "./EndemicNonceManager.sol";

abstract contract EndemicSale is
    ReentrancyGuardUpgradeable,
    EndemicFundsDistributor,
    EndemicExchangeCore,
    EndemicEIP712,
    EndemicNonceManager
{
    using ECDSA for bytes32;

    bytes32 private constant SALE_TYPEHASH =
        keccak256(
            "Sale(uint256 orderNonce,address nftContract,uint256 tokenId,address paymentErc20TokenAddress,uint256 price,uint256 makerCut,uint256 takerCut,uint256 royaltiesCut,address royaltiesRecipient,uint256 collectiveCut,address collectiveRecipient,address buyer,uint256 expiresAt)"
        );

    struct Sale {
        address seller;
        uint256 orderNonce;
        address nftContract;
        uint256 tokenId;
        address paymentErc20TokenAddress;
        uint256 price;
        uint256 makerCut;
        uint256 takerCut;
        uint256 royaltiesCut;
        address royaltiesRecipient;
        uint256 collectiveCut;
        address collectiveRecipient;
        address buyer;
        uint256 expiresAt;
    }

    event SaleSuccess(
        address indexed nftContract,
        uint256 indexed tokenId,
        address indexed seller,
        address buyer,
        uint256 price,
        uint256 totalFees,
        address paymentErc20TokenAddress
    );

    error SaleExpired();

    function buyFromSale(
        uint8 v,
        bytes32 r,
        bytes32 s,
        Sale calldata sale
    ) external payable nonReentrant {
        if (block.timestamp > sale.expiresAt) revert SaleExpired();

        if (
            (sale.buyer != address(0) && sale.buyer != msg.sender) ||
            sale.seller == msg.sender
        ) {
            revert InvalidCaller();
        }

        _verifySignature(v, r, s, sale);

        _requireSupportedPaymentMethod(sale.paymentErc20TokenAddress);
        _requireSufficientCurrencySupplied(
            sale.price + sale.takerCut,
            sale.paymentErc20TokenAddress,
            msg.sender
        );

        _invalidateNonce(sale.seller, sale.orderNonce);

        _finalizeSale(sale);
    }

    function _finalizeSale(Sale calldata sale) internal {
        IERC721(sale.nftContract).transferFrom(
            sale.seller,
            msg.sender,
            sale.tokenId
        );

        uint256 totalCut = sale.makerCut + sale.takerCut;

        _distributeFunds(
            sale.price,
            sale.makerCut,
            totalCut,
            sale.royaltiesCut,
            sale.royaltiesRecipient,
            sale.collectiveCut,
            sale.collectiveRecipient,
            sale.seller,
            msg.sender,
            sale.paymentErc20TokenAddress
        );

        emit SaleSuccess(
            sale.nftContract,
            sale.tokenId,
            sale.seller,
            msg.sender,
            sale.price,
            totalCut,
            sale.paymentErc20TokenAddress
        );
    }

    function _verifySignature(
        uint8 v,
        bytes32 r,
        bytes32 s,
        Sale calldata sale
    ) internal view {
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                _buildDomainSeparator(),
                keccak256(
                    abi.encode(
                        SALE_TYPEHASH,
                        sale.orderNonce,
                        sale.nftContract,
                        sale.tokenId,
                        sale.paymentErc20TokenAddress,
                        sale.price,
                        sale.makerCut,
                        sale.takerCut,
                        sale.royaltiesCut,
                        sale.royaltiesRecipient,
                        sale.collectiveCut,
                        sale.collectiveRecipient,
                        sale.buyer,
                        sale.expiresAt
                    )
                )
            )
        );

        if (digest.recover(v, r, s) != sale.seller) {
            revert InvalidSignature();
        }
    }

    /**
     * @notice See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[1000] private __gap;
}
