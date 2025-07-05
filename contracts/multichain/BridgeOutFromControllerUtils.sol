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
        IMultichainProvider.ActionType actionType;
        bytes actionData;
        uint256 desChainId;
        uint256 deadline;
        address provider;
        bytes providerData;
        address secondaryProvider;
        bytes secondaryProviderData;
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
        if (!_shouldProcessBridgeOut(
            account,
            receiver,
            amount,
            srcChainId,
            dataList
        )) {
            return;
        }

        bytes memory data = Array.dataArrayToBytes(dataList);
        BridgeOutFromControllerCache memory cache;
        bytes memory actionData;
        (cache.actionType, actionData) = abi.decode(
            data,
            (IMultichainProvider.ActionType, bytes)
        );

        if (cache.actionType == IMultichainProvider.ActionType.BridgeOut) {
            (cache.desChainId, cache.deadline, cache.provider, cache.providerData /* e.g. dstEid */) = abi.decode(
                actionData,
                (uint256, uint256, address, bytes)
            );

            _bridgeOut(
                eventEmitter,
                multichainTransferRouter,
                cache,
                account,
                srcChainId,
                token,
                amount
            );
        }
    }

    function bridgeOutFromController(
        EventEmitter eventEmitter,
        IMultichainTransferRouter multichainTransferRouter,
        address account,
        address receiver,
        uint256 srcChainId,
        address token,
        uint256 amount,
        address secondaryToken,
        uint256 secondaryAmount,
        bytes32[] memory dataList
    ) external {
        if (!_shouldProcessBridgeOut(
            account,
            receiver,
            amount + secondaryAmount,
            srcChainId,
            dataList
        )) {
            return;
        }

        bytes memory data = Array.dataArrayToBytes(dataList);
        BridgeOutFromControllerCache memory cache;
        bytes memory actionData;
        (cache.actionType, actionData) = abi.decode(
            data,
            (IMultichainProvider.ActionType, bytes)
        );

        if (cache.actionType == IMultichainProvider.ActionType.BridgeOut) {
            if (token == secondaryToken || secondaryToken == address(0)) {
                // providerData is to contain information such as dstEid
                (cache.desChainId, cache.deadline, cache.provider, cache.providerData) = abi.decode(
                    actionData,
                    (uint256, uint256, address, bytes)
                );

                _bridgeOut(
                    eventEmitter,
                    multichainTransferRouter,
                    cache,
                    account,
                    srcChainId,
                    token,
                    amount + secondaryAmount
                );
            } else {
                (cache.desChainId, cache.deadline, cache.provider, cache.providerData, cache.secondaryProvider, cache.secondaryProviderData) = abi.decode(
                    actionData,
                    (uint256, uint256, address, bytes, address, bytes)
                );
                _bridgeOut(
                    eventEmitter,
                    multichainTransferRouter,
                    cache,
                    account,
                    srcChainId,
                    token,
                    amount
                );

                cache.provider = cache.secondaryProvider;
                cache.providerData = cache.secondaryProviderData;

                _bridgeOut(
                    eventEmitter,
                    multichainTransferRouter,
                    cache,
                    account,
                    srcChainId,
                    secondaryToken,
                    secondaryAmount
                );
            }
        }
    }

    function _bridgeOut(
        EventEmitter eventEmitter,
        IMultichainTransferRouter multichainTransferRouter,
        BridgeOutFromControllerCache memory cache,
        address account,
        uint256 srcChainId,
        address token,
        uint256 amount
    ) internal {
        IRelayUtils.BridgeOutParams memory bridgeOutParams = IRelayUtils.BridgeOutParams({
            token: token,
            amount: amount,
            provider: cache.provider,
            data: cache.providerData
        });

        try multichainTransferRouter.bridgeOutFromController(account, srcChainId, cache.desChainId, cache.deadline, bridgeOutParams) {
            MultichainEventUtils.emitMultichainBridgeAction(eventEmitter, address(this), account, srcChainId, uint256(cache.actionType));
        } catch Error(string memory reason) {
            MultichainEventUtils.emitMultichainBridgeActionFailed(eventEmitter, address(this), account, srcChainId, uint256(cache.actionType), reason);
        } catch (bytes memory reasonBytes) {
            (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
            MultichainEventUtils.emitMultichainBridgeActionFailed(eventEmitter, address(this), account, srcChainId, uint256(cache.actionType), reason);
        }
    }

    function _shouldProcessBridgeOut(
        address account,
        address receiver,
        uint256 amount,
        uint256 srcChainId,
        bytes32[] memory dataList
    ) internal pure returns (bool) {
        if (account != receiver) {
            // bridging out from a recipient address is not allowed (GM / GLV tokens are minted directly to the recipient)
            // ensuring the bridging fee is paid by the account, otherwise an attacker could consume
            // any account's wnt balance as bridging fee by donating a minimal amount of gm or glv
            return false;
        }
        if (amount == 0) {
            return false;
        }
        if (srcChainId == 0) {
            return false;
        }
        if (dataList.length == 0 || dataList[0] != Keys.GMX_DATA_ACTION) {
            return false;
        }

        return true;
    }
}
