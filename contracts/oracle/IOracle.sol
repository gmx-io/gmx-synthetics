// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../event/EventEmitter.sol";
import "./OracleUtils.sol";

interface IOracle {
    function minTimestamp() external view returns (uint256);
    function maxTimestamp() external view returns (uint256);
    function dataStore() external view returns (DataStore);
    function eventEmitter() external view returns (EventEmitter);

    function validateSequencerUp() external view;
    function setPrices(OracleUtils.SetPricesParams memory params) external;
    function setPricesForAtomicAction(OracleUtils.SetPricesParams memory params) external;
    function setPrimaryPrice(address token, Price.Props memory price) external;
    function setTimestamps(uint256 _minTimestamp, uint256 _maxTimestamp) external;
    function clearAllPrices() external;
    function getTokensWithPricesCount() external view returns (uint256);
    function getTokensWithPrices(uint256 start, uint256 end) external view returns (address[] memory);
    function getPrimaryPrice(address token) external view returns (Price.Props memory);
    function primaryPrices(address token) external view returns (uint256 min, uint256 max);
    function validatePrices(
        OracleUtils.SetPricesParams memory params,
        bool forAtomicAction
    ) external returns (OracleUtils.ValidatedPrice[] memory);
}
