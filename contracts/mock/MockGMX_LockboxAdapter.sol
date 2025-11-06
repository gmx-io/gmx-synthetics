// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { Origin } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { OFTMsgCodec } from "@layerzerolabs/oft-evm/contracts/libs/OFTMsgCodec.sol";

import { OFTAdapter } from "@layerzerolabs/oft-evm/contracts/OFTAdapter.sol";

import { MockOverridableInboundRateLimiter } from "./MockOverridableInboundRateLimiter.sol";

/**
 * @title GMX_LockboxAdapter Contract
 * @author LayerZero Labs (@shankars99)
 * @dev Implementation of a lockbox-style OFT adapter with overridable rate limiting.
 * @dev This contract adapts an existing ERC-20 token to OFT functionality using lock/unlock mechanism.
 * @dev Unlike MintBurnOFTAdapter, this locks tokens in the contract rather than minting/burning.
 * @dev This contract is meant to be used on Arbitrum.
 */
contract MockGMX_LockboxAdapter is OFTAdapter, MockOverridableInboundRateLimiter {
    using OFTMsgCodec for bytes;
    using OFTMsgCodec for bytes32;

    constructor(
        RateLimitConfig[] memory _rateLimitConfigs,
        address _token,
        address _lzEndpoint,
        address _delegate
    ) OFTAdapter(_token, _lzEndpoint, _delegate) Ownable() {
        _setRateLimits(_rateLimitConfigs);
    }

    /**
     * @notice Override the base _debit() function to apply rate limiting before super._debit()
     * @dev This function is called when a debit is made from the OFT.
     * @param _from The address from which the debit is made.
     * @param _amountLD The amount to debit in local denomination.
     * @param _minAmountLD The minimum amount to debit in local denomination.
     * @param _dstEid The destination endpoint ID.
     */
    function _debit(
        address _from,
        uint256 _amountLD,
        uint256 _minAmountLD,
        uint32 _dstEid
    ) internal virtual override returns (uint256 amountSentLD, uint256 amountReceivedLD) {
        /// @dev amountSentLD is amountLD with dust removed
        /// @dev amountReceivedLD is amountSentLD with other token amount changes such as fee, etc.
        /// @dev For lockbox adapters, these are typically the same (no fees)
        (amountSentLD, amountReceivedLD) = super._debit(_from, _amountLD, _minAmountLD, _dstEid);

        _outflowOverridable(_from, amountSentLD, _dstEid);
    }

    /**
     * @notice Override the base _lzReceive() function to apply rate limiting before super._lzReceive()
     * @dev This function is called when a message is received from another chain.
     * @param _origin The origin of the message.
     * @param _guid The GUID of the message.
     * @param _message The message data.
     * @param _executor The address of the executor.
     * @param _extraData Additional data for the message.
     */
    function _lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor, // @dev unused in the default implementation.
        bytes calldata _extraData // @dev unused in the default implementation.
    ) internal virtual override {
        address toAddress = _message.sendTo().bytes32ToAddress();

        /// @dev We can assume that every layerzero message is an OFT transfer and that there are no non-token messages
        _inflowOverridable(_guid, toAddress, _toLD(_message.amountSD()), _origin.srcEid);

        super._lzReceive(_origin, _guid, _message, _executor, _extraData);
    }
}
