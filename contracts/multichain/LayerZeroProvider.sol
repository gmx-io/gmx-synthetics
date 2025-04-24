// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ILayerZeroComposer } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroComposer.sol";
import { MessagingFee, OFTReceipt, SendParam, MessagingReceipt } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol";
import { OFTComposeMsgCodec } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/libs/OFTComposeMsgCodec.sol";

import { IStargate } from "@stargatefinance/stg-evm-v2/src/interfaces/IStargate.sol";

import "../event/EventEmitter.sol";
import "../data/DataStore.sol";
import "../deposit/DepositUtils.sol";
import "../utils/Cast.sol";

import "./MultichainGmRouter.sol";
import "./MultichainGlvRouter.sol";


/**
 * @title LayerZeroProvider
 * Bridging In is done throught lzCompose (receives tokens + encoded message from a source chain)
 * Bridging Out is done through bridgeOut (sends tokens to a source chain)
 * Defines lzCompose function which:
 *  - is called by the Stargate executor after tokens are delivered to this contract
 *  - forwards the received tokens to MultichainVault and increases user's multichain balance
 * Defines bridgeOut function which:
 * - sends tokens to the Stargate executor for bridging out to the source chain
 */
contract LayerZeroProvider is IMultichainProvider, ILayerZeroComposer, RoleModule {
    struct BridgeOutCache {
        uint256 valueToSend;
        MessagingReceipt msgReceipt;
        SendParam sendParam;
        MessagingFee messagingFee;
        OFTReceipt receipt;
    }

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;
    MultichainVault public immutable multichainVault;
    MultichainGmRouter public immutable multichainGmRouter;
    MultichainGlvRouter public immutable multichainGlvRouter;

    constructor(
        DataStore _dataStore,
        RoleStore _roleStore,
        EventEmitter _eventEmitter,
        MultichainVault _multichainVault,
        MultichainGmRouter _multichainGmRouter,
        MultichainGlvRouter _multichainGlvRouter
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        multichainVault = _multichainVault;
        multichainGmRouter = _multichainGmRouter;
        multichainGlvRouter = _multichainGlvRouter;
    }

    /**
     * Called by Stargate after tokens have been delivered to this contract.
     * @param from The address of the sender (i.e. Stargate address, not user's address).
     * param guid A global unique identifier for tracking the packet.
     * @param message Encoded message. Contains the params needed to record the deposit (account, srcChainId)
     * param executor The address of the Executor.
     * param extraData Any extra data or options to trigger on receipt.
     */
    function lzCompose(
        address from,
        bytes32 /*guid*/,
        bytes calldata message,
        address /*executor*/,
        bytes calldata /*extraData*/
    ) external payable {
        MultichainUtils.validateMultichainProvider(dataStore, from);
        MultichainUtils.validateMultichainEndpoint(dataStore, msg.sender);

        uint256 amountLD = OFTComposeMsgCodec.amountLD(message);

        bytes memory composeMessage = OFTComposeMsgCodec.composeMsg(message);
        (address account, uint256 srcChainId, bytes memory data) = _decodeLzComposeMsg(composeMessage);

        address token = IStargate(from).token();
        if (token == address(0x0)) {
            // `from` is StargatePoolNative
            TokenUtils.depositAndSendWrappedNativeToken(dataStore, address(multichainVault), amountLD);

            // if token is ETH then we need to use WNT
            token = TokenUtils.wnt(dataStore);
        } else {
            // `from` is e.g. StargatePoolUSDC
            TokenUtils.transfer(dataStore, token, address(multichainVault), amountLD);
        }
        MultichainUtils.recordBridgeIn(
            dataStore,
            eventEmitter,
            multichainVault,
            this,
            token,
            account,
            amountLD,
            srcChainId
        );

        if (data.length != 0) {
            (ActionType actionType, bytes memory actionData) = _decodeLzComposeMsgData(data);
            if (actionType == ActionType.Deposit) {
                _handleDepositFromBridge(from, account, srcChainId, actionType, actionData);
            } else if (actionType == ActionType.GlvDeposit) {
                _handleGlvDepositFromBridge(from, account, srcChainId, actionType, actionData);
            } else {
                // TODO: confirm None case + else revert
            }
        }
    }

    /**
     * Bridges tokens from the current chain to a source chain using Stargate protocol
     * @dev Processes a cross-chain transfer of tokens from user's multichain balance
     * @dev Called by MultichainTransferRouter
     * This function:
     * 1. Approves tokens to be spent by Stargate
     * 2. Prepares the necessary parameters and quotes fees
     * 3. Transfers the bridging fee (in WNT) from user's multichain balance
     * 4. Unwraps WNT to ETH to pay for the cross-chain fee
     * 5. Transfers the tokens to be bridged from user's multichain balance
     * 6. Calls Stargate to initiate the cross-chain transfer
     *
     * @param params A struct containing:
     *        - provider: Address of the Stargate pool
     *        - account: User account bridging tokens
     *        - token: Address of token being bridged
     *        - amount: Amount of tokens to bridge
     *        - srcChainId: Source chain ID (for multichain balance accounting)
     *        - data: ABI-encoded destination endpoint ID (dstEid)
     * @return The amount of tokens bridged out (may be slightly different from params.amount after LZ precision/path limits adjustments)
     */
    function bridgeOut(IMultichainProvider.BridgeOutParams memory params) external onlyController returns (uint256) {
        IStargate stargate = IStargate(params.provider);

        address wnt = dataStore.getAddress(Keys.WNT);

        if (stargate.token() == address(0x0)) {
            // `stargate` is StargatePoolNative
            if (params.token != wnt) {
                revert Errors.InvalidBridgeOutToken(params.token);
            }
        } else {
            // `stargate` is e.g. StargatePoolUSDC
            if (params.token != stargate.token()) {
                revert Errors.InvalidBridgeOutToken(params.token);
            }
        }

        BridgeOutCache memory cache;

        (cache.valueToSend, cache.sendParam, cache.messagingFee, cache.receipt) = prepareSend(
            stargate,
            params.amount,
            params.account,
            abi.decode(params.data, (uint32)) // dstEid
        );

        // LZ/Stargate would round down the `amount` to 6 decimals precision / apply path limits
        params.amount = cache.receipt.amountSentLD;

        IERC20(params.token).approve(params.provider, params.amount);

        // transferOut bridging fee amount of wnt from user's multichain balance into this contract
        MultichainUtils.transferOut(
            dataStore,
            eventEmitter,
            multichainVault,
            wnt, // token
            params.account,
            address(this), // receiver
            cache.valueToSend, // bridge out fee
            params.srcChainId
        );

        uint256 wntBalanceBefore = IERC20(wnt).balanceOf(address(this));
        // unwrap wnt to native token and send it into this contract (to pay the bridging fee)
        TokenUtils.withdrawAndSendNativeToken(
            dataStore,
            wnt,
            address(this), // receiver
            cache.valueToSend // amount
        );
        uint256 wntBalanceAfter = IERC20(wnt).balanceOf(address(this));

        // if the above native token transfer failed, it re-wraps the token and sends it to the receiver (i.e. this contract)
        // check if wnt was send to this contract due to un-wrapping and transfer it back to user's multichain balance
        if (wntBalanceAfter > wntBalanceBefore) {
            uint256 amount = wntBalanceAfter - wntBalanceBefore;
            TokenUtils.transfer(dataStore, wnt, address(multichainVault), amount);
            MultichainUtils.recordBridgeIn(
                dataStore,
                eventEmitter,
                multichainVault,
                this,
                wnt,
                params.account,
                amount,
                0 // srcChainId
            );
            return 0;
        }

        // if Stagrate.token() is the ZeroAddress, amountSentLD was already added to valueToSend and transferred/unwrapped with the bridging fee
        if (stargate.token() != address(0x0)) {
            // `stargate` is e.g. StargatePoolUSDC
            // transferOut amount of tokens from user's multichain balance into this contract
            MultichainUtils.transferOut(
                dataStore,
                eventEmitter,
                multichainVault,
                params.token,
                params.account,
                address(this), // receiver
                params.amount,
                params.srcChainId
            );
        }

        (cache.msgReceipt, /* OFTReceipt memory oftReceipt */) = stargate.send{ value: cache.valueToSend }(
            cache.sendParam,
            cache.messagingFee,
            address(this) // refundAddress
        );

        // fee refunds are send back to this contract, converted to wrapped native token,
        // sent to multichainVault and user's multichain balance is increased
        if (cache.msgReceipt.fee.nativeFee < cache.messagingFee.nativeFee) {
            TokenUtils.depositAndSendWrappedNativeToken(
                dataStore,
                address(multichainVault), // receiver
                cache.messagingFee.nativeFee - cache.msgReceipt.fee.nativeFee // refund amount
            );
            MultichainUtils.recordTransferIn(
                dataStore,
                eventEmitter,
                multichainVault,
                wnt, // token
                params.account,
                0 // srcChainId
            );
        }

        return params.amount;
    }

    function prepareSend(
        IStargate stargate,
        uint256 amount,
        address receiver,
        uint32 _dstEid
    )
        private
        view
        returns (
            uint256 valueToSend,
            SendParam memory sendParam,
            MessagingFee memory messagingFee,
            OFTReceipt memory receipt
        )
    {
        sendParam = SendParam({
            dstEid: _dstEid,
            to: Cast.toBytes32(receiver),
            amountLD: amount,
            minAmountLD: amount,
            extraOptions: bytes(""),
            composeMsg: bytes(""),
            oftCmd: ""
        });

        (, , receipt) = stargate.quoteOFT(sendParam);
        sendParam.minAmountLD = receipt.amountReceivedLD;

        messagingFee = stargate.quoteSend(sendParam, false);
        valueToSend = messagingFee.nativeFee;

        if (stargate.token() == address(0x0)) {
            valueToSend += receipt.amountSentLD;
        }
    }

    function _decodeLzComposeMsg(bytes memory message) private pure returns (address, uint256, bytes memory) {
        return abi.decode(message, (address, uint256, bytes));
    }

    function _decodeLzComposeMsgData(bytes memory data) private pure returns (ActionType, bytes memory) {
        return abi.decode(data, (ActionType, bytes));
    }

    function _areValidTransferRequests(TransferRequests memory transferRequests) private pure returns (bool) {
        if (
            transferRequests.tokens.length != transferRequests.receivers.length ||
            transferRequests.tokens.length != transferRequests.amounts.length
        ) {
            return false;
        }
        for (uint256 i = 0; i < transferRequests.tokens.length; i++) {
            if (
                transferRequests.tokens[i] == address(0) ||
                transferRequests.receivers[i] == address(0) ||
                transferRequests.amounts[i] == 0
            ) {
                return false;
            }
        }
        return true;
    }

    function _handleDepositFromBridge(
        address from,
        address account,
        uint256 srcChainId,
        ActionType actionType,
        bytes memory actionData
    ) private {
        (
            RelayParams memory relayParams,
            TransferRequests memory transferRequests,
            DepositUtils.CreateDepositParams memory depositParams
        ) = abi.decode(actionData, (RelayParams, TransferRequests, DepositUtils.CreateDepositParams));
        
        if (_areValidTransferRequests(transferRequests)) {
            try multichainGmRouter.createDepositFromBridge(
                relayParams,
                account,
                srcChainId,
                transferRequests,
                depositParams
            ) returns (bytes32 key) {
                MultichainEventUtils.emitDepositFromBridge(eventEmitter, from, account, srcChainId, actionType, key);
            } catch Error(string memory reason) {
                MultichainEventUtils.emitDepositFromBridgeFailed(eventEmitter, from, account, srcChainId, actionType, reason);
            } catch (bytes memory reasonBytes) {
                (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
                MultichainEventUtils.emitDepositFromBridgeFailed(eventEmitter, from, account, srcChainId, actionType, reason);
            }
        }
    }

    function _handleGlvDepositFromBridge(
        address from,
        address account,
        uint256 srcChainId,
        ActionType actionType,
        bytes memory actionData
    ) private {
        (
            RelayParams memory relayParams,
            TransferRequests memory transferRequests,
            GlvDepositUtils.CreateGlvDepositParams memory glvDepositParams
        ) = abi.decode(actionData, (RelayParams, TransferRequests, GlvDepositUtils.CreateGlvDepositParams));
        
        if (_areValidTransferRequests(transferRequests)) {
            try multichainGlvRouter.createGlvDepositFromBridge(
                relayParams,
                account,
                srcChainId,
                transferRequests,
                glvDepositParams
            ) returns (bytes32 key) {
                MultichainEventUtils.emitDepositFromBridge(eventEmitter, from, account, srcChainId, actionType, key);
            } catch Error(string memory reason) {
                MultichainEventUtils.emitDepositFromBridgeFailed(eventEmitter, from, account, srcChainId, actionType, reason);
            } catch (bytes memory reasonBytes) {
                (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
                MultichainEventUtils.emitDepositFromBridgeFailed(eventEmitter, from, account, srcChainId, actionType, reason);
            }
        }
    }

    /// @dev Accept ETH from StargatePoolNative and when unwrapping WNT
    receive() external payable {}
}
