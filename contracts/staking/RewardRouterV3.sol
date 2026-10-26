// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "../role/RoleModule.sol";
import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../event/EventEmitter.sol";
import "../error/Errors.sol";
import "../feature/FeatureUtils.sol";
import "../utils/BasicMulticall.sol";
import "../external/IExternalHandler.sol";
import "../token/IWNT.sol";
import "../v1/IRewardRouterV2.sol";
import "../v1/IRewardTrackerV1.sol";
import "../v1/IVesterV1.sol";
import "../v1/IMintable.sol";
import "../incentive/IRatioVester.sol";
import "../incentive/IEsGmxIssuer.sol";
import "../incentive/IncentiveEventUtils.sol";
import "./RewardRouterUtils.sol";
import "./UnstakeRequestStoreUtils.sol";

// @title RewardRouterV3
// @dev V1 staking router that routes staking, rewards, and account transfers through
// a designated incentive vester list in place of the hard-coded legacy vester flow.
// GMX and esGMX unstaking requires a prior signalUnstake. The request matures after
// the current unstakeDelay, which gov can change for requests that are already pending.
// Signalling does not change tracker state: on-chain rewards keep accruing until unstake.
contract RewardRouterV3 is IRewardRouterV2, ReentrancyGuard, RoleModule, BasicMulticall {
    using SafeERC20 for IERC20;
    using Address for address payable;

    enum VotingPowerType {
        None,
        BaseStakedAmount,
        BaseAndBonusStakedAmount
    }

    struct ConstructorParams {
        RoleStore roleStore;
        DataStore dataStore;
        EventEmitter eventEmitter;
        address weth;
        address gmx;
        address esGmx;
        address bnGmx;
        address glp;
        address stakedGmxTracker;
        address bonusGmxTracker;
        address extendedGmxTracker;
        address feeGmxTracker;
        address feeGlpTracker;
        address stakedGlpTracker;
        address gmxVester;
        address glpVester;
        address externalHandler;
        address govToken;
        address esGmxIssuer;
        uint256 maxBoostBasisPoints;
        bool inStrictTransferMode;
        VotingPowerType votingPowerType;
    }

    uint256 public constant BASIS_POINTS_DIVISOR = 10000;
    uint256 public constant MAX_UNSTAKE_REQUESTS = RewardRouterUtils.MAX_UNSTAKE_REQUESTS;
    uint256 public constant MAX_UNSTAKE_DELAY = 365 days;
    uint256 public constant INITIAL_UNSTAKE_DELAY = 90 days;
    uint256 public constant INITIAL_UNSTAKE_EXPIRY = 100 * 365 days;

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;

    address public immutable override weth;

    address public immutable override gmx;
    address public immutable override esGmx;
    address public immutable override bnGmx;

    address public immutable glp;

    address public immutable override stakedGmxTracker;
    address public immutable override bonusGmxTracker;
    address public immutable override extendedGmxTracker;
    address public immutable override feeGmxTracker;

    address public immutable stakedGlpTracker;
    address public immutable feeGlpTracker;

    address public immutable override gmxVester;
    address public immutable override glpVester;

    address public immutable externalHandler;

    address public override govToken;
    address public esGmxIssuer;
    address[] public designatedVesters;
    mapping (address => bool) public isDesignatedVester;
    uint256 public vesterConfigVersion;

    uint256 public maxBoostBasisPoints;
    bool public override inStrictTransferMode;

    VotingPowerType public votingPowerType;

    bool public inRestakingMode;

    // unstakeExpiry of 0 means a pending request never expires
    uint256 public unstakeDelay;
    uint256 public unstakeExpiry;

    receive() external payable {
        if (msg.sender != weth) { revert Errors.InvalidNativeTokenSender(msg.sender); }
    }

    constructor(ConstructorParams memory _params) RoleModule(_params.roleStore) {
        dataStore = _params.dataStore;
        eventEmitter = _params.eventEmitter;

        weth = _params.weth;

        gmx = _params.gmx;
        esGmx = _params.esGmx;
        bnGmx = _params.bnGmx;

        glp = _params.glp;

        stakedGmxTracker = _params.stakedGmxTracker;
        bonusGmxTracker = _params.bonusGmxTracker;
        extendedGmxTracker = _params.extendedGmxTracker;
        feeGmxTracker = _params.feeGmxTracker;

        feeGlpTracker = _params.feeGlpTracker;
        stakedGlpTracker = _params.stakedGlpTracker;

        gmxVester = _params.gmxVester;
        glpVester = _params.glpVester;

        externalHandler = _params.externalHandler;

        govToken = _params.govToken;

        esGmxIssuer = _params.esGmxIssuer;

        // set at construction so the router never holds tracker or govToken permissions
        // under a config that differs from the router it replaces
        maxBoostBasisPoints = _params.maxBoostBasisPoints;
        inStrictTransferMode = _params.inStrictTransferMode;
        votingPowerType = _params.votingPowerType;

        unstakeDelay = INITIAL_UNSTAKE_DELAY;
        unstakeExpiry = INITIAL_UNSTAKE_EXPIRY;
    }

    function setGovToken(address _govToken) external onlyTimelockAdmin {
        govToken = _govToken;
    }

    function setInStrictTransferMode(bool _inStrictTransferMode) external onlyTimelockAdmin {
        inStrictTransferMode = _inStrictTransferMode;
    }

    function setMaxBoostBasisPoints(uint256 _maxBoostBasisPoints) external onlyTimelockAdmin {
        maxBoostBasisPoints = _maxBoostBasisPoints;
    }

    function setVotingPowerType(VotingPowerType _votingPowerType) external onlyTimelockAdmin {
        votingPowerType = _votingPowerType;
    }

    function setInRestakingMode(bool _inRestakingMode) external onlyTimelockAdmin {
        inRestakingMode = _inRestakingMode;
    }

    // a delay increase pushes every pending request's maturity out, including requests
    // that had already matured under the previous delay.
    // intended to be called by ConfigTimelockController after TimelockConfig.signalSetUnstakeDelay
    function setUnstakeDelay(uint256 _unstakeDelay) external onlyController {
        if (_unstakeDelay > MAX_UNSTAKE_DELAY) {
            revert Errors.MaxUnstakeDelayExceeded(_unstakeDelay, MAX_UNSTAKE_DELAY);
        }
        if (unstakeExpiry != 0 && _unstakeDelay >= unstakeExpiry) {
            revert Errors.UnstakeDelayExceedsExpiry(_unstakeDelay, unstakeExpiry);
        }
        unstakeDelay = _unstakeDelay;
        IncentiveEventUtils.emitUnstakeDelaySet(eventEmitter, _unstakeDelay);
    }

    // zero disables expiry. a non-zero expiry is the lifetime measured from requestedAt
    // and must stay strictly above the delay so a request has a non-empty execution window.
    // intended to be called by ConfigTimelockController after TimelockConfig.signalSetUnstakeExpiry
    function setUnstakeExpiry(uint256 _unstakeExpiry) external onlyController {
        if (_unstakeExpiry != 0 && _unstakeExpiry <= unstakeDelay) {
            revert Errors.UnstakeDelayExceedsExpiry(unstakeDelay, _unstakeExpiry);
        }
        unstakeExpiry = _unstakeExpiry;
        IncentiveEventUtils.emitUnstakeExpirySet(eventEmitter, _unstakeExpiry);
    }

    function setEsGmxIssuer(address _esGmxIssuer) external onlyTimelockAdmin {
        esGmxIssuer = _esGmxIssuer;
    }

    function addDesignatedVester(address _vester) external onlyTimelockAdmin {
        if (isDesignatedVester[_vester]) { revert Errors.DesignatedVesterAlreadyAdded(_vester); }
        // probe the RatioVester interface so an EOA or unrelated contract cannot be added;
        // the return is unused because a live vester is not drained
        IRatioVester(_vester).isDrainedForRemoval();
        isDesignatedVester[_vester] = true;
        designatedVesters.push(_vester);
        vesterConfigVersion++;
    }

    // removal is allowed only after deactivation and after all user assets and issuer
    // allocations have been paid out. changing the list invalidates pending transfers.
    function removeDesignatedVester(address _vester) external onlyTimelockAdmin {
        if (!isDesignatedVester[_vester]) { revert Errors.DesignatedVesterNotFound(_vester); }
        if (!IRatioVester(_vester).isDrainedForRemoval()) {
            revert Errors.DesignatedVesterNotDrained(_vester);
        }

        isDesignatedVester[_vester] = false;
        for (uint256 i = 0; i < designatedVesters.length; i++) {
            if (designatedVesters[i] == _vester) {
                designatedVesters[i] = designatedVesters[designatedVesters.length - 1];
                designatedVesters.pop();
                break;
            }
        }
        vesterConfigVersion++;
    }

    function designatedVestersLength() external view returns (uint256) {
        return designatedVesters.length;
    }

    // to help users who accidentally send their tokens to this contract
    function withdrawToken(address _token, address _receiver, uint256 _amount) external onlyTimelockMultisig {
        IERC20(_token).safeTransfer(_receiver, _amount);
    }

    function batchStakeGmxForAccounts(address[] memory _accounts, uint256[] memory _amounts) external nonReentrant onlyTimelockAdmin {
        address _gmx = gmx;
        for (uint256 i = 0; i < _accounts.length; i++) {
            _stakeGmx(msg.sender, _accounts[i], _gmx, _amounts[i]);
        }
    }

    function batchCompoundForAccounts(address[] memory _accounts) external nonReentrant onlyTimelockAdmin {
        for (uint256 i = 0; i < _accounts.length; i++) {
            _compound(_accounts[i]);
        }
    }

    function batchRestakeForAccounts(address[] memory _accounts) external nonReentrant onlyTimelockAdmin {
        for (uint256 i = 0; i < _accounts.length; i++) {
            _restakeForAccount(_accounts[i]);
        }
    }

    function makeExternalCalls(
        address[] memory externalCallTargets,
        bytes[] memory externalCallDataList,
        address[] memory refundTokens,
        address[] memory refundReceivers
    ) external nonReentrant {
        IExternalHandler(externalHandler).makeExternalCalls(
            externalCallTargets,
            externalCallDataList,
            refundTokens,
            refundReceivers
        );
    }

    function stakeGmx(uint256 _amount) external override nonReentrant {
        _stakeGmx(msg.sender, msg.sender, gmx, _amount);
    }

    function stakeEsGmx(uint256 _amount) external override nonReentrant {
        _stakeGmx(msg.sender, msg.sender, esGmx, _amount);
    }

    // Note!
    // A user can signalUnstake, unstake through V2, leave the V3 request in place, stake again,
    // and exit immediately once that request has matured.
    // The same reuse works for any other remaining tracker handler.
    function unstakeGmx(uint256 _amount) external override nonReentrant {
        _restakeForAccount(msg.sender);
        _consumeUnstakeRequest(msg.sender, _amount);

        _unstakeGmx(msg.sender, gmx, _amount, true);
    }

    function unstakeEsGmx(uint256 _amount) external override nonReentrant {
        _restakeForAccount(msg.sender);
        _consumeUnstakeRequest(msg.sender, _amount);

        _unstakeGmx(msg.sender, esGmx, _amount, true);
    }

    // reserves base stake (staked GMX + staked esGMX) for a later unstake.
    // the trackers are not touched, so on-chain rewards keep accruing.
    // returns the request key. gov can disable new signals with the signalUnstake feature flag.
    function signalUnstake(uint256 _amount) external nonReentrant returns (bytes32) {
        FeatureUtils.validateFeature(dataStore, Keys.signalUnstakeFeatureDisabledKey(address(this)));
        _validateAmount(_amount);

        uint256 stakedAmount = IRewardTracker(stakedGmxTracker).stakedAmounts(msg.sender);
        bytes32 requestKey = RewardRouterUtils.signalUnstakeRequest(dataStore, msg.sender, _amount, stakedAmount);
        IncentiveEventUtils.emitUnstakeSignalled(eventEmitter, msg.sender, _amount, block.timestamp, requestKey);
        return requestKey;
    }

    // cancelling an unknown or already removed request succeeds and emits nothing.
    function cancelUnstake(bytes32 _requestKey) external nonReentrant {
        UnstakeRequestStoreUtils.UnstakeRequest memory request = RewardRouterUtils.cancelUnstakeRequest(
            dataStore,
            msg.sender,
            _requestKey
        );
        if (request.requestedAt == 0) { return; }
        IncentiveEventUtils.emitUnstakeCancelled(eventEmitter, msg.sender, request.amount, request.requestedAt, _requestKey);
    }

    function pendingReceivers(address _sender) external view returns (address) {
        return dataStore.getAddress(Keys.pendingReceiverKey(_sender));
    }

    function pendingTransferVesterVersions(address _sender) external view returns (uint256) {
        return dataStore.getUint(Keys.pendingTransferVesterVersionKey(_sender));
    }

    function unstakeRequestsLength(address _account) external view returns (uint256) {
        return UnstakeRequestStoreUtils.getCount(dataStore, _account);
    }

    function unstakeRequestKeys(address _account) external view returns (bytes32[] memory) {
        return UnstakeRequestStoreUtils.getKeys(dataStore, _account);
    }

    function getUnstakeRequest(bytes32 _requestKey) external view returns (UnstakeRequestStoreUtils.UnstakeRequest memory) {
        return UnstakeRequestStoreUtils.get(dataStore, _requestKey);
    }

    function pendingUnstakeAmount(address _account) external view returns (uint256) {
        return RewardRouterUtils.pendingUnstakeAmount(dataStore, _account);
    }

    function executableUnstakeAmount(address _account) external view returns (uint256) {
        return RewardRouterUtils.executableUnstakeAmount(dataStore, _account, unstakeDelay, unstakeExpiry);
    }

    function claim() external override nonReentrant {
        _claim(stakedGmxTracker, stakedGlpTracker, msg.sender, msg.sender);
        _claimGmxFees(msg.sender, msg.sender);
        _claim(feeGmxTracker, feeGlpTracker, msg.sender, msg.sender);
    }

    function claimEsGmx() external override nonReentrant {
        _claim(stakedGmxTracker, stakedGlpTracker, msg.sender, msg.sender);
    }

    function claimFees() external override nonReentrant {
        _claimGmxFees(msg.sender, msg.sender);
        _claim(feeGmxTracker, feeGlpTracker, msg.sender, msg.sender);
    }

    function compound() external override nonReentrant {
        _compound(msg.sender);
    }

    function vesterDeposit(address _vester, uint256 _amount) external nonReentrant {
        _validateDesignatedVester(_vester);
        RewardRouterUtils.syncFeeGmxTrackerBalance(_routerAddresses(), designatedVesters, msg.sender);
        IRatioVester(_vester).depositForAccount(msg.sender, _amount);
    }

    function vesterWithdraw(address _vester) external nonReentrant {
        _validateDesignatedVester(_vester);
        IRatioVester(_vester).withdrawForAccount(msg.sender);
    }

    function vesterClaim(address _vester) external nonReentrant returns (uint256) {
        _validateDesignatedVester(_vester);
        return IRatioVester(_vester).claimForAccount(msg.sender);
    }

    function issuerClaim() external nonReentrant returns (uint256) {
        if (esGmxIssuer == address(0)) { revert Errors.EmptyIncentiveIssuer(); }
        return IEsGmxIssuer(esGmxIssuer).claimForAccount(msg.sender);
    }

    function handleRewards(
        bool _shouldClaimGmx,
        bool _shouldStakeGmx,
        bool _shouldClaimEsGmx,
        bool _shouldStakeEsGmx,
        bool _shouldStakeMultiplierPoints,
        bool _shouldClaimWeth,
        bool _shouldConvertWethToEth
    ) external override nonReentrant {
        _handleRewards(
            msg.sender,
            _shouldClaimGmx,
            _shouldStakeGmx,
            _shouldClaimEsGmx,
            _shouldStakeEsGmx,
            _shouldStakeMultiplierPoints,
            _shouldClaimWeth,
            _shouldConvertWethToEth
        );
    }

    function handleRewardsV2(
        address _gmxReceiver,
        bool _shouldClaimGmx,
        bool _shouldStakeGmx,
        bool _shouldClaimEsGmx,
        bool _shouldStakeEsGmx,
        bool _shouldStakeMultiplierPoints,
        bool _shouldClaimWeth,
        bool _shouldConvertWethToEth
    ) external nonReentrant {
        _handleRewards(
            _gmxReceiver,
            _shouldClaimGmx,
            _shouldStakeGmx,
            _shouldClaimEsGmx,
            _shouldStakeEsGmx,
            _shouldStakeMultiplierPoints,
            _shouldClaimWeth,
            _shouldConvertWethToEth
        );
    }

    function _handleRewards(
        address _gmxReceiver,
        bool _shouldClaimGmx,
        bool _shouldStakeGmx,
        bool _shouldClaimEsGmx,
        bool _shouldStakeEsGmx,
        bool _shouldStakeMultiplierPoints,
        bool _shouldClaimWeth,
        bool _shouldConvertWethToEth
    ) private {
        address account = msg.sender;

        uint256 gmxAmount = 0;
        if (_shouldClaimGmx) {
            uint256 gmxAmount0 = _claimVestedGmx(account, _gmxReceiver);
            uint256 gmxAmount1 = _claimGmxFees(account, _gmxReceiver);
            gmxAmount = gmxAmount0 + gmxAmount1;
        }

        if (_shouldStakeGmx && gmxAmount > 0) {
            if (_gmxReceiver != account) { revert Errors.InvalidGmxReceiver(_gmxReceiver); }
            _stakeGmx(account, account, gmx, gmxAmount);
        }

        uint256 esGmxAmount = 0;
        if (_shouldClaimEsGmx) {
            esGmxAmount = _claim(stakedGmxTracker, stakedGlpTracker, account, account);
        }

        if (_shouldStakeEsGmx && esGmxAmount > 0) {
            _stakeGmx(account, account, esGmx, esGmxAmount);
        }

        if (_shouldStakeMultiplierPoints) {
            _restakeForAccount(account);

            _stakeBnGmx(account);
        }

        if (_shouldClaimWeth) {
            if (_shouldConvertWethToEth) {
                uint256 wethAmount = _claim(feeGmxTracker, feeGlpTracker, account, address(this));
                _convertWethToEth(wethAmount);
            } else {
                _claim(feeGmxTracker, feeGlpTracker, account, account);
            }
        }

        _syncVotingPower(account);
    }

    // the _validateReceiver function checks that the averageStakedAmounts and cumulativeRewards
    // values of an account are zero, this is to help ensure that vesting calculations can be
    // done correctly
    // averageStakedAmounts and cumulativeRewards are updated if the claimable reward for an account
    // is more than zero
    // it is possible for multiple transfers to be sent into a single account, using signalTransfer and
    // acceptTransfer, if those values have not been updated yet
    // for GLP transfers it is also possible to transfer GLP into an account using the StakedGlp contract
    function signalTransfer(address _receiver) external override nonReentrant {
        if (designatedVesters.length == 0) { revert Errors.EmptyDesignatedVesters(); }
        if (_receiver == msg.sender) { revert Errors.SelfVestingTransfer(msg.sender); }

        _validateSender(msg.sender);

        _validateReceiver(_receiver);

        if (inStrictTransferMode) {
            uint256 balance = IRewardTracker(feeGmxTracker).stakedAmounts(msg.sender);
            uint256 allowance = IERC20(feeGmxTracker).allowance(msg.sender, _receiver);
            if (allowance < balance) { revert Errors.InsufficientStrictTransferAllowance(allowance, balance); }
        }

        dataStore.setAddress(Keys.pendingReceiverKey(msg.sender), _receiver);
        dataStore.setUint(Keys.pendingTransferVesterVersionKey(msg.sender), vesterConfigVersion);
    }

    function acceptTransfer(address _sender) external override nonReentrant {
        if (designatedVesters.length == 0) { revert Errors.EmptyDesignatedVesters(); }

        address receiver = msg.sender;
        bytes32 pendingReceiverKey = Keys.pendingReceiverKey(_sender);
        if (dataStore.getAddress(pendingReceiverKey) != receiver) { revert Errors.TransferNotSignalled(_sender, receiver); }

        bytes32 pendingVersionKey = Keys.pendingTransferVesterVersionKey(_sender);
        uint256 signalledVersion = dataStore.getUint(pendingVersionKey);
        if (signalledVersion != vesterConfigVersion) {
            revert Errors.TransferVesterConfigChanged(signalledVersion, vesterConfigVersion);
        }

        _validateSender(_sender);

        dataStore.removeUint(pendingVersionKey);
        dataStore.removeAddress(pendingReceiverKey);

        _validateReceiver(receiver);
        _compound(_sender);

        uint256 stakedGmx = IRewardTracker(stakedGmxTracker).depositBalances(_sender, gmx);
        if (stakedGmx > 0) {
            _unstakeGmx(_sender, gmx, stakedGmx, false);
            _stakeGmx(_sender, receiver, gmx, stakedGmx);
        }

        uint256 stakedEsGmx = IRewardTracker(stakedGmxTracker).depositBalances(_sender, esGmx);
        if (stakedEsGmx > 0) {
            _unstakeGmx(_sender, esGmx, stakedEsGmx, false);
            _stakeGmx(_sender, receiver, esGmx, stakedEsGmx);
        }

        RewardRouterUtils.transferBalances(_routerAddresses(), designatedVesters, _sender, receiver);

        uint256 movedRequests = RewardRouterUtils.transferUnstakeRequests(dataStore, _sender, receiver);
        if (movedRequests > 0) {
            IncentiveEventUtils.emitUnstakeRequestsTransferred(eventEmitter, _sender, receiver, movedRequests);
        }

        _syncVotingPower(_sender);
        _syncVotingPower(receiver);
    }

    function _claim(address _rewardTracker0, address _rewardTracker1, address _account, address _receiver) private returns (uint256) {
        uint256 amount0 = IRewardTracker(_rewardTracker0).claimForAccount(_account, _receiver);
        uint256 amount1 = IRewardTracker(_rewardTracker1).claimForAccount(_account, _receiver);
        uint256 amount = amount0 + amount1;
        return (amount);
    }

    function _claimGmxFees(address _account, address _receiver) private returns (uint256) {
        uint256 gmxAmount = IRewardTracker(extendedGmxTracker).claimForAccount(_account, _receiver);
        return (gmxAmount);
    }

    // the designated vesters pay the account itself, so vested GMX is only claimed
    // when the receiver is the account; the legacy vesters are not proxied
    function _claimVestedGmx(address _account, address _receiver) private returns (uint256) {
        if (_receiver != _account) { return 0; }
        uint256 gmxAmount = 0;
        for (uint256 i = 0; i < designatedVesters.length; i++) {
            IRatioVester designatedVester = IRatioVester(designatedVesters[i]);
            // skip rather than revert so handleRewards stays usable while a vester's claim
            // feature is disabled (migration wiring) or the account is frozen on one vester
            if (FeatureUtils.isFeatureDisabled(
                dataStore,
                Keys.incentiveVesterClaimFeatureDisabledKey(address(designatedVester))
            )) { continue; }
            if (designatedVester.isFrozen(_account)) { continue; }
            gmxAmount = gmxAmount + designatedVester.claimForAccount(_account);
        }
        return (gmxAmount);
    }

    function _convertWethToEth(uint256 _amount) private {
        IWNT(weth).withdraw(_amount);
        payable(msg.sender).sendValue(_amount);
    }

    function _compound(address _account) private {
        uint256 gmxAmount = _claimGmxFees(_account, _account);
        if (gmxAmount > 0) {
            _stakeGmx(_account, _account, gmx, gmxAmount);
        }

        uint256 esGmxAmount = _claim(stakedGmxTracker, stakedGlpTracker, _account, _account);
        if (esGmxAmount > 0) {
            _stakeGmx(_account, _account, esGmx, esGmxAmount);
        }

        _restakeForAccount(_account);

        _stakeBnGmx(_account);

        _syncVotingPower(_account);
    }

    function _stakeGmx(address _fundingAccount, address _account, address _token, uint256 _amount) private {
        _validateAmount(_amount);

        IRewardTracker(stakedGmxTracker).stakeForAccount(_fundingAccount, _account, _token, _amount);
        IRewardTracker(bonusGmxTracker).stakeForAccount(_account, _account, stakedGmxTracker, _amount);
        IRewardTracker(extendedGmxTracker).stakeForAccount(_account, _account, bonusGmxTracker, _amount);
        IRewardTracker(feeGmxTracker).stakeForAccount(_account, _account, extendedGmxTracker, _amount);

        _syncVotingPower(_account);

        IncentiveEventUtils.emitStakeGmx(eventEmitter, _account, _token, _amount);
    }

    // note that _syncVotingPower is not called here, in functions which
    // call _stakeBnGmx it should be ensured that _syncVotingPower is called
    // after
    function _stakeBnGmx(address _account) private {
        RewardRouterUtils.stakeBnGmx(_routerAddresses(), _account, maxBoostBasisPoints);
    }

    function _unstakeGmx(address _account, address _token, uint256 _amount, bool _shouldReduceBnGmx) private {
        _validateAmount(_amount);

        uint256 balance = IRewardTracker(stakedGmxTracker).stakedAmounts(_account);

        IRewardTracker(feeGmxTracker).unstakeForAccount(_account, extendedGmxTracker, _amount, _account);
        IRewardTracker(extendedGmxTracker).unstakeForAccount(_account, bonusGmxTracker, _amount, _account);
        IRewardTracker(bonusGmxTracker).unstakeForAccount(_account, stakedGmxTracker, _amount, _account);
        IRewardTracker(stakedGmxTracker).unstakeForAccount(_account, _token, _amount, _account);

        if (_shouldReduceBnGmx) {
            IRewardTracker(bonusGmxTracker).claimForAccount(_account, _account);

            // unstake and burn staked bnGmx tokens
            uint256 stakedBnGmx = IRewardTracker(extendedGmxTracker).depositBalances(_account, bnGmx);
            if (stakedBnGmx > 0) {
                uint256 reductionAmount = stakedBnGmx * _amount / balance;
                if (reductionAmount > 0) {
                    IRewardTracker(feeGmxTracker).unstakeForAccount(_account, extendedGmxTracker, reductionAmount, _account);
                    IRewardTracker(extendedGmxTracker).unstakeForAccount(_account, bnGmx, reductionAmount, _account);
                    _burnToken(bnGmx, _account, reductionAmount);
                }
            }

            // burn bnGmx tokens from user's balance
            uint256 bnGmxBalance = IERC20(bnGmx).balanceOf(_account);
            if (bnGmxBalance > 0) {
                uint256 amountToBurn = bnGmxBalance * _amount / balance;
                _burnToken(bnGmx, _account, amountToBurn);
            }
        }

        _syncVotingPower(_account);

        IncentiveEventUtils.emitUnstakeGmx(eventEmitter, _account, _token, _amount);
    }

    function _syncVotingPower(address _account) private {
        if (votingPowerType == VotingPowerType.None) {
            return;
        }

        if (votingPowerType == VotingPowerType.BaseStakedAmount) {
            uint256 baseStakedAmount = IRewardTracker(stakedGmxTracker).stakedAmounts(_account);
            _syncVotingPower(_account, baseStakedAmount);
            return;
        }

        if (votingPowerType == VotingPowerType.BaseAndBonusStakedAmount) {
            uint256 stakedAmount = IRewardTracker(feeGmxTracker).stakedAmounts(_account);
            _syncVotingPower(_account, stakedAmount);
            return;
        }

        revert Errors.UnsupportedVotingPowerType(uint256(votingPowerType));
    }

    function _syncVotingPower(address _account, uint256 _amount) private {
        uint256 currentVotingPower = IERC20(govToken).balanceOf(_account);
        if (currentVotingPower == _amount) { return; }

        if (currentVotingPower > _amount) {
            uint256 amountToBurn = currentVotingPower - _amount;
            _burnToken(govToken, _account, amountToBurn);
            return;
        }

        uint256 amountToMint = _amount - currentVotingPower;
        _mintToken(govToken, _account, amountToMint);
    }

    function _restakeForAccount(address _account) private {
        if (!inRestakingMode) { return; }

        if (RewardRouterUtils.restakeForAccount(_routerAddresses(), _account, maxBoostBasisPoints)) {
            _syncVotingPower(_account);
        }
    }

    function _mintToken(address _token, address _account, uint256 _amountToMint) private {
        IMintable(_token).mint(_account, _amountToMint);
    }

    function _burnToken(address _token, address _account, uint256 _amountToBurn) private {
        IMintable(_token).burn(_account, _amountToBurn);
    }

    function _routerAddresses() private view returns (RewardRouterUtils.Addresses memory) {
        return RewardRouterUtils.Addresses({
            gmx: gmx,
            esGmx: esGmx,
            bnGmx: bnGmx,
            glp: glp,
            stakedGmxTracker: stakedGmxTracker,
            bonusGmxTracker: bonusGmxTracker,
            extendedGmxTracker: extendedGmxTracker,
            feeGmxTracker: feeGmxTracker,
            stakedGlpTracker: stakedGlpTracker,
            feeGlpTracker: feeGlpTracker,
            gmxVester: gmxVester,
            glpVester: glpVester
        });
    }

    function _validateReceiver(address _receiver) private view {
        RewardRouterUtils.validateReceiver(_routerAddresses(), designatedVesters, _receiver);
    }

    function _validateSender(address _sender) private view {
        RewardRouterUtils.validateSender(_routerAddresses(), designatedVesters, _sender);
    }

    function _consumeUnstakeRequest(address _account, uint256 _amount) private {
        RewardRouterUtils.consumeUnstakeRequests(dataStore, _account, _amount, unstakeDelay, unstakeExpiry);
    }

    function _validateAmount(uint256 _amount) private pure {
        if (_amount == 0) { revert Errors.EmptyStakeAmount(); }
    }

    function _validateDesignatedVester(address _vester) private view {
        if (!isDesignatedVester[_vester]) { revert Errors.InvalidDesignatedVester(_vester); }
    }
}
