// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../contracts/data/DataStore.sol";
import "../../contracts/multichain/IMultichainProvider.sol";

// TODO: fix echidna error "unlinked libraries detected in bytecode, in /contracts/callback/CallbackUtils.sol:CallbackUtils" and use direct import
// import "../../contracts/multichain/MultichainTransferRouter.sol";
interface MultichainTransferRouter {
    function multichainProvider() external view returns (IMultichainProvider);
}

/**
 * @title SetupTest
 * @dev Echidna test contract for testing deployed GMX Synthetics contracts
 * echidna test/echidna --contract SetupTest --config test/echidna/echidna.yaml
 */
contract SetupTest {
    // Deployed contracts from local Ganache chain
    DataStore public dataStore = DataStore(0x07f96Aa816C1F244CbC6ef114bB2b023Ba54a2EB);
    IMultichainProvider public layerZeroProvider = IMultichainProvider(payable(0x3E809c563c15a295E832e37053798DdC8d6C8dab));
    MultichainTransferRouter public multichainTransferRouter = MultichainTransferRouter(0x9E5840E127A2d8ae5dd619FdafBD6E1A2CddeEB9);


    // ============ Fuzz Test Functions ============

    // Test reading various data types from DataStore
    function test_datastore_reads(bytes32 key) external view {
        try dataStore.getUint(key) returns (uint256) {assert(true);} catch {assert(false);}
        try dataStore.getAddress(key) returns (address) {assert(true);} catch {assert(false);}
        try dataStore.getBool(key) returns (bool) {assert(true);} catch {assert(false);}
    }


    // ============ Assertion Tests ============

    // Invariant: MultichainTransferRouter.multichainProvider() should equal LayerZeroProvider address
    function test_provider_is_initialized() public view {
        assert(address(multichainTransferRouter.multichainProvider()) == address(layerZeroProvider));
    }

    // Additional assertion test for basic setup
    function test_setup_valid() public view {
        assert(address(dataStore) != address(0));
        assert(address(layerZeroProvider) != address(0));
        assert(address(multichainTransferRouter) != address(0));
        assert(address(multichainTransferRouter) != address(layerZeroProvider));
    }
}
