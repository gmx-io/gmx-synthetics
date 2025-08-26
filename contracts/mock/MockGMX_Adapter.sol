// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { MintBurnOFTAdapter } from "@layerzerolabs/oft-evm/contracts/MintBurnOFTAdapter.sol";
import { IMintableBurnable } from "@layerzerolabs/oft-evm/contracts/interfaces/IMintableBurnable.sol";
import { SendParam, MessagingFee, MessagingReceipt, OFTReceipt } from "@layerzerolabs/oft-evm/contracts/OFTCore.sol";
import { Origin } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { OFTMsgCodec } from "@layerzerolabs/oft-evm/contracts/libs/OFTMsgCodec.sol";
import { OFTComposeMsgCodec } from "@layerzerolabs/oft-evm/contracts/libs/OFTComposeMsgCodec.sol";
import { RateLimiter } from "@layerzerolabs/oapp-evm/contracts/oapp/utils/RateLimiter.sol";

struct RateLimitExemptAddress {
    address addr;
    bool isExempt;
}

interface IOverridableInboundRatelimit {
    error InputLengthMismatch(uint256 addressOrGUIDLength, uint256 overridableLength); // 0x6b7f6f0e

    event RateLimitUpdated(RateLimiter.RateLimitConfig[] newConfigs);

    event RateLimitOverrider_ModifiedAddress(RateLimitExemptAddress[] indexed addresses);
    event RateLimitOverrider_ModifiedGUID(bytes32[] indexed guid, bool canOverride);

    /// ------------------------------------------------------------------------------
    /// Storage Variables
    /// ------------------------------------------------------------------------------
    function exemptAddresses(address addr) external view returns (bool isExempt);

    function guidOverrides(bytes32 guid) external view returns (bool canOverride);

    /*
     * @notice Sets the rate limits for the contract.
     * @param _rateLimitConfigs The rate limit configurations to set.
     * @dev This function can only be called by the owner of the contract.
     * @dev Emits a RateLimitUpdated event.
     */
    function setRateLimits(RateLimiter.RateLimitConfig[] calldata rateLimitConfigs) external;

    /*
     * @notice Modifies the rate limit exempt addresses in bulk.
     * @dev This function allows the owner to set multiple addresses as exempt or not exempt.
     * @param _exemptAddresses The addresses to modify as an object of (address, isExempt).
     */
    function modifyRateLimitExemptAddresses(RateLimitExemptAddress[] calldata _exemptAddresses) external;

    /*
     * @notice Modifies the overridable GUIDs in bulk.
     * @dev This function allows the owner to set multiple GUIDs as overridable or not overridable.
     * @param guids The GUIDs to modify.
     * @param canOverride The boolean values indicating whether each GUID is overridable (or not) from the rate limit.
     * @dev canOverride is applied to all GUIDs in the array.
     */
    function modifyOverridableGUIDs(bytes32[] calldata guids, bool canOverride) external;
}

/**
 * @title MintBurnOFTAdapter Contract
 * @author LayerZero Labs (@shankars99)
 * @dev MintBurnOFTAdapter is a contract that adapts an ERC-20 token with external mint and burn logic to the OFT functionality.
 * @dev For existing ERC20 tokens with exposed mint and burn permissions, this can be used to convert the token to crosschain compatibility.
 * @dev Unlike the vanilla OFT Adapter, multiple of these can exist for a given global mesh.
 */
contract MockGMX_Adapter is MintBurnOFTAdapter, RateLimiter, IOverridableInboundRatelimit {
    using OFTMsgCodec for bytes;
    using OFTMsgCodec for bytes32;

    mapping(address => bool) public exemptAddresses;
    mapping(bytes32 => bool) public guidOverrides;

    constructor(
        RateLimitConfig[] memory _rateLimitConfigs,
        address _token,
        IMintableBurnable _minterBurner,
        address _lzEndpoint,
        address _delegate
    ) MintBurnOFTAdapter(_token, _minterBurner, _lzEndpoint, _delegate) Ownable() {
        _setRateLimits(_rateLimitConfigs);
    }

    /**
     * @notice Sets the rate limits for the contract.
     * @param _rateLimitConfigs The rate limit configurations to set.
     * @dev This function can only be called by the owner of the contract.
     * @dev Emits a RateLimitUpdated event.
     */
    function setRateLimits(RateLimitConfig[] calldata _rateLimitConfigs) external onlyOwner {
        _setRateLimits(_rateLimitConfigs);
        emit RateLimitUpdated(_rateLimitConfigs);
    }

    /**
     * @notice Modifies the rate limit exempt addresses in bulk.
     * @dev This function allows the owner to set multiple addresses as exempt or not exempt.
     * @param _exemptAddresses The addresses to modify as an object of (address, isExempt).
     */
    function modifyRateLimitExemptAddresses(RateLimitExemptAddress[] calldata _exemptAddresses) external onlyOwner {
        for (uint256 i; i < _exemptAddresses.length; ++i) {
            exemptAddresses[_exemptAddresses[i].addr] = _exemptAddresses[i].isExempt;
        }

        emit RateLimitOverrider_ModifiedAddress(_exemptAddresses);
    }

    /**
     * @notice Modifies the overridable GUIDs in bulk.
     * @dev This function allows the owner to set multiple GUIDs as overridable or not overridable.
     * @dev This is used when a message with a normal recipient has failed due to rate limiting.
     *      This allows the owner to override the rate limit for that GUID and that tx can be re-executed at the endpoint.
     * @param _guids The GUIDs to modify.
     * @dev `_canOverride` is applied to all GUIDs in the array.
     */
    function modifyOverridableGUIDs(bytes32[] calldata _guids, bool _canOverride) external onlyOwner {
        for (uint256 i; i < _guids.length; ++i) {
            guidOverrides[_guids[i]] = _canOverride;
        }
        emit RateLimitOverrider_ModifiedGUID(_guids, _canOverride);
    }

    /**
     * @notice Override the base _debit() function to consume rate limit before super._debit()
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
        /// @dev GMX does not have any "changes" and so the following is true:
        ///         amountSentLD = amountReceivedLD
        (amountSentLD, amountReceivedLD) = super._debit(_from, _amountLD, _minAmountLD, _dstEid);

        /// @dev If the sender is an exemptAddress (FeeDistributor) then we do NOT refill the rate limiter.
        if (!exemptAddresses[msg.sender]) {
            /// @dev The original layerzero rate limiter is an outbound rate limit.
            /// @dev A unidirectional graph can be inverted by swapping the inflow and outflow functions.
            /// @dev This makes the rate limiter an inbound rate limit.
            super._inflow(_dstEid, amountReceivedLD);
        }
    }

    /**
     * @notice Override the base _lzReceive() function to use _inflowOverridable() before super._lzReceive()
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

        /// @dev If the address is exempt or the GUID is overridable, skip the rate limit check else apply the rate limit.
        if (!exemptAddresses[toAddress] && !guidOverrides[_guid]) {
            /// @dev The original layerzero rate limiter is an outbound rate limit.
            /// @dev Switching `inflow` and `outflow` makes the rate limiter an inbound rate limit.
            super._outflow(_origin.srcEid, _toLD(_message.amountSD()));
        }

        super._lzReceive(_origin, _guid, _message, _executor, _extraData);
    }
}
