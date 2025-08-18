// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../../../contracts/token/IWNT.sol";
import "../../../contracts/mock/MintableToken.sol";
import "./TestConstants.sol";

/**
 * @dev Utility library for GMX test helpers
 * Contains shared functionality for loading deployed contracts
 */
library TestHelpers {
    /// Loads deployed contract address from localhost deployments
    function loadDeploymentAddress(Vm vm, string memory contractName) internal view returns (address) {
        string memory deploymentPath = string.concat("./deployments/localhost/", contractName, ".json");
        string memory json = vm.readFile(deploymentPath);

        address contractAddress = vm.parseJsonAddress(json, ".address");
        require(contractAddress != address(0), string.concat("Failed to load address for ", contractName));
        console.log("Loaded %s at: %s", contractName, contractAddress);

        return contractAddress;
    }

    /// Sets up funds for a user address by minting WETH and USDC
    function setupFunds(
        Vm vm,
        address user,
        address weth,
        MintableToken usdc,
        uint256 wethAmount,
        uint256 usdcAmount
    ) internal {
        // Mint WETH to user (includes execution fee and gas)
        vm.deal(user, wethAmount + TestConstants.EXECUTION_FEE + TestConstants.ETH_AMOUNT_FOR_GAS);
        vm.prank(user);
        IWNT(weth).deposit{ value: wethAmount }();

        // Mint USDC to user
        vm.prank(TestConstants.DEPLOYER);
        usdc.mint(user, usdcAmount);
    }
}
