// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "../LiquidTokenLockingPoolBase.sol";

/**
 * @title LiquidTokenLockingPool
 * @dev Provides functionality for locking tokens with a liquid lock period
 */
abstract contract LiquidTokenLockingPool is LiquidTokenLockingPoolBase {
    mapping(address account => LiquidLock liquidLock) internal liquidLocks;

    /**
     * @notice Locks tokens in the liquid pool
     * @param amount The amount of tokens to lock
     */
    function liquidLock(
        uint256 amount
    ) external onlySufficientAmount(amount) nonReentrant {
        LiquidLock memory liquidLockInfo = liquidLocks[msg.sender];

        uint256 newLockAmount = liquidLockInfo.amount + amount;

        liquidLocks[msg.sender] = LiquidLock({
            amount: newLockAmount,
            unlockPeriodEndTime: 0
        });

        _lockTokens(amount);

        emit TokenActivity(
            PoolType.Liquid,
            ActivityType.Lock,
            msg.sender,
            newLockAmount,
            0
        );
    }

    /**
     * @notice Immediately withdraws locked tokens and pays the unlock period removal fee
     */
    function withdrawLiquidLockImmediately() external nonReentrant {
        LiquidLock memory lockInfo = liquidLocks[msg.sender];

        _revertIfAmountIsZero(lockInfo.amount);

        liquidLocks[msg.sender] = LiquidLock({
            amount: 0,
            unlockPeriodEndTime: 0
        });

        _withdrawImmediately(lockInfo);

        emit TokenActivity(
            PoolType.Liquid,
            ActivityType.Withdraw,
            msg.sender,
            lockInfo.amount,
            0
        );
    }

    /**
     * @notice Starts the unlock period for the liquid lock
     */
    function startLiquidLockUnlockPeriod() external nonReentrant {
        LiquidLock memory lockInfo = liquidLocks[msg.sender];

        _revertIfAmountIsZero(lockInfo.amount);

        LiquidLock memory newLiquidLockInfo = _startUnlockPeriod(lockInfo);

        liquidLocks[msg.sender] = newLiquidLockInfo;

        emit UnlockPeriodStarted(
            PoolType.Liquid,
            msg.sender,
            lockInfo.amount,
            newLiquidLockInfo.unlockPeriodEndTime
        );
    }

    /**
     * @notice Withdraws locked tokens after finishing the unlock period
     */
    function withdrawLiquidLock() external nonReentrant {
        LiquidLock memory lockInfo = liquidLocks[msg.sender];

        _revertIfAmountIsZero(lockInfo.amount);

        liquidLocks[msg.sender] = LiquidLock({
            amount: 0,
            unlockPeriodEndTime: 0
        });

        _withdraw(lockInfo);

        emit TokenActivity(
            PoolType.Liquid,
            ActivityType.Withdraw,
            msg.sender,
            lockInfo.amount,
            0
        );
    }

    /**
     * @notice Gets the liquid lock stats for a specific account
     * @param account Address of the account to get the stats for
     * @return liquidLock The liquid lock stats for the account
     */
    function getLiquidPoolStats(
        address account
    ) public view returns (LiquidLock memory) {
        return liquidLocks[account];
    }

    /**
     * @notice See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
