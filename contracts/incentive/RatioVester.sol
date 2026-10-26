// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../role/RoleModule.sol";
import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../event/EventEmitter.sol";
import "../error/Errors.sol";
import "../feature/FeatureUtils.sol";
import "../v1/IMintable.sol";
import "./IEsGmxIssuer.sol";
import "./IRatioVester.sol";
import "./IncentiveEventUtils.sol";

// @title RatioVester
// @dev Vests deposited esGMX into GMX linearly over vestingDuration, with deposits
// merged into weekly epoch tranches. The merge moves the start to the amount-weighted
// deposit time, rounded up, so added principal starts with zero elapsed credit and collateral
// has to be in the vester for as long as the conversion it earns.
// Conversion is bounded by a per-account cap sourced from provisioning, the bound issuer's issued
// amounts, and transferred lineage, less guardian and transfer deductions. Pair
// collateral is locked at a fixed ratio of the vesting balance and returned in full
// at withdrawal. The vester receipt is a non-transferable IERC20
contract RatioVester is IRatioVester, IERC20, ReentrancyGuard, RoleModule {
    using SafeERC20 for IERC20;

    struct Tranche {
        uint256 startTime;
        uint256 totalAmount;
        uint256 convertedAmount;
    }

    struct ConstructorParams {
        RoleStore roleStore;
        DataStore dataStore;
        EventEmitter eventEmitter;
        string name;
        string symbol;
        uint256 vestingDuration;
        address esToken;
        address pairToken;
        address claimableToken;
        address issuer;
        uint256 pairRatioFactor;
        bool isUncapped;
    }

    uint256 public constant PAIR_RATIO_PRECISION = 10 ** 30;
    uint256 public constant EPOCH_DURATION = 7 days;
    // unix epoch day zero is a Thursday; the offset aligns epoch boundaries to Wednesday 00:00 UTC
    uint256 public constant EPOCH_OFFSET = 1 days;
    uint256 public constant MIN_DEACTIVATION_NOTICE = 7 days;

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;

    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    uint256 public immutable vestingDuration;

    address public immutable esToken;
    address public immutable pairToken;
    address public immutable claimableToken;
    address public immutable override issuer;

    uint256 public immutable pairRatioFactor;
    bool public immutable isUncapped;

    bool public isIssuerBindingConfirmed;
    bool public provisioningComplete;
    uint256 public deactivatedAt;

    uint256 public override totalSupply;
    uint256 public pairSupply;
    uint256 public totalConverted;
    uint256 public totalGmxClaimed;

    mapping (address => uint256) public balances;
    mapping (address => uint256) public override pairAmounts;
    mapping (address => uint256) public cumulativeClaimAmounts;
    mapping (address => uint256) public claimedAmounts;
    mapping (address => uint256) public unpaidClaimAmounts;
    mapping (address => uint256) public totalConvertedAmounts;

    mapping (address => uint256) public provisionCaps;
    mapping (address => uint256) public transferredCaps;
    mapping (address => uint256) public transferredCapDeductions;
    mapping (address => uint256) public govCapDeductions;

    mapping (address => Tranche[]) public tranches;
    mapping (address => uint256) public trancheStartIndex;

    mapping (address => bool) public override isFrozen;

    constructor (ConstructorParams memory _params) RoleModule(_params.roleStore) {
        if (_params.issuer != address(0) && _params.isUncapped) {
            revert Errors.UncappedVesterHasIssuer(_params.issuer);
        }

        dataStore = _params.dataStore;
        eventEmitter = _params.eventEmitter;

        name = _params.name;
        symbol = _params.symbol;

        vestingDuration = _params.vestingDuration;

        esToken = _params.esToken;
        pairToken = _params.pairToken;
        claimableToken = _params.claimableToken;
        issuer = _params.issuer;

        pairRatioFactor = _params.pairRatioFactor;
        isUncapped = _params.isUncapped;
    }

    function setAccountFrozen(address _account, bool _isFrozen) external onlyIncentiveGuardian {
        isFrozen[_account] = _isFrozen;
        IncentiveEventUtils.emitAccountFrozenSet(eventEmitter, _account, _isFrozen);
    }

    function increaseCapDeduction(address _account, uint256 _amount) external onlyIncentiveGuardian {
        govCapDeductions[_account] = govCapDeductions[_account] + _amount;
        IncentiveEventUtils.emitCapDeductionChanged(eventEmitter, _account, _amount, true);
    }

    function decreaseCapDeduction(address _account, uint256 _amount) external onlyTimelockAdmin {
        govCapDeductions[_account] = govCapDeductions[_account] - _amount;
        IncentiveEventUtils.emitCapDeductionChanged(eventEmitter, _account, _amount, false);
    }

    function setDeactivatedAt(uint256 _deactivatedAt) external onlyTimelockAdmin {
        if (deactivatedAt != 0 && block.timestamp >= deactivatedAt) {
            revert Errors.VesterAlreadyDeactivated(deactivatedAt);
        }
        if (deactivatedAt == 0) {
            uint256 minDeactivatedAt = block.timestamp + MIN_DEACTIVATION_NOTICE;
            if (_deactivatedAt < minDeactivatedAt) {
                revert Errors.VesterDeactivationNoticeTooShort(_deactivatedAt, minDeactivatedAt);
            }
        } else {
            if (_deactivatedAt <= deactivatedAt) {
                revert Errors.VesterDeactivationNotExtended(_deactivatedAt, deactivatedAt);
            }
        }
        deactivatedAt = _deactivatedAt;
        IncentiveEventUtils.emitDeactivatedAtSet(eventEmitter, _deactivatedAt);
    }

    function confirmIssuerBinding() external {
        if (issuer == address(0) || IEsGmxIssuer(issuer).vester() != address(this)) {
            revert Errors.IncentiveIssuerNotBound(issuer);
        }
        isIssuerBindingConfirmed = true;
    }

    function setProvisionCaps(address[] calldata _accounts, uint256[] calldata _caps) external onlyIncentiveAdmin {
        if (provisioningComplete) { revert Errors.VesterProvisioningComplete(); }
        if (_accounts.length != _caps.length) {
            revert Errors.InvalidProvisionCapLengths(_accounts.length, _caps.length);
        }
        for (uint256 i = 0; i < _accounts.length; i++) {
            provisionCaps[_accounts[i]] = _caps[i];
            IncentiveEventUtils.emitProvisionCapSet(eventEmitter, _accounts[i], _caps[i]);
        }
    }

    function setProvisioningComplete() external onlyIncentiveAdmin {
        provisioningComplete = true;
    }

    function withdrawToken(address _token, address _receiver, uint256 _amount) external onlyTimelockMultisig {
        uint256 balance = IERC20(_token).balanceOf(address(this));
        uint256 excessBalance = balance;
        if (_token == pairToken) {
            excessBalance = balance - pairSupply;
        } else if (_token == esToken) {
            excessBalance = balance - totalSupply;
        } else if (_token == claimableToken) {
            uint256 obligations = totalSupply + (totalConverted - totalGmxClaimed);
            excessBalance = balance - obligations;
        }
        if (_amount > excessBalance) {
            revert Errors.IncentiveWithdrawalExceedsExcessBalance(_amount, excessBalance);
        }
        IERC20(_token).safeTransfer(_receiver, _amount);
    }

    function depositForAccount(address _account, uint256 _amount) external override nonReentrant onlyController {
        _deposit(_account, _amount);
    }

    function withdrawForAccount(address _account) external override nonReentrant onlyController {
        _withdraw(_account);
    }

    function claimForAccount(address _account) external override nonReentrant onlyController returns (uint256) {
        return _claim(_account);
    }

    function settleTranches(address _account, uint256 _maxTranches) external nonReentrant {
        _settle(_account, _maxTranches);
    }

    function transferVestingState(address _sender, address _receiver) external override nonReentrant onlyController {
        validateTransfersOpen();
        if (_sender == _receiver) { revert Errors.SelfVestingTransfer(_sender); }
        if (isFrozen[_sender]) { revert Errors.VesterAccountFrozen(_sender); }
        if (isFrozen[_receiver]) { revert Errors.VesterAccountFrozen(_receiver); }

        _settle(_sender, type(uint256).max);
        if (hasOpenSession(_sender)) { revert Errors.VestingSenderHasOpenSession(_sender); }
        if (!isFreshForTransfer(_receiver)) { revert Errors.VestingReceiverNotFresh(_receiver); }

        uint256 cap = getVestingCap(_sender);
        uint256 usageMoved = 0;
        if (cap > 0 && !(issuer == address(0) && isUncapped)) {
            transferredCaps[_receiver] = transferredCaps[_receiver] + cap;
            transferredCapDeductions[_sender] = transferredCapDeductions[_sender] + cap;
            usageMoved = totalConvertedAmounts[_sender] < cap ? totalConvertedAmounts[_sender] : cap;
            totalConvertedAmounts[_sender] = totalConvertedAmounts[_sender] - usageMoved;
            totalConvertedAmounts[_receiver] = totalConvertedAmounts[_receiver] + usageMoved;
        }

        uint256 unpaid = unpaidClaimAmounts[_sender];
        if (unpaid > 0) {
            unpaidClaimAmounts[_sender] = 0;
            unpaidClaimAmounts[_receiver] = unpaidClaimAmounts[_receiver] + unpaid;
        }

        IncentiveEventUtils.emitVestingStateTransferred(eventEmitter, _sender, _receiver, cap, usageMoved, unpaid);
    }

    function getVestingCap(address _account) public view override returns (uint256) {
        if (issuer == address(0) && isUncapped) { return type(uint256).max; }

        uint256 cap = provisionCaps[_account] + transferredCaps[_account];
        if (issuer != address(0)) {
            cap = cap + IEsGmxIssuer(issuer).issuedAmounts(_account);
        }

        // a deduction larger than the remaining cap floors it at zero rather than reverting,
        // so an oversized deduction can never block settlement or withdrawal
        uint256 transferredDeduction = transferredCapDeductions[_account];
        cap = cap > transferredDeduction ? cap - transferredDeduction : 0;
        uint256 govDeduction = govCapDeductions[_account];
        return cap > govDeduction ? cap - govDeduction : 0;
    }

    function getTotalVested(address _account) public view returns (uint256) {
        return balances[_account] + totalConvertedAmounts[_account];
    }

    function getPairRequirement(uint256 _balance) public view returns (uint256) {
        return (_balance * pairRatioFactor + (PAIR_RATIO_PRECISION - 1)) / PAIR_RATIO_PRECISION;
    }

    function currentEpoch() public view returns (uint256) {
        return (block.timestamp + EPOCH_OFFSET) / EPOCH_DURATION;
    }

    function isDeactivated() public view returns (bool) {
        return deactivatedAt != 0 && block.timestamp >= deactivatedAt;
    }

    // once deactivated, historical cap lineage cannot be used for new deposits.
    // removal is safe only after all escrow, collateral, converted GMX, and bound
    // issuer allocations have been paid out.
    function isDrainedForRemoval() external view override returns (bool) {
        if (!isDeactivated()) { return false; }
        if (totalSupply != 0 || pairSupply != 0 || totalConverted != totalGmxClaimed) { return false; }
        if (issuer == address(0)) { return true; }

        IEsGmxIssuer boundIssuer = IEsGmxIssuer(issuer);
        return boundIssuer.totalIssuedAmount() == boundIssuer.totalClaimedAmount();
    }

    function tranchesLength(address _account) external view returns (uint256) {
        return tranches[_account].length;
    }

    function hasOpenSession(address _account) public view override returns (bool) {
        return balances[_account] > 0 || pairAmounts[_account] > 0 || cumulativeClaimAmounts[_account] > 0;
    }

    function validateTransfersOpen() public view override {
        FeatureUtils.validateFeature(dataStore, Keys.incentiveVesterTransferFeatureDisabledKey(address(this)));
        if (!provisioningComplete) { revert Errors.VesterProvisioningNotComplete(); }
    }

    function isFreshForTransfer(address _account) public view override returns (bool) {
        return !isFrozen[_account]
            && balances[_account] == 0
            && pairAmounts[_account] == 0
            && cumulativeClaimAmounts[_account] == 0
            && claimedAmounts[_account] == 0
            && unpaidClaimAmounts[_account] == 0
            && totalConvertedAmounts[_account] == 0
            && transferredCaps[_account] == 0
            && transferredCapDeductions[_account] == 0
            && govCapDeductions[_account] == 0
            && tranches[_account].length == trancheStartIndex[_account];
    }

    // settled and unpaid plus what the next interaction would settle; a freeze withholds the
    // latter and blocks payment, and the withheld conversion lands on unfreeze unless deducted first
    function claimable(address _account) public view override returns (uint256) {
        uint256 amount = cumulativeClaimAmounts[_account] - claimedAmounts[_account] + unpaidClaimAmounts[_account];
        return amount + _pendingConversion(_account);
    }

    function balanceOf(address _account) external view override returns (uint256) {
        return balances[_account];
    }

    // the vester receipt is non-transferable, matching the legacy Vester
    function transfer(address, uint256) external pure override returns (bool) {
        revert Errors.IncentiveTokenNonTransferrable();
    }

    function allowance(address, address) external pure override returns (uint256) {
        return 0;
    }

    function approve(address, uint256) external pure override returns (bool) {
        revert Errors.IncentiveTokenNonTransferrable();
    }

    function transferFrom(address, address, uint256) external pure override returns (bool) {
        revert Errors.IncentiveTokenNonTransferrable();
    }

    function _deposit(address _account, uint256 _amount) private {
        FeatureUtils.validateFeature(dataStore, Keys.incentiveVesterDepositFeatureDisabledKey(address(this)));
        if (isDeactivated()) { revert Errors.VesterDeactivated(deactivatedAt); }
        if (_amount == 0) { revert Errors.EmptyVesterDepositAmount(); }
        if (isFrozen[_account]) { revert Errors.VesterAccountFrozen(_account); }
        if (issuer != address(0) && !isIssuerBindingConfirmed) {
            revert Errors.IncentiveIssuerBindingNotConfirmed();
        }

        _settle(_account, type(uint256).max);

        uint256 cap = getVestingCap(_account);
        if (cap != type(uint256).max) {
            uint256 totalVested = getTotalVested(_account) + _amount;
            if (totalVested > cap) { revert Errors.VestingCapExceeded(totalVested, cap); }
        }

        uint256 obligations = totalSupply + _amount + (totalConverted - totalGmxClaimed);
        uint256 backing = IERC20(claimableToken).balanceOf(address(this));
        if (obligations > backing) { revert Errors.InsufficientVesterBacking(obligations, backing); }

        IERC20(esToken).safeTransferFrom(_account, address(this), _amount);

        Tranche[] storage list = tranches[_account];
        uint256 epoch = currentEpoch();
        bool merged = false;
        if (list.length > trancheStartIndex[_account]) {
            Tranche storage last = list[list.length - 1];
            if ((last.startTime + EPOCH_OFFSET) / EPOCH_DURATION == epoch) {
                // rounded up so the added amount gains no elapsed credit
                uint256 total = last.totalAmount + _amount;
                last.startTime = (last.startTime * last.totalAmount + block.timestamp * _amount + total - 1) / total;
                last.totalAmount = total;
                merged = true;
            }
        }
        if (!merged) {
            list.push(Tranche({
                startTime: block.timestamp,
                totalAmount: _amount,
                convertedAmount: 0
            }));
        }

        balances[_account] = balances[_account] + _amount;
        totalSupply = totalSupply + _amount;
        emit Transfer(address(0), _account, _amount);

        uint256 requirement = getPairRequirement(balances[_account]);
        uint256 shortfall = 0;
        if (requirement > pairAmounts[_account]) {
            shortfall = requirement - pairAmounts[_account];
            IERC20(pairToken).safeTransferFrom(_account, address(this), shortfall);
            pairAmounts[_account] = pairAmounts[_account] + shortfall;
            pairSupply = pairSupply + shortfall;
            IncentiveEventUtils.emitVesterPairTransfer(eventEmitter, _account, address(this), shortfall);
        }

        IncentiveEventUtils.emitVesterDeposit(eventEmitter, _account, _amount, shortfall);
    }

    function _withdraw(address _account) private {
        _settle(_account, type(uint256).max);

        uint256 balance = balances[_account];
        uint256 pairAmount = pairAmounts[_account];
        if (balance == 0 && pairAmount == 0 && cumulativeClaimAmounts[_account] == 0) {
            revert Errors.EmptyVesterWithdrawal(_account);
        }

        uint256 unpaid = cumulativeClaimAmounts[_account] - claimedAmounts[_account];
        if (unpaid > 0) {
            unpaidClaimAmounts[_account] = unpaidClaimAmounts[_account] + unpaid;
        }
        delete cumulativeClaimAmounts[_account];
        delete claimedAmounts[_account];

        trancheStartIndex[_account] = tranches[_account].length;

        if (balance > 0) {
            balances[_account] = 0;
            totalSupply = totalSupply - balance;
            IERC20(esToken).safeTransfer(_account, balance);
            emit Transfer(_account, address(0), balance);
        }

        if (pairAmount > 0) {
            pairAmounts[_account] = 0;
            pairSupply = pairSupply - pairAmount;
            IERC20(pairToken).safeTransfer(_account, pairAmount);
            IncentiveEventUtils.emitVesterPairTransfer(eventEmitter, address(this), _account, pairAmount);
        }

        IncentiveEventUtils.emitVesterWithdraw(eventEmitter, _account, balance, pairAmount, unpaid);
    }

    function _claim(address _account) private returns (uint256) {
        FeatureUtils.validateFeature(dataStore, Keys.incentiveVesterClaimFeatureDisabledKey(address(this)));
        if (isFrozen[_account]) { revert Errors.VesterAccountFrozen(_account); }
        _settle(_account, type(uint256).max);

        uint256 amount = cumulativeClaimAmounts[_account] - claimedAmounts[_account] + unpaidClaimAmounts[_account];
        if (amount == 0) { return 0; }

        claimedAmounts[_account] = cumulativeClaimAmounts[_account];
        unpaidClaimAmounts[_account] = 0;
        totalGmxClaimed = totalGmxClaimed + amount;

        IERC20(claimableToken).safeTransfer(_account, amount);
        IncentiveEventUtils.emitVesterClaim(eventEmitter, _account, amount);
        return amount;
    }

    function _settle(address _account, uint256 _maxTranches) private {
        if (isFrozen[_account]) { return; }

        Tranche[] storage list = tranches[_account];
        uint256 start = trancheStartIndex[_account];
        uint256 endTime = block.timestamp;
        if (deactivatedAt != 0 && endTime > deactivatedAt) { endTime = deactivatedAt; }

        uint256 headroom = _capHeadroom(_account);
        uint256 totalDelta = 0;
        uint256 processed = 0;

        for (uint256 i = start; i < list.length; i++) {
            if (processed >= _maxTranches) { break; }
            processed = processed + 1;

            Tranche storage tranche = list[i];
            uint256 elapsed = endTime > tranche.startTime ? endTime - tranche.startTime : 0;
            if (elapsed > vestingDuration) { elapsed = vestingDuration; }

            uint256 target = tranche.totalAmount * elapsed / vestingDuration;
            if (target > tranche.convertedAmount) {
                uint256 delta = target - tranche.convertedAmount;
                if (headroom != type(uint256).max && delta > headroom) { delta = headroom; }
                if (delta > 0) {
                    tranche.convertedAmount = tranche.convertedAmount + delta;
                    totalDelta = totalDelta + delta;
                    if (headroom != type(uint256).max) { headroom = headroom - delta; }
                }
            }

            if (tranche.convertedAmount == tranche.totalAmount && i == start) {
                start = start + 1;
            }

            if (headroom == 0) { break; }
        }

        if (start != trancheStartIndex[_account]) {
            trancheStartIndex[_account] = start;
        }

        if (totalDelta > 0) {
            balances[_account] = balances[_account] - totalDelta;
            totalSupply = totalSupply - totalDelta;
            cumulativeClaimAmounts[_account] = cumulativeClaimAmounts[_account] + totalDelta;
            totalConvertedAmounts[_account] = totalConvertedAmounts[_account] + totalDelta;
            totalConverted = totalConverted + totalDelta;

            IMintable(esToken).burn(address(this), totalDelta);
            emit Transfer(_account, address(0), totalDelta);
            IncentiveEventUtils.emitVesterConvert(eventEmitter, _account, totalDelta);
        }
    }

    function _pendingConversion(address _account) private view returns (uint256) {
        if (isFrozen[_account]) { return 0; }

        Tranche[] storage list = tranches[_account];
        uint256 endTime = block.timestamp;
        if (deactivatedAt != 0 && endTime > deactivatedAt) { endTime = deactivatedAt; }

        uint256 headroom = _capHeadroom(_account);
        uint256 totalDelta = 0;

        for (uint256 i = trancheStartIndex[_account]; i < list.length; i++) {
            Tranche storage tranche = list[i];
            uint256 elapsed = endTime > tranche.startTime ? endTime - tranche.startTime : 0;
            if (elapsed > vestingDuration) { elapsed = vestingDuration; }

            uint256 target = tranche.totalAmount * elapsed / vestingDuration;
            if (target > tranche.convertedAmount) {
                uint256 delta = target - tranche.convertedAmount;
                if (headroom != type(uint256).max) {
                    if (delta > headroom) { delta = headroom; }
                    headroom = headroom - delta;
                }
                totalDelta = totalDelta + delta;
            }

            if (headroom == 0) { break; }
        }

        return totalDelta;
    }

    // a lifetime ceiling on conversion rather than a schedule; tranches age regardless of headroom and
    // restored headroom converts the oldest aged escrow first
    function _capHeadroom(address _account) private view returns (uint256) {
        uint256 cap = getVestingCap(_account);
        if (cap == type(uint256).max) { return type(uint256).max; }
        uint256 used = totalConvertedAmounts[_account];
        if (cap <= used) { return 0; }
        return cap - used;
    }
}
