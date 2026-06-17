// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IMintableToken {
    function mint(address account, uint256 amount) external;
    function burn(address account, uint256 amount) external;
}

// @title MockRewardRouterV2
// @dev Simulates V1 RewardRouterV2 for multichain staking tests.
// Staking transfers tokens from caller to this contract. Unstaking returns them.
// handleRewards mints claimable tokens to the caller based on pre-configured amounts.
contract MockRewardRouterV2 {
    using SafeERC20 for IERC20;

    address public override_gmx;
    address public override_esGmx;
    address public override_bnGmx;
    address public override_weth;
    address public override_stakedGmxTracker;
    address public override_bonusGmxTracker;
    address public override_extendedGmxTracker;
    address public override_feeGmxTracker;
    address public override_gmxVester;
    address public override_glpVester;
    address public override_govToken;
    bool public override_inStrictTransferMode;

    // claimable amounts per account (set by tests)
    mapping(address => uint256) public claimableWeth;
    mapping(address => uint256) public claimableGmx;
    mapping(address => uint256) public claimableEsGmx;

    // staked amounts per account
    mapping(address => uint256) public stakedGmxAmounts;
    mapping(address => uint256) public stakedEsGmxAmounts;

    // transfer tracking
    mapping(address => address) public pendingReceivers;

    // compound tracking
    mapping(address => bool) public compoundCalled;

    constructor(
        address _gmx,
        address _esGmx,
        address _weth,
        address _feeGmxTracker,
        address _gmxVester,
        address _govToken
    ) {
        override_gmx = _gmx;
        override_esGmx = _esGmx;
        override_weth = _weth;
        // stakedGmxTracker is this contract itself (simplifies mock)
        override_stakedGmxTracker = address(this);
        override_feeGmxTracker = _feeGmxTracker;
        override_gmxVester = _gmxVester;
        override_govToken = _govToken;
    }

    // View functions matching IRewardRouterV2
    function gmx() external view returns (address) { return override_gmx; }
    function esGmx() external view returns (address) { return override_esGmx; }
    function bnGmx() external view returns (address) { return override_bnGmx; }
    function weth() external view returns (address) { return override_weth; }
    function stakedGmxTracker() external view returns (address) { return override_stakedGmxTracker; }
    function bonusGmxTracker() external view returns (address) { return override_bonusGmxTracker; }
    function extendedGmxTracker() external view returns (address) { return override_extendedGmxTracker; }
    function feeGmxTracker() external view returns (address) { return override_feeGmxTracker; }
    function gmxVester() external view returns (address) { return override_gmxVester; }
    function glpVester() external view returns (address) { return override_glpVester; }
    function govToken() external view returns (address) { return override_govToken; }
    function inStrictTransferMode() external view returns (bool) { return override_inStrictTransferMode; }

    // Config functions for tests
    function setClaimableWeth(address account, uint256 amount) external {
        claimableWeth[account] = amount;
    }

    function setClaimableGmx(address account, uint256 amount) external {
        claimableGmx[account] = amount;
    }

    function setClaimableEsGmx(address account, uint256 amount) external {
        claimableEsGmx[account] = amount;
    }

    function setStrictTransferMode(bool _enabled) external {
        override_inStrictTransferMode = _enabled;
    }

    function setFeeGmxTracker(address _feeGmxTracker) external {
        override_feeGmxTracker = _feeGmxTracker;
    }

    // Staking functions — tokens are held by this contract
    function stakeGmx(uint256 _amount) external {
        IERC20(override_gmx).safeTransferFrom(msg.sender, address(this), _amount);
        stakedGmxAmounts[msg.sender] += _amount;
        if (override_govToken != address(0)) {
            IMintableToken(override_govToken).mint(msg.sender, _amount);
        }
    }

    function unstakeGmx(uint256 _amount) external {
        require(stakedGmxAmounts[msg.sender] >= _amount, "MockRewardRouterV2: insufficient staked amount");
        stakedGmxAmounts[msg.sender] -= _amount;
        IERC20(override_gmx).safeTransfer(msg.sender, _amount);
        if (override_govToken != address(0)) {
            IMintableToken(override_govToken).burn(msg.sender, _amount);
        }
    }

    function stakeEsGmx(uint256 _amount) external {
        IERC20(override_esGmx).safeTransferFrom(msg.sender, address(this), _amount);
        stakedEsGmxAmounts[msg.sender] += _amount;
    }

    function unstakeEsGmx(uint256 _amount) external {
        require(stakedEsGmxAmounts[msg.sender] >= _amount, "MockRewardRouterV2: insufficient staked esGmx amount");
        stakedEsGmxAmounts[msg.sender] -= _amount;
        IERC20(override_esGmx).safeTransfer(msg.sender, _amount);
    }

    function handleRewards(
        bool _shouldClaimGmx,
        bool _shouldStakeGmx,
        bool _shouldClaimEsGmx,
        bool _shouldStakeEsGmx,
        bool, /* _shouldStakeMultiplierPoints */
        bool _shouldClaimWeth,
        bool /* _shouldConvertWethToEth */
    ) external {
        // Claim WETH if requested
        if (_shouldClaimWeth && claimableWeth[msg.sender] > 0) {
            uint256 amount = claimableWeth[msg.sender];
            claimableWeth[msg.sender] = 0;
            IERC20(override_weth).safeTransfer(msg.sender, amount);
        }

        // Claim GMX if requested
        if (_shouldClaimGmx && claimableGmx[msg.sender] > 0) {
            uint256 amount = claimableGmx[msg.sender];
            claimableGmx[msg.sender] = 0;
            if (_shouldStakeGmx) {
                // Restake — tokens stay in this contract, just update accounting
                stakedGmxAmounts[msg.sender] += amount;
            } else {
                IERC20(override_gmx).safeTransfer(msg.sender, amount);
            }
        }

        // Claim esGMX if requested
        if (_shouldClaimEsGmx && claimableEsGmx[msg.sender] > 0) {
            uint256 amount = claimableEsGmx[msg.sender];
            claimableEsGmx[msg.sender] = 0;
            if (_shouldStakeEsGmx) {
                // Restake — tokens stay in this contract, just update accounting
                stakedEsGmxAmounts[msg.sender] += amount;
            } else {
                IERC20(override_esGmx).safeTransfer(msg.sender, amount);
            }
        }
    }

    function compound() external {
        compoundCalled[msg.sender] = true;
    }

    function claim() external {}
    function claimEsGmx() external {}
    function claimFees() external {}

    function signalTransfer(address _receiver) external {
        pendingReceivers[msg.sender] = _receiver;
    }

    function acceptTransfer(address _sender) external {
        require(pendingReceivers[_sender] == msg.sender, "MockRewardRouterV2: transfer not signalled");
        pendingReceivers[_sender] = address(0);
    }
}
