// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ILayerZeroComposer } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroComposer.sol";
import { MessagingFee, MessagingReceipt, OFTReceipt, SendParam } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol";

import { IStargate } from "@stargatefinance/stg-evm-v2/src/interfaces/IStargate.sol";

import { Errors } from "../error/Errors.sol";

import { MultichainVault } from "./MultichainVault.sol";
import { MultichainHandler } from "./MultichainHandler.sol";
import { IMultichainProvider } from "./IMultichainProvider.sol";
import { MultichainProviderUtils } from "./MultichainProviderUtils.sol";
import { MultichainProviderSignature } from "./MultichainProviderSignature.sol";

/**
 * @title LayerZeroProvider
 * Receives tokens and messages from source chains. Sends tokens to source chains
 * Messages contain multicall args for e.g. createDeposit, createWithdrawal
 * Deposit is done using lzCompose after tokens are received in this contract
 *  Tokens are forwarded to MultichainVault and recorded by MultichainHandler
 * Withdrawal is done using by verifying the signature and then sending the tokens back to the source chain using Stargate
 * Non USDC tokens are swapped to USDC before withdrawal
 * Defines _lzReceive and lzCompose methods which are called by the Executor
 * @dev LayerZeroProvider is specific to one Stargate pool (e.g. StargatePoolUSDC). TODO: generalize for multiple pools
 * @dev security implications must be considered when using ERC2771 in combination with multicall
 */
contract LayerZeroProvider is IMultichainProvider, ILayerZeroComposer {
    address public stargatePool;
    address public lzEndpoint;

    MultichainVault public multichainVault;
    MultichainHandler public multichainHandler;
    MultichainProviderSignature public multichainProviderSignature;

    /**
     * @param stargate StargatePoolUSDC address from Arbitrum
     * @param endpoint LZ endpoint address from Arbitrum
     * @param handler MultichainHandler address
     * @param vault MultichainVault address
     * @dev must transfer ownership after deployment
     */
    constructor(
        address stargate,
        address endpoint,
        address vault,
        address handler,
        address signature
    ) {
        stargatePool = stargate;
        lzEndpoint = endpoint;
        multichainVault = MultichainVault(payable(vault));
        multichainHandler = MultichainHandler(handler);
        multichainProviderSignature = MultichainProviderSignature(signature);
    }

    ///////////////////// Stargate //////////////////////

    /**
     * Called by Stargate after tokens have been transferred to this contract.
     * @param from The address of the sender (i.e. Stargate address, not user's address).
     * @param guid A global unique identifier for tracking the packet.
     * @param message Encoded message. Contains the multicall args for e.g. createDeposit
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
        if (from != stargatePool) {
            revert Errors.InvalidStargatePool();
        }
        if (msg.sender != lzEndpoint) {
            revert Errors.InvalidLzEndpoint();
        }
        // TODO: handle guid, executor, extraData

        // decode composed message
        (address account, address token, uint256 sourceChainId, , bytes[] memory multicallArgs) = MultichainProviderUtils
            .decodeDeposit(message);

        // forward tokens to MultichainVault
        uint256 amount = IERC20(token).balanceOf(address(this));
        address to = address(multichainVault);
        IERC20(token).transfer(to, amount);

        // TODO: validate `account` is the intended user address from source chain (i.e. )
        // e.g. lzReceive has origin.sender which can be used to validate account => what would be the equivalent for lzCompose? Otherwise signature verification is needed
        // it's possible that msg.sender is encoded in the message (for some reason the Stargate message is longer than the OApp message)

        // record deposit in MultichainVault
        multichainHandler.recordDeposit(account, token, sourceChainId);

        // execute multicall
        multichainHandler.executeMulticall(account, sourceChainId, multicallArgs);
        // TODO: how do you ensure multicallArgs are for createDeposit only? not for e.g. createWithdrawal
    }

    /**
     * External call to this contract to create a withdrawal
     * contains user signature
     */
    function createWithdrawal(bytes calldata message, bytes calldata signature) external {
        // verify signature
        bool isSigner = multichainProviderSignature.isSigner(message, signature);
        if (!isSigner) {
            revert Errors.InvalidMultichainProviderSignature();
        }

        // decode message
        (address token, uint256 amount, address account, uint256 sourceChainId, uint32 srcEid) = MultichainProviderUtils
            .decodeWithdrawal(message);

        // record withdrawal
        multichainHandler.recordWithdrawal(account, token, amount, sourceChainId);

        // send tokens to source chain
        _sendTokens(token, account, amount, srcEid);
    }

    function _sendTokens(address token, address account, uint256 amount, uint32 srcEid) private {
        (uint256 valueToSend, SendParam memory sendParam, MessagingFee memory messagingFee) = _prepareSendTokens(
            stargatePool,
            srcEid,
            amount,
            account
        );
        IERC20(token).approve(stargatePool, amount);
        (MessagingReceipt memory msgReceipt, OFTReceipt memory oftReceipt) = IStargate(stargatePool).send{ value: valueToSend }(
            sendParam,
            messagingFee,
            account
        );
        // TODO: emit event
    }

    function _prepareSendTokens(
        address _stargate,
        uint32 _dstEid,
        uint256 _amount,
        address _receiver
    ) private view returns (uint256 valueToSend, SendParam memory sendParam, MessagingFee memory messagingFee) {
        sendParam = SendParam({
            dstEid: _dstEid,
            to: MultichainProviderUtils.addressToBytes32(_receiver),
            amountLD: _amount,
            minAmountLD: _amount,
            extraOptions: new bytes(0),
            composeMsg: new bytes(0),
            oftCmd: ""
        });

        IStargate stargate = IStargate(_stargate);

        (, , OFTReceipt memory receipt) = stargate.quoteOFT(sendParam);
        sendParam.minAmountLD = receipt.amountReceivedLD;

        messagingFee = stargate.quoteSend(sendParam, false);
        valueToSend = messagingFee.nativeFee;

        if (stargate.token() == address(0x0)) {
            valueToSend += sendParam.amountLD;
        }
    }

    fallback() external payable {}

    receive() external payable {}
}
