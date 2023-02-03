// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./BaseOrderHandler.sol";

// @title AdlHandler
// @dev Contract to handle adls
contract AdlHandler is BaseOrderHandler {
    using SafeCast for uint256;
    using SafeCast for int256;
    using Order for Order.Props;
    using Array for uint256[];

    error AdlNotRequired(int256 pnlToPoolFactor, uint256 maxPnlFactorForAdl);
    error InvalidAdl(int256 nextPnlToPoolFactor, int256 pnlToPoolFactor);
    error PnlOvercorrected(int256 nextPnlToPoolFactor, uint256 minPnlFactorForAdl);

    // @dev ExecuteAdlCache struct used in executeAdl to avoid
    // stack too deep errors
    struct ExecuteAdlCache {
        uint256 startingGas;
        uint256[] minOracleBlockNumbers;
        uint256[] maxOracleBlockNumbers;
        bytes32 key;
        bool shouldAllowAdl;
        uint256 maxPnlFactorForAdl;
        int256 pnlToPoolFactor;
        int256 nextPnlToPoolFactor;
        uint256 minPnlFactorForAdl;
    }

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        OrderVault _orderVault,
        Oracle _oracle,
        SwapHandler _swapHandler,
        IReferralStorage _referralStorage
    ) BaseOrderHandler(
        _roleStore,
        _dataStore,
        _eventEmitter,
        _orderVault,
        _oracle,
        _swapHandler,
        _referralStorage
    ) {}

    // @dev checks the ADL state to update the isAdlEnabled flag
    // @param market the market to check
    // @param isLong whether to check the long or short side
    // @param oracleParams OracleUtils.SetPricesParams
    function updateAdlState(
        address market,
        bool isLong,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external
        globalNonReentrant
        onlyAdlKeeper
        withOraclePrices(oracle, dataStore, eventEmitter, oracleParams)
    {
        uint256[] memory maxOracleBlockNumbers = OracleUtils.getUncompactedOracleBlockNumbers(
            oracleParams.compactedMaxOracleBlockNumbers,
            oracleParams.tokens.length
        );

        AdlUtils.updateAdlState(
            dataStore,
            eventEmitter,
            oracle,
            market,
            isLong,
            maxOracleBlockNumbers
        );
    }

    // @dev auto-deleverages a position
    // @param account the position's account
    // @param market the position's market
    // @param collateralToken the position's collateralToken
    // @param isLong whether the position is long or short
    // @param sizeDeltaUsd the size to reduce the position by
    // @param oracleParams OracleUtils.SetPricesParams
    function executeAdl(
        address account,
        address market,
        address collateralToken,
        bool isLong,
        uint256 sizeDeltaUsd,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external
        globalNonReentrant
        onlyAdlKeeper
        withOraclePrices(oracle, dataStore, eventEmitter, oracleParams)
    {
        ExecuteAdlCache memory cache;

        cache.startingGas = gasleft();

        cache.minOracleBlockNumbers = OracleUtils.getUncompactedOracleBlockNumbers(
            oracleParams.compactedMinOracleBlockNumbers,
            oracleParams.tokens.length
        );

        cache.maxOracleBlockNumbers = OracleUtils.getUncompactedOracleBlockNumbers(
            oracleParams.compactedMaxOracleBlockNumbers,
            oracleParams.tokens.length
        );

        AdlUtils.validateAdl(
            dataStore,
            market,
            isLong,
            cache.maxOracleBlockNumbers
        );

        (cache.shouldAllowAdl, cache.pnlToPoolFactor, cache.maxPnlFactorForAdl) = MarketUtils.isPnlFactorExceeded(
            dataStore,
            oracle,
            market,
            isLong,
            Keys.MAX_PNL_FACTOR_FOR_ADL
        );

        if (!cache.shouldAllowAdl) {
            revert AdlNotRequired(cache.pnlToPoolFactor, cache.maxPnlFactorForAdl);
        }

        cache.key = AdlUtils.createAdlOrder(
            AdlUtils.CreateAdlOrderParams(
                dataStore,
                eventEmitter,
                account,
                market,
                collateralToken,
                isLong,
                sizeDeltaUsd,
                cache.minOracleBlockNumbers[0]
            )
        );

        BaseOrderUtils.ExecuteOrderParams memory params = _getExecuteOrderParams(cache.key, oracleParams, msg.sender, cache.startingGas);

        FeatureUtils.validateFeature(params.contracts.dataStore, Keys.executeAdlFeatureDisabledKey(address(this), uint256(params.order.orderType())));

        OrderUtils.executeOrder(params);

        // validate that the ratio of pending pnl to pool value was decreased
        cache.nextPnlToPoolFactor = MarketUtils.getPnlToPoolFactor(dataStore, oracle, market, isLong, true);
        if (cache.nextPnlToPoolFactor >= cache.pnlToPoolFactor) {
            revert InvalidAdl(cache.nextPnlToPoolFactor, cache.pnlToPoolFactor);
        }

        cache.minPnlFactorForAdl = MarketUtils.getMinPnlFactorAfterAdl(dataStore, market, isLong);

        if (cache.nextPnlToPoolFactor < cache.minPnlFactorForAdl.toInt256()) {
            revert PnlOvercorrected(cache.nextPnlToPoolFactor, cache.minPnlFactorForAdl);
        }
    }
}
