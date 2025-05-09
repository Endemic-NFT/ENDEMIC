// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

/**
 * @title TokenLockingPoolBase
 * @dev Abstract contract providing basic functionality for token locking pools
 */
abstract contract TokenLockingPoolBase is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    /**
     * @dev Enum representing different types of token activities
     */
    enum ActivityType {
        Lock,
        Withdraw
    }

    /**
     * @dev Enum representing different types of token pools
     */
    enum PoolType {
        Liquid,
        ShortProlongedLiquid,
        LongProlongedLiquid
    }

    IERC20 internal endemicToken;
    address public feeReceiver;

    /**
     * @dev Emitted when a token activity occurs
     * @param poolType The type of pool
     * @param activityType The type of activity
     * @param account The account involved in the activity
     * @param amount The amount of tokens involved in the activity
     * @param lockPeriodEndTime The end time of the lock period
     */
    event TokenActivity(
        PoolType indexed poolType,
        ActivityType indexed activityType,
        address indexed account,
        uint256 amount,
        uint256 lockPeriodEndTime
    );

    error InsufficientAmount();
    error InvalidAddress();

    /**
     * @dev Modifier to check if the amount is sufficient
     * @param amount The amount to check
     */
    modifier onlySufficientAmount(uint256 amount) {
        if (amount == 0) {
            revert InsufficientAmount();
        }
        _;
    }

    /**
     * @notice Updates the fee receiver address
     * @param newFeeReceiver The new address to receive fees
     */
    function updateFeeReceiver(address newFeeReceiver) external onlyOwner {
        if (newFeeReceiver == address(0)) {
            revert InvalidAddress();
        }
        feeReceiver = newFeeReceiver;
    }

    /**
     * @dev Internal function to lock tokens
     * @param amount The amount of tokens to lock
     */
    function _lockTokens(uint256 amount) internal {
        endemicToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    /**
     * @dev Internal function to release tokens
     * @param amount The amount of tokens to release
     * @param removalFee The fee for removing the lock period
     */
    function _releaseTokens(uint256 amount, uint256 removalFee) internal {
        endemicToken.safeTransfer(msg.sender, amount);

        if (removalFee > 0) {
            endemicToken.safeTransfer(feeReceiver, removalFee);
        }
    }

    /**
     * @dev Internal function to release tokens
     * @param amount The amount of tokens to release
     */
    function _releaseTokens(uint256 amount) internal {
        endemicToken.safeTransfer(msg.sender, amount);
    }

    /**
     * @dev Internal function to revert if the amount is zero
     * @param amount The amount of tokens to check
     */
    function _revertIfAmountIsZero(uint256 amount) internal pure {
        if (amount == 0) {
            revert InsufficientAmount();
        }
    }

    /**
     * @notice See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
