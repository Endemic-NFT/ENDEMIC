// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "../TokenPoolBase.sol";
import "./WithdrawalEligibility.sol";

error ExistentTokensToClaim();

/**
 * @title LiquidPool
 * @dev Provides functionality for staking, locking, and withdrawing tokens
 * Tokens can be withdrawn with respecting grace period or immediately by paying ignore fee
 */
contract LiquidPool is TokenPoolBase, WithdrawalEligibility {
    /**
     * @notice Stakes tokens in the liquid pool
     * @param amount The amount of tokens to stake
     */
    function liquidStake(
        uint256 amount
    ) external onlySufficientAmount(amount) nonReentrant {
        Stake memory stakeInfo = stakes[msg.sender];

        stakes[msg.sender] = Stake({
            amount: stakeInfo.amount + amount,
            eligibleWithdraw: stakeInfo.eligibleWithdraw
        });

        _claimTokens(amount);

        emit TokenActivity(ActivityType.Stake, msg.sender, amount);
    }

    /**
     * @notice Immediately withdraws staked tokens and pays grace period removal fee
     * @param amount The amount of tokens to withdraw
     */
    function withdraw(
        uint256 amount
    ) external onlySufficientAmount(amount) nonReentrant {
        Stake memory stakeInfo = stakes[msg.sender];

        uint256 availableToWithdraw = stakeInfo.amount;

        _checkAvailableWithdraw(availableToWithdraw, amount);

        uint256 amountToWithdraw = _substractRemovalFee(amount);

        stakeInfo.eligibleWithdraw = _initEligibleWithdraw();
        stakeInfo.amount = availableToWithdraw - amount;

        stakes[msg.sender] = stakeInfo;

        _releaseTokens(amountToWithdraw);

        emit TokenActivity(ActivityType.Withdraw, msg.sender, amountToWithdraw);
    }

    /**
     * @notice Withdraws staked tokens after finishing grace period
     */
    function withdraw() external nonReentrant {
        Stake memory stakeInfo = stakes[msg.sender];

        uint256 availableToWithdraw = stakeInfo.eligibleWithdraw.amount;

        _checkWithdrawEligibility(availableToWithdraw);

        uint256 amountToWithdraw = _getAmountToWithdraw(
            stakeInfo.eligibleWithdraw
        );

        stakeInfo.eligibleWithdraw = _initEligibleWithdraw();
        stakeInfo.amount = stakeInfo.amount - availableToWithdraw;

        stakes[msg.sender] = stakeInfo;

        _releaseTokens(amountToWithdraw);

        emit TokenActivity(ActivityType.Withdraw, msg.sender, amountToWithdraw);
    }

    /**
     * @notice Locks tokens
     * @param amount The amount of tokens to lock
     */
    function lock(
        uint256 amount
    ) external onlySufficientAmount(amount) nonReentrant {
        Lock memory lockInfo = locks[msg.sender];

        if (lockInfo.amount > 0) {
            revert ExistentTokensToClaim();
        }

        locks[msg.sender] = Lock({
            amount: amount,
            lockTime: block.timestamp,
            eligibleWithdraw: _initEligibleWithdraw()
        });

        _claimTokens(amount);

        emit TokenActivity(ActivityType.Lock, msg.sender, amount);
    }

    /**
     * @notice Immediately withdraws unlocked tokens and pays grace period removal fee
     * @param amount The amount of tokens to unlock
     */
    function unlock(
        uint256 amount
    ) external onlySufficientAmount(amount) nonReentrant {
        Lock memory lockInfo = locks[msg.sender];

        _checkUnlockPeriod(lockInfo.lockTime);

        uint256 availableToWithdraw = lockInfo.amount;

        _checkAvailableWithdraw(availableToWithdraw, amount);

        uint256 amountToWithdraw = _substractRemovalFee(amount);

        lockInfo.eligibleWithdraw = _initEligibleWithdraw();
        lockInfo.amount = lockInfo.amount - amount;

        locks[msg.sender] = lockInfo;

        _releaseTokens(amountToWithdraw);

        emit TokenActivity(ActivityType.Unlock, msg.sender, amountToWithdraw);
    }

    /**
     * @notice Withdraws unlocked tokens after finishing grace period
     */
    function unlock() external nonReentrant {
        Lock memory lockInfo = locks[msg.sender];

        uint256 availableWithdraw = lockInfo.eligibleWithdraw.amount;

        _checkWithdrawEligibility(availableWithdraw);

        _checkUnlockPeriod(lockInfo.lockTime);

        uint256 amountToWithdraw = _getAmountToWithdraw(
            lockInfo.eligibleWithdraw
        );

        lockInfo.eligibleWithdraw = _initEligibleWithdraw();
        lockInfo.amount = lockInfo.amount - availableWithdraw;

        locks[msg.sender] = lockInfo;

        _releaseTokens(amountToWithdraw);

        emit TokenActivity(ActivityType.Unlock, msg.sender, amountToWithdraw);
    }

    /**
     * @notice Get the liquid pool stats for a specific account
     * @param account Address of the account to get the stats for
     * @return stakedAmount The amount of tokens staked by the account
     * @return lockedAmount The amount of tokens locked by the account
     */
    function getLiquidPoolStats(
        address account
    ) public view returns (uint256 stakedAmount, uint256 lockedAmount) {
        stakedAmount = stakes[account].amount;
        lockedAmount = locks[account].amount;
    }

    /**
     * @notice See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
