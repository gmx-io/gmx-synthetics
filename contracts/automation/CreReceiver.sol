// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";

import "./IReceiver.sol";
import "../data/DataStore.sol";
import "../data/Keys2.sol";
import "../event/EventEmitter.sol";
import "../utils/Cast.sol";

contract CreReceiver is IReceiver, RoleModule {
    using Address for address;
    using EventUtils for EventUtils.BytesItems;

    DataStore internal immutable dataStore;
    EventEmitter internal immutable eventEmitter;

    constructor(RoleStore _roleStore, DataStore _dataStore, EventEmitter _eventEmitter) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
    }

    function onReport(bytes calldata metadata, bytes calldata report) external override onlyCreForwarder {
        (bytes32 workflowId, bytes10 workflowName, address workflowOwner) = _decodeMetadata(metadata);

        if (!roleStore.hasRole(workflowOwner, Role.CRE_KEEPER)) {
            revert Errors.UnauthorizedWorkflowOwner(workflowOwner);
        }

        if (!dataStore.getBool(Keys2.creReceiverAuthorizedWorkflowIdsKey(workflowId))) {
            revert Errors.UnauthorizedWorkflow(workflowId, workflowName, workflowOwner);
        }

        _processReport(report);

        EventUtils.EventLogData memory eventData;
        eventData.bytesItems.initItems(2);
        eventData.bytesItems.setItem(0, "metadata", metadata);
        eventData.bytesItems.setItem(1, "report", report);

        eventEmitter.emitEventLog2("CRE Workflow Executed", workflowId, Cast.toBytes32(workflowOwner), eventData);
    }

    /// @notice Extracts all metadata fields from the onReport metadata parameter
    /// @param metadata The metadata in bytes format
    /// @return workflowId The unique identifier of the workflow (bytes32)
    /// @return workflowName The name of the workflow (bytes10)
    /// @return workflowOwner The owner address of the workflow
    function _decodeMetadata(
        bytes memory metadata
    ) internal pure returns (bytes32 workflowId, bytes10 workflowName, address workflowOwner) {
        // Metadata structure:
        // - First 32 bytes: length of the byte array (standard for dynamic bytes)
        // - Offset 32, size 32: workflow_id (bytes32)
        // - Offset 64, size 10: workflow_name (bytes10)
        // - Offset 74, size 20: workflow_owner (address)
        assembly {
            workflowId := mload(add(metadata, 32))
            workflowName := mload(add(metadata, 64))
            workflowOwner := shr(mul(12, 8), mload(add(metadata, 74)))
        }
    }

    function _processReport(bytes calldata report) internal {
        (address target, bytes memory data) = abi.decode(report, (address, bytes));

        if (!target.isContract()) {
            revert Errors.InvalidCreReceiverTarget(target);
        }

        (bool success, bytes memory returndata) = target.call(data);

        if (!success) {
            revert Errors.CreReceiverCallFailed(returndata);
        }
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public pure override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
