// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "./pools/liquid/variants/LiquidTokenLockingPool.sol";
import "./pools/liquid/variants/ProlongedLiquidTokenLockingPool.sol";
import "./pools/permanent/PermanentTokenLockingPool.sol";

/**
 * @title EndemicTokenLockingPool
 * @dev Utilizes functionalities of liquid and permanent pools
 */

contract EndemicTokenLockingPool is
    LiquidTokenLockingPool,
    ProlongedLiquidTokenLockingPool,
    PermanentTokenLockingPool
{
    struct PoolStats {
        uint256 permanentLock;
        uint256 liquidLock;
        uint256 prolongedLiquidLock;
    }

    /**
     * @dev Initializes the contract and sets the EndemicToken address and fee receiver address
     * @param tokenAddress Address of the EndemicToken
     * @param feeReceiverAddress Address of the fee receiver
     */
    function __EndemicTokenLockingPool_init(
        address tokenAddress,
        address feeReceiverAddress
    ) public initializer {
        __Ownable_init();
        __ReentrancyGuard_init();

        endemicToken = IERC20(tokenAddress);
        feeReceiver = feeReceiverAddress;
    }

    /**
     * @notice Get the pool stats for a specific account
     * @param account Address of the account to get the stats for
     * @return stats PoolStats structure containing permanentLock, liquidLock, and prolongedLiquidLock
     */
    function getPoolStats(address account)
        external
        view
        returns (PoolStats memory)
    {
        uint256 permanentLock = PermanentTokenLockingPool.getPermanentPoolStats(
            account
        );

        uint256 liquidLock = LiquidTokenLockingPool.getLiquidPoolStats(account);

        uint256 prolongedLiquidLock = ProlongedLiquidTokenLockingPool
            .getProlongedLiquidPoolStats(account);

        PoolStats memory stats = PoolStats({
            permanentLock: permanentLock,
            liquidLock: liquidLock,
            prolongedLiquidLock: prolongedLiquidLock
        });

        return stats;
    }

    /**
     * @notice See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
