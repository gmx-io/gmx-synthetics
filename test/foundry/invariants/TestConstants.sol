// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

/**
 * @dev Constants used across GMX invariant tests
 * Centralizes configuration to avoid duplication and make updates easier
 */
library TestConstants {
    /// @dev URL for connecting to local anvil node
    string constant FORK_URL = "http://127.0.0.1:8545";

    /// @dev Default anvil deployer address (first account in anvil's default accounts)
    /// This address has all roles in localhost deployment configurations
    address constant DEPLOYER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    /// @dev Common test user addresses for consistency across tests
    address constant USER_1 = 0x0000000000000000000000000000000000001111;
    address constant USER_2 = 0x0000000000000000000000000000000000002222;
    address constant USER_3 = 0x0000000000000000000000000000000000003333;

    /// @dev Standard token amounts for testing
    uint256 constant ETH_AMOUNT_FOR_GAS = 1 ether;
    uint256 constant WETH_AMOUNT = 1 ether;
    uint256 constant USDC_AMOUNT = 5000 * 10 ** 6; // 5000 USDC
    uint256 constant EXECUTION_FEE = 0.001 ether;
}
