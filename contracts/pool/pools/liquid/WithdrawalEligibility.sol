// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "../TokenPoolBase.sol";

error UnlockPeriodNotFinished();
error NonWithdrawableTokens();
error AmountExceedsAvailableWithdraw();
error StakedAmountExceeded();
error LockedAmountExceeded();

/**
 * @title WithdrawalEligibility
 * @dev Provides functionality for checking withdrawal eligibility and grace periods
 */
contract WithdrawalEligibility is TokenPoolBase {
    uint256 internal constant GRACE_PERIOD = 4 weeks;
    uint256 internal constant GRACE_PERIOD_REMOVAL_FEE = 1000;
    uint256 internal constant UPGRADE_PERIOD = 63_158_400; // 2 years considering leap years in seconds;

    struct EligibleWithdraw {
        uint256 gracePeriodEndTime;
        uint256 amount;
    }

    struct Stake {
        EligibleWithdraw eligibleWithdraw;
        uint256 amount;
    }

    struct Lock {
        EligibleWithdraw eligibleWithdraw;
        uint256 lockTime;
        uint256 amount;
    }

    mapping(address => Stake) internal stakes;

    mapping(address => Lock) internal locks;

    event GracePeriodStarted(
        address indexed account,
        uint256 indexed unlockPeriodEnd
    );

    function startWithdrawPeriod(
        uint256 amount
    ) external onlySufficientAmount(amount) {
        Stake memory stakeInfo = stakes[msg.sender];

        if (stakeInfo.amount < amount) {
            revert StakedAmountExceeded();
        }

        _startGracePeriod(stakeInfo.eligibleWithdraw, amount);

        stakes[msg.sender] = stakeInfo;

        emit GracePeriodStarted(msg.sender, stakeInfo.eligibleWithdraw.amount);
    }

    function startUnlockPeriod(
        uint256 amount
    ) external onlySufficientAmount(amount) {
        Lock memory lockInfo = locks[msg.sender];

        if (lockInfo.amount < amount) {
            revert LockedAmountExceeded();
        }

        _startGracePeriod(lockInfo.eligibleWithdraw, amount);

        locks[msg.sender] = lockInfo;

        emit GracePeriodStarted(
            msg.sender,
            lockInfo.eligibleWithdraw.gracePeriodEndTime
        );
    }

    function _startGracePeriod(
        EligibleWithdraw memory eligibleWithdraw,
        uint256 amount
    ) internal view {
        uint256 endGracePeriodTime = block.timestamp + GRACE_PERIOD;

        eligibleWithdraw.gracePeriodEndTime = endGracePeriodTime;
        eligibleWithdraw.amount = amount;
    }

    function _checkUnlockPeriod(uint256 lockTime) internal view {
        if (lockTime + UPGRADE_PERIOD < block.timestamp) {
            return;
        }

        revert UnlockPeriodNotFinished();
    }

    function _checkWithdrawEligibility(
        uint256 eligibleWithdrawAmount
    ) internal pure {
        if (eligibleWithdrawAmount != 0) {
            return;
        }

        revert NonWithdrawableTokens();
    }

    function _checkAvailableWithdraw(
        uint256 availableToWithdraw,
        uint256 amount
    ) internal pure {
        if (availableToWithdraw >= amount) {
            return;
        }

        revert AmountExceedsAvailableWithdraw();
    }

    function _getAmountToWithdraw(
        EligibleWithdraw memory eligibleWithdraw,
        bool ignoreGracePeriod
    ) internal view returns (uint256) {
        if (ignoreGracePeriod) {
            return _substractRemovalFee(eligibleWithdraw.amount);
        }

        uint256 endGracePeriodTime = eligibleWithdraw.gracePeriodEndTime;

        if (endGracePeriodTime == 0 || block.timestamp < endGracePeriodTime) {
            revert GracePeriodNotFinished();
        }

        return eligibleWithdraw.amount;
    }

    function _substractRemovalFee(
        uint256 amount
    ) internal pure returns (uint256) {
        uint256 removalFee = _calculateRemovalFee(amount);

        return amount - removalFee;
    }

    function _calculateRemovalFee(
        uint256 amount
    ) internal pure returns (uint256) {
        return (amount * GRACE_PERIOD_REMOVAL_FEE) / 10000;
    }

    function _initEligibleWithdraw()
        internal
        pure
        returns (EligibleWithdraw memory)
    {
        return EligibleWithdraw({amount: 0, gracePeriodEndTime: 0});
    }

    /**
     * @notice See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
