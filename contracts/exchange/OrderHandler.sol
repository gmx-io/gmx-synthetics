// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../role/RoleModule.sol";
import "../feature/FeatureUtils.sol";
import "../callback/CallbackUtils.sol";

import "../adl/AdlUtils.sol";
import "../liquidation/LiquidationUtils.sol";

import "../bank/FundReceiver.sol";
import "../market/Market.sol";
import "../market/MarketStore.sol";
import "../market/MarketToken.sol";

import "../order/Order.sol";
import "../order/OrderStore.sol";
import "../order/OrderUtils.sol";

import "../position/PositionStore.sol";
import "../oracle/Oracle.sol";
import "../oracle/OracleModule.sol";
import "../event/EventEmitter.sol";

import "../utils/Null.sol";
import "../referral/IReferralStorage.sol";

// @title OrderHandler
// @dev Contract to handle creation, execution and cancellation of orders
contract OrderHandler is ReentrancyGuard, FundReceiver, OracleModule {
    using SafeCast for uint256;
    using Order for Order.Props;
    using Array for uint256[];

    // @dev _ExecuteAdlCache struct used in executeAdl to avoid
    // stack too deep errors
    struct _ExecuteAdlCache {
        uint256 startingGas;
        uint256[] oracleBlockNumbers;
        bytes32 key;
        int256 pnlToPoolFactor;
        int256 nextPnlToPoolFactor;
        uint256 maxPnlFactorForWithdrawals;
    }

    MarketStore public immutable marketStore;
    OrderStore public immutable orderStore;
    PositionStore public immutable positionStore;
    SwapHandler public immutable swapHandler;
    Oracle public immutable oracle;
    EventEmitter public immutable eventEmitter;
    FeeReceiver public immutable feeReceiver;
    IReferralStorage public immutable referralStorage;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        MarketStore _marketStore,
        OrderStore _orderStore,
        PositionStore _positionStore,
        Oracle _oracle,
        SwapHandler _swapHandler,
        FeeReceiver _feeReceiver,
        IReferralStorage _referralStorage
    ) FundReceiver(_roleStore, _dataStore) {
        eventEmitter = _eventEmitter;
        marketStore = _marketStore;
        orderStore = _orderStore;
        positionStore = _positionStore;
        oracle = _oracle;
        swapHandler = _swapHandler;
        feeReceiver = _feeReceiver;
        referralStorage = _referralStorage;
    }

    receive() external payable {}


    // @dev creates an order in the order store
    // @param account the order's account
    // @param params OrderBaseUtils.CreateOrderParams
    function createOrder(
        address account,
        OrderBaseUtils.CreateOrderParams calldata params
    ) external nonReentrant onlyController returns (bytes32) {
        FeatureUtils.validateFeature(dataStore, Keys.createOrderFeatureKey(address(this), uint256(params.orderType)));

        return OrderUtils.createOrder(
            dataStore,
            eventEmitter,
            orderStore,
            marketStore,
            account,
            params
        );
    }

    // @dev executes an order
    // @param key the key of the order to execute
    // @param oracleParams OracleUtils.SetPricesParams
    function executeOrder(
        bytes32 key,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external
        onlyOrderKeeper
        withOraclePrices(oracle, dataStore, eventEmitter, oracleParams)
    {
        uint256 startingGas = gasleft();

        try this._executeOrder(
            key,
            oracleParams,
            msg.sender,
            startingGas
        ) {
        } catch Error(string memory reason) {
            bytes32 reasonKey = keccak256(abi.encode(reason));

            // note that it is possible for any external contract to spoof these errors
            // this can happen when calling transfers for external tokens, eth transfers, callbacks etc
            // because of that, errors from external calls should be separately caught
            if (
                reasonKey == Keys.FROZEN_ORDER_ERROR_KEY ||
                reasonKey == Keys.EMPTY_POSITION_ERROR_KEY
            ) {
                revert(reason);
            }

            _handleOrderError(key, startingGas, reason, reasonKey);
        } catch (bytes memory _reason) {
            string memory reason = string(abi.encode(_reason));
            bytes32 reasonKey = keccak256(abi.encode(_reason));
            _handleOrderError(key, startingGas, reason, reasonKey);
        }
    }

    // @dev executes a position liquidation
    // @param account the account of the position to liquidation
    // @param market the position's market
    // @param collateralToken the position's collateralToken
    // @param isLong whether the position is long or short
    // @param oracleParams OracleUtils.SetPricesParams
    function executeLiquidation(
        address account,
        address market,
        address collateralToken,
        bool isLong,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external
        nonReentrant
        onlyLiquidationKeeper
        withOraclePrices(oracle, dataStore, eventEmitter, oracleParams)
    {
        uint256 startingGas = gasleft();

        bytes32 key = LiquidationUtils.createLiquidationOrder(
            dataStore,
            orderStore,
            positionStore,
            account,
            market,
            collateralToken,
            isLong
        );

        OrderBaseUtils.ExecuteOrderParams memory params = _getExecuteOrderParams(key, oracleParams, msg.sender, startingGas);

        FeatureUtils.validateFeature(params.contracts.dataStore, Keys.executeOrderFeatureKey(address(this), uint256(params.order.orderType())));

        OrderUtils.executeOrder(params);
    }

    // @dev checks the ADL state to update the isAdlEnabled flag
    // @param market the market to check
    // @param isLong whether to check the long or short side
    // @param oracleParams OracleUtils.SetPricesParams
    function updateAdlState(
        address market,
        bool isLong,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external
        nonReentrant
        onlyAdlKeeper
        withOraclePrices(oracle, dataStore, eventEmitter, oracleParams)
    {
        uint256[] memory oracleBlockNumbers = OracleUtils.getUncompactedOracleBlockNumbers(
            oracleParams.compactedOracleBlockNumbers,
            oracleParams.tokens.length
        );

        AdlUtils.updateAdlState(
            dataStore,
            eventEmitter,
            marketStore,
            oracle,
            market,
            isLong,
            oracleBlockNumbers
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
        nonReentrant
        onlyAdlKeeper
        withOraclePrices(oracle, dataStore, eventEmitter, oracleParams)
    {
        _ExecuteAdlCache memory cache;

        cache.startingGas = gasleft();

        cache.oracleBlockNumbers = OracleUtils.getUncompactedOracleBlockNumbers(
            oracleParams.compactedOracleBlockNumbers,
            oracleParams.tokens.length
        );

        AdlUtils.validateAdl(
            dataStore,
            market,
            isLong,
            cache.oracleBlockNumbers
        );

        cache.pnlToPoolFactor = MarketUtils.getPnlToPoolFactor(dataStore, marketStore, oracle, market, isLong, true);

        if (cache.pnlToPoolFactor < 0) {
            revert("Invalid pnlToPoolFactor");
        }

        cache.key = AdlUtils.createAdlOrder(
            AdlUtils.CreateAdlOrderParams(
                dataStore,
                orderStore,
                positionStore,
                account,
                market,
                collateralToken,
                isLong,
                sizeDeltaUsd,
                cache.oracleBlockNumbers[0]
            )
        );

        OrderBaseUtils.ExecuteOrderParams memory params = _getExecuteOrderParams(cache.key, oracleParams, msg.sender, cache.startingGas);

        FeatureUtils.validateFeature(params.contracts.dataStore, Keys.executeAdlFeatureKey(address(this), uint256(params.order.orderType())));

        OrderUtils.executeOrder(params);

        cache.nextPnlToPoolFactor = MarketUtils.getPnlToPoolFactor(dataStore, marketStore, oracle, market, isLong, true);
        if (cache.nextPnlToPoolFactor >= cache.pnlToPoolFactor) {
            revert("Invalid adl");
        }

        cache.maxPnlFactorForWithdrawals = MarketUtils.getMaxPnlFactorForWithdrawals(dataStore, market, isLong);

        if (cache.nextPnlToPoolFactor < cache.maxPnlFactorForWithdrawals.toInt256()) {
            revert("Pnl was overcorrected");
        }
    }

    // @dev executes an order
    // @param key the key of the order to execute
    // @param oracleParams OracleUtils.SetPricesParams
    // @param keeper the keeper executing the order
    // @param startingGas the starting gas
    function _executeOrder(
        bytes32 key,
        OracleUtils.SetPricesParams memory oracleParams,
        address keeper,
        uint256 startingGas
    ) external nonReentrant onlySelf {
        OrderBaseUtils.ExecuteOrderParams memory params = _getExecuteOrderParams(key, oracleParams, keeper, startingGas);
        // limit swaps require frozen order keeper as well since on creation it can fail due to output amount
        // which would automatically cause the order to be frozen
        // limit increase and decrease positions may fail due to output amount as well and become frozen
        // but only if their acceptablePrice is reached
        if (params.order.isFrozen() || params.order.orderType() == Order.OrderType.LimitSwap) {
            _validateFrozenOrderKeeper(keeper);
        }

        FeatureUtils.validateFeature(params.contracts.dataStore, Keys.executeOrderFeatureKey(address(this), uint256(params.order.orderType())));

        OrderUtils.executeOrder(params);
    }

    // @dev get the OrderBaseUtils.ExecuteOrderParams to execute an order
    // @param key the key of the order to execute
    // @param oracleParams OracleUtils.SetPricesParams
    // @param keeper the keeper executing the order
    // @param startingGas the starting gas
    // @return the required OrderBaseUtils.ExecuteOrderParams params to execute the order
    function _getExecuteOrderParams(
        bytes32 key,
        OracleUtils.SetPricesParams memory oracleParams,
        address keeper,
        uint256 startingGas
    ) internal view returns (OrderBaseUtils.ExecuteOrderParams memory) {
        OrderBaseUtils.ExecuteOrderParams memory params;

        params.key = key;
        params.order = orderStore.get(key);
        params.swapPathMarkets = MarketUtils.getMarkets(marketStore, params.order.swapPath());

        params.contracts.dataStore = dataStore;
        params.contracts.eventEmitter = eventEmitter;
        params.contracts.orderStore = orderStore;
        params.contracts.positionStore = positionStore;
        params.contracts.oracle = oracle;
        params.contracts.swapHandler = swapHandler;
        params.contracts.feeReceiver = feeReceiver;
        params.contracts.referralStorage = referralStorage;

        params.oracleBlockNumbers = OracleUtils.getUncompactedOracleBlockNumbers(
            oracleParams.compactedOracleBlockNumbers,
            oracleParams.tokens.length
        );

        if (params.order.market() != address(0)) {
            params.market = MarketUtils.getMarket(marketStore, params.order.market());
        }

        params.keeper = keeper;
        params.startingGas = startingGas;

        return params;
    }

    // @dev handle a caught order error
    // @param key the order's key
    // @param startingGas the starting gas
    // @param reason the error reason
    // @param reasonKey the hash or the error reason
    function _handleOrderError(
        bytes32 key,
        uint256 startingGas,
        string memory reason,
        bytes32 reasonKey
    ) internal {
        Order.Props memory order = orderStore.get(key);
        bool isMarketOrder = OrderBaseUtils.isMarketOrder(order.orderType());

        if (isMarketOrder) {
            OrderUtils.cancelOrder(
                dataStore,
                eventEmitter,
                orderStore,
                key,
                msg.sender,
                startingGas,
                reason
            );
        } else {
            if (reasonKey == Keys.UNACCEPTABLE_PRICE_ERROR_KEY) {
                revert(reason);
            }

            // freeze unfulfillable orders to prevent the order system from being gamed
            // an example of gaming would be if a user creates a limit order
            // with size greater than the available amount in the pool
            // the user waits for their limit price to be hit, and if price
            // moves in their favour after, they can deposit into the pool
            // to allow the order to be executed then close the order for a profit
            //
            // frozen order keepers will have additional validations before executing
            // frozen orders to prevent gaming
            //
            // alternatively, the user can call updateOrder to unfreeze the order
            OrderUtils.freezeOrder(
                dataStore,
                eventEmitter,
                orderStore,
                key,
                msg.sender,
                startingGas,
                reason
            );
        }
    }

    // @dev validate that the keeper is a frozen order keeper
    // @param keeper address of the keeper
    function _validateFrozenOrderKeeper(address keeper) internal view {
        require(roleStore.hasRole(keeper, Role.FROZEN_ORDER_KEEPER), Keys.FROZEN_ORDER_ERROR);
    }
}
