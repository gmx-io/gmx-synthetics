// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../event/EventUtils.sol";
import "../event/EventEmitter.sol";
import "../utils/Cast.sol";

library ClaimEventUtils {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.Bytes32Items;

    // @dev emit a ClaimFundsDeposited event
    // @param eventEmitter the event emitter
    // @param account the account funds were deposited for
    // @param token the token that was deposited
    // @param distributionId the distribution id that was deposited
    // @param amount the amount that was deposited
    // @param nextAmount the updated total amount for the account
    function emitClaimFundsDeposited(
        EventEmitter eventEmitter,
        address account,
        address token,
        uint256 distributionId,
        uint256 amount,
        uint256 nextAmount
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "account", account);
        eventData.addressItems.setItem(1, "token", token);

        eventData.uintItems.initItems(3);
        eventData.uintItems.setItem(0, "distributionId", distributionId);
        eventData.uintItems.setItem(1, "amount", amount);
        eventData.uintItems.setItem(2, "nextAmount", nextAmount);

        eventEmitter.emitEventLog2("ClaimFundsDeposited", Cast.toBytes32(account), Cast.toBytes32(token), eventData);
    }

    // @dev emit a ClaimFundsWithdrawn event
    // @param eventEmitter the event emitter
    // @param account the account that funds were withdrawn for
    // @param token the token that was withdrawn
    // @param distributionId the distribution id that was withdrawn
    // @param amount the amount that was withdrawn
    // @param receiver the address that received the funds
    function emitClaimFundsWithdrawn(
        EventEmitter eventEmitter,
        address account,
        address token,
        uint256 distributionId,
        uint256 amount,
        address receiver
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "account", account);
        eventData.addressItems.setItem(1, "token", token);
        eventData.addressItems.setItem(2, "receiver", receiver);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "distributionId", distributionId);
        eventData.uintItems.setItem(1, "amount", amount);

        eventEmitter.emitEventLog2("ClaimFundsWithdrawn", Cast.toBytes32(account), Cast.toBytes32(token), eventData);
    }

    // @dev emit a ClaimFundsClaimed event
    // this event is emitted when user claims funds and funds are transferred
    // from the claim vault to the receiver
    // @param eventEmitter the event emitter
    // @param account the account that claimed funds
    // @param receiver the address that received the funds
    // @param token the token that was claimed
    // @param distributionId the distribution id that was claimed
    // @param amount the amount that was claimed
    function emitClaimFundsClaimed(
        EventEmitter eventEmitter,
        address account,
        address receiver,
        address token,
        uint256 distributionId,
        uint256 amount
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "account", account);
        eventData.addressItems.setItem(1, "receiver", receiver);
        eventData.addressItems.setItem(2, "token", token);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "distributionId", distributionId);
        eventData.uintItems.setItem(1, "amount", amount);

        eventEmitter.emitEventLog2("ClaimFundsClaimed", Cast.toBytes32(account), Cast.toBytes32(token), eventData);
    }

    // @dev emit a ClaimFundsTransferred event
    // this event is emitted when funds are transferred from one account to another
    // it affects internal accounting of the claimable funds amount only
    // funds stay inside the claim vault
    // @param eventEmitter the event emitter
    // @param token the token that was transferred
    // @param distributionId the distribution id for the transfer
    // @param fromAccount the account that funds were transferred from
    // @param toAccount the account that funds were transferred to
    // @param amount the amount that was transferred
    // @param nextAmount the updated total amount for the recipient
    function emitClaimFundsTransferred(
        EventEmitter eventEmitter,
        address token,
        uint256 distributionId,
        address fromAccount,
        address toAccount,
        uint256 amount,
        uint256 nextAmount
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "fromAccount", fromAccount);
        eventData.addressItems.setItem(1, "toAccount", toAccount);
        eventData.addressItems.setItem(2, "token", token);

        eventData.uintItems.initItems(3);
        eventData.uintItems.setItem(0, "distributionId", distributionId);
        eventData.uintItems.setItem(1, "amount", amount);
        eventData.uintItems.setItem(2, "nextAmount", nextAmount);

        eventEmitter.emitEventLog2(
            "ClaimFundsTransferred",
            Cast.toBytes32(fromAccount),
            Cast.toBytes32(toAccount),
            eventData
        );
    }

    // @dev emit a ClaimTermsSet event
    // @param eventEmitter the event emitter
    // @param distributionId the distribution id for the terms
    // @param termsHash the hash of the terms string
    function emitClaimTermsSet(EventEmitter eventEmitter, uint256 distributionId, bytes32 termsHash) internal {
        EventUtils.EventLogData memory eventData;

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "distributionId", distributionId);

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "termsHash", termsHash);

        eventEmitter.emitEventLog1("ClaimTermsSet", bytes32(distributionId), eventData);
    }

    // @dev emit a ClaimTermsRemoved event
    // @param eventEmitter the event emitter
    // @param distributionId the distribution id for the terms that were removed
    function emitClaimTermsRemoved(EventEmitter eventEmitter, uint256 distributionId) internal {
        EventUtils.EventLogData memory eventData;

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "distributionId", distributionId);

        eventEmitter.emitEventLog1("ClaimTermsRemoved", bytes32(distributionId), eventData);
    }
}
