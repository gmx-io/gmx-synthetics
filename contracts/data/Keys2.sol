// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

// @title Keys2
// @dev Additional keys for values in the DataStore
library Keys2 {
    // @dev key for MultichainReader read channel
    bytes32 public constant MULTICHAIN_READ_CHANNEL = keccak256(abi.encode("MULTICHAIN_READ_CHANNEL"));
    // @dev key for MultichainReader read channel to peer mapping
    bytes32 public constant MULTICHAIN_PEERS = keccak256(abi.encode("MULTICHAIN_PEERS"));
    // @dev key for MultichainReader number of confirmations to wait for finality
    bytes32 public constant MULTICHAIN_CONFIRMATIONS = keccak256(abi.encode("MULTICHAIN_CONFIRMATIONS"));
    // @dev key for MultichainReader guid to originator mapping
    bytes32 public constant MULTICHAIN_GUID_TO_ORIGINATOR = keccak256(abi.encode("MULTICHAIN_GUID_TO_ORIGINATOR"));
    // @dev key for MultichainReader authorized originators
    bytes32 public constant MULTICHAIN_AUTHORIZED_ORIGINATORS = keccak256(abi.encode("MULTICHAIN_AUTHORIZED_ORIGINATORS"));

    // @dev key for FeeDistributor day of the week (0 = Sunday, 6 = Saturday)
    bytes32 public constant FEE_DISTRIBUTOR_DISTRIBUTION_DAY = keccak256(abi.encode("FEE_DISTRIBUTOR_DISTRIBUTION_DAY"));
    // @dev key for FeeDistributor timestamp that the last distribution was completed
    bytes32 public constant FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP = keccak256(abi.encode("FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP"));
    // @dev key for the fee distribution state
    bytes32 public constant FEE_DISTRIBUTOR_STATE = keccak256(abi.encode("FEE_DISTRIBUTOR_STATE"));
    // @dev key for FeeDistributor max read response delay in seconds from MultichainReader
    bytes32 public constant FEE_DISTRIBUTOR_MAX_READ_RESPONSE_DELAY = keccak256(abi.encode("FEE_DISTRIBUTOR_MAX_READ_RESPONSE_DELAY"));
    // @dev key for FeeDistributor gas limit used for the MultichainReader read request
    bytes32 public constant FEE_DISTRIBUTOR_GAS_LIMIT = keccak256(abi.encode("FEE_DISTRIBUTOR_GAS_LIMIT"));
    // @dev key for FeeDistributor chain ID
    bytes32 public constant FEE_DISTRIBUTOR_CHAIN_ID = keccak256(abi.encode("FEE_DISTRIBUTOR_CHAIN_ID"));
    // @dev key for FeeDistributor GMX fee amount for a given chain
    bytes32 public constant FEE_DISTRIBUTOR_FEE_AMOUNT_GMX = keccak256(abi.encode("FEE_DISTRIBUTOR_FEE_AMOUNT_GMX"));
    // @dev key FeeDistributor total GMX fee amount for all chains combined
    bytes32 public constant FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX = keccak256(abi.encode("FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX"));
    // @dev key for FeeDistributor staked GMX for a given chain
    bytes32 public constant FEE_DISTRIBUTOR_STAKED_GMX = keccak256(abi.encode("FEE_DISTRIBUTOR_STAKED_GMX"));
    // @dev key FeeDistributor total staked GMX for all chains combined
    bytes32 public constant FEE_DISTRIBUTOR_TOTAL_STAKED_GMX = keccak256(abi.encode("FEE_DISTRIBUTOR_TOTAL_STAKED_GMX"));
    // @dev key for FeeDistributor bridging slippage factor
    bytes32 public constant FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_FACTOR = keccak256(abi.encode("FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_FACTOR"));
    // @dev key for FeeDistributor read response timestamp
    bytes32 public constant FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP = keccak256(abi.encode("FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP"));
    // @dev key for FeeDistributor LayerZero version of chainId
    bytes32 public constant FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID = keccak256(abi.encode("FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID"));
    // @dev key for contract and keeper addresses stored used in FeeDistributor
    bytes32 public constant FEE_DISTRIBUTOR_ADDRESS_INFO = keccak256(abi.encode("FEE_DISTRIBUTOR_ADDRESS_INFO"));
    // @dev key for contract and keeper addresses stored by chain used in FeeDistributor
    bytes32 public constant FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN = keccak256(abi.encode("FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN"));
    // @dev key for FeeDistributor keeper costs
    bytes32 public constant FEE_DISTRIBUTOR_KEEPER_COSTS = keccak256(abi.encode("FEE_DISTRIBUTOR_KEEPER_COSTS"));
    // @dev key for FeeDistributor chainlink factor used to determine total chainlink fees paid
    bytes32 public constant FEE_DISTRIBUTOR_CHAINLINK_FACTOR = keccak256(abi.encode("FEE_DISTRIBUTOR_CHAINLINK_FACTOR"));
    // @dev key for max secondaryFeeToken amount from treasury to cover keeper costs
    bytes32 public constant FEE_DISTRIBUTOR_MAX_FEE_AMOUNT_FROM_TREASURY = keccak256(abi.encode("FEE_DISTRIBUTOR_MAX_FEE_AMOUNT_FROM_TREASURY"));
    // @dev key for whether or not weekly fees should be distributed
    bytes32 public constant FEE_DISTRIBUTOR_DISTRIBUTE_FEES = keccak256(abi.encode("FEE_DISTRIBUTOR_DISTRIBUTE_FEES"));
    // @dev key for the FeeDistributor snapshot epoch for a given chain
    bytes32 public constant FEE_DISTRIBUTOR_SNAPSHOT_EPOCH = keccak256(abi.encode("FEE_DISTRIBUTOR_SNAPSHOT_EPOCH"));
    // @dev key for the FeeDistributor committed snapshot GMX fee amount for a given chain
    bytes32 public constant FEE_DISTRIBUTOR_SNAPSHOT_FEE_AMOUNT_GMX = keccak256(abi.encode("FEE_DISTRIBUTOR_SNAPSHOT_FEE_AMOUNT_GMX"));
    // @dev key for the FeeDistributor committed snapshot staked GMX for a given chain
    bytes32 public constant FEE_DISTRIBUTOR_SNAPSHOT_STAKED_GMX = keccak256(abi.encode("FEE_DISTRIBUTOR_SNAPSHOT_STAKED_GMX"));
    // @dev key for FeeDistributor withdrawable GMX amount at the time of the snapshot
    bytes32 public constant FEE_DISTRIBUTOR_SNAPSHOT_WITHDRAWABLE_GMX = keccak256(abi.encode("FEE_DISTRIBUTOR_SNAPSHOT_WITHDRAWABLE_GMX"));
    // @dev key for FeeDistributor GMX that became withdrawable after the GMX fee amount was snapshotted
    bytes32 public constant FEE_DISTRIBUTOR_POST_SNAPSHOT_FEE_AMOUNT_GMX = keccak256(abi.encode("FEE_DISTRIBUTOR_POST_SNAPSHOT_FEE_AMOUNT_GMX"));
    // @dev key for the expected LZRead response guid for the in-progress distribution
    bytes32 public constant FEE_DISTRIBUTOR_EXPECTED_READ_GUID = keccak256(abi.encode("FEE_DISTRIBUTOR_EXPECTED_READ_GUID"));
    // @dev key for the expected hash of the chain id list for the in-progress read
    bytes32 public constant FEE_DISTRIBUTOR_EXPECTED_CHAIN_IDS_HASH = keccak256(abi.encode("FEE_DISTRIBUTOR_EXPECTED_CHAIN_IDS_HASH"));
    // @dev key for the timestamp of the last distribution state transition
    bytes32 public constant FEE_DISTRIBUTOR_STATE_UPDATED_AT = keccak256(abi.encode("FEE_DISTRIBUTOR_STATE_UPDATED_AT"));
    // @dev key for the period after the read response after which a bridged GMX shortfall is tolerated,
    // must be configured below FEE_DISTRIBUTOR_MAX_READ_RESPONSE_DELAY for the tolerance to be reachable
    bytes32 public constant FEE_DISTRIBUTOR_BRIDGE_GRACE_PERIOD = keccak256(abi.encode("FEE_DISTRIBUTOR_BRIDGE_GRACE_PERIOD"));
    // @dev key for the minimum factor of the required GMX amount below which a shortfall is not tolerated
    bytes32 public constant FEE_DISTRIBUTOR_MIN_BRIDGED_FACTOR = keccak256(abi.encode("FEE_DISTRIBUTOR_MIN_BRIDGED_FACTOR"));

    // @dev key for CreReceiver authorized workflow IDs
    bytes32 public constant CRE_RECEIVER_AUTHORIZED_WORKFLOW_IDS = keccak256(abi.encode("CRE_RECEIVER_AUTHORIZED_WORKFLOW_IDS"));

    // @dev key for the multichain peers mapping (peer address stored as bytes32)
    // @param readChannel the readChannel for which to retrieve the respective peer
    // @return key for multichain peers
    function multichainPeersKey(uint32 readChannel) internal pure returns (bytes32) {
        return keccak256(abi.encode(MULTICHAIN_PEERS, readChannel));
    }

    // @dev key for the multichain number of confirmations
    // @param eid the endpoint id for which to retrieve the number of confirmations
    // @return key for multichain confirmations
    function multichainConfirmationsKey(uint32 eid) internal pure returns (bytes32) {
        return keccak256(abi.encode(MULTICHAIN_CONFIRMATIONS, eid));
    }

    // @dev key for the multichain guid to originator mapping
    // @param guid the guid for which to retrieve the originator address
    // @return key for multichain guid to originator
    function multichainGuidToOriginatorKey(bytes32 guid) internal pure returns (bytes32) {
        return keccak256(abi.encode(MULTICHAIN_GUID_TO_ORIGINATOR, guid));
    }

    // @dev key for the multichain authorized originators
    // @param originator the originator address to validate if authorized
    // @return key for multichain authorized originators
    function multichainAuthorizedOriginatorsKey(address originator) internal pure returns (bytes32) {
        return keccak256(abi.encode(MULTICHAIN_AUTHORIZED_ORIGINATORS, originator));
    }

    // @dev key for the FeeDistributor fee amount gmx
    // @param chainId the chainId for which to retrieve fee amount gmx
    // @return key for FeeDistributor fee amount gmx
    function feeDistributorFeeAmountGmxKey(uint256 chainId) internal pure returns (bytes32) {
        return keccak256(abi.encode(FEE_DISTRIBUTOR_FEE_AMOUNT_GMX, chainId));
    }

    // @dev key for the FeeDistributor staked gmx
    // @param chainId the chainId for which to retrieve total staked
    // @return key for FeeDistributor staked gmx
    function feeDistributorStakedGmxKey(uint256 chainId) internal pure returns (bytes32) {
        return keccak256(abi.encode(FEE_DISTRIBUTOR_STAKED_GMX, chainId));
    }

    // @dev key for the FeeDistributor snapshot epoch
    // @param chainId the chainId for which to retrieve the snapshot epoch
    // @return key for FeeDistributor snapshot epoch
    function feeDistributorSnapshotEpochKey(uint256 chainId) internal pure returns (bytes32) {
        return keccak256(abi.encode(FEE_DISTRIBUTOR_SNAPSHOT_EPOCH, chainId));
    }

    // @dev key for the FeeDistributor committed snapshot gmx fee amount
    // @param chainId the chainId for which to retrieve the snapshot fee amount
    // @return key for FeeDistributor snapshot gmx fee amount
    function feeDistributorSnapshotFeeAmountGmxKey(uint256 chainId) internal pure returns (bytes32) {
        return keccak256(abi.encode(FEE_DISTRIBUTOR_SNAPSHOT_FEE_AMOUNT_GMX, chainId));
    }

    // @dev key for the FeeDistributor committed snapshot staked gmx
    // @param chainId the chainId for which to retrieve the snapshot staked gmx
    // @return key for FeeDistributor snapshot staked gmx
    function feeDistributorSnapshotStakedGmxKey(uint256 chainId) internal pure returns (bytes32) {
        return keccak256(abi.encode(FEE_DISTRIBUTOR_SNAPSHOT_STAKED_GMX, chainId));
    }

    // @dev key for the FeeDistributor bridging slippage factor
    // @param chainId the chainId for which to retrieve max slippage
    // @return key for FeeDistributor bridging slippage factor
    function feeDistributorBridgeSlippageFactorKey(uint256 chainId) internal pure returns (bytes32) {
        return keccak256(abi.encode(FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_FACTOR, chainId));
    }

    // @dev key for FeeDistributor LayerZero version of chainId
    // @param chainId the chainId for the chain
    // @return key for FeeDistributor LayerZero chainId
    function feeDistributorLayerZeroChainIdKey(uint256 chainId) internal pure returns (bytes32) {
        return keccak256(abi.encode(FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID, chainId));
    }

    // @dev key for contract and keeper addresses used in FeeDistributor
    // @param addressName bytes32 representing the address to be retrieved
    // @return key for contract and keeper addresses used in FeeDistributor
    function feeDistributorAddressInfoKey(bytes32 addressName) internal pure returns (bytes32) {
        return keccak256(abi.encode(FEE_DISTRIBUTOR_ADDRESS_INFO, addressName));
    }

    // @dev key for contract and keeper addresses used in FeeDistributor stored by chain
    // @param chainId the chainId for the chain
    // @param addressName bytes32 representing the address to be retrieved
    // @return key for contract and keeper addresses used in FeeDistributor stored by chain
    function feeDistributorAddressInfoForChainKey(uint256 chainId, bytes32 addressName) internal pure returns (bytes32) {
        return keccak256(abi.encode(FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN, chainId, addressName));
    }

    // @dev key for CreReceiver authorized workflow IDs
    // @param workflowId the workflow ID to validate if authorized
    // @return key for CreReceiver authorized workflow IDs
    function creReceiverAuthorizedWorkflowIdsKey(bytes32 workflowId) internal pure returns (bytes32) {
        return keccak256(abi.encode(CRE_RECEIVER_AUTHORIZED_WORKFLOW_IDS, workflowId));
    }
}
