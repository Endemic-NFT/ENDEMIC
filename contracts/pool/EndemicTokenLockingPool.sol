// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "./pools/liquid/variants/LiquidTokenLockingPool.sol";
import "./pools/liquid/variants/ProlongedLiquidTokenLockingPool.sol";

/**
 * @title EndemicTokenLockingPool
 * @dev Utilizes functionalities of liquid pools
 */

contract EndemicTokenLockingPool is
    LiquidTokenLockingPool,
    ProlongedLiquidTokenLockingPool
{
    struct PoolStats {
        uint256 liquidLock;
        uint256 shortProlongedLiquidLock;
        uint256 longProlongedLiquidLock;
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
     * @return stats PoolStats structure containing liquidLock, and prolongedLiquidLock
     */
    function getPoolStats(address account)
        external
        view
        returns (PoolStats memory)
    {
        uint256 liquidAmount = LiquidTokenLockingPool.getLiquidPoolStats(account);

        (uint256 shortProlongedLiquidAmount, uint256 longProlongedLiquidAmount) = ProlongedLiquidTokenLockingPool
            .getProlongedLiquidPoolStats(account);

        PoolStats memory stats = PoolStats({
            liquidLock: liquidAmount,
            shortProlongedLiquidLock: shortProlongedLiquidAmount,
            longProlongedLiquidLock: longProlongedLiquidAmount
        });

        return stats;
    }

    /**
     * @notice See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
