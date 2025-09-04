// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

// Minimal interfaces for the deployed contracts
interface IMultichainTransferRouter {
    function multichainProvider() external view returns (address);
    function dataStore() external view returns (address);
}

interface ILayerZeroProvider {
    function dataStore() external view returns (address);
}

interface IDataStore {
    function getUint(bytes32 key) external view returns (uint256);
    function getAddress(bytes32 key) external view returns (address);
    function getBool(bytes32 key) external view returns (bool);
    function getBytes32Count(bytes32 key) external view returns (uint256);
}

/**
 * @title SetupTest
 * @dev Echidna test contract for testing deployed GMX Synthetics contracts
 * echidna . --contract SetupTest --config echidna.yaml
 */
contract SetupTest {
    // Deployed contracts from local Ganache chain
    IMultichainTransferRouter public multichainTransferRouter = IMultichainTransferRouter(0x9E5840E127A2d8ae5dd619FdafBD6E1A2CddeEB9);
    ILayerZeroProvider public layerZeroProvider = ILayerZeroProvider(payable(0x3E809c563c15a295E832e37053798DdC8d6C8dab));

    // Cached references for commonly accessed contracts
    IDataStore public dataStore;

    constructor() {
        // Cache the dataStore reference
        dataStore = IDataStore(multichainTransferRouter.dataStore());
    }

    // ============ Assertion Tests ============

    // Invariant: MultichainTransferRouter.multichainProvider() should equal LayerZeroProvider address
    function test_provider_consistency() public view {
        assert(address(multichainTransferRouter.multichainProvider()) == address(layerZeroProvider));
    }

    // Invariant: Both contracts should have the same non-zero dataStore
    function test_datastore_consistency() public view {
        address routerDataStore = multichainTransferRouter.dataStore();
        address providerDataStore = layerZeroProvider.dataStore();
        assert(routerDataStore != address(0) && routerDataStore == providerDataStore);
    }

    // Additional assertion test for basic setup
    function test_setup_valid() public view {
        assert(address(dataStore) != address(0));
        assert(address(layerZeroProvider) != address(0));
        assert(address(multichainTransferRouter) != address(0));
        assert(address(multichainTransferRouter) != address(layerZeroProvider));
    }

    // ============ Fuzz Test Functions ============

    // Test reading various data types from DataStore
    function test_datastore_reads(bytes32 key) external view {
        try dataStore.getUint(key) returns (uint256) {assert(true);} catch {assert(false);}
        try dataStore.getAddress(key) returns (address) {assert(true);} catch {assert(false);}
        try dataStore.getBool(key) returns (bool) {assert(true);} catch {assert(false);}
        try dataStore.getBytes32Count(key) returns (uint256) {assert(true);} catch {assert(false);}
    }
}
