// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ILayerZeroComposer } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroComposer.sol";
import { MessagingFee, OFTReceipt, SendParam, MessagingReceipt } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol";
import { OFTComposeMsgCodec } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/libs/OFTComposeMsgCodec.sol";

import { IStargate } from "@stargatefinance/stg-evm-v2/src/interfaces/IStargate.sol";

import "../event/EventEmitter.sol";
import "../data/DataStore.sol";
import "../utils/Cast.sol";
import "../gas/GasUtils.sol";
import "../deposit/DepositStoreUtils.sol";
import "../glv/GlvUtils.sol";

import "./IMultichainProvider.sol";
import "./IMultichainGmRouter.sol";
import "./IMultichainGlvRouter.sol";
import "./IMultichainOrderRouter.sol";

import "./MultichainVault.sol";
import "./MultichainUtils.sol";


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
        uint32 dstEid;
        uint256 valueToSend;
        MessagingReceipt msgReceipt;
        SendParam sendParam;
        MessagingFee messagingFee;
        OFTReceipt receipt;
    }

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;
    MultichainVault public immutable multichainVault;
    IMultichainGmRouter public immutable multichainGmRouter;
    IMultichainGlvRouter public immutable multichainGlvRouter;
    IMultichainOrderRouter public immutable multichainOrderRouter;

    constructor(
        DataStore _dataStore,
        RoleStore _roleStore,
        EventEmitter _eventEmitter,
        MultichainVault _multichainVault,
        IMultichainGmRouter _multichainGmRouter,
        IMultichainGlvRouter _multichainGlvRouter,
        IMultichainOrderRouter _multichainOrderRouter
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        multichainVault = _multichainVault;
        multichainGmRouter = _multichainGmRouter;
        multichainGlvRouter = _multichainGlvRouter;
        multichainOrderRouter = _multichainOrderRouter;
    }

    /**
     * @notice Called by Stargate after tokens have been delivered to this contract.
     * @dev Handles the receipt of bridged tokens and optionally executes a deposit action.
     *
     * @dev If a user bridges tokens with deposit data, and already has sufficient funds in their multichain balance,
     * it is possible for multiple bridge transactions to result in multiple deposits (i.e. double mints).
     * For example, if a user bridges 10 WETH and 20,000 USDC, both with deposit data, and already has enough funds,
     * both bridge transactions could result in a deposit.
     *
     * @dev It is recommended that the interface or frontend enforces that users only bridge amounts that would not
     * result in double deposits.
     *
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

        /// @dev The `account` field is user-supplied and not validated; any address may be provided by the sender
        // msg.sender and `from` need to be validated for `amountLD` and `token` to not be spoofable
        // additionally, the lzReceive, _credit and _debit functions of the OFT should be checked for any overrides
        // before the `amountLD` and `token` values can be trusted
        (address account, uint256 srcChainId, uint256 amountLD, bytes memory data) = _decodeLzComposeMsg(message);

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
            srcChainId
        );

        // Handle native token top-up before other actions to ensure the user has the ability to
        // pay relay and execution fees required by subsequent actions (Deposit, Withdrawal, etc.)
        uint256 expectedNativeValue = 0;
        if (data.length != 0) {
            (, uint256 decodedExpectedNativeValue, ) = abi.decode(data, (ActionType, uint256, bytes));
            expectedNativeValue = decodedExpectedNativeValue;
        }
        if (expectedNativeValue != 0 || msg.value != 0) {
            _handleNativeTopUp(account, srcChainId, expectedNativeValue);
        }


        // note that for these functions, the remaining gas must be sufficient
        // otherwise the function will revert
        // if the action cannot be completed due to gas issues, the user would
        // need to manually call the function with the right amount of gas
        // srcChainId could be zero when returned from _decodeLzComposeMsg, skip follow up actions in this case
        if (srcChainId != 0 && data.length != 0) {
            (ActionType actionType, , bytes memory actionData) = abi.decode(data, (ActionType, uint256, bytes));

            // this event is emitted even though the actionType may not be valid
            MultichainEventUtils.emitMultichainBridgeAction(eventEmitter, address(this), account, srcChainId, uint256(actionType));

            /// @dev relayParams.fee.feeToken must default to WNT when feeSwapPath is not being used
            /// otherwise reverts with UnexpectedRelayFeeToken
            if (actionType == ActionType.Deposit) {
                _handleDeposit(account, srcChainId, actionType, actionData);
            } else if (actionType == ActionType.GlvDeposit) {
                _handleGlvDeposit(account, srcChainId, actionType, actionData);
            } else if (actionType == ActionType.SetTraderReferralCode) {
                _handleSetTraderReferralCode(account, srcChainId, actionType, actionData);
            } else if (actionType == ActionType.RegisterCode) {
                _handleRegisterCode(account, srcChainId, actionType, actionData);
            } else if (actionType == ActionType.Withdrawal) {
                _handleWithdrawal(account, srcChainId, actionType, actionData);
            } else if (actionType == ActionType.GlvWithdrawal) {
                _handleGlvWithdrawal(account, srcChainId, actionType, actionData);
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
    function bridgeOut(address account, uint256 srcChainId, IRelayUtils.BridgeOutParams memory params) external onlyController returns (uint256) {
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
        cache.dstEid = abi.decode(params.data, (uint32));

        if (srcChainId != dataStore.getUint(Keys.eidToSrcChainId(cache.dstEid))) {
            revert Errors.InvalidEid(cache.dstEid);
        }

        (cache.valueToSend, cache.sendParam, cache.messagingFee, cache.receipt) = prepareSend(
            stargate,
            params.amount,
            params.minAmountOut,
            account,
            cache.dstEid
        );

        // LZ/Stargate would round down the `amount` to 6 decimals precision / apply path limits
        params.amount = cache.receipt.amountSentLD;

        // transferOut bridging fee amount of wnt from user's multichain balance into this contract
        // for StargatePoolNative, amountSentLD is added on top of the bridging fee
        MultichainUtils.transferOut(
            dataStore,
            eventEmitter,
            multichainVault,
            wnt, // token
            account,
            address(this), // receiver
            cache.valueToSend, // bridge out fee (+ amountSentLD for native token transfers)
            srcChainId
        );

        IWNT(wnt).withdraw(cache.valueToSend);

        // if Stagrate.token() is the ZeroAddress:
        //   - amountSentLD was already added to valueToSend and transferred/unwrapped with the bridging fee
        //   - approval is not needed (since native tokens are being bridged)
        if (stargate.token() != address(0x0)) {
            // `stargate` is e.g. StargatePoolUSDC
            // transferOut amount of tokens from user's multichain balance into this contract
            MultichainUtils.transferOut(
                dataStore,
                eventEmitter,
                multichainVault,
                params.token,
                account,
                address(this), // receiver
                params.amount,
                srcChainId
            );

            IERC20(params.token).approve(params.provider, params.amount);
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
                account,
                0 // srcChainId
            );
        }

        return params.amount;
    }

    function prepareSend(
        IStargate stargate,
        uint256 amount,
        uint256 minAmountOut,
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
            minAmountLD: minAmountOut,
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

    function _decodeLzComposeMsg(bytes calldata message) private view returns (address, uint256, uint256, bytes memory) {
        uint256 amountLD = OFTComposeMsgCodec.amountLD(message);

        uint32 srcEid = OFTComposeMsgCodec.srcEid(message);
        uint256 srcChainId = dataStore.getUint(Keys.eidToSrcChainId(srcEid));

        bytes memory composeMessage = OFTComposeMsgCodec.composeMsg(message);
        (address account, bytes memory data) = abi.decode(composeMessage, (address, bytes));

        return (account, srcChainId, amountLD, data);
    }

    function _areValidTransferRequests(IRelayUtils.TransferRequests memory transferRequests) private pure returns (bool) {
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

    function _handleNativeTopUp(
        address account,
        uint256 srcChainId,
        uint256 expectedNativeValue
    ) private {
        // Enforce msg.value matches expected native top-up amount
        // Note: This may cause bridged tokens to be locked if executor underpays,
        // but other executors or users can retry lzCompose with correct msg.value
        if (msg.value < expectedNativeValue) {
            revert Errors.InsufficientNativeTokenAmount(msg.value, expectedNativeValue);
        }

        // Allow receiving native tokens alongside bridged tokens to cover execution fees
        // msg.value represents ONLY the top-up amount specified in lzComposeOption (not the bridged tokens)
        // Bridged tokens are already transferred to this contract separately via Stargate's flow
        TokenUtils.depositAndSendWrappedNativeToken(dataStore, address(multichainVault), msg.value);
        MultichainUtils.recordBridgeIn(
            dataStore,
            eventEmitter,
            multichainVault,
            this,
            TokenUtils.wnt(dataStore),
            account,
            srcChainId
        );
    }

    /// @dev long/short tokens are deposited from user's multichain balance
    /// GM tokens are minted and transferred to user's multichain balance
    function _handleDeposit(
        address account,
        uint256 srcChainId,
        ActionType actionType,
        bytes memory actionData
    ) private {
        (
            IRelayUtils.RelayParams memory relayParams,
            IRelayUtils.TransferRequests memory transferRequests,
            IDepositUtils.CreateDepositParams memory depositParams
        ) = abi.decode(actionData, (IRelayUtils.RelayParams, IRelayUtils.TransferRequests, IDepositUtils.CreateDepositParams));

        if (_areValidTransferRequests(transferRequests)) {
            uint256 estimatedGasLimit = GasUtils.estimateCreateDepositGasLimit(dataStore);
            _validateGasLeft(estimatedGasLimit);

            try multichainGmRouter.createDeposit(
                relayParams,
                account,
                srcChainId,
                transferRequests,
                depositParams
            ) {
            } catch Error(string memory reason) {
                MultichainEventUtils.emitMultichainBridgeActionFailed(eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
            } catch (bytes memory reasonBytes) {
                (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
                MultichainEventUtils.emitMultichainBridgeActionFailed(eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
            }
        }
    }

    /// @dev long/short/GM tokens are deposited from user's multichain balance
    /// GLV tokens are minted and transferred to user's multichain balance
    function _handleGlvDeposit(
        address account,
        uint256 srcChainId,
        ActionType actionType,
        bytes memory actionData
    ) private {
        (
            IRelayUtils.RelayParams memory relayParams,
            IRelayUtils.TransferRequests memory transferRequests,
            IGlvDepositUtils.CreateGlvDepositParams memory glvDepositParams
        ) = abi.decode(actionData, (IRelayUtils.RelayParams, IRelayUtils.TransferRequests, IGlvDepositUtils.CreateGlvDepositParams));

        if (_areValidTransferRequests(transferRequests)) {
            uint256 estimatedGasLimit = GasUtils.estimateCreateGlvDepositGasLimit(dataStore);
            _validateGasLeft(estimatedGasLimit);

            try multichainGlvRouter.createGlvDeposit(
                relayParams,
                account,
                srcChainId,
                transferRequests,
                glvDepositParams
            ) {
            } catch Error(string memory reason) {
                MultichainEventUtils.emitMultichainBridgeActionFailed(eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
            } catch (bytes memory reasonBytes) {
                (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
                MultichainEventUtils.emitMultichainBridgeActionFailed(eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
            }
        }
    }

    /// @dev `account` is expected to be `msg.sender` from the source chain, as
    /// MultichainOrderRouter would use it to validate the signature.
    function _handleSetTraderReferralCode(
        address account,
        uint256 srcChainId,
        ActionType actionType,
        bytes memory actionData
    ) private {
        (
            IRelayUtils.RelayParams memory relayParams,
            bytes32 referralCode
        ) = abi.decode(actionData, (IRelayUtils.RelayParams, bytes32));

        uint256 estimatedGasLimit = GasUtils.estimateSetTraderReferralCodeGasLimit(dataStore);
        _validateGasLeft(estimatedGasLimit);

        try multichainOrderRouter.setTraderReferralCode(relayParams, account, srcChainId, referralCode) {
        } catch Error(string memory reason) {
            MultichainEventUtils.emitMultichainBridgeActionFailed(eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        } catch (bytes memory reasonBytes) {
            (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
            MultichainEventUtils.emitMultichainBridgeActionFailed(eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        }
    }

    /// @dev `account` is expected to be `msg.sender` from the source chain, as
    /// MultichainOrderRouter would use it to validate the signature.
    function _handleRegisterCode(
        address account,
        uint256 srcChainId,
        ActionType actionType,
        bytes memory actionData
    ) private {
        (
            IRelayUtils.RelayParams memory relayParams,
            bytes32 referralCode
        ) = abi.decode(actionData, (IRelayUtils.RelayParams, bytes32));

        uint256 estimatedGasLimit = GasUtils.estimateRegisterCodeGasLimit(dataStore);
        _validateGasLeft(estimatedGasLimit);

        try multichainOrderRouter.registerCode(relayParams, account, srcChainId, referralCode) {
        } catch Error(string memory reason) {
            MultichainEventUtils.emitMultichainBridgeActionFailed(eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        } catch (bytes memory reasonBytes) {
            (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
            MultichainEventUtils.emitMultichainBridgeActionFailed(eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
        }
    }

    function _handleWithdrawal(
        address account,
        uint256 srcChainId,
        ActionType actionType,
        bytes memory actionData
    ) private {
        (
            IRelayUtils.RelayParams memory relayParams,
            IRelayUtils.TransferRequests memory transferRequests,
            IWithdrawalUtils.CreateWithdrawalParams memory withdrawalParams
        ) = abi.decode(actionData, (IRelayUtils.RelayParams, IRelayUtils.TransferRequests, IWithdrawalUtils.CreateWithdrawalParams));

        if (_areValidTransferRequests(transferRequests)) {
            uint256 estimatedGasLimit = GasUtils.estimateCreateWithdrawalGasLimit(dataStore);
            _validateGasLeft(estimatedGasLimit);

            try multichainGmRouter.createWithdrawal(
                relayParams,
                account,
                srcChainId,
                transferRequests,
                withdrawalParams
            ) {
            } catch Error(string memory reason) {
                MultichainEventUtils.emitMultichainBridgeActionFailed(eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
            } catch (bytes memory reasonBytes) {
                (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
                MultichainEventUtils.emitMultichainBridgeActionFailed(eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
            }
        }
    }

    function _handleGlvWithdrawal(
        address account,
        uint256 srcChainId,
        ActionType actionType,
        bytes memory actionData
    ) private {
        (
            IRelayUtils.RelayParams memory relayParams,
            IRelayUtils.TransferRequests memory transferRequests,
            IGlvWithdrawalUtils.CreateGlvWithdrawalParams memory glvWithdrawalParams
        ) = abi.decode(actionData, (IRelayUtils.RelayParams, IRelayUtils.TransferRequests, IGlvWithdrawalUtils.CreateGlvWithdrawalParams));

        if (_areValidTransferRequests(transferRequests)) {
            uint256 estimatedGasLimit = GasUtils.estimateCreateGlvWithdrawalGasLimit(dataStore);
            _validateGasLeft(estimatedGasLimit);

            try multichainGlvRouter.createGlvWithdrawal(
                relayParams,
                account,
                srcChainId,
                transferRequests,
                glvWithdrawalParams
            ) {
            } catch Error(string memory reason) {
                MultichainEventUtils.emitMultichainBridgeActionFailed(eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
            } catch (bytes memory reasonBytes) {
                (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);
                MultichainEventUtils.emitMultichainBridgeActionFailed(eventEmitter, address(this), account, srcChainId, uint256(actionType), reason);
            }
        }
    }

    function _validateGasLeft(uint256 estimatedGasLimit) internal view {
        uint256 gas = gasleft();
        if (gas < estimatedGasLimit) {
            revert Errors.InsufficientGasLeft(gas, estimatedGasLimit);
        }
    }

    /**
     * @notice Withdraws tokens which have been locked in this contract due to potential errors in lzCompose (e.g. incorrect message format).
     * @dev Callable through the timelock contract.
     * @param token The address of the token to withdraw.
     * @param receiver The address receiving the withdrawn tokens.
     * @param amount The amount of tokens to withdraw.
     */
    function withdrawTokens(address token, address receiver, uint256 amount) external onlyController {
        if (amount == 0) {
            revert Errors.EmptyWithdrawalAmount();
        }

        if (token == address(0)) {
            TokenUtils.sendNativeToken(dataStore, receiver, amount);
        } else {
            TokenUtils.transfer(dataStore, token, receiver, amount);
        }
    }

    /// @dev Accept ETH from StargatePoolNative and when unwrapping WNT
    receive() external payable {}
}
