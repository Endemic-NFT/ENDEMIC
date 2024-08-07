// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "../TokenPoolBase.sol";

/**
 * @title PermanentPool
 * @dev Provides functionality for permanently staking tokens
 */
contract PermanentPool is TokenPoolBase {
    mapping(address => uint256) private stakes;

    /**
     * @notice Stakes tokens permanently
     * @param amount The amount of tokens to stake
     */
    function permanentStake(
        uint256 amount
    ) external onlySufficientAmount(amount) {
        uint256 currentStake = stakes[msg.sender];

        stakes[msg.sender] = currentStake + amount;

        _claimTokens(amount);

        emit TokensStaked(msg.sender, amount);
    }

    /**
     * @notice Get the permanent pool stats for a specific account
     * @param account Address of the account to get the stats for
     * @return The amount of tokens permanently staked by the account
     */
    function getPermanentPoolStats(
        address account
    ) public view returns (uint256) {
        return stakes[account];
    }
}
