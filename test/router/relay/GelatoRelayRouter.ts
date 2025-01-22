import { expect } from "chai";
import { impersonateAccount, stopImpersonatingAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../../utils/math";
import { logGasUsage } from "../../../utils/gas";
import { hashString } from "../../../utils/hash";
import { OrderType, DecreasePositionSwapType, getOrderKeys } from "../../../utils/order";

describe("GelatoRelayRouter", () => {
  let fixture;
  let user0, user1, user2;
  let reader, dataStore, router, gelatoRelayRouter, ethUsdMarket, wnt, usdc;
  const executionFee = expandDecimals(1, 18);

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2 } = fixture.accounts);
    ({ reader, dataStore, router, gelatoRelayRouter, ethUsdMarket, wnt, usdc } = fixture.contracts);
  });

  it("createOrder", async () => {
    const referralCode = hashString("referralCode");
    await usdc.mint(user0.address, expandDecimals(50 * 1000, 6));
    await usdc.connect(user0).approve(router.address, expandDecimals(50 * 1000, 6));
    const relayParams = {
      oracleParams: {
        tokens: [],
        providers: [],
        data: [],
      },
      tokenPermits: [],
      fee: {
        feeToken: wnt.address,
        feeAmount: expandDecimals(2, 15), // 0.001 ETH
        feeSwapPath: [],
      },
    };
    const params = {
      addresses: {
        receiver: user0.address,
        cancellationReceiver: user0.address,
        callbackContract: user1.address,
        uiFeeReceiver: user2.address,
        market: ethUsdMarket.marketToken,
        initialCollateralToken: ethUsdMarket.longToken,
        swapPath: [ethUsdMarket.marketToken],
      },
      numbers: {
        sizeDeltaUsd: decimalToFloat(1000),
        initialCollateralDeltaAmount: 0,
        triggerPrice: decimalToFloat(4800),
        acceptablePrice: decimalToFloat(4900),
        executionFee,
        callbackGasLimit: "200000",
        minOutputAmount: 700,
        validFromTime: 0,
      },
      orderType: OrderType.LimitIncrease,
      decreasePositionSwapType: DecreasePositionSwapType.SwapCollateralTokenToPnlToken,
      isLong: true,
      shouldUnwrapNativeToken: true,
      referralCode,
    };

    const types = {
      CreateOrder: [
        { name: "collateralDeltaAmount", type: "uint256" },
        { name: "addresses", type: "CreateOrderAddresses" },
        { name: "numbers", type: "CreateOrderNumbers" },
        { name: "orderType", type: "uint256" },
        { name: "isLong", type: "bool" },
        { name: "shouldUnwrapNativeToken", type: "bool" },
        { name: "autoCancel", type: "bool" },
        { name: "referralCode", type: "bytes32" },
        { name: "userNonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "relayParams", type: "bytes32" },
      ],
      CreateOrderAddresses: [
        { name: "receiver", type: "address" },
        { name: "cancellationReceiver", type: "address" },
        { name: "callbackContract", type: "address" },
        { name: "uiFeeReceiver", type: "address" },
        { name: "market", type: "address" },
        { name: "initialCollateralToken", type: "address" },
        { name: "swapPath", type: "address[]" },
      ],
      CreateOrderNumbers: [
        { name: "sizeDeltaUsd", type: "uint256" },
        { name: "initialCollateralDeltaAmount", type: "uint256" },
        { name: "triggerPrice", type: "uint256" },
        { name: "acceptablePrice", type: "uint256" },
        { name: "executionFee", type: "uint256" },
        { name: "callbackGasLimit", type: "uint256" },
        { name: "minOutputAmount", type: "uint256" },
        { name: "validFromTime", type: "uint256" },
      ],
    };

    const chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);
    const domain = {
      name: "GmxBaseGelatoRelayRouter",
      version: "1",
      chainId,
      verifyingContract: gelatoRelayRouter.address,
    };
    const relayParamsHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        [
          "tuple(tuple(address[] tokens, address[] providers, bytes[] data) oracleParams, tuple(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s, address token)[] tokenPermits, tuple(address feeToken, uint256 feeAmount, address[] feeSwapPath) fee)",
        ],
        [relayParams]
      )
    );

    const collateralDeltaAmount = expandDecimals(1, 17); // 0.1 ETH
    const deadline = 0;
    const userNonce = 0;
    const typedData = {
      collateralDeltaAmount: collateralDeltaAmount,
      addresses: params.addresses,
      numbers: params.numbers,
      orderType: params.orderType,
      isLong: params.isLong,
      shouldUnwrapNativeToken: params.shouldUnwrapNativeToken,
      autoCancel: false,
      referralCode: params.referralCode,
      userNonce,
      deadline,
      relayParams: relayParamsHash,
    };
    const signature = await user0._signTypedData(domain, types, typedData);

    const gelatoRelayAddress = "0xcd565435e0d2109feFde337a66491541Df0D1420";
    await impersonateAccount(gelatoRelayAddress);
    await setBalance(gelatoRelayAddress, expandDecimals(100, 18));
    const gelatoRelaySigner = await hre.ethers.getSigner(gelatoRelayAddress);

    const createOrderCalldata = gelatoRelayRouter.interface.encodeFunctionData("createOrder", [
      relayParams,
      collateralDeltaAmount,
      user0.address,
      params,
      signature,
      userNonce,
      deadline,
    ]);
    const calldata = ethers.utils.solidityPack(
      ["bytes", "address", "address", "uint256"],
      [createOrderCalldata, gelatoRelayAddress, wnt.address, expandDecimals(1, 15)]
    );

    await wnt.connect(user0).deposit({ value: expandDecimals(1, 18) });
    await wnt.connect(user0).approve(router.address, expandDecimals(1, 18));

    const tx = await gelatoRelaySigner.sendTransaction({
      to: gelatoRelayRouter.address,
      data: calldata,
    });

    const orderKeys = await getOrderKeys(dataStore, 0, 1);
    const order = await reader.getOrder(dataStore.address, orderKeys[0]);

    expect(order.addresses.account).eq(user0.address);
    expect(order.addresses.receiver).eq(user0.address);
    expect(order.addresses.callbackContract).eq(user1.address);
    expect(order.addresses.market).eq(ethUsdMarket.marketToken);
    expect(order.addresses.initialCollateralToken).eq(ethUsdMarket.longToken);
    expect(order.addresses.swapPath).deep.eq([ethUsdMarket.marketToken]);
    expect(order.numbers.orderType).eq(OrderType.LimitIncrease);
    expect(order.numbers.decreasePositionSwapType).eq(DecreasePositionSwapType.SwapCollateralTokenToPnlToken);
    expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(1000));
    expect(order.numbers.initialCollateralDeltaAmount).eq(collateralDeltaAmount);
    expect(order.numbers.triggerPrice).eq(decimalToFloat(4800));
    expect(order.numbers.acceptablePrice).eq(decimalToFloat(4900));
    expect(order.numbers.executionFee).eq(expandDecimals(1, 15));
    expect(order.numbers.callbackGasLimit).eq("200000");
    expect(order.numbers.minOutputAmount).eq(700);

    expect(order.flags.isLong).eq(true);
    expect(order.flags.shouldUnwrapNativeToken).eq(true);
    expect(order.flags.isFrozen).eq(false);

    await stopImpersonatingAccount(gelatoRelayAddress);

    await logGasUsage({
      tx,
      label: "gelatoRelayRouter.createOrder",
    });
  });
});
