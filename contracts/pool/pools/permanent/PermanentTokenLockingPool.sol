// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "../TokenLockingPoolBase.sol";

/**
 * @title PermanentTokenLockingPool
 * @dev Provides functionality for permanently staking tokens
 */
contract PermanentTokenLockingPool is TokenLockingPoolBase {
    mapping(address => uint256) private permanentLocks;

    /**
     * @notice Permanently locks tokens
     * @param amount The amount of tokens to lock
     */
    function permanentLock(uint256 amount)
        external
        onlySufficientAmount(amount)
    {
        uint256 currentPermanentLockedAmount = permanentLocks[msg.sender];

        permanentLocks[msg.sender] = currentPermanentLockedAmount + amount;

        _lockTokens(amount);

        emit TokenActivity(ActivityType.PermanentLock, msg.sender, amount, 0);
    }

    /**
     * @notice Get the permanent lock stats for a specific account
     * @param account Address of the account to get the stats for
     * @return The amount of tokens permanently locked by the account
     */
    function getPermanentPoolStats(address account)
        public
        view
        returns (uint256)
    {
        return permanentLocks[account];
    }

    /**
     * @notice See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
