// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { RateLimiter } from "@layerzerolabs/oapp-evm/contracts/oapp/utils/RateLimiter.sol";

struct RateLimitExemptAddress {
    address addr;
    bool isExempt;
}

interface IOverridableInboundRateLimiter {
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
 * @title OverridableRateLimiter
 * @author LayerZero Labs (@shankars99)
 * @dev Abstract contract that provides overridable inbound rate limiting functionality for OFT contracts.
 * @dev This contract can be inherited by any LayerZero OFT adapter (MintBurnOFTAdapter, OFTAdapter, NativeOFTAdapter, etc.)
 * @dev to add rate limiting with exemption and override capabilities.
 */
abstract contract MockOverridableInboundRateLimiter is RateLimiter, Ownable, IOverridableInboundRateLimiter {
    /// @dev Mapping to track addresses exempt from rate limiting
    mapping(address => bool) public exemptAddresses;

    /// @dev Mapping to track GUIDs that can override rate limiting
    mapping(bytes32 => bool) public guidOverrides;

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
     * @notice Apply rate limiting for outbound transfers (inverted to act as inbound rate limit)
     * @dev Uses LayerZero's outbound rate limiter in reverse - calling _inflow() to consume capacity
     * @param _from The address from which the debit is made.
     * @param _amountLD The amount to debit in local denomination.
     * @param _dstEid The destination endpoint ID.
     */
    function _outflowOverridable(address _from, uint256 _amountLD, uint32 _dstEid) internal virtual {
        /// @dev Apply outbound rate limiting if sender is not exempt
        if (!exemptAddresses[_from]) {
            /// @dev The original LayerZero rate limiter is an outbound rate limit.
            /// @dev A unidirectional graph can be inverted by swapping the inflow and outflow functions.
            /// @dev This makes the rate limiter an inbound rate limit.
            super._inflow(_dstEid, _amountLD);
        }
    }

    /**
     * @notice Apply rate limiting for inbound transfers (inverted to act as inbound rate limit)
     * @dev Uses LayerZero's outbound rate limiter in reverse - calling _outflow() to consume capacity
     * @param _guid The GUID of the message.
     * @param _to The address of the recipient.
     * @param _amountLD The amount of tokens received in local decimals.
     * @param _srcEid The source chain ID.
     */
    function _inflowOverridable(bytes32 _guid, address _to, uint256 _amountLD, uint32 _srcEid) internal virtual {
        /// @dev Apply inbound rate limiting if recipient is not exempt and GUID is not overridable
        if (!exemptAddresses[_to] && !guidOverrides[_guid]) {
            /// @dev The original LayerZero rate limiter is an outbound rate limit.
            /// @dev Switching `inflow` and `outflow` makes the rate limiter an inbound rate limit.
            super._outflow(_srcEid, _amountLD);
        }
    }
}
