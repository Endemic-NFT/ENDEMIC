// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

error VestingFreezed();
error VestingNotStarted();
error NoAllocatedTokensForClaimer();
error AllocationExists();
error ENDTransferFailed();
error MaximumAdditionalAllocationReached();

contract EndemicVesting is Context, Ownable {
    IERC20 public immutable END;

    uint256 public vestingStartTime;

    bool private isVestingFreezed;

    uint256 private additionalTokensAllocated;

    uint256 public constant ADDITIONAL_TOKENS_LIMIT = 3_883_333 * 10**18;

    mapping(address => mapping(AllocationType => AllocationData))
        public allocations;

    enum AllocationType {
        SEED_SALE,
        PRIVATE_SALE,
        STRATEGIC_SALE,
        PUBLIC_SALE,
        TEAM,
        ADVISORS
    }

    struct AllocationData {
        address claimer;
        //percentage of TGE that is available for claimer immediately after TGE
        uint256 initialAllocation;
        //total allocation that is available for claimer after vesting finishes
        uint256 totalAllocated;
        uint256 totalClaimed;
        uint256 cliffDuration;
        uint256 vestingDuration;
    }

    struct AllocationRequest {
        AllocationType allocType;
        address claimer;
        uint256 initialAllocation;
        uint256 totalAllocated;
        uint256 cliffDuration;
        uint256 vestingDuration;
    }

    event ENDTokenClaimed(
        address indexed claimer,
        uint256 indexed amountClaimed,
        uint256 indexed totalClaimed
    );

    constructor(address tokenAddress, AllocationRequest[] memory allocRequests)
    {
        END = IERC20(tokenAddress);

        for (uint256 i = 0; i < allocRequests.length; i++) {
            _allocateTokens(allocRequests[i]);
        }
    }

    function addAllocations(AllocationRequest[] memory allocRequests)
        external
        onlyOwner
    {
        uint256 amountToTransfer;

        for (uint256 i = 0; i < allocRequests.length; i++) {
            AllocationRequest memory allocRequest = allocRequests[i];
            _allocateTokens(allocRequest);

            amountToTransfer += allocRequest.totalAllocated;
        }

        additionalTokensAllocated += amountToTransfer;

        if (additionalTokensAllocated > ADDITIONAL_TOKENS_LIMIT) {
            revert MaximumAdditionalAllocationReached();
        }

        if (!END.transferFrom(_msgSender(), address(this), amountToTransfer)) {
            revert ENDTransferFailed();
        }
    }

    function _allocateTokens(AllocationRequest memory allocRequest) internal {
        AllocationData storage claimerAlloc = allocations[allocRequest.claimer][
            allocRequest.allocType
        ];

        if (claimerAlloc.claimer != address(0)) {
            revert AllocationExists();
        }

        claimerAlloc.claimer = allocRequest.claimer;
        claimerAlloc.initialAllocation = allocRequest.initialAllocation;
        claimerAlloc.totalAllocated = allocRequest.totalAllocated;
        claimerAlloc.cliffDuration = allocRequest.cliffDuration;
        claimerAlloc.vestingDuration = allocRequest.vestingDuration;
    }

    function claim(AllocationType allocType) external {
        _requireVestingStart();

        _transferTokens(_msgSender(), allocType);
    }

    function claimFor(address claimer, AllocationType allocType)
        external
        onlyOwner
    {
        _requireVestingStart();

        _transferTokens(claimer, allocType);
    }

    function setVestingDates(uint256 _vestingStartTime) external onlyOwner {
        if (isVestingFreezed) revert VestingFreezed();

        vestingStartTime = _vestingStartTime;
    }

    function freezeVesting() external onlyOwner {
        isVestingFreezed = true;
    }

    function getAllocationsForClaimer(address claimer)
        external
        view
        returns (AllocationData[] memory, uint256[] memory)
    {
        AllocationData[] memory claimerAllocs = new AllocationData[](6);
        uint256[] memory amountsToClaim = new uint256[](6);

        for (uint256 i = 0; i < claimerAllocs.length; i++) {
            AllocationType allocType = AllocationType(i);

            claimerAllocs[i] = allocations[claimer][allocType];

            amountsToClaim[i] = _getAmountToClaim(claimer, allocType);
        }

        return (claimerAllocs, amountsToClaim);
    }

    function _transferTokens(address claimer, AllocationType allocType)
        internal
    {
        AllocationData memory claimerAlloc = allocations[claimer][allocType];

        if (claimerAlloc.totalClaimed >= claimerAlloc.totalAllocated) {
            revert NoAllocatedTokensForClaimer();
        }

        uint256 amountToClaim = _getAmountToClaim(claimer, allocType);

        if (amountToClaim == 0) {
            revert NoAllocatedTokensForClaimer();
        }

        allocations[claimer][allocType].totalClaimed += amountToClaim;

        require(
            END.transfer(claimer, amountToClaim),
            "END Token transfer fail"
        );

        emit ENDTokenClaimed(claimer, amountToClaim, claimerAlloc.totalClaimed);
    }

    function _getAmountToClaim(address claimer, AllocationType allocType)
        internal
        view
        returns (uint256 amountToClaim)
    {
        //vesting didn't start yet
        if (vestingStartTime > block.timestamp) {
            return 0;
        }

        AllocationData storage claimerAlloc = allocations[claimer][allocType];

        uint256 cliffEndTime = vestingStartTime + claimerAlloc.cliffDuration;
        uint256 vestingEndTime = vestingStartTime +
            claimerAlloc.vestingDuration;

        //if vesting finished total allocation is available for claimer
        if (block.timestamp >= vestingEndTime) {
            amountToClaim = claimerAlloc.totalAllocated;
        } else {
            //initial allocation is available for claimer immediately after TGE
            amountToClaim = claimerAlloc.initialAllocation;

            //if cliff passed initial allocation is summed with tokens that are lineary released by block
            if (block.timestamp >= cliffEndTime) {
                amountToClaim += uint256(
                    ((claimerAlloc.totalAllocated -
                        claimerAlloc.initialAllocation) *
                        (block.timestamp - cliffEndTime)) /
                        (vestingEndTime - cliffEndTime)
                );
            }
        }

        //calculated allocation is subtracted by amount claimer already claimed
        amountToClaim -= claimerAlloc.totalClaimed;
    }

    function _requireVestingStart() internal view {
        if (vestingStartTime == 0 || vestingStartTime > block.timestamp) {
            revert VestingNotStarted();
        }
    }
}
