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
    function withdrawLiquidLockImmediately() external nonReentrant {
        LiquidLock memory lockInfo = liquidLocks[msg.sender];

        _withdrawImmediately(lockInfo);

        liquidLocks[msg.sender] = LiquidLock({
            amount: 0,
            unlockPeriodEndTime: 0
        });
    }

    /**
     * @notice Starts the unlock period for the liquid lock
     */
    function startLiquidLockUnlockPeriod() external nonReentrant {
        LiquidLock memory lockInfo = liquidLocks[msg.sender];

        LiquidLock memory newLiquidLockInfo = _startUnlockPeriod(lockInfo);

        liquidLocks[msg.sender] = newLiquidLockInfo;
    }

    /**
     * @notice Withdraws locked tokens after finishing the lock period
     */
    function withdrawLiquidLock() external nonReentrant {
        LiquidLock memory lockInfo = liquidLocks[msg.sender];

        _withdraw(lockInfo);

        liquidLocks[msg.sender] = LiquidLock({
            amount: 0,
            unlockPeriodEndTime: 0
        });
    }

    /**
     * @notice Get the liquid lock stats for a specific account
     * @param account Address of the account to get the stats for
     * @return The amount of tokens locked by the account
     */
    function getLiquidPoolStats(address account) public view returns (uint256) {
        return liquidLocks[account].amount;
    }

    /**
     * @notice See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
