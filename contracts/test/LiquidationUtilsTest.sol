// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import "../../lib/forge-std/src/Test.sol";
import "../../contracts/liquidation/LiquidationUtils.sol";
import "../../contracts/data/DataStore.sol";
import "../../contracts/event/EventEmitter.sol";
import "../../contracts/position/PositionStoreUtils.sol";
import "../../contracts/order/OrderStoreUtils.sol";
import "../../contracts/position/Position.sol";
import "../../contracts/order/Order.sol";
import "../../contracts/role/Role.sol";
import "../../contracts/role/RoleStore.sol";

contract LiquidationUtilsTest is Test {
    DataStore public dataStore;
    EventEmitter public eventEmitter;
    address public account = address(0x123);
    address public market = address(0x456);
    address public collateralToken = address(0x789);
    bool public isLong = true;

    function setUp() public {
        RoleStore roleStore = new RoleStore();
        // RoleStore constructor assigns ROLE_ADMIN to msg.sender
        // Here, address(this) is used as admin and directly assigned the CONTROLLER role
        roleStore.grantRole(address(this), Role.CONTROLLER);
        dataStore = new DataStore(roleStore);
        eventEmitter = new EventEmitter(roleStore);
        // You can initialize mock data for Position and DataStore here as needed
    }

    function testCreateLiquidationOrder() public {
    // Preset Position data (in actual projects, mock or set according to PositionStoreUtils implementation)
    // Here is just an interface call demonstration
        bytes32 key = LiquidationUtils.createLiquidationOrder(
            dataStore,
            eventEmitter,
            account,
            market,
            collateralToken,
            isLong
        );
        assertTrue(key != bytes32(0), "Liquidation order key should not be zero");
    }

    function testCreateLiquidationOrderWithoutPermission() public {
    // Create a new RoleStore without CONTROLLER permission
        RoleStore roleStore = new RoleStore();
        DataStore ds = new DataStore(roleStore);
        EventEmitter ee = new EventEmitter(roleStore);
    // Do not assign CONTROLLER permission, call directly
        vm.expectRevert();
        LiquidationUtils.createLiquidationOrder(
            ds,
            ee,
            account,
            market,
            collateralToken,
            isLong
        );
    }
}
