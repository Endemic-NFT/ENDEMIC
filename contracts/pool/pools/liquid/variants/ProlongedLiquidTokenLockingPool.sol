// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "../LiquidTokenLockingPoolBase.sol";

/**
 * @title ProlongedLiquidTokenLockingPool
 * @dev Provides functionality for prolonged locking of tokens with a lock period
 */
abstract contract ProlongedLiquidTokenLockingPool is
    LiquidTokenLockingPoolBase
{
    struct ProlongedLock {
        LiquidLock liquidLock;
        uint256 lockPeriodEndTime;
    }

    uint256 internal constant LOCK_PERIOD = 63_158_400; // 2 years considering leap years in seconds

    mapping(address account => ProlongedLock prolongedLiquidLock) internal prolongedLiquidLocks;

    error LockPeriodNotFinished();

    /**
     * @notice Locks tokens in the liquid pool with a prolonged lock period
     * @param amount The amount of tokens to lock
     */
    function prolongedLiquidLock(uint256 amount)
        external
        onlySufficientAmount(amount)
        nonReentrant
    {
        ProlongedLock memory prolongedLockInfo = prolongedLiquidLocks[
            msg.sender
        ];

        uint256 newLockAmount = prolongedLockInfo.liquidLock.amount + amount;

        prolongedLiquidLocks[msg.sender] = ProlongedLock({
            liquidLock: LiquidLock({
                amount: newLockAmount,
                unlockPeriodEndTime: 0
            }),
            lockPeriodEndTime: block.timestamp + LOCK_PERIOD
        });

        _lockTokens(amount);

        emit TokenActivity(
            PoolType.ProlongedLiquid,
            ActivityType.Lock,
            msg.sender,
            newLockAmount,
            prolongedLiquidLocks[msg.sender].lockPeriodEndTime
        );
    }

    /**
     * @notice Immediately withdraws locked tokens and pays the unlock period removal fee
     */
    function withdrawProlongedLiquidLockImmediately() external nonReentrant {
        ProlongedLock memory prolongedLock = prolongedLiquidLocks[msg.sender];

        _revertIfLockPeriodNotFinished(prolongedLock.lockPeriodEndTime);
        _revertIfAmountIsZero(prolongedLock.liquidLock.amount);
        prolongedLiquidLocks[msg.sender] = ProlongedLock({
            liquidLock: LiquidLock(0, 0),
            lockPeriodEndTime: 0
        });

        _withdrawImmediately(prolongedLock.liquidLock);

        emit TokenActivity(
            PoolType.ProlongedLiquid,
            ActivityType.Withdraw,
            msg.sender,
            prolongedLock.liquidLock.amount,
            0
        );
    }

    /**
     * @notice Starts the unlock period for the prolonged lock
     */
    function startProlongedLiquidLockUnlockPeriod() external nonReentrant {
        ProlongedLock memory prolongedLock = prolongedLiquidLocks[msg.sender];

        _revertIfLockPeriodNotFinished(prolongedLock.lockPeriodEndTime);
        _revertIfAmountIsZero(prolongedLock.liquidLock.amount);

        LiquidLock memory liquidLock = _startUnlockPeriod(
            prolongedLock.liquidLock
        );

        prolongedLiquidLocks[msg.sender] = ProlongedLock({
            liquidLock: liquidLock,
            lockPeriodEndTime: prolongedLock.lockPeriodEndTime
        });

        emit UnlockPeriodStarted(
            PoolType.ProlongedLiquid,
            msg.sender,
            liquidLock.amount,
            liquidLock.unlockPeriodEndTime
        );
    }

    /**
     * @notice Withdraws locked tokens after finishing the lock period
     */
    function withdrawProlongedLiquidLock() external nonReentrant {
        ProlongedLock memory prolongedLock = prolongedLiquidLocks[msg.sender];

        _revertIfLockPeriodNotFinished(prolongedLock.lockPeriodEndTime);
        _revertIfAmountIsZero(prolongedLock.liquidLock.amount);
        prolongedLiquidLocks[msg.sender] = ProlongedLock({
            liquidLock: LiquidLock(0, 0),
            lockPeriodEndTime: 0
        });

        _withdraw(prolongedLock.liquidLock);

        emit TokenActivity(
            PoolType.ProlongedLiquid,
            ActivityType.Withdraw,
            msg.sender,
            prolongedLock.liquidLock.amount,
            0
        );
    }

    /**
     * @notice Gets the prolonged liquid lock stats for a specific account
     * @param account Address of the account to get the stats for
     * @return The amount of tokens locked by the account
     */
    function getProlongedLiquidPoolStats(address account)
        public
        view
        returns (uint256)
    {
        return prolongedLiquidLocks[account].liquidLock.amount;
    }

    function _revertIfLockPeriodNotFinished(uint256 lockPeriodEndTime)
        internal
        view
    {
        if (block.timestamp < lockPeriodEndTime) {
            revert LockPeriodNotFinished();
        }
    }

    /**
     * @notice See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
