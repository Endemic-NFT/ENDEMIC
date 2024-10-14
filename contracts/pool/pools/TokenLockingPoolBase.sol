// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

error InsufficientAmount();

/**
 * @title LockingPoolBase
 * @dev Abstract contract providing basic functionality for token locking pools
 */
abstract contract TokenLockingPoolBase is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    IERC20 internal endemicToken;
    address feeReceiver;

    /**
     * @dev Enum representing different types of token activities
     */
    enum ActivityType {
        Lock,
        ProlongedLock,
        PermanentLock,
        Withdraw
    }

    /**
     * @dev Emitted when a token activity occurs
     * @param activity The type of activity
     * @param account The account involved in the activity
     * @param amount The amount of tokens involved in the activity
     */
    event TokenActivity(
        ActivityType indexed activity,
        address indexed account,
        uint256 amount
    );

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
     * @dev Internal function to lock tokens
     * @param amount The amount of tokens to lock
     */
    function _lockTokens(uint256 amount) internal {
        endemicToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    /**
     * @dev Internal function to release tokens
     * @param amount The amount of tokens to release
     */
    function _releaseTokens(uint256 amount) internal {
        endemicToken.safeTransfer(msg.sender, amount);
    }

    /**
     * @notice See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
