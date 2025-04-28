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
        bool isLong;
    }

    uint256 internal constant SHORT_LOCK_PERIOD = 15_778_463; // 1 year in seconds
    uint256 internal constant LONG_LOCK_PERIOD = 31_556_926; // 6 months in seconds

    mapping(address account => ProlongedLock prolongedLiquidLock)
        internal shortProlongedLiquidLocks;
    mapping(address account => ProlongedLock prolongedLiquidLock)
        internal longProlongedLiquidLocks;

    error LockPeriodNotFinished();

    /**
     * @notice Locks tokens in the liquid pool with a short prolonged lock period
     * @param amount The amount of tokens to lock
     */
    function shortProlongedLiquidLock(
        uint256 amount
    ) external onlySufficientAmount(amount) nonReentrant {
        _prolongedLiquidLock(amount, PoolType.ShortProlongedLiquid);
    }

    /**
     * @notice Locks tokens in the liquid pool with a long prolonged lock period
     * @param amount The amount of tokens to lock
     */
    function longProlongedLiquidLock(
        uint256 amount
    ) external onlySufficientAmount(amount) nonReentrant {
        _prolongedLiquidLock(amount, PoolType.LongProlongedLiquid);
    }

    /**
     * @notice Immediately withdraws locked tokens from the short prolonged liquid pool
     * and pays the unlock period removal fee
     */
    function withdrawShortProlongedLiquidLockImmediately()
        external
        nonReentrant
    {
        _withdrawProlongedLiquidLockImmediately(PoolType.ShortProlongedLiquid);
    }

    /**
     * @notice Immediately withdraws locked tokens from the long prolonged liquid pool
     * and pays the unlock period removal fee
     */
    function withdrawLongProlongedLiquidLockImmediately()
        external
        nonReentrant
    {
        _withdrawProlongedLiquidLockImmediately(PoolType.LongProlongedLiquid);
    }

    /**
     * @notice Starts the unlock period for the short prolonged lock
     */
    function startShortProlongedLiquidLockUnlockPeriod() external nonReentrant {
        _startProlongedLiquidLockUnlockPeriod(PoolType.ShortProlongedLiquid);
    }

    /**
     * @notice Starts the unlock period for the long prolonged lock
     */
    function startLongProlongedLiquidLockUnlockPeriod() external nonReentrant {
        _startProlongedLiquidLockUnlockPeriod(PoolType.LongProlongedLiquid);
    }

    /**
     * @notice Withdraws locked tokens from short prolonged liquid pool after finishing the lock period
     */
    function withdrawShortProlongedLiquidLock() external nonReentrant {
        _withdrawProlongedLiquidLock(PoolType.ShortProlongedLiquid);
    }

    /**
     * @notice Withdraws locked tokens from long prolonged liquid pool after finishing the lock period
     */
    function withdrawLongProlongedLiquidLock() external nonReentrant {
        _withdrawProlongedLiquidLock(PoolType.LongProlongedLiquid);
    }

    /**
     * @notice Gets the prolonged liquid lock stats for a specific account
     * @param account Address of the account to get the stats for
     * @return shortLockAmount The amount of tokens locked in the short prolonged liquid pool
     * @return longLockAmount The amount of tokens locked in the long prolonged liquid pool
     */
    function getProlongedLiquidPoolStats(
        address account
    ) public view returns (uint256 shortLockAmount, uint256 longLockAmount) {
        return (
            shortProlongedLiquidLocks[account].liquidLock.amount,
            longProlongedLiquidLocks[account].liquidLock.amount
        );
    }

    function _revertIfLockPeriodNotFinished(
        uint256 lockPeriodEndTime
    ) internal view {
        if (block.timestamp < lockPeriodEndTime) {
            revert LockPeriodNotFinished();
        }
    }

    /**
     * @dev Internal function to to lock tokens in liquid pool with a prolonged lock period
     * @param amount The amount of tokens to lock
     * @param poolType The type of pool
     */
    function _prolongedLiquidLock(uint256 amount, PoolType poolType) internal {
        ProlongedLock memory prolongedLockInfo = poolType ==
            PoolType.ShortProlongedLiquid
            ? shortProlongedLiquidLocks[msg.sender]
            : longProlongedLiquidLocks[msg.sender];

        uint256 newLockAmount = prolongedLockInfo.liquidLock.amount + amount;

        if (poolType == PoolType.ShortProlongedLiquid) {
            shortProlongedLiquidLocks[msg.sender] = ProlongedLock({
                liquidLock: LiquidLock({
                    amount: newLockAmount,
                    unlockPeriodEndTime: 0
                }),
                lockPeriodEndTime: block.timestamp + SHORT_LOCK_PERIOD,
                isLong: false
            });
        } else {
            longProlongedLiquidLocks[msg.sender] = ProlongedLock({
                liquidLock: LiquidLock({
                    amount: newLockAmount,
                    unlockPeriodEndTime: 0
                }),
                lockPeriodEndTime: block.timestamp + LONG_LOCK_PERIOD,
                isLong: true
            });
        }

        _lockTokens(amount);

        emit TokenActivity(
            poolType,
            ActivityType.Lock,
            msg.sender,
            newLockAmount,
            poolType == PoolType.ShortProlongedLiquid
                ? shortProlongedLiquidLocks[msg.sender].lockPeriodEndTime
                : longProlongedLiquidLocks[msg.sender].lockPeriodEndTime
        );
    }

    /**
     * @dev Internal function to withdraw prolonged liquid lock immediately
     * @param poolType The type of pool
     */
    function _withdrawProlongedLiquidLockImmediately(
        PoolType poolType
    ) internal {
        ProlongedLock memory prolongedLock;
        if (poolType == PoolType.ShortProlongedLiquid) {
            prolongedLock = shortProlongedLiquidLocks[msg.sender];

            _revertIfLockPeriodNotFinished(prolongedLock.lockPeriodEndTime);
            _revertIfAmountIsZero(prolongedLock.liquidLock.amount);

            shortProlongedLiquidLocks[msg.sender] = ProlongedLock({
                liquidLock: LiquidLock(0, 0),
                lockPeriodEndTime: 0,
                isLong: false
            });
        } else {
            prolongedLock = longProlongedLiquidLocks[msg.sender];

            _revertIfLockPeriodNotFinished(prolongedLock.lockPeriodEndTime);
            _revertIfAmountIsZero(prolongedLock.liquidLock.amount);

            longProlongedLiquidLocks[msg.sender] = ProlongedLock({
                liquidLock: LiquidLock(0, 0),
                lockPeriodEndTime: 0,
                isLong: false
            });
        }

        _withdrawImmediately(prolongedLock.liquidLock);

        emit TokenActivity(
            poolType,
            ActivityType.Withdraw,
            msg.sender,
            prolongedLock.liquidLock.amount,
            0
        );
    }

    /**
     * @dev Internal function to start the unlock period for the prolonged lock
     * @param poolType The type of pool
     */
    function _startProlongedLiquidLockUnlockPeriod(PoolType poolType) internal {
        ProlongedLock memory prolongedLock;
        if (poolType == PoolType.ShortProlongedLiquid) {
            prolongedLock = shortProlongedLiquidLocks[msg.sender];
        } else {
            prolongedLock = longProlongedLiquidLocks[msg.sender];
        }

        _revertIfLockPeriodNotFinished(prolongedLock.lockPeriodEndTime);
        _revertIfAmountIsZero(prolongedLock.liquidLock.amount);

        LiquidLock memory liquidLock = _startUnlockPeriod(
            prolongedLock.liquidLock
        );

        if (poolType == PoolType.ShortProlongedLiquid) {
            shortProlongedLiquidLocks[msg.sender] = ProlongedLock({
                liquidLock: liquidLock,
                lockPeriodEndTime: prolongedLock.lockPeriodEndTime,
                isLong: false
            });
        } else {
            longProlongedLiquidLocks[msg.sender] = ProlongedLock({
                liquidLock: liquidLock,
                lockPeriodEndTime: prolongedLock.lockPeriodEndTime,
                isLong: true
            });
        }

        emit UnlockPeriodStarted(
            poolType,
            msg.sender,
            liquidLock.amount,
            liquidLock.unlockPeriodEndTime
        );
    }

    /**
     * @dev Internal function to withdraw prolonged liquid lock
     * @param poolType The type of pool
     */
    function _withdrawProlongedLiquidLock(PoolType poolType) internal {
        ProlongedLock memory prolongedLock = poolType ==
            PoolType.ShortProlongedLiquid
            ? shortProlongedLiquidLocks[msg.sender]
            : longProlongedLiquidLocks[msg.sender];

        _revertIfLockPeriodNotFinished(prolongedLock.lockPeriodEndTime);
        _revertIfAmountIsZero(prolongedLock.liquidLock.amount);

        if (poolType == PoolType.ShortProlongedLiquid) {
            shortProlongedLiquidLocks[msg.sender] = ProlongedLock({
                liquidLock: LiquidLock(0, 0),
                lockPeriodEndTime: 0,
                isLong: false
            });
        } else {
            longProlongedLiquidLocks[msg.sender] = ProlongedLock({
                liquidLock: LiquidLock(0, 0),
                lockPeriodEndTime: 0,
                isLong: false
            });
        }

        _withdraw(prolongedLock.liquidLock);

        emit TokenActivity(
            poolType,
            ActivityType.Withdraw,
            msg.sender,
            prolongedLock.liquidLock.amount,
            0
        );
    }

    /**
     * @notice See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
