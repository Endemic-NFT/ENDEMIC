// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "../TokenLockingPoolBase.sol";

error UnlockPeriodNotFinished();
error UnlockPeriodFinished();

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

        uint256 amountToWithdraw = _subtractRemovalFee(availableToWithdraw);

        _releaseTokens(amountToWithdraw);

        emit TokenActivity(
            ActivityType.Withdraw,
            msg.sender,
            availableToWithdraw
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
            availableToWithdraw
        );
    }

    function _revertIfUnlockPeriodNotFinished(uint256 unlockPeriodEndTime)
        internal
        view
    {
        if (block.timestamp < unlockPeriodEndTime) {
            revert UnlockPeriodNotFinished();
        }
    }

    function _revertIfUnlockPeriodFinished(uint256 unlockPeriodEndTime)
        internal
        view
    {
        if (block.timestamp > unlockPeriodEndTime) {
            revert UnlockPeriodFinished();
        }
    }

    function _subtractRemovalFee(uint256 amount)
        internal
        pure
        returns (uint256)
    {
        uint256 removalFee = _calculateRemovalFee(amount);

        return amount - removalFee;
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
