// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ILayerZeroComposer } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroComposer.sol";
import { IMessagingComposer } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessagingComposer.sol";
import { MessagingFee, OFTReceipt, SendParam, MessagingReceipt } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol";
import { OFTComposeMsgCodec } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/libs/OFTComposeMsgCodec.sol";

import { IStargate } from "@stargatefinance/stg-evm-v2/src/interfaces/IStargate.sol";

import "../event/EventEmitter.sol";
import "../data/DataStore.sol";
import "../utils/Cast.sol";
import "../gas/GasUtils.sol";
import "../deposit/DepositStoreUtils.sol";

import "./IMultichainProvider.sol";
import "./IMultichainGmRouter.sol";
import "./IMultichainGlvRouter.sol";
import "./IMultichainOrderRouter.sol";

import "./LayerZeroProviderUtils.sol";
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
    struct LzComposeCache {
        ActionType actionType;
        bytes actionData;
        bool isActionSuccessful;
    }

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
     * @dev A follow-up action that fails is recorded and can be retried with retryAction until its relay deadline.
     *
     * @dev A message refunded with refundCompose is consumed without recording any multichain balance, so the
     * endpoint can retire it.
     *
     * @param from The address of the sender (i.e. Stargate address, not user's address).
     * @param guid A global unique identifier for tracking the packet.
     * @param message Encoded message. Contains the params needed to record the deposit (account, srcChainId)
     * param executor The address of the Executor.
     * param extraData Any extra data or options to trigger on receipt.
     */
    function lzCompose(
        address from,
        bytes32 guid,
        bytes calldata message,
        address /*executor*/,
        bytes calldata /*extraData*/
    ) external payable {
        MultichainUtils.validateMultichainProvider(dataStore, from);
        MultichainUtils.validateMultichainEndpoint(dataStore, msg.sender);

        // the tokens of a refunded message were sent out already; consuming the message here
        // lets the endpoint retire it, a revert would keep it queued
        if (dataStore.getBool(Keys2.multichainRefundedComposeKey(guid, keccak256(message)))) {
            MultichainEventUtils.emitMultichainRefundedComposeDelivered(eventEmitter, address(this), from, guid);
            return;
        }

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
            LzComposeCache memory cache;
            (cache.actionType, , cache.actionData) = abi.decode(data, (ActionType, uint256, bytes));

            // this event is emitted even though the actionType may not be valid
            MultichainEventUtils.emitMultichainBridgeAction(eventEmitter, address(this), account, srcChainId, uint256(cache.actionType));

            /// @dev relayParams.fee.feeToken must default to WNT when feeSwapPath is not being used
            /// otherwise reverts with UnexpectedRelayFeeToken
            cache.isActionSuccessful = LayerZeroProviderUtils.dispatchAction(
                LayerZeroProviderUtils.DispatchContracts(
                    multichainGmRouter,
                    multichainGlvRouter,
                    multichainOrderRouter,
                    dataStore,
                    eventEmitter
                ),
                account,
                srcChainId,
                cache.actionType,
                cache.actionData
            );

            // the endpoint delivers a queued compose for whoever calls its lzCompose, at a time and in a
            // context of their choosing (e.g. while a router's reentrancy guard is held); the checks above
            // only prove the message is genuine, so a failed action is kept for retryAction instead of
            // being dropped with the compose message
            if (!cache.isActionSuccessful) {
                dataStore.setBool(Keys2.multichainFailedActionKey(guid, keccak256(message)), true);
            }
        }
    }

    /**
     * @notice Retries a follow-up action that failed in lzCompose, the bridged tokens were already credited
     * @dev Callable by anyone, reverts if the action fails again so that it stays retryable
     * @param guid The guid of the compose message
     * @param message The compose message as received in lzCompose
     */
    function retryAction(bytes32 guid, bytes calldata message) external {
        bytes32 key = Keys2.multichainFailedActionKey(guid, keccak256(message));
        if (!dataStore.getBool(key)) {
            revert Errors.MultichainFailedActionNotFound(guid);
        }
        dataStore.removeBool(key);

        (address account, uint256 srcChainId, , bytes memory data) = _decodeLzComposeMsg(message);
        (ActionType actionType, , bytes memory actionData) = abi.decode(data, (ActionType, uint256, bytes));

        bool isActionSuccessful = LayerZeroProviderUtils.dispatchAction(
            LayerZeroProviderUtils.DispatchContracts(
                multichainGmRouter,
                multichainGlvRouter,
                multichainOrderRouter,
                dataStore,
                eventEmitter
            ),
            account,
            srcChainId,
            actionType,
            actionData
        );
        if (!isActionSuccessful) {
            revert Errors.MultichainActionRetryFailed(guid);
        }
    }

    /**
     * @notice Refunds the tokens Stargate delivered for a compose message that is still queued on the endpoint,
     * e.g. because lzCompose keeps reverting for it. The message is marked as refunded before the tokens
     * leave, so a later delivery of it credits nothing.
     * @dev Callable through the timelock contract. The provider holds the pending deliveries of a token in one
     * balance, so tokens may only leave it against the message they were delivered for.
     * @dev After the refund, deliver the message once with zero value to retire it on the endpoint; value sent
     * with that delivery stays in this contract.
     * @param endpoint The endpoint holding the compose queue.
     * @param from The Stargate pool that delivered the tokens and queued the message.
     * @param guid The guid of the compose message.
     * @param message The compose message as queued on the endpoint.
     * @param receiver The address receiving the refunded tokens.
     */
    function refundCompose(
        address endpoint,
        address from,
        bytes32 guid,
        bytes calldata message,
        address receiver
    ) external onlyController {
        MultichainUtils.validateMultichainProvider(dataStore, from);
        MultichainUtils.validateMultichainEndpoint(dataStore, endpoint);

        // the endpoint stores the hash of a queued message and overwrites it with a marker once the
        // message is delivered; Stargate queues one compose per guid, at index 0
        bytes32 messageHash = keccak256(message);
        if (IMessagingComposer(endpoint).composeQueue(from, address(this), guid, 0) != messageHash) {
            revert Errors.MultichainComposeNotFound(guid);
        }

        bytes32 refundedKey = Keys2.multichainRefundedComposeKey(guid, messageHash);
        if (dataStore.getBool(refundedKey)) {
            revert Errors.MultichainComposeAlreadyRefunded(guid);
        }
        dataStore.setBool(refundedKey, true);

        uint256 amountLD = OFTComposeMsgCodec.amountLD(message);
        address token = IStargate(from).token();

        if (token == address(0x0)) {
            // `from` is StargatePoolNative
            TokenUtils.sendNativeToken(dataStore, receiver, amountLD);
        } else {
            TokenUtils.transfer(dataStore, token, receiver, amountLD);
        }

        MultichainEventUtils.emitMultichainComposeRefunded(eventEmitter, address(this), from, token, receiver, guid, amountLD);
    }

    function quoteBridgeOutFee(address account, IRelayUtils.BridgeOutParams memory params) external view returns (uint256) {
        IStargate stargate = IStargate(params.provider);
        _validateBridgeOutToken(stargate, params.token);

        uint32 dstEid = abi.decode(params.data, (uint32));
        (, , MessagingFee memory messagingFee, ) = prepareSend(
            stargate,
            params.amount,
            params.minAmountOut,
            account,
            dstEid
        );

        return messagingFee.nativeFee;
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

        _validateBridgeOutToken(stargate, params.token);

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

    function _validateBridgeOutToken(IStargate stargate, address token) private view {
        address wnt = dataStore.getAddress(Keys.WNT);

        if (stargate.token() == address(0x0)) {
            // `stargate` is StargatePoolNative
            if (token != wnt) {
                revert Errors.InvalidBridgeOutToken(token);
            }
        } else {
            // `stargate` is e.g. StargatePoolUSDC
            if (token != stargate.token()) {
                revert Errors.InvalidBridgeOutToken(token);
            }
        }
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

        if (receipt.amountReceivedLD < minAmountOut) {
            revert Errors.InsufficientBridgeOutputAmount(receipt.amountReceivedLD, minAmountOut);
        }

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

    /**
     * @notice Withdraws tokens which have been locked in this contract due to potential errors in lzCompose (e.g. incorrect message format).
     * @dev Callable through the timelock contract.
     * @dev Recovery order: a stuck compose message is delivered again first, anyone can supply the missing
     * native value or gas. A message that can never execute is refunded with refundCompose, the default
     * recovery. This function is the last measure, only for funds that no queued compose message accounts for.
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
