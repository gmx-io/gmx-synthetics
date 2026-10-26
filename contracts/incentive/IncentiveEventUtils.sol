// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../event/EventUtils.sol";
import "../event/EventEmitter.sol";
import "../utils/Cast.sol";

library IncentiveEventUtils {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;

    function emitEsGmxIssued(
        EventEmitter eventEmitter,
        uint256 epochId,
        uint256 batchIndex,
        address account,
        uint256 amount
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);

        eventData.uintItems.initItems(3);
        eventData.uintItems.setItem(0, "epochId", epochId);
        eventData.uintItems.setItem(1, "batchIndex", batchIndex);
        eventData.uintItems.setItem(2, "amount", amount);

        eventEmitter.emitEventLog1("EsGmxIssued", Cast.toBytes32(account), eventData);
    }

    function emitIssuanceBatchDistributed(
        EventEmitter eventEmitter,
        uint256 epochId,
        uint256 batchIndex,
        uint256 entryCount,
        uint256 totalAmount
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.uintItems.initItems(4);
        eventData.uintItems.setItem(0, "epochId", epochId);
        eventData.uintItems.setItem(1, "batchIndex", batchIndex);
        eventData.uintItems.setItem(2, "entryCount", entryCount);
        eventData.uintItems.setItem(3, "totalAmount", totalAmount);

        eventEmitter.emitEventLog2("EsGmxIssuanceBatchDistributed", bytes32(epochId), bytes32(batchIndex), eventData);
    }

    function emitIssuanceEpochFinalized(
        EventEmitter eventEmitter,
        uint256 epochId,
        uint256 entryCount,
        uint256 totalAmount
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.uintItems.initItems(3);
        eventData.uintItems.setItem(0, "epochId", epochId);
        eventData.uintItems.setItem(1, "entryCount", entryCount);
        eventData.uintItems.setItem(2, "totalAmount", totalAmount);

        eventEmitter.emitEventLog1("EsGmxIssuanceEpochFinalized", bytes32(epochId), eventData);
    }

    function emitIssuerClaim(EventEmitter eventEmitter, address account, uint256 amount) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "amount", amount);

        eventEmitter.emitEventLog1("EsGmxIssuerClaim", Cast.toBytes32(account), eventData);
    }

    function emitIssuanceReduced(
        EventEmitter eventEmitter,
        address account,
        uint256 amount,
        uint256 nextIssuedAmount
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "amount", amount);
        eventData.uintItems.setItem(1, "nextIssuedAmount", nextIssuedAmount);

        eventEmitter.emitEventLog1("EsGmxIssuanceReduced", Cast.toBytes32(account), eventData);
    }

    function emitVesterDeposit(
        EventEmitter eventEmitter,
        address account,
        uint256 amount,
        uint256 pairShortfall
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "amount", amount);
        eventData.uintItems.setItem(1, "pairShortfall", pairShortfall);

        eventEmitter.emitEventLog1("RatioVesterDeposit", Cast.toBytes32(account), eventData);
    }

    function emitVesterWithdraw(
        EventEmitter eventEmitter,
        address account,
        uint256 esAmount,
        uint256 pairAmount,
        uint256 unpaidCarried
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);

        eventData.uintItems.initItems(3);
        eventData.uintItems.setItem(0, "esAmount", esAmount);
        eventData.uintItems.setItem(1, "pairAmount", pairAmount);
        eventData.uintItems.setItem(2, "unpaidCarried", unpaidCarried);

        eventEmitter.emitEventLog1("RatioVesterWithdraw", Cast.toBytes32(account), eventData);
    }

    function emitVesterClaim(EventEmitter eventEmitter, address account, uint256 amount) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "amount", amount);

        eventEmitter.emitEventLog1("RatioVesterClaim", Cast.toBytes32(account), eventData);
    }

    function emitVesterConvert(EventEmitter eventEmitter, address account, uint256 amount) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "amount", amount);

        eventEmitter.emitEventLog1("RatioVesterConvert", Cast.toBytes32(account), eventData);
    }

    function emitVesterPairTransfer(
        EventEmitter eventEmitter,
        address from,
        address to,
        uint256 amount
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "from", from);
        eventData.addressItems.setItem(1, "to", to);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "amount", amount);

        eventEmitter.emitEventLog2("RatioVesterPairTransfer", Cast.toBytes32(from), Cast.toBytes32(to), eventData);
    }

    function emitProvisionCapSet(EventEmitter eventEmitter, address account, uint256 cap) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "cap", cap);

        eventEmitter.emitEventLog1("RatioVesterProvisionCapSet", Cast.toBytes32(account), eventData);
    }

    function emitCapDeductionChanged(
        EventEmitter eventEmitter,
        address account,
        uint256 amount,
        bool increased
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "amount", amount);

        eventEmitter.emitEventLog1(
            increased ? "RatioVesterCapDeductionIncreased" : "RatioVesterCapDeductionDecreased",
            Cast.toBytes32(account),
            eventData
        );
    }

    function emitAccountFrozenSet(EventEmitter eventEmitter, address account, bool isFrozen) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);

        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "isFrozen", isFrozen);

        eventEmitter.emitEventLog1("RatioVesterAccountFrozen", Cast.toBytes32(account), eventData);
    }

    function emitDeactivatedAtSet(EventEmitter eventEmitter, uint256 deactivatedAt) internal {
        EventUtils.EventLogData memory eventData;

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "deactivatedAt", deactivatedAt);

        eventEmitter.emitEventLog("RatioVesterDeactivatedAtSet", eventData);
    }

    function emitVestingStateTransferred(
        EventEmitter eventEmitter,
        address sender,
        address receiver,
        uint256 cap,
        uint256 usage,
        uint256 unpaid
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "sender", sender);
        eventData.addressItems.setItem(1, "receiver", receiver);

        eventData.uintItems.initItems(3);
        eventData.uintItems.setItem(0, "cap", cap);
        eventData.uintItems.setItem(1, "usage", usage);
        eventData.uintItems.setItem(2, "unpaid", unpaid);

        eventEmitter.emitEventLog2(
            "RatioVesterStateTransferred",
            Cast.toBytes32(sender),
            Cast.toBytes32(receiver),
            eventData
        );
    }

    function emitVesterCapZeroed(EventEmitter eventEmitter, address account, uint256 cap) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "cap", cap);

        eventEmitter.emitEventLog1("VesterCapZeroed", Cast.toBytes32(account), eventData);
    }

    function emitStakeGmx(EventEmitter eventEmitter, address account, address token, uint256 amount) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "account", account);
        eventData.addressItems.setItem(1, "token", token);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "amount", amount);

        eventEmitter.emitEventLog1("RewardRouterStakeGmx", Cast.toBytes32(account), eventData);
    }

    function emitUnstakeSignalled(
        EventEmitter eventEmitter,
        address account,
        uint256 amount,
        uint256 requestedAt,
        bytes32 requestKey
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "amount", amount);
        eventData.uintItems.setItem(1, "requestedAt", requestedAt);

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "requestKey", requestKey);

        eventEmitter.emitEventLog1("RewardRouterUnstakeSignalled", Cast.toBytes32(account), eventData);
    }

    function emitUnstakeCancelled(
        EventEmitter eventEmitter,
        address account,
        uint256 amount,
        uint256 requestedAt,
        bytes32 requestKey
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "amount", amount);
        eventData.uintItems.setItem(1, "requestedAt", requestedAt);

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "requestKey", requestKey);

        eventEmitter.emitEventLog1("RewardRouterUnstakeCancelled", Cast.toBytes32(account), eventData);
    }

    function emitUnstakeRequestsTransferred(
        EventEmitter eventEmitter,
        address sender,
        address receiver,
        uint256 count
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "sender", sender);
        eventData.addressItems.setItem(1, "receiver", receiver);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "count", count);

        eventEmitter.emitEventLog2(
            "RewardRouterUnstakeRequestsTransferred",
            Cast.toBytes32(sender),
            Cast.toBytes32(receiver),
            eventData
        );
    }

    function emitUnstakeDelaySet(EventEmitter eventEmitter, uint256 delay) external {
        EventUtils.EventLogData memory eventData;

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "delay", delay);

        eventEmitter.emitEventLog("RewardRouterUnstakeDelaySet", eventData);
    }

    function emitUnstakeExpirySet(EventEmitter eventEmitter, uint256 expiry) external {
        EventUtils.EventLogData memory eventData;

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "expiry", expiry);

        eventEmitter.emitEventLog("RewardRouterUnstakeExpirySet", eventData);
    }

    function emitUnstakeGmx(EventEmitter eventEmitter, address account, address token, uint256 amount) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "account", account);
        eventData.addressItems.setItem(1, "token", token);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "amount", amount);

        eventEmitter.emitEventLog1("RewardRouterUnstakeGmx", Cast.toBytes32(account), eventData);
    }
}
