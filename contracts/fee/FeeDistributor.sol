// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../v1/IVaultV1.sol";

import "../data/DataStore.sol";
import "../role/RoleModule.sol";
import "../fee/FeeUtils.sol";
import "../fee/FeeBatchStoreUtils.sol";
import "../market/Market.sol";
import "../nonce/NonceUtils.sol";

// @title FeeDistributor
contract FeeDistributor is ReentrancyGuard, RoleModule {
    using Market for Market.Props;

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;

    IVaultV1 public immutable vaultV1;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        IVaultV1 _vaultV1
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        vaultV1 = _vaultV1;
    }

    // the startIndexV2 and endIndexV2 is passed into the function instead of iterating
    // all markets in the market factory as there may be a large number of v2 markets
    // which could cause the function to exceed the max block gas limit
    // for v1 it is assumed that the total number of tokens to claim fees for is manageable
    // so the tokens are directly iterated for v1
    function claimFees(
        uint256 startIndexV2,
        uint256 endIndexV2
    ) external nonReentrant onlyFeeDistributionKeeper {
        FeeBatch.Props memory feeBatch;

        feeBatch = _claimFeesV1(feeBatch);
        feeBatch = _claimFeesV2(feeBatch, startIndexV2, endIndexV2);
        feeBatch.createdAt = Chain.currentTimestamp();

        bytes32 key = NonceUtils.getNextKey(dataStore);
        FeeBatchStoreUtils.set(dataStore, key, feeBatch);
    }

    function _claimFeesV1(FeeBatch.Props memory feeBatch) internal returns (FeeBatch.Props memory) {
        uint256 count = vaultV1.allWhitelistedTokensLength();

        feeBatch.feeTokensV1 = new address[](count);
        feeBatch.feeAmountsV1 = new uint256[](count);
        feeBatch.remainingAmountsV1 = new uint256[](count);

        for (uint256 i; i < count; i++) {
            // it is possible for the token to be address(0) the withdrawFees
            // function should just return 0 in that case
            address token = vaultV1.allWhitelistedTokens(i);
            uint256 amount = vaultV1.withdrawFees(token, address(this));

            feeBatch.feeTokensV1[i] = token;
            feeBatch.feeAmountsV1[i] = amount;
            feeBatch.remainingAmountsV1[i] = amount;
        }

        return feeBatch;
    }

    function _claimFeesV2(FeeBatch.Props memory feeBatch, uint256 start, uint256 end) internal returns (FeeBatch.Props memory) {
        address[] memory marketKeys = MarketStoreUtils.getMarketKeys(dataStore, start, end);
        uint256 count = marketKeys.length;

        feeBatch.feeTokensV2 = new address[](count);
        feeBatch.feeAmountsV2 = new uint256[](count);
        feeBatch.remainingAmountsV2 = new uint256[](count);

        for (uint256 i; i < count; i++) {
            address marketKey = marketKeys[i];
            Market.Props memory market = MarketStoreUtils.get(dataStore, marketKey);

            uint256 longTokenFeeAmount = FeeUtils.claimFees(
                dataStore,
                eventEmitter,
                market.marketToken,
                market.longToken,
                address(this)
            );

            uint256 shortTokenFeeAmount = FeeUtils.claimFees(
                dataStore,
                eventEmitter,
                market.marketToken,
                market.shortToken,
                address(this)
            );

            feeBatch.feeTokensV2[i * 2] = market.longToken;
            feeBatch.feeAmountsV2[i * 2] = longTokenFeeAmount;
            feeBatch.remainingAmountsV2[i * 2] = longTokenFeeAmount;

            feeBatch.feeTokensV2[i * 2 + 1] = market.shortToken;
            feeBatch.feeAmountsV2[i * 2 + 1] = shortTokenFeeAmount;
            feeBatch.remainingAmountsV2[i * 2 + 1] = shortTokenFeeAmount;
        }

        return feeBatch;
    }
}
