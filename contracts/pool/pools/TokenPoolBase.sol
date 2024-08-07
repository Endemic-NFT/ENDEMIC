// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

error InsufficientAmount();
error GracePeriodNotFinished();

abstract contract TokenPoolBase is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    IERC20 internal EndemicToken;

    event TokensStaked(address indexed account, uint256 indexed amount);

    modifier onlySufficientAmount(uint256 amount) {
        if (amount == 0) {
            revert InsufficientAmount();
        }

        _;
    }

    function _claimTokens(uint256 amount) internal {
        EndemicToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function _releaseTokens(uint256 amount) internal {
        EndemicToken.safeTransfer(msg.sender, amount);
    }

    /**
     * @notice See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
