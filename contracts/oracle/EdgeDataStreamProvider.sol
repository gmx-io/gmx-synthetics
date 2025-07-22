// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "./IOracleProvider.sol";
import "./IChainlinkDataStreamVerifier.sol";
import "../utils/Precision.sol";
import "../chain/Chain.sol";
import "./EdgeDataStreamVerifier.sol";

contract EdgeDataStreamProvider is IOracleProvider {

    DataStore public immutable dataStore;
    address public immutable oracle;
    EdgeDataStreamVerifier public immutable verifier;

    modifier onlyOracle() {
        if (msg.sender != oracle) {
            revert Errors.Unauthorized(msg.sender, "Oracle");
        }
        _;
    }

    constructor(
        DataStore _dataStore,
        address _oracle,
        EdgeDataStreamVerifier _verifier
    ) {
        dataStore = _dataStore;
        oracle = _oracle;
        verifier = _verifier;
    }

    function shouldAdjustTimestamp() external pure returns (bool) {
        return true;
    }

    function isChainlinkOnChainProvider() external pure returns (bool) {
        return false;
    }

    function getOraclePrice(
        address token,
        bytes memory data
    ) external view onlyOracle returns (OracleUtils.ValidatedPrice memory) {

        bytes32 feedId = dataStore.getBytes32(Keys.edgeDataStreamIdKey(token));
        if (feedId == bytes32(0)) {
            revert Errors.EmptyDataStreamFeedId(token);
        }

        EdgeDataStreamVerifier.Report memory report = verifier.verifyData(data);

        if (feedId != report.feedId) {
            revert Errors.InvalidDataStreamFeedId(token, report.feedId, feedId);
        }

        if (report.bid == 0 || report.ask == 0) {
            revert Errors.InvalidEdgeDataStreamBidAsk(token, report.bid, report.ask);
        }

        if (report.bid > report.ask) {
            revert Errors.InvalidEdgeDataStreamPrices(token, report.bid, report.ask);
        }

        // @dev converting edge price feed price to the price of the 1 unit of the token represented with 30 decimals
        // e.g. WETH has 18 decimals and price of 3000 USD per WETH.
        // So oracle price decimals should be 30 - 18 = 10 ^ 12
        // Note that report.expo is a negative value
        // With edge price being negative we get formula: edgePrice * 10 ^ (30 - 18 - 8)
        // dataStore decimals instead of token.decimals is used here because token can be synthetic
        uint256 tokenDecimals = dataStore.getUint(Keys.edgeDataStreamTokenDecimalsKey(token));
        int256 floatMultiplier = int256(30) - int256(tokenDecimals) + report.expo;
        if (floatMultiplier < 0) {
            revert Errors.InvalidEdgeDataStreamExpo(report.expo);
        }
        uint256 adjustedBidPrice = report.bid * 10 ** (uint256(floatMultiplier));
        uint256 adjustedAskPrice = report.ask * 10 ** (uint256(floatMultiplier));

        return OracleUtils.ValidatedPrice({
            token: token,
            min: adjustedBidPrice,
            max: adjustedAskPrice,
            timestamp: report.timestamp,
            provider: address(this)
        });
    }
}
