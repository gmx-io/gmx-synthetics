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
import "./IEsGmxIssuer.sol";
import "./IncentiveEventUtils.sol";

// @title EsGmxIssuer
// @dev Escrow ledger for weekly esGMX issuance. The off-chain engine distributes
// per-epoch batches through INCENTIVE_DISTRIBUTOR, INCENTIVE_ADMIN reconciles and
// seals each epoch, accounts claim their own issued esGMX through claim() or
// claimAmount(), and CONTROLLER callers (the reward router, or a future claim
// wrapper) claim on an account's behalf. Issued amounts also back the bound
// RatioVester's vesting cap
contract EsGmxIssuer is IEsGmxIssuer, ReentrancyGuard, RoleModule {
    using SafeERC20 for IERC20;

    struct Epoch {
        bool finalized;
        uint256 entryCount;
        uint256 totalAmount;
    }

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;
    address public immutable esGmx;

    address public override vester;

    uint256 public override totalIssuedAmount;
    uint256 public override totalClaimedAmount;

    mapping (address => uint256) public override issuedAmounts;
    mapping (address => uint256) public claimedAmounts;

    // gross per-epoch record for finalizeEpoch's reconciliation; reduceIssuedAmount adjusts only
    // the live totals, so the sum over epochs is not expected to equal totalIssuedAmount
    mapping (uint256 => Epoch) public epochs;
    mapping (uint256 => mapping (uint256 => bool)) public processedBatchIndexes;
    mapping (uint256 => mapping (bytes32 => bool)) public processedBatchHashes;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        address _esGmx
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        esGmx = _esGmx;
    }

    // @dev one-shot binding so the vester's cap source cannot be redirected after confirmation
    function setVester(address _vester) external onlyTimelockAdmin {
        if (vester != address(0)) { revert Errors.IncentiveVesterAlreadySet(vester); }
        if (_vester == address(0)) { revert Errors.EmptyIncentiveVester(); }
        vester = _vester;
    }

    function withdrawToken(address _token, address _receiver, uint256 _amount) external onlyTimelockMultisig {
        if (_token == esGmx) {
            uint256 balance = IERC20(esGmx).balanceOf(address(this));
            uint256 outstandingAmount = totalIssuedAmount - totalClaimedAmount;
            uint256 excessBalance = balance - outstandingAmount;
            if (_amount > excessBalance) {
                revert Errors.IncentiveWithdrawalExceedsExcessBalance(_amount, excessBalance);
            }
        }
        IERC20(_token).safeTransfer(_receiver, _amount);
    }

    function distributeEpoch(
        uint256 _epochId,
        uint256 _batchIndex,
        address[] calldata _accounts,
        uint256[] calldata _amounts
    ) external nonReentrant onlyIncentiveDistributor {
        if (_accounts.length == 0) { revert Errors.EmptyIssuanceBatch(); }
        if (_accounts.length != _amounts.length) {
            revert Errors.InvalidIssuanceBatchLengths(_accounts.length, _amounts.length);
        }
        if (epochs[_epochId].finalized) { revert Errors.IssuanceEpochFinalized(_epochId); }
        if (processedBatchIndexes[_epochId][_batchIndex]) {
            revert Errors.IssuanceBatchIndexAlreadyProcessed(_epochId, _batchIndex);
        }

        bytes32 batchHash = keccak256(abi.encode(_accounts, _amounts));
        if (processedBatchHashes[_epochId][batchHash]) {
            revert Errors.IssuanceBatchContentAlreadyProcessed(_epochId, batchHash);
        }

        processedBatchIndexes[_epochId][_batchIndex] = true;
        processedBatchHashes[_epochId][batchHash] = true;

        uint256 batchTotal = 0;
        for (uint256 i = 0; i < _accounts.length; i++) {
            if (i > 0 && _accounts[i] <= _accounts[i - 1]) {
                revert Errors.IssuanceBatchNotSorted(i);
            }
            address account = _accounts[i];
            uint256 amount = _amounts[i];
            if (account == address(0)) { revert Errors.EmptyIssuanceAccount(i); }
            if (amount == 0) { revert Errors.EmptyIssuanceAmount(i); }

            issuedAmounts[account] = issuedAmounts[account] + amount;
            batchTotal = batchTotal + amount;

            IncentiveEventUtils.emitEsGmxIssued(eventEmitter, _epochId, _batchIndex, account, amount);
        }

        totalIssuedAmount = totalIssuedAmount + batchTotal;
        epochs[_epochId].entryCount = epochs[_epochId].entryCount + _accounts.length;
        epochs[_epochId].totalAmount = epochs[_epochId].totalAmount + batchTotal;

        uint256 outstandingAmount = totalIssuedAmount - totalClaimedAmount;
        uint256 balance = IERC20(esGmx).balanceOf(address(this));
        if (outstandingAmount > balance) {
            revert Errors.InsufficientIssuanceFunding(outstandingAmount, balance);
        }

        IncentiveEventUtils.emitIssuanceBatchDistributed(
            eventEmitter,
            _epochId,
            _batchIndex,
            _accounts.length,
            batchTotal
        );
    }

    function finalizeEpoch(
        uint256 _epochId,
        uint256 _expectedEntryCount,
        uint256 _expectedTotal
    ) external onlyIncentiveAdmin {
        Epoch storage epoch = epochs[_epochId];
        if (epoch.finalized) { revert Errors.IssuanceEpochFinalized(_epochId); }
        if (epoch.entryCount != _expectedEntryCount) {
            revert Errors.IssuanceEpochEntryCountMismatch(_expectedEntryCount, epoch.entryCount);
        }
        if (epoch.totalAmount != _expectedTotal) {
            revert Errors.IssuanceEpochTotalMismatch(_expectedTotal, epoch.totalAmount);
        }
        epoch.finalized = true;
        IncentiveEventUtils.emitIssuanceEpochFinalized(eventEmitter, _epochId, epoch.entryCount, epoch.totalAmount);
    }

    function claimForAccount(address _account) external override nonReentrant onlyController returns (uint256) {
        return _claim(_account, claimable(_account));
    }

    function claimAmountForAccount(address _account, uint256 _amount) external override nonReentrant onlyController returns (uint256) {
        return _claim(_account, _amount);
    }

    function reduceIssuedAmount(address _account, uint256 _amount) external nonReentrant onlyIncentiveAdmin {
        uint256 unclaimedAmount = claimable(_account);
        // capped at what is still unclaimed, so a claim landing first shrinks the correction;
        // it reverts only when nothing can be reduced
        if (_amount > unclaimedAmount) { _amount = unclaimedAmount; }
        if (_amount == 0) { revert Errors.EmptyIssuanceReduction(_amount, unclaimedAmount); }
        issuedAmounts[_account] = issuedAmounts[_account] - _amount;
        totalIssuedAmount = totalIssuedAmount - _amount;
        IncentiveEventUtils.emitIssuanceReduced(eventEmitter, _account, _amount, issuedAmounts[_account]);
    }

    function claimable(address _account) public view override returns (uint256) {
        return issuedAmounts[_account] - claimedAmounts[_account];
    }

    function _claim(address _account, uint256 _amount) private returns (uint256) {
        // the feature check runs before the zero-amount return so a disabled issuer
        // blocks claim-coupled flows for accounts with a pending amount; callers that
        // should proceed regardless check claimable() first and skip the call
        FeatureUtils.validateFeature(dataStore, Keys.incentiveIssuerClaimFeatureDisabledKey(address(this)));

        uint256 claimableAmount = claimable(_account);
        if (_amount > claimableAmount) { revert Errors.IssuerClaimExceedsClaimable(_amount, claimableAmount); }
        if (_amount == 0) { return 0; }

        claimedAmounts[_account] = claimedAmounts[_account] + _amount;
        totalClaimedAmount = totalClaimedAmount + _amount;
        IERC20(esGmx).safeTransfer(_account, _amount);

        IncentiveEventUtils.emitIssuerClaim(eventEmitter, _account, _amount);
        return _amount;
    }
}
