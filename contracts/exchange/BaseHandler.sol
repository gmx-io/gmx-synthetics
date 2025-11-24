// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../event/EventEmitter.sol";
import "../oracle/IOracle.sol";
import "../oracle/OracleModule.sol";
import "../role/RoleModule.sol";
import "../utils/GlobalReentrancyGuard.sol";
import "../data/DataStoreClient.sol";
import "../error/ErrorUtils.sol";
import "../feature/FeatureUtils.sol";
import "../chain/Chain.sol";

contract BaseHandler is RoleModule, DataStoreClient, GlobalReentrancyGuard, OracleModule {
    EventEmitter public immutable eventEmitter;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter
    ) RoleModule(_roleStore) DataStoreClient(_dataStore) {
        eventEmitter = _eventEmitter;
    }

    receive() external payable {
        address wnt = _dataStore().getAddress(Keys.WNT);
        if (msg.sender != wnt) {
            revert Errors.InvalidNativeTokenSender(msg.sender);
        }
    }

    function validateRequestCancellation(
        uint256 createdAtTime,
        string memory requestType
    ) internal view {
        uint256 requestExpirationTime = _dataStore().getUint(Keys.REQUEST_EXPIRATION_TIME);
        uint256 requestAge = Chain.currentTimestamp() - createdAtTime;
        if (requestAge < requestExpirationTime) {
            revert Errors.RequestNotYetCancellable(requestAge, requestExpirationTime, requestType);
        }
    }

    function validateNonKeeperError(bytes4 errorSelector, bytes memory reasonBytes) internal pure {
        if (
            OracleUtils.isOracleError(errorSelector) ||
            errorSelector == Errors.DisabledFeature.selector ||
            errorSelector == Errors.InsufficientGasLeftForCallback.selector ||
            errorSelector == Errors.InsufficientGasForCancellation.selector ||
            errorSelector == Errors.InsufficientGasForAutoCancellation.selector
        ) {
            ErrorUtils.revertWithCustomError(reasonBytes);
        }
    }

    function validateDataListLength(uint256 dataLength) internal view {
        uint256 maxDataLength = _dataStore().getUint(Keys.MAX_DATA_LENGTH);
        if (dataLength > maxDataLength) {
            revert Errors.MaxDataListLengthExceeded(dataLength, maxDataLength);
        }
    }
}
