// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "../LiquidTokenLockingPoolBase.sol";

/**
 * @title LiquidTokenLockingPool
 * @dev Provides functionality for prolonged locking of tokens with a lock period
 */
contract LiquidTokenLockingPool is LiquidTokenLockingPoolBase {
    mapping(address => LiquidLock) internal liquidLocks;

    /**
     * @notice Locks tokens in the liquid pool with a prolonged lock period
     * @param amount The amount of tokens to lock
     */
    function liquidLock(uint256 amount)
        external
        onlySufficientAmount(amount)
        nonReentrant
    {
        LiquidLock memory liquidLockInfo = liquidLocks[msg.sender];

        uint256 newLockAmount = liquidLockInfo.amount + amount;

        liquidLocks[msg.sender] = LiquidLock({
            amount: newLockAmount,
            unlockPeriodEndTime: 0
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
    function withdrawImmediately() external nonReentrant {
        LiquidLock memory lockInfo = liquidLocks[msg.sender];

        _withdrawImmediately(lockInfo);

        liquidLocks[msg.sender] = LiquidLock({
            amount: 0,
            unlockPeriodEndTime: 0
        });
    }

    /**
     * @notice Withdraws locked tokens after finishing the lock period
     */
    function withdraw() external nonReentrant {
        LiquidLock memory lockInfo = liquidLocks[msg.sender];

        _withdraw(lockInfo);

        liquidLocks[msg.sender] = LiquidLock({
            amount: 0,
            unlockPeriodEndTime: 0
        });
    }

    /**
     * @notice See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
