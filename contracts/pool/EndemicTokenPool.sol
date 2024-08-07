// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "./pools/liquid/LiquidPool.sol";
import "./pools/permanent/PermanentPool.sol";

/**
 * @title EndemicTokenPool
 * @dev Utilizes funcionalities of liquid and permanent pools
 */
contract EndemicTokenPool is LiquidPool, PermanentPool {
    struct PoolStats {
        uint256 permanentStake;
        uint256 liquidStake;
        uint256 liquidLock;
    }

    /**
     * @dev Initializes the contract and sets the EndemicToken address
     * @param tokenAddress Address of the EndemicToken
     */
    function __EndemicTokenPool_init(address tokenAddress) public initializer {
        __Ownable_init();
        __ReentrancyGuard_init();

        EndemicToken = IERC20(tokenAddress);
    }

    /**
     * @notice Get the pool stats for a specific account
     * @param account Address of the account to get the stats for
     * @return stats PoolStats structure containing permanentStake, liquidStake, and liquidLock
     */
    function getPoolStats(
        address account
    ) external view returns (PoolStats memory) {
        uint256 permanentStake = PermanentPool.getPermanentPoolStats(account);

        (uint256 liquidStake, uint256 liquidLock) = LiquidPool
            .getLiquidPoolStats(account);

        PoolStats memory stats = PoolStats({
            permanentStake: permanentStake,
            liquidStake: liquidStake,
            liquidLock: liquidLock
        });

        return stats;
    }

    /**
     * @notice See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
