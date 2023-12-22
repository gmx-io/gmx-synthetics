// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../v1/IVaultV1.sol";
import "../v1/IRouterV1.sol";

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
    IRouterV1 public immutable routerV1;

    address public immutable bridgingToken;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        IVaultV1 _vaultV1,
        IRouterV1 _routerV1,
        address _bridgingToken
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;

        vaultV1 = _vaultV1;
        routerV1 = _routerV1;

        bridgingToken = _bridgingToken;
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

        uint256 countV1 = vaultV1.allWhitelistedTokensLength();

        address[] memory marketKeysV2 = MarketStoreUtils.getMarketKeys(dataStore, startIndexV2, endIndexV2);
        uint256 countV2 = marketKeysV2.length;

        uint256 totalCount = countV1 + countV2 * 2;
        feeBatch.feeTokens = new address[](totalCount);
        feeBatch.feeAmounts = new uint256[](totalCount);
        feeBatch.remainingAmounts = new uint256[](totalCount);

        feeBatch = _claimFeesV1(feeBatch, countV1);
        feeBatch = _claimFeesV2(feeBatch, marketKeysV2, countV1, countV2);
        feeBatch.createdAt = Chain.currentTimestamp();

        bytes32 key = NonceUtils.getNextKey(dataStore);
        FeeBatchStoreUtils.set(dataStore, key, feeBatch);
    }

    function swapFeesUsingV1(
        bytes32 feeBatchKey,
        uint256 tokenIndex,
        address[] memory path,
        uint256 amountIn,
        uint256 minOut
    ) external {
        FeeBatch.Props memory feeBatch = FeeBatchStoreUtils.get(dataStore, feeBatchKey);
        if (tokenIndex > feeBatch.feeTokens.length) {
            revert Errors.InvalidFeeBatchTokenIndex(tokenIndex, feeBatch.feeTokens.length);
        }

        address tokenIn = feeBatch.feeTokens[tokenIndex];
        uint256 remainingAmount = feeBatch.remainingAmounts[tokenIndex];
        if (amountIn > remainingAmount) {
            revert Errors.InvalidAmountInForFeeBatch(amountIn, remainingAmount);
        }

        if (path[path.length - 1] != bridgingToken) {
            revert Errors.InvalidSwapPathForV1(path, bridgingToken);
        }

        IERC20(tokenIn).approve(address(routerV1), amountIn);

        routerV1.swap(path, amountIn, minOut, address(this));
    }


    function _claimFeesV1(FeeBatch.Props memory feeBatch, uint256 count) internal returns (FeeBatch.Props memory) {
        for (uint256 i; i < count; i++) {
            // it is possible for the token to be address(0) the withdrawFees
            // function should just return 0 in that case
            address token = vaultV1.allWhitelistedTokens(i);
            uint256 amount = vaultV1.withdrawFees(token, address(this));

            feeBatch.feeTokens[i] = token;
            feeBatch.feeAmounts[i] = amount;
            feeBatch.remainingAmounts[i] = amount;
        }

        return feeBatch;
    }

    function _claimFeesV2(
        FeeBatch.Props memory feeBatch,
        address[] memory marketKeys,
        uint256 countV1,
        uint256 countV2
    ) internal returns (FeeBatch.Props memory) {
        for (uint256 i; i < countV2; i++) {
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

            uint256 baseIndex = countV1 + i * 2;

            feeBatch.feeTokens[baseIndex] = market.longToken;
            feeBatch.feeAmounts[baseIndex] = longTokenFeeAmount;
            feeBatch.remainingAmounts[baseIndex] = longTokenFeeAmount;

            feeBatch.feeTokens[baseIndex + 1] = market.shortToken;
            feeBatch.feeAmounts[baseIndex + 1] = shortTokenFeeAmount;
            feeBatch.remainingAmounts[baseIndex + 1] = shortTokenFeeAmount;
        }

        return feeBatch;
    }
}
