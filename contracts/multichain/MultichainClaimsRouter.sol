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

    function claimFundingFees(
        RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        address[] memory markets,
        address[] memory tokens,
        address receiver
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false, false) returns (uint256[] memory) {
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
        RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        address[] memory markets,
        address[] memory tokens,
        uint256[] memory timeKeys,
        address receiver
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false, false) returns (uint256[] memory) {
        return _claimCollateral(relayParams, account, srcChainId, markets, tokens, timeKeys, receiver);
    }

    // @dev needed to keep `claimCollateral` under the stack limit
    function _claimCollateral(
        RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        address[] memory markets,
        address[] memory tokens,
        uint256[] memory timeKeys,
        address receiver
    ) private returns (uint256[] memory claimedAmounts) {
        bytes32 structHash = RelayUtils.getClaimCollateralStructHash(relayParams, markets, tokens, timeKeys, receiver);
        _validateCall(relayParams, account, structHash, srcChainId);

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
        RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        address[] memory markets,
        address[] memory tokens,
        address receiver
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false, false) returns (uint256[] memory) {
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
