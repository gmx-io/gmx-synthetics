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

    // fee tracker allowances, this contract also acts as the fee tracker
    mapping(address => mapping(address => uint256)) public trackerAllowances;

    constructor(
        address _gmx,
        address _esGmx,
        address _weth,
        address _gmxVester,
        address _govToken
    ) {
        override_gmx = _gmx;
        override_esGmx = _esGmx;
        override_weth = _weth;
        // stakedGmxTracker and feeGmxTracker are this contract itself (simplifies mock)
        override_stakedGmxTracker = address(this);
        override_feeGmxTracker = address(this);
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

    // IRewardTracker and IERC20 surface for the fee tracker role
    function stakedAmounts(address _account) external view returns (uint256) {
        return stakedGmxAmounts[_account] + stakedEsGmxAmounts[_account];
    }

    function approve(address _spender, uint256 _amount) external returns (bool) {
        trackerAllowances[msg.sender][_spender] = _amount;
        return true;
    }

    function allowance(address _owner, address _spender) external view returns (uint256) {
        return trackerAllowances[_owner][_spender];
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
            IERC20(override_gmx).safeTransfer(msg.sender, amount);
            if (_shouldStakeGmx) {
                // restake pulls the claimed GMX back with transferFrom like the
                // real tracker, so the caller needs a GMX allowance for it
                IERC20(override_gmx).safeTransferFrom(msg.sender, address(this), amount);
                stakedGmxAmounts[msg.sender] += amount;
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
        _compoundAccount(msg.sender);
    }

    function claim() external {}
    function claimEsGmx() external {}
    function claimFees() external {}

    function signalTransfer(address _receiver) external {
        if (override_inStrictTransferMode) {
            uint256 balance = stakedGmxAmounts[msg.sender] + stakedEsGmxAmounts[msg.sender];
            require(trackerAllowances[msg.sender][_receiver] >= balance, "MockRewardRouterV2: insufficient allowance");
        }
        pendingReceivers[msg.sender] = _receiver;
    }

    // matches RewardRouterV2: the sender is compounded first, then the sender's
    // staked GMX is unstaked to the sender and restaked for the receiver with
    // transferFrom, so the sender needs a GMX allowance for the tracker (this contract)
    function acceptTransfer(address _sender) external {
        require(pendingReceivers[_sender] == msg.sender, "MockRewardRouterV2: transfer not signalled");
        pendingReceivers[_sender] = address(0);

        _compoundAccount(_sender);

        uint256 stakedGmx = stakedGmxAmounts[_sender];
        if (stakedGmx > 0) {
            stakedGmxAmounts[_sender] = 0;
            IERC20(override_gmx).safeTransfer(_sender, stakedGmx);
            IERC20(override_gmx).safeTransferFrom(_sender, address(this), stakedGmx);
            stakedGmxAmounts[msg.sender] += stakedGmx;
        }

        // esGMX moves via handler calls on the real router, no allowance needed
        uint256 stakedEsGmx = stakedEsGmxAmounts[_sender];
        if (stakedEsGmx > 0) {
            stakedEsGmxAmounts[_sender] = 0;
            stakedEsGmxAmounts[msg.sender] += stakedEsGmx;
        }
    }

    // matches RewardRouterV2._compound: claimed GMX is restaked by pulling it
    // back with transferFrom, which needs the account's GMX allowance for the
    // tracker (this contract)
    function _compoundAccount(address _account) private {
        uint256 amount = claimableGmx[_account];
        if (amount > 0) {
            claimableGmx[_account] = 0;
            IERC20(override_gmx).safeTransfer(_account, amount);
            IERC20(override_gmx).safeTransferFrom(_account, address(this), amount);
            stakedGmxAmounts[_account] += amount;
        }
    }
}
