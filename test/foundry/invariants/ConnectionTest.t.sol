// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../../../contracts/role/RoleStore.sol";
import "../../../contracts/role/Role.sol";
import "../../../contracts/multichain/MultichainTransferRouter.sol";

string constant FORK_URL = "http://127.0.0.1:8545";

/**
 * @dev Test that verifies contracts have been deployed and correctly configured to an anvil node using the hardhat deployment script.
 */
contract ConnectionTest is Test {
    address layerZeroProviderAddr;
    address multichainTransferRouterAddr;
    address roleStoreAddr;

    RoleStore roleStore;
    MultichainTransferRouter multichainTransferRouter;

    function setUp() public {
        // Create fork of the running Hardhat node at localhost:8545
        vm.createSelectFork(FORK_URL);

        roleStoreAddr = _loadDeploymentAddress("RoleStore");
        layerZeroProviderAddr = _loadDeploymentAddress("LayerZeroProvider");
        multichainTransferRouterAddr = _loadDeploymentAddress("MultichainTransferRouter");

        roleStore = RoleStore(roleStoreAddr);
        multichainTransferRouter = MultichainTransferRouter(multichainTransferRouterAddr);
    }

    function _loadDeploymentAddress(string memory contractName) internal view returns (address) {
        string memory deploymentPath = string.concat("./deployments/localhost/", contractName, ".json");
        string memory json = vm.readFile(deploymentPath);

        address contractAddress = vm.parseJsonAddress(json, ".address");
        require(contractAddress != address(0), string.concat("Failed to load address for ", contractName));
        console.log("Loaded %s at: %s", contractName, contractAddress);

        return contractAddress;
    }

    /// @dev Verify basic connection to Anvil node
    function testConnectionToAnvilNode() public {
        // Verify connection to a live node (block number > 0)
        assertTrue(block.number > 0, "Should be connected to live node");

        // Verify contracts exist (have code)
        assertTrue(layerZeroProviderAddr.code.length > 0, "LayerZeroProvider should have code");
        assertTrue(multichainTransferRouterAddr.code.length > 0, "MultichainTransferRouter should have code");
        assertTrue(roleStoreAddr.code.length > 0, "RoleStore should have code");
    }

    function testLayerZeroProviderHasControllerRole() public {
        // Check if LayerZeroProvider has CONTROLLER role
        bool hasControllerRole = roleStore.hasRole(layerZeroProviderAddr, Role.CONTROLLER);

        console.log("LayerZeroProvider has CONTROLLER role:", hasControllerRole);
        console.log("Role.CONTROLLER hash:", vm.toString(Role.CONTROLLER));

        assertTrue(hasControllerRole, "LayerZeroProvider should have CONTROLLER role");
    }

    /// @dev Verify MultichainTransferRouter.multichainProvider points to LayerZeroProvider
    function testMultichainTransferRouterConfiguration() public {
        address multichainProvider = address(multichainTransferRouter.multichainProvider());

        console.log("MultichainTransferRouter.multichainProvider:", multichainProvider);
        console.log("Expected LayerZeroProvider address:", layerZeroProviderAddr);

        assertEq(
            multichainProvider,
            layerZeroProviderAddr,
            "MultichainTransferRouter.multichainProvider should equal LayerZeroProvider address"
        );
    }

    /**
     * @dev Basic contract interactions
     */
    function testContractInteraction() public {
        uint256 roleCount = roleStore.getRoleCount();
        console.log("Total roles in system:", roleCount);
        assertTrue(roleCount > 0, "Should have at least one role");
    }
}
