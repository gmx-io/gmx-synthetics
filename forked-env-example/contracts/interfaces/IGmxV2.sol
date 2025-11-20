// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

/**
 * Minimal interface definitions copied from GMX Synthetics V2
 * @dev This file contains only the essential interfaces needed for order flow testing
 */

// ============================================================================
// Exchange Router - Main entry point for users
// ============================================================================

interface IExchangeRouter {
    struct CreateOrderParams {
        CreateOrderParamsAddresses addresses;
        CreateOrderParamsNumbers numbers;
        OrderType orderType;
        DecreasePositionSwapType decreasePositionSwapType;
        bool isLong;
        bool shouldUnwrapNativeToken;
        bool autoCancel;
        bytes32 referralCode;
        bytes32[] dataList;
    }

    struct CreateOrderParamsAddresses {
        address receiver;
        address cancellationReceiver;
        address callbackContract;
        address uiFeeReceiver;
        address market;
        address initialCollateralToken;
        address[] swapPath;
    }

    struct CreateOrderParamsNumbers {
        uint256 sizeDeltaUsd;              // Position size change in USD (scaled by 1e30)
        uint256 initialCollateralDeltaAmount; // Collateral amount in token decimals
        uint256 triggerPrice;              // Trigger price for limit/stop orders (scaled by 1e30)
        uint256 acceptablePrice;           // Max price for longs, min price for shorts (scaled by 1e12)
        uint256 executionFee;              // Fee for keepers in native token
        uint256 callbackGasLimit;          // Gas limit for callback contract
        uint256 minOutputAmount;           // Min output for decrease orders/swaps
        uint256 validFromTime;             // Order valid from timestamp
    }

    enum OrderType {
        MarketSwap,         // 0: Swap at market price
        LimitSwap,          // 1: Swap when price reaches trigger
        MarketIncrease,     // 2: Open/increase position at market price
        LimitIncrease,      // 3: Open/increase position at limit price
        MarketDecrease,     // 4: Close/decrease position at market price
        LimitDecrease,      // 5: Close/decrease position at limit price
        StopLossDecrease,   // 6: Stop loss order
        Liquidation,        // 7: Liquidation order (keeper only)
        StopIncrease        // 8: Stop order to increase position
    }

    enum DecreasePositionSwapType {
        NoSwap,                             // 0: No swap
        SwapPnlTokenToCollateralToken,      // 1: Swap PnL to collateral
        SwapCollateralTokenToPnlToken       // 2: Swap collateral to PnL token
    }

    /// Create a new order
    /// @param params Order parameters
    /// @return orderKey Unique identifier for the order
    function createOrder(CreateOrderParams calldata params) external payable returns (bytes32);

    /// Send wrapped native tokens to a receiver
    function sendWnt(address receiver, uint256 amount) external payable;
}

// ============================================================================
// Order Handler - Executed by keepers
// ============================================================================

interface IOrderHandler {
    /// Execute an order (keeper only)
    /// @param key Order key
    /// @param oracleParams Oracle price data
    function executeOrder(bytes32 key, OracleUtils.SetPricesParams calldata oracleParams) external;
}

// ============================================================================
// Oracle - Price feed management
// ============================================================================

library OracleUtils {
    struct SetPricesParams {
        address[] tokens;           // Token addresses
        address[] providers;        // Price providers
        bytes[] data;              // Signed price data
    }

    struct ValidatedPrice {
        address token;
        uint256 min;
        uint256 max;
        uint256 timestamp;
        address provider;
    }
}

library Price {
    struct Props {
        uint256 min;
        uint256 max;
    }
}

interface IOracle {
    function setPrices(OracleUtils.SetPricesParams memory params) external;
    function setPrimaryPrice(address token, Price.Props memory price) external;
    function setTimestamps(uint256 minTimestamp, uint256 maxTimestamp) external;
    function getPrimaryPrice(address token) external view returns (Price.Props memory);
}

interface IOracleStore {
    function getSigners() external view returns (address[] memory);
}


// ============================================================================
// DataStore - Key-value storage
// ============================================================================

interface IDataStore {
    function getUint(bytes32 key) external view returns (uint256);
    function setUint(bytes32 key, uint256 value) external;
    function getAddress(bytes32 key) external view returns (address);
    function getBool(bytes32 key) external view returns (bool);
    function getBytes32(bytes32 key) external view returns (bytes32);
    function getBytes32Count(bytes32 setKey) external view returns (uint256);
    function getBytes32ValuesAt(bytes32 setKey, uint256 start, uint256 end) external view returns (bytes32[] memory);
}

// ============================================================================
// RoleStore - Access control
// ============================================================================

interface IRoleStore {
    function hasRole(address account, bytes32 roleKey) external view returns (bool);
    function getRoleMembers(bytes32 roleKey, uint256 start, uint256 end) external view returns (address[] memory);
    function getRoleMemberCount(bytes32 roleKey) external view returns (uint256);
}

// ============================================================================
// Foundry Compatibility - Keys library for Solidity tests
// ============================================================================

library Keys {
    bytes32 internal constant ORDER_LIST = keccak256(abi.encode("ORDER_LIST"));
    bytes32 internal constant POSITION_LIST = keccak256(abi.encode("POSITION_LIST"));
    bytes32 internal constant ORDER_KEEPER = keccak256(abi.encode("ORDER_KEEPER"));
    bytes32 internal constant ACCOUNT_ORDER_LIST = keccak256(abi.encode("ACCOUNT_ORDER_LIST"));
    bytes32 internal constant ACCOUNT_POSITION_LIST = keccak256(abi.encode("ACCOUNT_POSITION_LIST"));

    function accountOrderListKey(address account) internal pure returns (bytes32) {
        return keccak256(abi.encode(ACCOUNT_ORDER_LIST, account));
    }

    function accountPositionListKey(address account) internal pure returns (bytes32) {
        return keccak256(abi.encode(ACCOUNT_POSITION_LIST, account));
    }
}
