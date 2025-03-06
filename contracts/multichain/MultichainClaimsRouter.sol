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

        uint256[] memory claimedAmounts = FeeUtils.batchClaimFundingFees(
            dataStore,
            eventEmitter,
            markets,
            tokens,
            srcChainId == 0 ? receiver : address(multichainVault),
            account
        );

        if (srcChainId != 0) {
            for (uint256 i; i < markets.length; i++) {
                MultichainUtils.recordTransferIn(
                    dataStore,
                    eventEmitter,
                    multichainVault,
                    tokens[i],
                    receiver,
                    srcChainId
                );
            }
        }

        // orderVault is used to transfer funds into it and do a swap from feeToken to wnt when using the feeSwapPath
        Contracts memory contracts = Contracts({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            bank: orderVault
        });
        _handleRelay(
            contracts,
            relayParams,
            account,
            srcChainId == 0 ? receiver : address(multichainVault), // residualFeeReceiver
            false, // isSubaccount
            srcChainId
        );

        return claimedAmounts;
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

        uint256[] memory claimedAmounts = MarketUtils.batchClaimCollateral(
            dataStore,
            eventEmitter,
            markets,
            tokens,
            timeKeys,
            receiver,
            account
        );

        if (srcChainId != 0) {
            for (uint256 i; i < markets.length; i++) {
                MultichainUtils.recordTransferIn(
                    dataStore,
                    eventEmitter,
                    multichainVault,
                    tokens[i],
                    srcChainId == 0 ? receiver : address(multichainVault),
                    srcChainId
                );
            }
        }

        // orderVault is used to transfer funds into it and do a swap from feeToken to wnt when using the feeSwapPath
        Contracts memory contracts = Contracts({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            bank: orderVault
        });
        _handleRelay(
            contracts,
            relayParams,
            account,
            srcChainId == 0 ? receiver : address(multichainVault), // residualFeeReceiver
            false, // isSubaccount
            srcChainId
        );

        return claimedAmounts;
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

        uint256[] memory claimedAmounts = ReferralUtils.batchClaimAffiliateRewards(
            dataStore,
            eventEmitter,
            markets,
            tokens,
            srcChainId == 0 ? receiver : address(multichainVault),
            account
        );

        if (srcChainId != 0) {
            for (uint256 i; i < markets.length; i++) {
                MultichainUtils.recordTransferIn(
                    dataStore,
                    eventEmitter,
                    multichainVault,
                    tokens[i],
                    receiver,
                    srcChainId
                );
            }
        }

        // orderVault is used to transfer funds into it and do a swap from feeToken to wnt when using the feeSwapPath
        Contracts memory contracts = Contracts({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            bank: orderVault
        });
        _handleRelay(
            contracts,
            relayParams,
            account,
            srcChainId == 0 ? receiver : address(multichainVault), // residualFeeReceiver
            false, // isSubaccount
            srcChainId
        );

        return claimedAmounts;
    }
}
