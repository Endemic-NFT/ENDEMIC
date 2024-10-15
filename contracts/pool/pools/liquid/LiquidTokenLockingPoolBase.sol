// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "../TokenLockingPoolBase.sol";

error UnlockPeriodNotFinished();
error UnlockPeriodFinished();
error UnlockPeriodExists();

/**
 * @title LiquidPool
 * @dev Provides functionality for staking, locking, and withdrawing tokens
 * Tokens can be withdrawn with respecting grace period or immediately by paying ignore fee
 */
abstract contract LiquidTokenLockingPoolBase is TokenLockingPoolBase {
    uint256 internal constant UNLOCK_PERIOD = 4 weeks;
    uint256 internal constant UNLOCK_PERIOD_REMOVAL_FEE = 1000;

    struct LiquidLock {
        uint256 amount;
        uint256 unlockPeriodEndTime;
    }

    event UnlockPeriodStarted(
        address indexed account,
        uint256 indexed amount,
        uint256 indexed unlockPeriodEndTime
    );

    function _startUnlockPeriod(LiquidLock memory liquidLockInfo)
        internal
        returns (LiquidLock memory)
    {
        uint256 endUnlockPeriodTime = block.timestamp + UNLOCK_PERIOD;

        _revertIfUnlockPeriodExists(liquidLockInfo.unlockPeriodEndTime);
        emit UnlockPeriodStarted(
            msg.sender,
            liquidLockInfo.amount,
            endUnlockPeriodTime
        );

        return
            LiquidLock({
                amount: liquidLockInfo.amount,
                unlockPeriodEndTime: endUnlockPeriodTime
            });
    }

    /**
     * @notice Immediately withdraws locked tokens and pays unlock period removal fee
     * @param liquidLockInfo The information of the liquid lock
     */
    function _withdrawImmediately(LiquidLock memory liquidLockInfo) internal {
        uint256 availableToWithdraw = liquidLockInfo.amount;

        _revertIfUnlockPeriodFinished(liquidLockInfo.unlockPeriodEndTime);

        (uint256 amountToWithdraw, uint256 removalFee) = _subtractRemovalFee(
            availableToWithdraw
        );

        _releaseTokens(amountToWithdraw, removalFee);

        emit TokenActivity(
            ActivityType.Withdraw,
            msg.sender,
            availableToWithdraw,
            0
        );
    }

    /**
     * @notice Withdraws staked tokens after finishing grace period
     * @param liquidLockInfo The information of the liquid lock
     */
    function _withdraw(LiquidLock memory liquidLockInfo) internal {
        uint256 availableToWithdraw = liquidLockInfo.amount;

        _revertIfUnlockPeriodNotFinished(liquidLockInfo.unlockPeriodEndTime);

        _releaseTokens(availableToWithdraw);

        emit TokenActivity(
            ActivityType.Withdraw,
            msg.sender,
            availableToWithdraw,
            0
        );
    }

    function _revertIfUnlockPeriodExists(uint256 unlockPeriodEndTime)
        internal
        pure
    {
        if (unlockPeriodEndTime != 0) {
            revert UnlockPeriodExists();
        }
    }

    function _revertIfUnlockPeriodNotFinished(uint256 unlockPeriodEndTime)
        internal
        view
    {
        if (unlockPeriodEndTime == 0 || block.timestamp < unlockPeriodEndTime) {
            revert UnlockPeriodNotFinished();
        }
    }

    function _revertIfUnlockPeriodFinished(uint256 unlockPeriodEndTime)
        internal
        view
    {
        if (unlockPeriodEndTime != 0 && block.timestamp > unlockPeriodEndTime) {
            revert UnlockPeriodFinished();
        }
    }

    function _subtractRemovalFee(uint256 amount)
        internal
        pure
        returns (uint256, uint256)
    {
        uint256 removalFee = _calculateRemovalFee(amount);

        return (amount - removalFee, removalFee);
    }

    function _calculateRemovalFee(uint256 amount)
        internal
        pure
        returns (uint256)
    {
        return (amount * UNLOCK_PERIOD_REMOVAL_FEE) / 10000;
    }

    /**
     * @notice See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
