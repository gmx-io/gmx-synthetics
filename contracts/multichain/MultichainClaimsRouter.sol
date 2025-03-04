// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./MultichainRouter.sol";

contract MultichainClaimsRouter is MultichainRouter {
    constructor(
        BaseConstructorParams memory params
    ) MultichainRouter(params) BaseRouter(params.router, params.roleStore, params.dataStore, params.eventEmitter) {}

    function claimFundingFees(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        address[] memory markets,
        address[] memory tokens,
        address receiver
    )
        external
        nonReentrant
        withOraclePricesForAtomicAction(relayParams.oracleParams)
        onlyGelatoRelay
        returns (uint256[] memory)
    {
        _validateDesChainId(relayParams.desChainId);
        _validateGaslessFeature();

        bytes32 structHash = RelayUtils.getClaimFundingFeesStructHash(relayParams, markets, tokens, receiver);
        _validateCall(relayParams, account, structHash, srcChainId);

        return
            FeeUtils.batchClaimFundingFees(
                dataStore,
                eventEmitter,
                multichainVault,
                markets,
                tokens,
                receiver,
                account,
                srcChainId
            );
    }

    function claimCollateral(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        address[] memory markets,
        address[] memory tokens,
        uint256[] memory timeKeys,
        address receiver
    )
        external
        nonReentrant
        withOraclePricesForAtomicAction(relayParams.oracleParams)
        onlyGelatoRelay
        returns (uint256[] memory)
    {
        {
            _validateDesChainId(relayParams.desChainId);
            _validateGaslessFeature();

            bytes32 structHash = RelayUtils.getClaimCollateralStructHash(
                relayParams,
                markets,
                tokens,
                timeKeys,
                receiver
            );
            _validateCall(relayParams, account, structHash, srcChainId);
        }

        return
            MarketUtils.batchClaimCollateral(
                dataStore,
                eventEmitter,
                multichainVault,
                markets,
                tokens,
                timeKeys,
                receiver,
                account,
                srcChainId
            );
    }

    function claimAffiliateRewards(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        address[] memory markets,
        address[] memory tokens,
        address receiver
    )
        external
        nonReentrant
        withOraclePricesForAtomicAction(relayParams.oracleParams)
        onlyGelatoRelay
        returns (uint256[] memory)
    {
        _validateDesChainId(relayParams.desChainId);
        _validateGaslessFeature();

        bytes32 structHash = RelayUtils.getClaimAffiliateRewardsStructHash(relayParams, markets, tokens, receiver);
        _validateCall(relayParams, account, structHash, srcChainId);

        return
            ReferralUtils.batchClaimAffiliateRewards(
                dataStore,
                eventEmitter,
                multichainVault,
                markets,
                tokens,
                receiver,
                account,
                srcChainId
            );
    }
}
