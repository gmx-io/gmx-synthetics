// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./IGlpVault.sol";
import "./IGlpTimelock.sol";
import "./IGlpRewardRouter.sol";

import "../data/Keys.sol";
import "../data/DataStore.sol";
import "../event/EventEmitter.sol";

import "../deposit/DepositVault.sol";
import "../exchange/DepositHandler.sol";

contract GlpMigrator is ReentrancyGuard, RoleModule {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    using SafeERC20 for IERC20;

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;
    DepositVault public immutable depositVault;
    DepositHandler public immutable depositHandler;

    IERC20 public immutable stakedGlp;
    IGlpVault public immutable glpVault;
    IGlpTimelock public immutable glpTimelock;
    IGlpRewardRouter public immutable glpRewardRouter;

    uint256 public reducedMintBurnFeeBasisPoints;

    struct GlpRedemption {
        address token;
        uint256 glpAmount;
        uint256 minOut;
    }

    struct MigrationItem {
        address market;

        GlpRedemption long;
        GlpRedemption short;

        uint256 minMarketTokens;
    }

    struct MigrateCache {
        Market.Props market;
        uint256 redeemedLongTokenAmount;
        uint256 redeemedShortTokenAmount;
        bytes32 depositKey;
    }

    modifier withReducedRedemptionFees() {
        uint256 taxBasisPoints = glpVault.taxBasisPoints();
        uint256 stableTaxBasisPoints = glpVault.stableTaxBasisPoints();
        uint256 mintBurnFeeBasisPoints = glpVault.mintBurnFeeBasisPoints();
        uint256 swapFeeBasisPoints = glpVault.swapFeeBasisPoints();
        uint256 stableSwapFeeBasisPoints = glpVault.stableSwapFeeBasisPoints();
        uint256 _reducedMintBurnFeeBasisPoints = reducedMintBurnFeeBasisPoints;

        bool shouldUpdateFees = _reducedMintBurnFeeBasisPoints != mintBurnFeeBasisPoints;

        if (shouldUpdateFees) {
            glpTimelock.setSwapFees(
                address(glpVault),
                taxBasisPoints,
                stableTaxBasisPoints,
                _reducedMintBurnFeeBasisPoints,
                swapFeeBasisPoints,
                stableSwapFeeBasisPoints
            );
        }

        _;

        if (shouldUpdateFees) {
            glpTimelock.setSwapFees(
                address(glpVault),
                taxBasisPoints,
                stableTaxBasisPoints,
                mintBurnFeeBasisPoints,
                swapFeeBasisPoints,
                stableSwapFeeBasisPoints
            );
        }
    }

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        DepositVault _depositVault,
        DepositHandler _depositHandler,
        IERC20 _stakedGlp,
        IGlpVault _glpVault,
        IGlpTimelock _glpTimelock,
        IGlpRewardRouter _glpRewardRouter,
        uint256 _reducedMintBurnFeeBasisPoints
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        depositVault = _depositVault;
        depositHandler = _depositHandler;

        stakedGlp = _stakedGlp;
        glpVault = _glpVault;
        glpTimelock = _glpTimelock;
        glpRewardRouter = _glpRewardRouter;

        reducedMintBurnFeeBasisPoints = _reducedMintBurnFeeBasisPoints;
    }

    function setReducedMintBurnFeeBasisPoints(uint256 _reducedMintBurnFeeBasisPoints) external onlyConfigKeeper {
        reducedMintBurnFeeBasisPoints = _reducedMintBurnFeeBasisPoints;

        EventUtils.EventLogData memory eventData;

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "reducedMintBurnFeeBasisPoints", _reducedMintBurnFeeBasisPoints);

        eventEmitter.emitEventLog(
            "SetReducedMintBurnFeeBasisPoints",
            eventData
        );
    }

    function migrate(
        uint256 totalGlpAmount,
        MigrationItem[] memory migrationItems,
        uint256 executionFee
    ) external payable nonReentrant withReducedRedemptionFees {
        address account = msg.sender;
        stakedGlp.transferFrom(account, address(this), totalGlpAmount);

        uint256 totalGlpAmountToRedeem;

        for (uint256 i = 0; i < migrationItems.length; i++) {
            MigrationItem memory migrationItem = migrationItems[i];
            totalGlpAmountToRedeem += migrationItem.long.glpAmount;
            totalGlpAmountToRedeem += migrationItem.short.glpAmount;
        }

        if (totalGlpAmountToRedeem != totalGlpAmount) {
            revert Errors.InvalidGlpAmount(totalGlpAmountToRedeem, totalGlpAmount);
        }

        for (uint256 i = 0; i < migrationItems.length; i++) {
            MigrationItem memory migrationItem = migrationItems[i];
            MigrateCache memory cache;

            cache.market = MarketUtils.getEnabledMarket(dataStore, migrationItem.market);

            if (migrationItem.long.token != cache.market.longToken) {
                revert Errors.InvalidLongTokenForMigration(migrationItem.market, migrationItem.long.token, cache.market.longToken);
            }

            if (migrationItem.short.token != cache.market.shortToken) {
                revert Errors.InvalidShortTokenForMigration(migrationItem.market, migrationItem.short.token, cache.market.shortToken);
            }

            cache.redeemedLongTokenAmount = glpRewardRouter.unstakeAndRedeemGlp(
                migrationItem.long.token, // tokenOut
                migrationItem.long.glpAmount, // glpAmount
                migrationItem.long.minOut, // minOut
                address(depositVault) // receiver
            );

            cache.redeemedShortTokenAmount = glpRewardRouter.unstakeAndRedeemGlp(
                migrationItem.short.token, // tokenOut
                migrationItem.short.glpAmount, // glpAmount
                migrationItem.short.minOut, // minOut
                address(depositVault) // receiver
            );

            TokenUtils.depositAndSendWrappedNativeToken(
                dataStore,
                address(depositVault),
                executionFee
            );

            // a user could set a minMarketTokens to force the deposit to fail
            // or set a market where the deposited amount would exceed the caps and
            // the deposit would fail
            // glp should be adjusted such that only redemptions are allowed so
            // any arbitrage / benefit of doing this should be minimal
            DepositUtils.CreateDepositParams memory depositParams =  DepositUtils.CreateDepositParams(
                account, // receiver;
                address(0), // callbackContract;
                address(0), // uiFeeReceiver;
                migrationItem.market, // market;
                cache.market.longToken, // initialLongToken;
                cache.market.shortToken, // initialShortToken;
                new address[](0), // longTokenSwapPath;
                new address[](0), // shortTokenSwapPath;
                migrationItem.minMarketTokens, // minMarketTokens;
                false, // shouldUnwrapNativeToken;
                executionFee, // executionFee;
                0 // callbackGasLimit;
            );

            cache.depositKey = depositHandler.createDeposit(
                account,
                depositParams
            );

            EventUtils.EventLogData memory eventData;

            eventData.bytes32Items.initItems(1);
            eventData.bytes32Items.setItem(0, "depositKey", cache.depositKey);

            eventData.addressItems.initItems(1);
            eventData.addressItems.setItem(0, "market", cache.market.marketToken);

            eventData.uintItems.initItems(4);
            eventData.uintItems.setItem(0, "glpLongAmount", migrationItem.long.glpAmount);
            eventData.uintItems.setItem(1, "glpShortAmount", migrationItem.short.glpAmount);
            eventData.uintItems.setItem(2, "redeemedLongTokenAmount", cache.redeemedLongTokenAmount);
            eventData.uintItems.setItem(3, "redeemedShortTokenAmount", cache.redeemedShortTokenAmount);

            eventEmitter.emitEventLog1(
                "GlpMigration",
                Cast.toBytes32(cache.market.marketToken),
                eventData
            );
        }
    }

}
