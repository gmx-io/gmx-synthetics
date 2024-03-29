// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

import "../role/RoleModule.sol";

import "./OracleStore.sol";
import "./OracleUtils.sol";
import "./IPriceFeed.sol";
import "./IRealtimeFeedVerifier.sol";
import "./IOracleProvider.sol";
import "../price/Price.sol";

import "../chain/Chain.sol";
import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../event/EventEmitter.sol";
import "../event/EventUtils.sol";

import "../utils/Bits.sol";
import "../utils/Array.sol";
import "../utils/Precision.sol";
import "../utils/Cast.sol";
import "../utils/Uint256Mask.sol";

// @title Oracle
// @dev Contract to validate and store signed values
// Some calculations e.g. calculating the size in tokens for a position
// may not work with zero / negative prices
// as a result, zero / negative prices are considered empty / invalid
// A market may need to be manually settled in this case
contract Oracle is RoleModule {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableValues for EnumerableSet.AddressSet;
    using Price for Price.Props;
    using Uint256Mask for Uint256Mask.Mask;

    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    // tokensWithPrices stores the tokens with prices that have been set
    // this is used in clearAllPrices to help ensure that all token prices
    // set in setPrices are cleared after use
    EnumerableSet.AddressSet internal tokensWithPrices;
    mapping(address => Price.Props) public primaryPrices;

    constructor(RoleStore _roleStore) RoleModule(_roleStore) {}

    function setPrices(
        DataStore dataStore,
        EventEmitter eventEmitter,
        OracleUtils.SetPricesParams memory params
    ) external onlyController {
        if (tokensWithPrices.length() != 0) {
            revert Errors.NonEmptyTokensWithPrices(tokensWithPrices.length());
        }

        ValidatedPrice[] memory validatedPrices = _validatePrices(dataStore, params);

        _setPrices(
            dataStore,
            eventEmitter,
            validatedPrices
        );
    }

    // @dev set the primary price
    // @param token the token to set the price for
    // @param price the price value to set to
    function setPrimaryPrice(address token, Price.Props memory price) external onlyController {
        _setPrimaryPrice(token, price);
    }

    // @dev clear all prices
    function clearAllPrices() external onlyController {
        uint256 length = tokensWithPrices.length();
        for (uint256 i; i < length; i++) {
            address token = tokensWithPrices.at(0);
            _removePrimaryPrice(token);
        }
    }

    // @dev get the length of tokensWithPrices
    // @return the length of tokensWithPrices
    function getTokensWithPricesCount() external view returns (uint256) {
        return tokensWithPrices.length();
    }

    // @dev get the tokens of tokensWithPrices for the specified indexes
    // @param start the start index, the value for this index will be included
    // @param end the end index, the value for this index will not be included
    // @return the tokens of tokensWithPrices for the specified indexes
    function getTokensWithPrices(uint256 start, uint256 end) external view returns (address[] memory) {
        return tokensWithPrices.valuesAt(start, end);
    }

    // @dev get the primary price of a token
    // @param token the token to get the price for
    // @return the primary price of a token
    function getPrimaryPrice(address token) external view returns (Price.Props memory) {
        if (token == address(0)) { return Price.Props(0, 0); }

        Price.Props memory price = primaryPrices[token];
        if (price.isEmpty()) {
            revert Errors.EmptyPrimaryPrice(token);
        }

        return price;
    }

    function validatePrices(
        DataStore dataStore,
        OracleUtils.SetPricesParams memory params
    ) external onlyController returns (ValidatedPrice[] memory) {
        return _validatePrices(dataStore, params);
    }

    // @dev validate and set prices
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param params OracleUtils.SetPricesParams
    function _setPrices(
        DataStore dataStore,
        EventEmitter eventEmitter,
        ValidatedPrice[] memory validatePrices
    ) internal returns (ValidatedPrice[] memory) {
        for (uint256 i; i < validatedPrices.length; i++) {
            ValidatedPrice memory validatedPrice = validatedPrices[i];

            _setPrimaryPrice(validatedPrice.token, Price.Props(
                validatedPrice.min,
                validatedPrice.max
            ));

            _emitOraclePriceUpdated(
                eventEmitter,
                validatedPrice.token,
                validatedPrice.min,
                validatedPrice.max,
                validatedPrice.timestamp,
                validatedPrice.provider
            );
        }

        return validatedPrices;
    }

    function _validatePrices(
        DataStore dataStore,
        OracleUtils.SetPricesParams memory params
    ) internal view returns (ValidatedPrice[] memory) {
        if (params.tokens.length != params.providers.length) {
            revert InvalidOracleSetPricesProvidersParam(params.tokens.length, params.providers.length);
        }

        if (params.tokens.length != params.data.length) {
            revert InvalidOracleSetPricesDataParam(params.tokens.length, params.data.length);
        }

        OracleUtils.ValidatedPrice[] memory validatedPrices = new ValidatedPrice[](params.tokens.length);

        for (uint256 i; i < params.tokens.length; i++) {
            address token = params.tokens[i];
            address provider = params.providers[i];
            bytes data = params.data[i];

            // TODO: validate that provider is an approved provider contract
            // TODO: validate price relative to onchain feeds
            // TODO: adjust timestamp by delay

            OracleUtils.ValidatedPrice memory validatedPrice = IOracleProvider(provider).getOraclePrice(
                token,
                data
            );

            validatePrices[i] = validatedPrice;
        }

        // TODO: validate timestamps

        return validatedPrices;
    }

    function _validateRefPrice(
        address token,
        uint256 price,
        uint256 refPrice,
        uint256 maxRefPriceDeviationFactor
    ) internal pure {
        uint256 diff = Calc.diff(price, refPrice);
        uint256 diffFactor = Precision.toFactor(diff, refPrice);

        if (diffFactor > maxRefPriceDeviationFactor) {
            revert Errors.MaxRefPriceDeviationExceeded(
                token,
                price,
                refPrice,
                maxRefPriceDeviationFactor
            );
        }
    }

    function _setPrimaryPrice(address token, Price.Props memory price) internal {
        if (price.min > price.max) {
            revert Errors.InvalidMinMaxForPrice(token, price.min, price.max);
        }

        Price.Props memory existingPrice = primaryPrices[token];

        if (!existingPrice.isEmpty()) {
            revert Errors.PriceAlreadySet(token, existingPrice.min, existingPrice.max);
        }

        primaryPrices[token] = price;
        tokensWithPrices.add(token);
    }

    function _removePrimaryPrice(address token) internal {
        delete primaryPrices[token];
        tokensWithPrices.remove(token);
    }

    function _emitOraclePriceUpdated(
        EventEmitter eventEmitter,
        address token,
        uint256 minPrice,
        uint256 maxPrice,
        uint256 timestamp,
        address provider
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "token", token);
        eventData.addressItems.setItem(1, "provider", provider);

        eventData.uintItems.initItems(3);
        eventData.uintItems.setItem(0, "minPrice", minPrice);
        eventData.uintItems.setItem(1, "maxPrice", maxPrice);
        eventData.uintItems.setItem(2, "timestamp", timestamp);

        eventEmitter.emitEventLog1(
            "OraclePriceUpdate",
            Cast.toBytes32(token),
            eventData
        );
    }
}
