// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/Keys.sol";
import "../event/EventEmitter.sol";
import "../error/ErrorUtils.sol";
import "../utils/Array.sol";

import "./IMultichainProvider.sol";
import "./IMultichainTransferRouter.sol";
import "./MultichainEventUtils.sol";

// @title BridgeOutFromControllerUtils
library BridgeOutFromControllerUtils {
    struct BridgeOutFromControllerCache {
        uint256 desChainId;
        uint256 deadline;
        address provider;
        bytes providerData;
        string reason;
    }

    /// @dev abi.decode can fail if dataList is not properly formed, which would cause the deposit to be cancelled
    /// @dev first item of dataList should be the GMX_DATA_ACTION hash if dataList is intended to be used for bridging out tokens
    // note that if account != receiver the transfer will just be skipped instead of throwing an error
    function bridgeOutFromController(
        EventEmitter eventEmitter,
        IMultichainTransferRouter multichainTransferRouter,
        address account,
        address receiver,
        uint256 srcChainId,
        address token,
        uint256 amount,
        bytes32[] memory dataList
    ) external {
        if (account != receiver) {
            // bridging out from a recipient address is not allowed (GM / GLV tokens are minted directly to the recipient)
            // ensuring the bridging fee is paid by the account, otherwise an attacker could consume
            // any account's wnt balance as bridging fee by donating a minimal amount of gm or glv
            return;
        }
        if (amount == 0) {
            return;
        }
        if (srcChainId == 0) {
            return;
        }
        if (dataList.length == 0 || dataList[0] != Keys.GMX_DATA_ACTION) {
            return;
        }

        bytes memory data = Array.dataArrayToBytes(dataList);

        (IMultichainProvider.ActionType actionType, bytes memory actionData) = abi.decode(
            data,
            (IMultichainProvider.ActionType, bytes)
        );

        if (actionType == IMultichainProvider.ActionType.BridgeOut) {
            BridgeOutFromControllerCache memory cache;

            (cache.desChainId, cache.deadline, cache.provider, cache.providerData /* e.g. dstEid */) = abi.decode(
                actionData,
                (uint256, uint256, address, bytes)
            );

            IRelayUtils.BridgeOutParams memory bridgeOutParams = IRelayUtils.BridgeOutParams({
                token: token,
                amount: amount,
                provider: cache.provider,
                data: cache.providerData
            });

            try multichainTransferRouter.bridgeOutFromController(account, srcChainId, cache.desChainId, cache.deadline, bridgeOutParams) {
                MultichainEventUtils.emitMultichainBridgeAction(eventEmitter, address(this), account, srcChainId, uint256(actionType));
            } catch Error(string memory reason) {
                MultichainEventUtils.emitMultichainBridgeActionFailed(eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
            } catch (bytes memory reasonBytes) {
                (cache.reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
                MultichainEventUtils.emitMultichainBridgeActionFailed(eventEmitter, address(this), account, srcChainId, uint256(actionType), cache.reason);
            }
        }
    }
}
