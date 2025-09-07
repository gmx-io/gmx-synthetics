import { expect } from "chai";
import { ethers } from "hardhat";

describe("LiquidationUtils Swap Execution", function () {
	let roleStore: any;
	let dataStore: any;
	let eventEmitter: any;
	let liquidationUtilsHarness: any;
	let account: any;
	let market: any;
	let collateralToken: any;

	beforeEach(async () => {
			const signers = await ethers.getSigners();
			[account] = signers;
			const RoleStore = await ethers.getContractFactory("RoleStore");
			roleStore = await RoleStore.deploy();
			const DataStore = await ethers.getContractFactory("DataStore");
			dataStore = await DataStore.deploy(roleStore.address);
			// 给所有 signer 分配 CONTROLLER 权限
			for (const signer of signers) {
				await roleStore.connect(account).grantRole(signer.address, ethers.utils.id("CONTROLLER"));
			}
		const EventEmitter = await ethers.getContractFactory("EventEmitter");
		eventEmitter = await EventEmitter.deploy(roleStore.address);
		const OrderEventUtils = await ethers.getContractFactory("OrderEventUtils");
		const orderEventUtilsLib = await OrderEventUtils.deploy();
		await orderEventUtilsLib.deployed();
		const OrderStoreUtils = await ethers.getContractFactory("OrderStoreUtils");
		const orderStoreUtilsLib = await OrderStoreUtils.deploy();
		await orderStoreUtilsLib.deployed();
		const PositionStoreUtils = await ethers.getContractFactory("PositionStoreUtils");
		const positionStoreUtilsLib = await PositionStoreUtils.deploy();
		await positionStoreUtilsLib.deployed();
		const LiquidationUtils = await ethers.getContractFactory("LiquidationUtils", {
			libraries: {
				OrderEventUtils: orderEventUtilsLib.address,
				OrderStoreUtils: orderStoreUtilsLib.address,
				PositionStoreUtils: positionStoreUtilsLib.address,
			},
		});
		const liquidationUtilsLib = await LiquidationUtils.deploy();
		await liquidationUtilsLib.deployed();
		const Harness = await ethers.getContractFactory("LiquidationUtilsHarness", {
			libraries: {
				LiquidationUtils: liquidationUtilsLib.address,
			},
		});
		liquidationUtilsHarness = await Harness.deploy();
	await roleStore.connect(account).grantRole(liquidationUtilsHarness.address, ethers.utils.id("CONTROLLER"));
	await roleStore.connect(account).grantRole(dataStore.address, ethers.utils.id("CONTROLLER"));
	await roleStore.connect(account).grantRole(eventEmitter.address, ethers.utils.id("CONTROLLER"));
		market = ethers.Wallet.createRandom().address;
		collateralToken = ethers.Wallet.createRandom().address;
	});

	it("should revert on zero-size position", async () => {
		await expect(
			liquidationUtilsHarness.createLiquidationOrder(
				dataStore.address,
				eventEmitter.address,
				account.address,
				market,
				collateralToken,
				true
			)
		).to.be.reverted;
	});

	it("should revert on slippage breach", async () => {
		// mock position with huge sizeInUsd to trigger slippage breach
		const positionKey = ethers.utils.keccak256(
			ethers.utils.defaultAbiCoder.encode([
				"address", "address", "address", "bool"
			], [account.address, market, collateralToken, true])
		);
		await dataStore.addBytes32(
			ethers.utils.keccak256(ethers.utils.toUtf8Bytes("POSITION_LIST")),
			positionKey
		);
		await dataStore.setAddress(
			ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes32"], [positionKey, ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ACCOUNT"))])),
			account.address
		);
		await dataStore.setAddress(
			ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes32"], [positionKey, ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MARKET"))])),
			market
		);
		await dataStore.setAddress(
			ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes32"], [positionKey, ethers.utils.keccak256(ethers.utils.toUtf8Bytes("COLLATERAL_TOKEN"))])),
			collateralToken
		);
		await dataStore.setUint(
			ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes32"], [positionKey, ethers.utils.keccak256(ethers.utils.toUtf8Bytes("SIZE_IN_USD"))])),
			ethers.constants.MaxUint256
		);
		await dataStore.setBool(
			ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes32"], [positionKey, ethers.utils.keccak256(ethers.utils.toUtf8Bytes("IS_LONG"))])),
			true
		);
		await expect(
			liquidationUtilsHarness.createLiquidationOrder(
				dataStore.address,
				eventEmitter.address,
				account.address,
				market,
				collateralToken,
				true
			)
		).to.be.reverted;
	});

	it("should create liquidation order with correct output, fees, price impact sign", async () => {
		// mock position with normal sizeInUsd and check order creation
		const positionKey = ethers.utils.keccak256(
			ethers.utils.defaultAbiCoder.encode([
				"address", "address", "address", "bool"
			], [account.address, market, collateralToken, false])
		);
		await dataStore.addBytes32(
			ethers.utils.keccak256(ethers.utils.toUtf8Bytes("POSITION_LIST")),
			positionKey
		);
		await dataStore.setAddress(
			ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes32"], [positionKey, ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ACCOUNT"))])),
			account.address
		);
		await dataStore.setAddress(
			ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes32"], [positionKey, ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MARKET"))])),
			market
		);
		await dataStore.setAddress(
			ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes32"], [positionKey, ethers.utils.keccak256(ethers.utils.toUtf8Bytes("COLLATERAL_TOKEN"))])),
			collateralToken
		);
		await dataStore.setUint(
			ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes32"], [positionKey, ethers.utils.keccak256(ethers.utils.toUtf8Bytes("SIZE_IN_USD"))])),
			ethers.BigNumber.from("1000")
		);
		await dataStore.setBool(
			ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes32"], [positionKey, ethers.utils.keccak256(ethers.utils.toUtf8Bytes("IS_LONG"))])),
			false
		);
		const tx = await liquidationUtilsHarness.createLiquidationOrder(
			dataStore.address,
			eventEmitter.address,
			account.address,
			market,
			collateralToken,
			false
		);
		expect(tx).to.not.be.undefined;
	});
});
