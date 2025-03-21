// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ILayerZeroComposer } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroComposer.sol";
import { MessagingFee, OFTReceipt, SendParam, MessagingReceipt } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol";
import { OFTComposeMsgCodec } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/libs/OFTComposeMsgCodec.sol";

import { IStargate } from "@stargatefinance/stg-evm-v2/src/interfaces/IStargate.sol";

import "../event/EventEmitter.sol";
import "../data/DataStore.sol";

import "./MultichainVault.sol";
import "./MultichainUtils.sol";
import "./IMultichainProvider.sol";
import "./MultichainProviderUtils.sol";

/**
 * @title LayerZeroProvider
 * Receives tokens + encoded message from a source chain and bridges tokens back to a source chain.
 * Defines lzCompose function which:
 *  - is called by the Stargate executor after tokens are delivered to this contract
 *  - forwards the received tokens to MultichainVault and increases user's multichain balance
 * Defines bridgeOut function which:
 * - sends tokens to the Stargate executor for bridging out to the source chain
 */
contract LayerZeroProvider is IMultichainProvider, ILayerZeroComposer, RoleModule {
    using SafeERC20 for IERC20;

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;
    MultichainVault public immutable multichainVault;

    constructor(
        DataStore _dataStore,
        RoleStore _roleStore,
        EventEmitter _eventEmitter,
        MultichainVault _multichainVault
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        multichainVault = _multichainVault;
    }

    /**
     * Called by Stargate after tokens have been delivered to this contract.
     * @param from The address of the sender (i.e. Stargate address, not user's address).
     * param guid A global unique identifier for tracking the packet.
     * @param message Encoded message. Contains the params needed to record the deposit (account, token, srcChainId)
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

        address token = IStargate(from).token();
        uint256 amountLD = OFTComposeMsgCodec.amountLD(message);
        IERC20(token).safeTransfer(address(multichainVault), amountLD);

        bytes memory composeMessage = OFTComposeMsgCodec.composeMsg(message);
        (address account, uint256 srcChainId) = MultichainProviderUtils.decodeDeposit(composeMessage);

        MultichainUtils.recordBridgeIn(dataStore, eventEmitter, multichainVault, this, token, account, amountLD, srcChainId);
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
     */
    function bridgeOut(IMultichainProvider.BridgeOutParams memory params) external onlyController {
        IERC20(params.token).approve(params.provider, params.amount);

        IStargate stargate = IStargate(params.provider);

        (uint256 valueToSend, SendParam memory sendParam, MessagingFee memory messagingFee) = prepareSend(
            stargate,
            params.amount,
            params.account,
            abi.decode(params.data, (uint32)), // dstEid
            new bytes(0), // _extraOptions
            new bytes(0) // _composeMsg
        );

        {
            address wnt = dataStore.getAddress(Keys.WNT);

            // transferOut bridging fee amount of wnt from user's multichain balance into this contract
            MultichainUtils.transferOut(
                dataStore,
                eventEmitter,
                multichainVault,
                wnt, // token
                params.account,
                address(this), // receiver
                valueToSend, // bridge out fee
                params.srcChainId
            );

            uint256 wntBalanceBefore = IERC20(wnt).balanceOf(address(this));

            // unwrap wnt to native token and send it into this contract (to pay the bridging fee)
            TokenUtils.withdrawAndSendNativeToken(
                dataStore,
                wnt,
                address(this), // receiver
                valueToSend // amount
            );

            uint256 wntBalanceAfter = IERC20(wnt).balanceOf(address(this));

            // if the above native token transfer failed, it re-wraps the token and sends it to the receiver (i.e. this contract)
            // check if wnt was send to this contract due to un-wrapping and transfer it back to user's multichain balance
            if (wntBalanceAfter > wntBalanceBefore) {
                uint256 amount = wntBalanceAfter - wntBalanceBefore;
                IERC20(wnt).safeTransfer(address(multichainVault), amount);

                MultichainUtils.recordBridgeIn(dataStore, eventEmitter, multichainVault, this, wnt, params.account, amount, 0 /*srcChainId*/); // srcChainId is the current block.chainId
                return;
            }
        }

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

        /*(MessagingReceipt memory msgReceipt, OFTReceipt memory oftReceipt) =*/ stargate.send{ value: valueToSend }(
            sendParam,
            messagingFee,
            params.account
        );
    }

    function prepareSend(
        IStargate stargate,
        uint256 amount,
        address receiver,
        uint32 _dstEid,
        bytes memory _composeMsg,
        bytes memory _extraOptions
    ) private view returns (uint256 valueToSend, SendParam memory sendParam, MessagingFee memory messagingFee) {
        sendParam = SendParam({
            dstEid: _dstEid,
            to: MultichainProviderUtils.addressToBytes32(receiver),
            amountLD: amount,
            minAmountLD: amount,
            extraOptions: _extraOptions,
            composeMsg: _composeMsg,
            oftCmd: ""
        });

        (, , OFTReceipt memory receipt) = stargate.quoteOFT(sendParam);
        sendParam.minAmountLD = receipt.amountReceivedLD;

        messagingFee = stargate.quoteSend(sendParam, false);
        valueToSend = messagingFee.nativeFee;

        if (stargate.token() == address(0x0)) {
            valueToSend += sendParam.amountLD;
        }
    }

    /// @dev Accept ETH when unwrapping WNT
    receive() external payable {}
}
