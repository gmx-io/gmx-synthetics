// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/Keys.sol";
import "../data/DataStore.sol";

import "./Order.sol";

/**
 * @title OrderStoreUtils
 * @dev Library for order storage functions
 */
library OrderStoreUtils {
    using Order for Order.Props;

    bytes32 public constant ACCOUNT = keccak256(abi.encode("ACCOUNT"));
    bytes32 public constant RECEIVER = keccak256(abi.encode("RECEIVER"));
    bytes32 public constant CALLBACK_CONTRACT = keccak256(abi.encode("CALLBACK_CONTRACT"));
    bytes32 public constant MARKET = keccak256(abi.encode("MARKET"));
    bytes32 public constant INITIAL_COLLATERAL_TOKEN = keccak256(abi.encode("INITIAL_COLLATERAL_TOKEN"));
    bytes32 public constant SWAP_PATH = keccak256(abi.encode("SWAP_PATH"));

    bytes32 public constant ORDER_TYPE = keccak256(abi.encode("ORDER_TYPE"));
    bytes32 public constant SIZE_DELTA_USD = keccak256(abi.encode("SIZE_DELTA_USD"));
    bytes32 public constant INITIAL_COLLATERAL_DELTA_AMOUNT = keccak256(abi.encode("INITIAL_COLLATERAL_DELTA_AMOUNT"));
    bytes32 public constant TRIGGER_PRICE = keccak256(abi.encode("TRIGGER_PRICE"));
    bytes32 public constant ACCEPTABLE_PRICE = keccak256(abi.encode("ACCEPTABLE_PRICE"));
    bytes32 public constant EXECUTION_FEE = keccak256(abi.encode("EXECUTION_FEE"));
    bytes32 public constant CALLBACK_GAS_LIMIT = keccak256(abi.encode("CALLBACK_GAS_LIMIT"));
    bytes32 public constant MIN_OUTPUT_AMOUNT = keccak256(abi.encode("MIN_OUTPUT_AMOUNT"));
    bytes32 public constant UPDATED_AT_BLOCK = keccak256(abi.encode("UPDATED_AT_BLOCK"));

    bytes32 public constant IS_LONG = keccak256(abi.encode("IS_LONG"));
    bytes32 public constant SHOULD_UNWRAP_NATIVE_TOKEN = keccak256(abi.encode("SHOULD_UNWRAP_NATIVE_TOKEN"));
    bytes32 public constant IS_FROZEN = keccak256(abi.encode("IS_FROZEN"));

    function get(DataStore dataStore, bytes32 key) external view returns (Order.Props memory) {
        Order.Props memory order;

        order.setAccount(dataStore.getAddress(
            keccak256(abi.encode(key, ACCOUNT))
        ));

        order.setReceiver(dataStore.getAddress(
            keccak256(abi.encode(key, RECEIVER))
        ));

        order.setCallbackContract(dataStore.getAddress(
            keccak256(abi.encode(key, CALLBACK_CONTRACT))
        ));

        order.setMarket(dataStore.getAddress(
            keccak256(abi.encode(key, MARKET))
        ));

        order.setInitialCollateralToken(dataStore.getAddress(
            keccak256(abi.encode(key, INITIAL_COLLATERAL_TOKEN))
        ));

        order.setOrderType(Order.OrderType(dataStore.getUint(
            keccak256(abi.encode(key, ORDER_TYPE))
        )));

        order.setSizeDeltaUsd(dataStore.getUint(
            keccak256(abi.encode(key, SIZE_DELTA_USD))
        ));

        order.setInitialCollateralDeltaAmount(dataStore.getUint(
            keccak256(abi.encode(key, INITIAL_COLLATERAL_DELTA_AMOUNT))
        ));

        order.setTriggerPrice(dataStore.getUint(
            keccak256(abi.encode(key, TRIGGER_PRICE))
        ));

        order.setAcceptablePrice(dataStore.getUint(
            keccak256(abi.encode(key, ACCEPTABLE_PRICE))
        ));

        order.setExecutionFee(dataStore.getUint(
            keccak256(abi.encode(key, EXECUTION_FEE))
        ));

        order.setCallbackGasLimit(dataStore.getUint(
            keccak256(abi.encode(key, CALLBACK_GAS_LIMIT))
        ));

        order.setMinOutputAmount(dataStore.getUint(
            keccak256(abi.encode(key, MIN_OUTPUT_AMOUNT))
        ));

        order.setUpdatedAtBlock(dataStore.getUint(
            keccak256(abi.encode(key, UPDATED_AT_BLOCK))
        ));

        order.setIsLong(dataStore.getBool(
            keccak256(abi.encode(key, IS_LONG))
        ));

        order.setShouldUnwrapNativeToken(dataStore.getBool(
            keccak256(abi.encode(key, SHOULD_UNWRAP_NATIVE_TOKEN))
        ));

        order.setIsFrozen(dataStore.getBool(
            keccak256(abi.encode(key, IS_FROZEN))
        ));

        return order;
    }

    /* function set(DataStore dataStore, bytes32 key, Order.Props memory position) external {
        dataStore.addBytes32(
            Keys.POSITION_LIST,
            key
        );

        dataStore.addBytes32(
            Keys.accountPositionListKey(position.account()),
            key
        );

        dataStore.setAddress(
            keccak256(abi.encode(key, ACCOUNT)),
            position.account()
        );

        dataStore.setAddress(
            keccak256(abi.encode(key, MARKET)),
            position.market()
        );

        dataStore.setAddress(
            keccak256(abi.encode(key, COLLATERAL_TOKEN)),
            position.collateralToken()
        );

        dataStore.setUint(
            keccak256(abi.encode(key, SIZE_IN_USD)),
            position.sizeInUsd()
        );

        dataStore.setUint(
            keccak256(abi.encode(key, SIZE_IN_TOKENS)),
            position.sizeInTokens()
        );

        dataStore.setUint(
            keccak256(abi.encode(key, COLLATERAL_AMOUNT)),
            position.collateralAmount()
        );

        dataStore.setUint(
            keccak256(abi.encode(key, BORROWING_FACTOR)),
            position.borrowingFactor()
        );

        dataStore.setInt(
            keccak256(abi.encode(key, LONG_TOKEN_FUNDING_AMOUNT_PER_SIZE)),
            position.longTokenFundingAmountPerSize()
        );

        dataStore.setInt(
            keccak256(abi.encode(key, SHORT_TOKEN_FUNDING_AMOUNT_PER_SIZE)),
            position.shortTokenFundingAmountPerSize()
        );

        dataStore.setUint(
            keccak256(abi.encode(key, INCREASED_AT_BLOCK)),
            position.increasedAtBlock()
        );

        dataStore.setUint(
            keccak256(abi.encode(key, DECREASED_AT_BLOCK)),
            position.decreasedAtBlock()
        );

        dataStore.setBool(
            keccak256(abi.encode(key, IS_LONG)),
            position.isLong()
        );
    }

    function remove(DataStore dataStore, bytes32 key, address account) external {
        dataStore.removeBytes32(
            Keys.POSITION_LIST,
            key
        );

        dataStore.removeBytes32(
            Keys.accountPositionListKey(account),
            key
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, ACCOUNT))
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, MARKET))
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, COLLATERAL_TOKEN))
        );

        dataStore.removeUint(
            keccak256(abi.encode(key, SIZE_IN_USD))
        );

        dataStore.removeUint(
            keccak256(abi.encode(key, SIZE_IN_TOKENS))
        );

        dataStore.removeUint(
            keccak256(abi.encode(key, COLLATERAL_AMOUNT))
        );

        dataStore.removeUint(
            keccak256(abi.encode(key, BORROWING_FACTOR))
        );

        dataStore.removeInt(
            keccak256(abi.encode(key, LONG_TOKEN_FUNDING_AMOUNT_PER_SIZE))
        );

        dataStore.removeInt(
            keccak256(abi.encode(key, SHORT_TOKEN_FUNDING_AMOUNT_PER_SIZE))
        );

        dataStore.removeUint(
            keccak256(abi.encode(key, INCREASED_AT_BLOCK))
        );

        dataStore.removeUint(
            keccak256(abi.encode(key, DECREASED_AT_BLOCK))
        );

        dataStore.removeBool(
            keccak256(abi.encode(key, IS_LONG))
        );
    }

    function getPositionCount(DataStore dataStore) internal view returns (uint256) {
        return dataStore.getBytes32Count(Keys.POSITION_LIST);
    }

    function getPositionKeys(DataStore dataStore, uint256 start, uint256 end) internal view returns (bytes32[] memory) {
        return dataStore.getBytes32ValuesAt(Keys.POSITION_LIST, start, end);
    }

    function getAccountPositionCount(DataStore dataStore, address account) internal view returns (uint256) {
        return dataStore.getBytes32Count(Keys.accountPositionListKey(account));
    }

    function getAccountPositionKeys(DataStore dataStore, address account, uint256 start, uint256 end) internal view returns (bytes32[] memory) {
        return dataStore.getBytes32ValuesAt(Keys.accountPositionListKey(account), start, end);
    } */
}
