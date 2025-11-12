// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { Origin } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { OFTMsgCodec } from "@layerzerolabs/oft-evm/contracts/libs/OFTMsgCodec.sol";

import { MintBurnOFTAdapter, IMintableBurnable } from "@layerzerolabs/oft-evm/contracts/MintBurnOFTAdapter.sol";

import { MockOverridableInboundRateLimiter } from "./MockOverridableInboundRateLimiter.sol";

/**
 * @title IGMXMinterBurnable
 * @dev Interface for the GMX token contract with minting and burning functionality
 */
interface IGMXMinterBurnable {
    /**
     * @notice Burns tokens from an account
     * @param _account The account to burn tokens from
     * @param _amount The amount of tokens to burn
     * @dev Can only be called by authorized minters
     */
    function burn(address _account, uint256 _amount) external;

    /**
     * @notice Mints tokens to an account
     * @param _account The account to mint tokens to
     * @param _amount The amount of tokens to mint
     * @dev Can only be called by authorized minters
     */
    function mint(address _account, uint256 _amount) external;
}

/**
 * @title GMX_MintBurnAdapter Contract
 * @author LayerZero Labs (@shankars99)
 * @dev GMX_MintBurnAdapter is a contract that adapts an ERC-20 token with external mint and burn logic to the OFT functionality.
 * @dev For existing ERC20 tokens with exposed mint and burn permissions, this can be used to convert the token to crosschain compatibility.
 * @dev Unlike the vanilla OFT Adapter, multiple of these can exist for a given global mesh.
 * @dev This contract is meant to be used on Avalanche and other chains that support mint and burn.
 */
contract MockGMX_MintBurnAdapter is MintBurnOFTAdapter, MockOverridableInboundRateLimiter {
    using OFTMsgCodec for bytes;
    using OFTMsgCodec for bytes32;

    /// @dev The GMX token contract that implements the IGMXMinterBurnable interface
    /// @dev Used instead of IMintableBurnable because GMX does not return bool for mint and burn
    IGMXMinterBurnable public immutable minterBurnerGMX;

    /// @dev IMinterBurnable is set to address(0) because GMX does not return bool for mint and burn
    /// @dev Parent contracts do not use mint() or burn() outside of _credit() and _debit() which are overridden
    constructor(
        RateLimitConfig[] memory _rateLimitConfigs,
        address _token,
        address _lzEndpoint,
        address _delegate
    ) MintBurnOFTAdapter(_token, IMintableBurnable(address(0)), _lzEndpoint, _delegate) Ownable() {
        _setRateLimits(_rateLimitConfigs);
        minterBurnerGMX = IGMXMinterBurnable(_token);
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
        (amountSentLD, amountReceivedLD) = _debitView(_amountLD, _minAmountLD, _dstEid);

        /// @dev Burn the amount being transferred to the destination chain
        /// @dev Since GMX does not have a Fee the following invariant holds:
        /// @dev         `amountSentLD == amountReceivedLD`
        minterBurnerGMX.burn(_from, amountSentLD);

        /// @dev While this _technically_ should be amountReceivedLD
        /// @dev it can be amountSentLD because GMX does not have a Fee
        /// @dev also improves symmetry
        _outflowOverridable(_from, amountSentLD, _dstEid);
    }

    /**
     * @notice Mints tokens to the specified address upon receiving them.
     * @param _to The address to credit the tokens to.
     * @param _amountLD The amount of tokens to credit in local decimals.
     * @return amountReceivedLD The amount of tokens actually received in local decimals.
     * @dev WARNING: The default OFTAdapter implementation assumes LOSSLESS transfers, i.e., 1 token in, 1 token out.
     *      If the 'innerToken' applies something like a transfer fee, the default will NOT work.
     *      A pre/post balance check will need to be done to calculate the amountReceivedLD.
     */
    function _credit(
        address _to,
        uint256 _amountLD,
        uint32 /* _srcEid */
    ) internal virtual override returns (uint256 amountReceivedLD) {
        if (_to == address(0x0)) _to = address(0xdead); /// @dev mint(...) does not support address(0x0)

        /// @dev Mints the tokens to the recipient
        minterBurnerGMX.mint(_to, _amountLD);

        /// @dev In the case of NON-default OFTAdapter, the amountLD MIGHT not be equal to amountReceivedLD.
        return _amountLD;
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

        /// @dev We can assume that every layerzero message is an OFT transfer and that there are no non-token messages
        _inflowOverridable(_guid, toAddress, _toLD(_message.amountSD()), _origin.srcEid);

        super._lzReceive(_origin, _guid, _message, _executor, _extraData);
    }
}
