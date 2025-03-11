// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ILayerZeroComposer } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroComposer.sol";
import { MessagingFee, OFTReceipt, SendParam, MessagingReceipt } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol";

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
    struct LayerZeroBridgeOutParams {
        uint32 dstEid;
    }

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

    ///////////////////// Stargate //////////////////////

    /**
     * Called by Stargate after tokens have been delivered to this contract.
     * @dev Non-guarded function caller (i.e. require from == stargatePool AND msg.sender == lzEndpoint)
     *      Anyone (and on behalf of anyone) can call this function to deposit tokens
     * param from The address of the sender (i.e. Stargate address, not user's address).
     * param guid A global unique identifier for tracking the packet.
     * @param message Encoded message. Contains the params needed to record the deposit (account, token, srcChainId)
     * param executor The address of the Executor.
     * param extraData Any extra data or options to trigger on receipt.
     */
    function lzCompose(
        address /*from*/,
        bytes32 /*guid*/,
        bytes calldata message,
        address /*executor*/,
        bytes calldata /*extraData*/
    ) external payable {
        (address account, address token, uint256 srcChainId) = MultichainProviderUtils.decodeDeposit(message);
        _transferToVault(token, address(multichainVault));
        MultichainUtils.recordBridgeIn(dataStore, eventEmitter, multichainVault, this, token, account, srcChainId);
    }

    function _transferToVault(address token, address to) private {
        uint256 amount = IERC20(token).balanceOf(address(this));
        IERC20(token).transfer(to, amount);
    }

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

        address wnt = dataStore.getAddress(Keys.WNT);

        // transferOut bridging fee amount of wnt from user's multichain balance into this contract
        MultichainUtils.transferOut(
            dataStore,
            eventEmitter,
            multichainVault,
            wnt, // token
            params.account,
            address(this), // receiver
            valueToSend, // bridging fee amount
            params.srcChainId
        );

        // unwrap wnt to native token and send it into this contract (to pay the bridging fee)
        TokenUtils.withdrawAndSendNativeToken(
            dataStore,
            wnt,
            address(this), // receiver
            valueToSend // amount
        );

        // transferOut amount of tokens from user's multichain balance into this contract
        MultichainUtils.transferOut(
            dataStore,
            eventEmitter,
            multichainVault,
            params.token, // token
            params.account,
            address(this), // receiver
            params.amount, // amount
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

    /// Used to accept ETH when unwrapping WNT
    receive() external payable {}
}
