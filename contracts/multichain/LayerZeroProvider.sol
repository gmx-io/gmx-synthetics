// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ILayerZeroComposer } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroComposer.sol";

import "../event/EventEmitter.sol";
import "../data/DataStore.sol";

import "./IMultichainProvider.sol";
import "./MultichainVault.sol";
import "./MultichainUtils.sol";
import "./MultichainEventUtils.sol";
import "./MultichainProviderUtils.sol";
import "./LayerZeroProviderEventUtils.sol";

/**
 * @title LayerZeroProvider
 * Receives tokens + encoded message from a source chain and bridges tokens back to a source chain.
 * Defines lzCompose function which:
 *  - is called by the Stargate executor after tokens are delivered to this contract
 *  - forwards the received tokens to MultichainVault and increases user's multichain balance
 * Defines bridgeOut function which:
 * - sends tokens to the Stargate executor for bridging out to the source chain
 */
contract LayerZeroProvider is IMultichainProvider, ILayerZeroComposer {

    struct LayerZeroBridgeOutParams {
        bytes32 dstEid;
    }

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;
    MultichainVault public immutable multichainVault;

    constructor(DataStore _dataStore, EventEmitter _eventEmitter, MultichainVault _multichainVault) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        multichainVault = _multichainVault;
    }

    ///////////////////// Stargate //////////////////////

    /**
     * Called by Stargate after tokens have been delivered to this contract.
     * @dev Non-guarded function caller (i.e. require from == stargatePool AND msg.sender == lzEndpoint)
     *      Anyone (and on behalf of anyone) can call this function to deposit tokens
     *      TBD if this will change
     * @dev Non-guarded token address (i.e. require token == USDC)
     *      Any token can be deposited (not just USDC), but current implementation intended to USDC only
     *      TBD if this will change
     * @param from The address of the sender (i.e. Stargate address, not user's address).
     * @param guid A global unique identifier for tracking the packet.
     * @param message Encoded message. Contains the params needed to record the deposit (account, token, srcChainId)
     * @param executor The address of the Executor.
     * @param extraData Any extra data or options to trigger on receipt.
     */
    function lzCompose(
        address from,
        bytes32 guid,
        bytes calldata message,
        address executor,
        bytes calldata extraData
    ) external payable {
        (address account, address token, uint256 srcChainId) = MultichainProviderUtils.decodeDeposit(message);

        _transferToVault(token, address(multichainVault));

        MultichainUtils.recordTransferIn(dataStore, eventEmitter, multichainVault, token, account, srcChainId);

        // TODO: check what LZ contract already emits --> if it already emits the fields bellow, remove this event
        LayerZeroProviderEventUtils.emitComposedMessageReceived(
            eventEmitter,
            srcChainId,
            account,
            from,
            guid,
            message,
            executor,
            extraData
        );

        MultichainEventUtils.emitBridgeIn(
            eventEmitter,
            token,
            account,
            srcChainId
        );
    }

    function _transferToVault(address token, address to) private {
        uint256 amount = IERC20(token).balanceOf(address(this));
        IERC20(token).transfer(to, amount);
    }

    function bridgeOut(
        address _stargate,
        address receiver,
        address token,
        uint256 amount,
        bytes calldata data
    ) external {
        IERC20(token).approve(_stargate, amount);

        // IStargate stargate = IStargate(_stargate);
        // LayerZeroBridgeOutParams memory info = abi.decode(data, (LayerZeroBridgeOutParams));

        // (uint256 valueToSend, SendParam memory sendParam, MessagingFee memory messagingFee) = prepareSend(
        //     stargate,
        //     amount,
        //     receiver,
        //     info.dstEid,
        //     new bytes(0), // _extraOptions
        //     new bytes(0) // _composeMsg
        // );

        // (MessagingReceipt memory msgReceipt, OFTReceipt memory oftReceipt) = stargate.send{value: valueToSend}(
        //     sendParam,
        //     messagingFee,
        //     receiver
        // );

        MultichainEventUtils.emitBridgeOut(
            eventEmitter,
            receiver,
            token,
            amount
        );
    }

    // function prepareSend(
    //     IStargate stargate,
    //     uint256 amount,
    //     address receiver,
    //     uint32 _dstEid,
    //     bytes memory _composeMsg,
    //     bytes memory _extraOptions
    // ) private view returns (uint256 valueToSend, SendParam memory sendParam, MessagingFee memory messagingFee) {
    //     sendParam = SendParam({
    //         dstEid: _dstEid,
    //         to: addressToBytes32(receiver),
    //         amountLD: amount,
    //         minAmountLD: amount,
    //         extraOptions: _extraOptions,
    //         composeMsg: _composeMsg,
    //         oftCmd: ""
    //     });

    //     (, , OFTReceipt memory receipt) = stargate.quoteOFT(sendParam);
    //     sendParam.minAmountLD = receipt.amountReceivedLD;

    //     messagingFee = stargate.quoteSend(sendParam, false);
    //     valueToSend = messagingFee.nativeFee;

    //     if (stargate.token() == address(0x0)) {
    //         valueToSend += sendParam.amountLD;
    //     }
    // }
}
