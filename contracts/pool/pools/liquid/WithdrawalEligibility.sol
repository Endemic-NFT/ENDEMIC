// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "../TokenPoolBase.sol";

error UnlockPeriodNotFinished();
error NonWithdrawableTokens();
error AmountExceedsAvailableWithdraw();

/**
 * @title WithdrawalEligibility
 * @dev Provides functionality for checking withdrawal eligibility and grace periods
 */
contract WithdrawalEligibility is TokenPoolBase {
    uint256 internal constant GRACE_PERIOD = 4 weeks;
    uint256 internal constant GRACE_PERIOD_REMOVAL_FEE = 1000;
    uint256 internal constant UPGRADE_PERIOD = 63_158_400; // 2 years considering leap years in seconds;

    struct EligbleWithdraw {
        uint256 gracePeriodEndTime;
        uint256 amount;
    }

    struct Stake {
        EligbleWithdraw eligbleWithdraw;
        uint256 amount;
    }

    struct Lock {
        EligbleWithdraw eligbleWithdraw;
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

        _startGracePeriod(stakeInfo.eligbleWithdraw, amount);

        stakes[msg.sender] = stakeInfo;

        emit GracePeriodStarted(msg.sender, stakeInfo.eligbleWithdraw.amount);
    }

    function startUnlockPeriod(
        uint256 amount
    ) external onlySufficientAmount(amount) {
        Lock memory lockInfo = locks[msg.sender];

        _startGracePeriod(lockInfo.eligbleWithdraw, amount);

        locks[msg.sender] = lockInfo;

        emit GracePeriodStarted(
            msg.sender,
            lockInfo.eligbleWithdraw.gracePeriodEndTime
        );
    }

    function _startGracePeriod(
        EligbleWithdraw memory eligbleWithdraw,
        uint256 amount
    ) internal view {
        _checkWithdrawEligibility(amount);

        uint256 endGracePeriodTime = block.timestamp + GRACE_PERIOD;

        eligbleWithdraw.gracePeriodEndTime = endGracePeriodTime;
        eligbleWithdraw.amount = amount;
    }

    function _checkWithdrawEligibility(
        uint256 eligbleWithdrawAmount
    ) internal pure {
        if (eligbleWithdrawAmount != 0) {
            return;
        }

        revert NonWithdrawableTokens();
    }

    function _checkUnlockPeriod(uint256 lockTime) internal view {
        if (lockTime + UPGRADE_PERIOD < block.timestamp) {
            return;
        }

        revert UnlockPeriodNotFinished();
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
        EligbleWithdraw memory eligbleWithdraw,
        bool ignoreGracePeriod
    ) internal view returns (uint256) {
        if (ignoreGracePeriod) {
            return _substractRemovalFee(eligbleWithdraw.amount);
        }

        uint256 endGracePeriodTime = eligbleWithdraw.gracePeriodEndTime;

        if (endGracePeriodTime == 0 || block.timestamp < endGracePeriodTime) {
            revert GracePeriodNotFinished();
        }

        return eligbleWithdraw.amount;
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

    function _initEligbleWithdraw()
        internal
        pure
        returns (EligbleWithdraw memory)
    {
        return EligbleWithdraw({amount: 0, gracePeriodEndTime: 0});
    }

    /**
     * @notice See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
