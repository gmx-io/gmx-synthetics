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
    struct BridgeOutFromControllerParams {
        address account;
        address receiver;
        uint256 srcChainId;
        address token;
        uint256 amount;
        address secondaryToken;
        uint256 secondaryAmount;
        bytes32[] dataList;
    }

    struct _BridgeOutParams {
        IMultichainProvider.ActionType actionType;
        address account;
        address token;
        uint256 srcChainId;
        uint256 desChainId;
        uint256 amount;
        uint256 minAmountOut;
        uint256 deadline;
        address provider;
        bytes providerData;
    }

    struct BridgeOutActionData {
        uint256 desChainId;
        uint256 deadline;
        address provider;
        bytes providerData;
        uint256 minAmountOut;
        address secondaryProvider;
        bytes secondaryProviderData;
        uint256 secondaryMinAmountOut;
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
        _BridgeOutParams memory _bridgeOutParams;
        bytes memory actionData;
        (_bridgeOutParams.actionType, actionData) = abi.decode(
            data,
            (IMultichainProvider.ActionType, bytes)
        );

        if (_bridgeOutParams.actionType == IMultichainProvider.ActionType.BridgeOut) {
            (_bridgeOutParams.desChainId, _bridgeOutParams.deadline, _bridgeOutParams.provider, _bridgeOutParams.providerData, _bridgeOutParams.minAmountOut) = abi.decode(
                actionData,
                (uint256, uint256, address, bytes, uint256)
            );

            _bridgeOutParams.account = account;
            _bridgeOutParams.srcChainId = srcChainId;
            _bridgeOutParams.token = token;
            _bridgeOutParams.amount = amount;

            _bridgeOut(
                eventEmitter,
                multichainTransferRouter,
                _bridgeOutParams
            );
        }
    }

    function bridgeOutFromController(
        EventEmitter eventEmitter,
        IMultichainTransferRouter multichainTransferRouter,
        BridgeOutFromControllerParams memory params
    ) external {
        if (!_shouldProcessBridgeOut(
            params.account,
            params.receiver,
            params.amount + params.secondaryAmount,
            params.srcChainId,
            params.dataList
        )) {
            return;
        }

        bytes memory data = Array.dataArrayToBytes(params.dataList);
        _BridgeOutParams memory _bridgeOutParams;

        bytes memory actionData;
        (_bridgeOutParams.actionType, actionData) = abi.decode(
            data,
            (IMultichainProvider.ActionType, bytes)
        );

        if (_bridgeOutParams.actionType == IMultichainProvider.ActionType.BridgeOut) {
            if (params.token == params.secondaryToken || params.secondaryToken == address(0)) {
                // providerData is to contain information such as dstEid
                (
                    _bridgeOutParams.desChainId,
                    _bridgeOutParams.deadline,
                    _bridgeOutParams.provider,
                    _bridgeOutParams.providerData,
                    _bridgeOutParams.minAmountOut
                ) = abi.decode(
                    actionData,
                    (uint256, uint256, address, bytes, uint256)
                );

                _bridgeOutParams.account = params.account;
                _bridgeOutParams.srcChainId = params.srcChainId;
                _bridgeOutParams.token = params.token;
                _bridgeOutParams.amount = params.amount + params.secondaryAmount;

                _bridgeOut(
                    eventEmitter,
                    multichainTransferRouter,
                    _bridgeOutParams
                );
            } else {
                BridgeOutActionData memory decodedActionData = abi.decode(actionData, (BridgeOutActionData));

                _bridgeOut(
                    eventEmitter,
                    multichainTransferRouter,
                    _BridgeOutParams({
                        actionType: _bridgeOutParams.actionType,
                        account: params.account,
                        token: params.token,
                        srcChainId: params.srcChainId,
                        desChainId: decodedActionData.desChainId,
                        amount: params.amount,
                        minAmountOut: decodedActionData.minAmountOut,
                        deadline: decodedActionData.deadline,
                        provider: decodedActionData.provider,
                        providerData: decodedActionData.providerData
                    })
                );

                _bridgeOut(
                    eventEmitter,
                    multichainTransferRouter,
                    _BridgeOutParams({
                        actionType: _bridgeOutParams.actionType,
                        account: params.account,
                        token: params.secondaryToken,
                        srcChainId: params.srcChainId,
                        desChainId: decodedActionData.desChainId,
                        amount: params.secondaryAmount,
                        minAmountOut: decodedActionData.secondaryMinAmountOut,
                        deadline: decodedActionData.deadline,
                        provider: decodedActionData.secondaryProvider,
                        providerData: decodedActionData.secondaryProviderData
                    })
                );
            }
        }
    }

    function _bridgeOut(
        EventEmitter eventEmitter,
        IMultichainTransferRouter multichainTransferRouter,
        _BridgeOutParams memory params
    ) internal {
        if (params.amount == 0) {
            return;
        }

        IRelayUtils.BridgeOutParams memory bridgeOutParams = IRelayUtils.BridgeOutParams({
            token: params.token,
            amount: params.amount,
            minAmountOut: params.minAmountOut,
            provider: params.provider,
            data: params.providerData
        });

        try multichainTransferRouter.bridgeOutFromController(params.account, params.srcChainId, params.desChainId, params.deadline, bridgeOutParams) {
            MultichainEventUtils.emitMultichainBridgeAction(eventEmitter, address(this), params.account, params.srcChainId, uint256(params.actionType));
        } catch Error(string memory reason) {
            MultichainEventUtils.emitMultichainBridgeActionFailed(eventEmitter, address(this), params.account, params.srcChainId, uint256(params.actionType), reason);
        } catch (bytes memory reasonBytes) {
            (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
            MultichainEventUtils.emitMultichainBridgeActionFailed(eventEmitter, address(this), params.account, params.srcChainId, uint256(params.actionType), reason);
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
