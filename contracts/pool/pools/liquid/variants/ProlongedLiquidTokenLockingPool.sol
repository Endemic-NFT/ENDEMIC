// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "../LiquidTokenLockingPoolBase.sol";

error LockPeriodNotFinished();

/**
 * @title ProlongedLiquidTokenLockingPool
 * @dev Provides functionality for prolonged locking of tokens with a lock period
 */
contract ProlongedLiquidTokenLockingPool is LiquidTokenLockingPoolBase {
    uint256 internal constant LOCK_PERIOD = 63_158_400; // 2 years considering leap years in seconds

    struct ProlongedLock {
        LiquidLock liquidLock;
        uint256 lockPeriodEndTime;
    }

    mapping(address => ProlongedLock) internal prolongedLiquidLocks;

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
            ActivityType.ProlongedLock,
            msg.sender,
            newLockAmount
        );
    }

    /**
     * @notice Immediately withdraws locked tokens and pays unlock period removal fee
     */
    function withdrawImmediately() internal nonReentrant {
        ProlongedLock memory prolongedLock = prolongedLiquidLocks[msg.sender];

        _revertIfLockPeriodNotFinished(prolongedLock.lockPeriodEndTime);

        _withdrawImmediately(prolongedLock.liquidLock);

        prolongedLiquidLocks[msg.sender] = ProlongedLock({
            liquidLock: LiquidLock(0, 0),
            lockPeriodEndTime: 0
        });
    }

    /**
     * @notice Starts the unlock period for the prolonged lock
     */
    function startUnlockPeriod() external nonReentrant {
        ProlongedLock memory prolongedLock = prolongedLiquidLocks[msg.sender];

        _revertIfLockPeriodNotFinished(prolongedLock.lockPeriodEndTime);

        LiquidLock memory liquidLock = _startUnlockPeriod(
            prolongedLock.liquidLock
        );

        prolongedLiquidLocks[msg.sender] = ProlongedLock({
            liquidLock: liquidLock,
            lockPeriodEndTime: prolongedLock.lockPeriodEndTime
        });
    }

    /**
     * @notice Withdraws locked tokens after finishing the lock period
     */
    function withdraw() external nonReentrant {
        ProlongedLock memory prolongedLock = prolongedLiquidLocks[msg.sender];

        _revertIfLockPeriodNotFinished(prolongedLock.lockPeriodEndTime);

        _withdraw(prolongedLock.liquidLock);

        prolongedLiquidLocks[msg.sender] = ProlongedLock({
            liquidLock: LiquidLock(0, 0),
            lockPeriodEndTime: 0
        });
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
