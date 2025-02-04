// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../../manager/interfaces/IPaymentManager.sol";

abstract contract EndemicExchangeCore {
    struct Fees {
        uint256 makerCut;
        uint256 takerCut;
        uint256 royaltiesCut;
        uint256 collectiveCut;
        uint256 totalCut;
    }

    /// @custom:oz-renamed-from royaltiesProvider
    address private royaltiesProvider_deprecated;
    IPaymentManager public paymentManager;
    address public approvedSigner;

    uint16 internal constant MAX_FEE = 10000;
    address internal constant ZERO_ADDRESS = address(0);

    error InvalidAddress();
    error UnsufficientCurrencySupplied();
    error InvalidPaymentMethod();
    error InvalidCaller();
    error InvalidPrice();
    error InvalidConfiguration();
    error AuctionNotStarted();
    error InvalidDuration();

    /// @notice Fired when auction is successfully completed
    event AuctionSuccessful(
        address indexed nftContract,
        uint256 indexed tokenId,
        uint256 indexed totalPrice,
        address seller,
        address winner,
        uint256 totalFees,
        address paymentErc20TokenAddress
    );

    modifier onlySupportedERC20Payments(address paymentErc20TokenAddress) {
        if (
            paymentErc20TokenAddress == ZERO_ADDRESS ||
            !paymentManager.isPaymentMethodSupported(paymentErc20TokenAddress)
        ) revert InvalidPaymentMethod();

        _;
    }

    function _calculateFees(
        uint256 price,
        uint256 makerFeePercentage,
        uint256 takerFeePercentage,
        uint256 royaltiesPercentage,
        uint256 collectiveFeePercentage
    ) internal pure returns (Fees memory fees) {
        fees.takerCut = _calculateCut(takerFeePercentage, price);
        fees.makerCut = _calculateCut(makerFeePercentage, price);
        fees.totalCut = fees.takerCut + fees.makerCut;

        fees.royaltiesCut = _calculateCut(royaltiesPercentage, price);

        fees.collectiveCut = _calculateCut(collectiveFeePercentage, price);
    }

    function _calculateCut(
        uint256 fee,
        uint256 amount
    ) internal pure returns (uint256) {
        return (amount * fee) / MAX_FEE;
    }

    function _requireSupportedPaymentMethod(
        address paymentMethodAddress
    ) internal view {
        if (paymentMethodAddress == ZERO_ADDRESS) return;

        if (!paymentManager.isPaymentMethodSupported(paymentMethodAddress)) {
            revert InvalidPaymentMethod();
        }
    }

    function _requireSufficientCurrencySupplied(
        uint256 sufficientAmount,
        address paymentMethodAddress,
        address buyer
    ) internal view {
        if (paymentMethodAddress == ZERO_ADDRESS) {
            _requireSufficientEtherSupplied(sufficientAmount);
        } else {
            _requireSufficientErc20AmountAvailable(
                sufficientAmount,
                paymentMethodAddress,
                buyer
            );
        }
    }

    function _requireSufficientEtherSupplied(
        uint256 sufficientAmount
    ) internal view {
        if (msg.value < sufficientAmount) {
            revert UnsufficientCurrencySupplied();
        }
    }

    function _requireSufficientErc20AmountAvailable(
        uint256 sufficientAmount,
        address paymentMethodAddress,
        address buyer
    ) internal view {
        IERC20 ERC20PaymentToken = IERC20(paymentMethodAddress);

        uint256 contractAllowance = ERC20PaymentToken.allowance(
            buyer,
            address(this)
        );
        if (contractAllowance < sufficientAmount) {
            revert UnsufficientCurrencySupplied();
        }

        uint256 buyerBalance = ERC20PaymentToken.balanceOf(buyer);
        if (buyerBalance < sufficientAmount) {
            revert UnsufficientCurrencySupplied();
        }
    }

    function _updateExchangeConfiguration(
        address _paymentManager,
        address _approvedSigner
    ) internal {
        if (_paymentManager == ZERO_ADDRESS) revert InvalidAddress();

        paymentManager = IPaymentManager(_paymentManager);
        approvedSigner = _approvedSigner;
    }

    /**
     * @notice See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[999] private __gap;
}
