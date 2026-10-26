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
        IRelayUtils.BridgeFeeParams bridgeFee;
    }

    struct BridgeOutActionData {
        uint256 desChainId;
        uint256 deadline;
        address provider;
        bytes providerData;
        uint256 minAmountOut;
        IRelayUtils.BridgeFeeParams bridgeFee;
        address secondaryProvider;
        bytes secondaryProviderData;
        uint256 secondaryMinAmountOut;
        IRelayUtils.BridgeFeeParams secondaryBridgeFee;
    }

    // @dev Returns the number of fee-swap hops encoded in a remote bridge action.
    // Output amounts are not known when a withdrawal is created, so every encoded
    // fee swap with a non-zero fee is included in the execution-fee estimate.
    function getBridgeFeeSwapCount(
        address account,
        address receiver,
        uint256 srcChainId,
        address token,
        address secondaryToken,
        bytes32[] memory dataList
    ) external view returns (uint256) {
        if (
            account != receiver ||
            srcChainId == 0 ||
            srcChainId == block.chainid ||
            dataList.length == 0 ||
            dataList[0] != Keys.GMX_DATA_ACTION
        ) {
            return 0;
        }

        bytes memory data = Array.dataArrayToBytes(dataList);
        (IMultichainProvider.ActionType actionType, bytes memory actionData) = abi.decode(
            data,
            (IMultichainProvider.ActionType, bytes)
        );

        if (actionType != IMultichainProvider.ActionType.BridgeOut) {
            return 0;
        }

        if (token == secondaryToken || secondaryToken == address(0)) {
            (
                ,
                ,
                ,
                ,
                ,
                IRelayUtils.BridgeFeeParams memory bridgeFee
            ) = abi.decode(
                actionData,
                (uint256, uint256, address, bytes, uint256, IRelayUtils.BridgeFeeParams)
            );

            return bridgeFee.feeAmount == 0 ? 0 : bridgeFee.feeSwapPath.length;
        }

        BridgeOutActionData memory decodedActionData = abi.decode(actionData, (BridgeOutActionData));
        uint256 bridgeFeeSwapCount;

        if (decodedActionData.bridgeFee.feeAmount != 0) {
            bridgeFeeSwapCount = decodedActionData.bridgeFee.feeSwapPath.length;
        }

        if (decodedActionData.secondaryBridgeFee.feeAmount != 0) {
            bridgeFeeSwapCount += decodedActionData.secondaryBridgeFee.feeSwapPath.length;
        }

        return bridgeFeeSwapCount;
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
    ) external returns (uint256) {
        if (!_shouldProcessBridgeOut(
            account,
            receiver,
            amount,
            srcChainId,
            dataList
        )) {
            return 0;
        }

        bytes memory data = Array.dataArrayToBytes(dataList);
        _BridgeOutParams memory _bridgeOutParams;
        bytes memory actionData;
        (_bridgeOutParams.actionType, actionData) = abi.decode(
            data,
            (IMultichainProvider.ActionType, bytes)
        );

        if (_bridgeOutParams.actionType == IMultichainProvider.ActionType.BridgeOut) {
            (_bridgeOutParams.desChainId, _bridgeOutParams.deadline, _bridgeOutParams.provider, _bridgeOutParams.providerData, _bridgeOutParams.minAmountOut, _bridgeOutParams.bridgeFee) = abi.decode(
                actionData,
                (uint256, uint256, address, bytes, uint256, IRelayUtils.BridgeFeeParams)
            );

            _bridgeOutParams.account = account;
            _bridgeOutParams.srcChainId = srcChainId;
            _bridgeOutParams.token = token;
            _bridgeOutParams.amount = amount;

            uint256 bridgeFeeSwapCount = _getBridgeFeeSwapCount(
                srcChainId,
                amount,
                _bridgeOutParams.bridgeFee
            );

            _bridgeOut(
                eventEmitter,
                multichainTransferRouter,
                _bridgeOutParams
            );

            return bridgeFeeSwapCount;
        }

        return 0;
    }

    function bridgeOutFromController(
        EventEmitter eventEmitter,
        IMultichainTransferRouter multichainTransferRouter,
        BridgeOutFromControllerParams memory params
    ) external returns (uint256) {
        if (!_shouldProcessBridgeOut(
            params.account,
            params.receiver,
            params.amount + params.secondaryAmount,
            params.srcChainId,
            params.dataList
        )) {
            return 0;
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
                    _bridgeOutParams.minAmountOut,
                    _bridgeOutParams.bridgeFee
                ) = abi.decode(
                    actionData,
                    (uint256, uint256, address, bytes, uint256, IRelayUtils.BridgeFeeParams)
                );

                _bridgeOutParams.account = params.account;
                _bridgeOutParams.srcChainId = params.srcChainId;
                _bridgeOutParams.token = params.token;
                _bridgeOutParams.amount = params.amount + params.secondaryAmount;

                uint256 bridgeFeeSwapCount = _getBridgeFeeSwapCount(
                    params.srcChainId,
                    _bridgeOutParams.amount,
                    _bridgeOutParams.bridgeFee
                );

                _bridgeOut(
                    eventEmitter,
                    multichainTransferRouter,
                    _bridgeOutParams
                );

                return bridgeFeeSwapCount;
            } else {
                BridgeOutActionData memory decodedActionData = abi.decode(actionData, (BridgeOutActionData));

                uint256 bridgeFeeSwapCount = _getBridgeFeeSwapCount(
                    params.srcChainId,
                    params.amount,
                    decodedActionData.bridgeFee
                );
                bridgeFeeSwapCount += _getBridgeFeeSwapCount(
                    params.srcChainId,
                    params.secondaryAmount,
                    decodedActionData.secondaryBridgeFee
                );

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
                        providerData: decodedActionData.providerData,
                        bridgeFee: decodedActionData.bridgeFee
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
                        providerData: decodedActionData.secondaryProviderData,
                        bridgeFee: decodedActionData.secondaryBridgeFee
                    })
                );

                return bridgeFeeSwapCount;
            }
        }

        return 0;
    }

    function _getBridgeFeeSwapCount(
        uint256 srcChainId,
        uint256 amount,
        IRelayUtils.BridgeFeeParams memory bridgeFee
    ) private view returns (uint256) {
        if (
            srcChainId == block.chainid ||
            amount == 0 ||
            bridgeFee.feeAmount == 0
        ) {
            return 0;
        }

        return bridgeFee.feeSwapPath.length;
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
            data: params.providerData,
            bridgeFee: params.bridgeFee
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
