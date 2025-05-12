// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../referral/ReferralUtils.sol";
import "./MultichainRouter.sol";

/*
 * Fees can be paid from the newly claimed tokens if the recipient is the account.
 * Otherwise, the account must have enough funds to pay fees first.
 */
contract MultichainClaimsRouter is MultichainRouter {
    constructor(
        BaseConstructorParams memory params
    ) MultichainRouter(params) BaseRouter(params.router, params.roleStore, params.dataStore, params.eventEmitter) {}

    // @dev same logic as withRelay modifier, but different execution order
    // to allow paying the relayFee from newly claimed tokens
    // i.e. _handleRelayBeforeAction is "delayed" and executed at the same time as _handleRelayAfterAction
    modifier withRelayForClaims(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bool isSubaccount
    ) {
        WithRelayCache memory cache;
        cache.startingGas = gasleft();
        _validateGaslessFeature();
        cache.contracts = _getContracts();
        _;
        // beforeAction "delayed" after tokens have been claimed
        _handleRelayBeforeAction(cache.contracts, relayParams, account, srcChainId, isSubaccount);
        _handleRelayAfterAction(cache.contracts, cache.startingGas, account, srcChainId);
    }

    function claimFundingFees(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        address[] memory markets,
        address[] memory tokens,
        address receiver
    ) external nonReentrant withRelayForClaims(relayParams, account, srcChainId, false) returns (uint256[] memory) {
        bytes32 structHash = RelayUtils.getClaimFundingFeesStructHash(relayParams, markets, tokens, receiver);
        _validateCall(relayParams, account, structHash, srcChainId);
        return _claimFundingFees(account, srcChainId, markets, tokens, receiver);
    }

    function _claimFundingFees(
        address account,
        uint256 srcChainId,
        address[] memory markets,
        address[] memory tokens,
        address receiver
    ) private returns (uint256[] memory claimedAmounts) {
        claimedAmounts = FeeUtils.batchClaimFundingFees(
            dataStore,
            eventEmitter,
            markets,
            tokens,
            address(multichainVault), // receiver
            account
        );

        for (uint256 i; i < tokens.length; i++) {
            MultichainUtils.recordTransferIn(dataStore, eventEmitter, multichainVault, tokens[i], receiver, srcChainId);
        }
    }

    function claimCollateral(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        address[] memory markets,
        address[] memory tokens,
        uint256[] memory timeKeys,
        address receiver
    ) external nonReentrant withRelayForClaims(relayParams, account, srcChainId, false) returns (uint256[] memory) {
        bytes32 structHash = RelayUtils.getClaimCollateralStructHash(relayParams, markets, tokens, timeKeys, receiver);
        _validateCall(relayParams, account, structHash, srcChainId);
        return _claimCollateral(account, srcChainId, markets, tokens, timeKeys, receiver);
    }

    function _claimCollateral(
        address account,
        uint256 srcChainId,
        address[] memory markets,
        address[] memory tokens,
        uint256[] memory timeKeys,
        address receiver
    ) private returns (uint256[] memory claimedAmounts) {
        claimedAmounts = MarketUtils.batchClaimCollateral(
            dataStore,
            eventEmitter,
            markets,
            tokens,
            timeKeys,
            address(multichainVault), // receiver
            account
        );

        for (uint256 i; i < tokens.length; i++) {
            MultichainUtils.recordTransferIn(dataStore, eventEmitter, multichainVault, tokens[i], receiver, srcChainId);
        }
    }

    function claimAffiliateRewards(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        address[] memory markets,
        address[] memory tokens,
        address receiver
    ) external nonReentrant withRelayForClaims(relayParams, account, srcChainId, false) returns (uint256[] memory) {
        bytes32 structHash = RelayUtils.getClaimAffiliateRewardsStructHash(relayParams, markets, tokens, receiver);
        _validateCall(relayParams, account, structHash, srcChainId);
        return _claimAffiliateRewards(account, srcChainId, markets, tokens, receiver);
    }

    function _claimAffiliateRewards(
        address account,
        uint256 srcChainId,
        address[] memory markets,
        address[] memory tokens,
        address receiver
    ) private returns (uint256[] memory claimedAmounts) {
        claimedAmounts = ReferralUtils.batchClaimAffiliateRewards(
            dataStore,
            eventEmitter,
            markets,
            tokens,
            address(multichainVault), // receiver
            account
        );

        for (uint256 i; i < tokens.length; i++) {
            MultichainUtils.recordTransferIn(dataStore, eventEmitter, multichainVault, tokens[i], receiver, srcChainId);
        }
    }
}
