// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "forge-std/Test.sol";

/**
 * @dev Utility library for GMX test helpers
 * Contains shared functionality for loading deployed contracts
 */
library TestHelpers {
    /**
     * @dev Loads deployed contract address from localhost deployments
     * @param vm The VM instance from the test contract
     * @param contractName Name of the contract (matches deployment JSON filename)
     * @return address The deployed contract address
     */
    function loadDeploymentAddress(Vm vm, string memory contractName) internal view returns (address) {
        string memory deploymentPath = string.concat("./deployments/localhost/", contractName, ".json");
        string memory json = vm.readFile(deploymentPath);

        address contractAddress = vm.parseJsonAddress(json, ".address");
        require(contractAddress != address(0), string.concat("Failed to load address for ", contractName));
        console.log("Loaded %s at: %s", contractName, contractAddress);

        return contractAddress;
    }
}
