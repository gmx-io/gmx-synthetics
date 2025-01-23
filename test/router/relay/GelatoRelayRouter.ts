import { expect } from "chai";
import { impersonateAccount, stopImpersonatingAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../../utils/math";
import { logGasUsage } from "../../../utils/gas";
import { hashString } from "../../../utils/hash";
import { OrderType, DecreasePositionSwapType, getOrderKeys } from "../../../utils/order";
import { errorsContract } from "../../../utils/error";
import { expectBalance } from "../../../utils/validation";
import { BigNumberish } from "ethers";

const BAD_SIGNATURE =
  "0x122e3efab9b46c82dc38adf4ea6cd2c753b00f95c217a0e3a0f4dd110839f07a08eb29c1cc414d551349510e23a75219cd70c8b88515ed2b83bbd88216ffdb051f";
const GELATO_RELAY_ADDRESS = "0xcd565435e0d2109feFde337a66491541Df0D1420";

async function getTokenPermit(
  token: any,
  signer: any,
  spender: string,
  value: BigNumberish,
  nonce: BigNumberish,
  deadline: BigNumberish,
  chainId: BigNumberish
) {
  const permitSignature = await getPermitSignature(token, signer, spender, value, nonce, deadline, chainId);
  const { v, r, s } = ethers.utils.splitSignature(permitSignature);
  return {
    owner: signer.address,
    spender,
    value,
    deadline,
    v,
    r,
    s,
    token: token.address,
  };
}

async function getCreateOrderSignature({
  signer,
  relayParams,
  collateralDeltaAmount,
  verifyingContract,
  params,
  deadline,
  userNonce,
  chainId,
}) {
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
  const domain = {
    name: "GmxBaseGelatoRelayRouter",
    version: "1",
    chainId,
    verifyingContract,
  };
  const relayParamsHash = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      [
        "tuple(tuple(address[] tokens, address[] providers, bytes[] data) oracleParams, tuple(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s, address token)[] tokenPermits, tuple(address feeToken, uint256 feeAmount, address[] feeSwapPath) fee)",
      ],
      [relayParams]
    )
  );
  const typedData = {
    collateralDeltaAmount,
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

  return signer._signTypedData(domain, types, typedData);
}

async function getPermitSignature(
  token: any,
  signer: any,
  spender: string,
  value: BigNumberish,
  nonce: BigNumberish,
  deadline: BigNumberish,
  chainId: BigNumberish
) {
  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const tokenName = await token.name();
  const tokenVersion = "1";
  const domain = {
    name: tokenName,
    version: tokenVersion,
    chainId,
    verifyingContract: token.address,
  };
  const typedData = {
    owner: signer.address,
    spender: spender,
    value: value,
    nonce: nonce,
    deadline: deadline,
  };
  return signer._signTypedData(domain, types, typedData);
}

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
    const feeParams = {
      feeToken: wnt.address,
      feeAmount: expandDecimals(2, 15), // 0.001 ETH
      feeSwapPath: [],
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

    const chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);

    async function sendCreateOrder({
      signer,
      sender,
      oracleParams = undefined,
      tokenPermits = undefined,
      feeParams,
      collateralDeltaAmount,
      account,
      params,
      signature = undefined,
      userNonce,
      deadline,
    }) {
      if (!oracleParams) {
        oracleParams = {
          tokens: [],
          providers: [],
          data: [],
        };
      }
      if (!tokenPermits) {
        tokenPermits = [];
      }

      const relayParams = {
        oracleParams,
        tokenPermits,
        fee: feeParams,
      };

      if (!signature) {
        signature = await getCreateOrderSignature({
          signer,
          relayParams,
          collateralDeltaAmount,
          verifyingContract: gelatoRelayRouter.address,
          params,
          deadline,
          userNonce,
          chainId,
        });
      }
      const createOrderCalldata = gelatoRelayRouter.interface.encodeFunctionData("createOrder", [
        relayParams,
        collateralDeltaAmount,
        account,
        params,
        signature,
        userNonce,
        deadline,
      ]);
      const calldata = ethers.utils.solidityPack(
        ["bytes", "address", "address", "uint256"],
        [createOrderCalldata, GELATO_RELAY_ADDRESS, wnt.address, gelatoRelayFee]
      );
      return sender.sendTransaction({
        to: gelatoRelayRouter.address,
        data: calldata,
      });
    }

    const collateralDeltaAmount = expandDecimals(1, 17); // 0.1 ETH

    await impersonateAccount(GELATO_RELAY_ADDRESS);
    await setBalance(GELATO_RELAY_ADDRESS, expandDecimals(100, 18));
    const gelatoRelaySigner = await hre.ethers.getSigner(GELATO_RELAY_ADDRESS);

    await wnt.connect(user0).deposit({ value: expandDecimals(1, 18) });

    const gelatoRelayFee = expandDecimals(1, 15);
    await expect(
      sendCreateOrder({
        sender: gelatoRelaySigner,
        signer: user0,
        feeParams,
        collateralDeltaAmount,
        account: user0.address,
        params,
        signature: BAD_SIGNATURE,
        userNonce: 0,
        deadline: 0,
      })
    ).to.be.revertedWithCustomError(errorsContract, "InvalidSignature");

    await expect(
      sendCreateOrder({
        sender: user0,
        signer: user0,
        feeParams,
        collateralDeltaAmount,
        account: user0.address,
        params,
        userNonce: 0,
        deadline: 0,
      })
    ).to.be.revertedWith("onlyGelatoRelay");

    await expect(
      sendCreateOrder({
        sender: gelatoRelaySigner,
        signer: user0,
        feeParams,
        collateralDeltaAmount,
        account: user0.address,
        params,
        userNonce: 100,
        deadline: 0,
      })
    ).to.be.revertedWithCustomError(errorsContract, "InvalidUserNonce");

    await expect(
      sendCreateOrder({
        sender: gelatoRelaySigner,
        signer: user0,
        feeParams,
        collateralDeltaAmount,
        account: user0.address,
        params,
        userNonce: 0,
        deadline: 5,
      })
    ).to.be.revertedWithCustomError(errorsContract, "DeadlinePassed");

    await expect(
      sendCreateOrder({
        sender: gelatoRelaySigner,
        signer: user0,
        feeParams,
        collateralDeltaAmount,
        account: user0.address,
        params,
        userNonce: 0,
        deadline: 0,
      })
    ).to.be.revertedWith("ERC20: insufficient allowance");

    const tokenPermit = await getTokenPermit(wnt, user0, router.address, expandDecimals(1, 18), 0, 9999999999, chainId);

    await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, 0);
    const tx = await sendCreateOrder({
      sender: gelatoRelaySigner,
      signer: user0,
      feeParams,
      tokenPermits: [tokenPermit],
      collateralDeltaAmount,
      account: user0.address,
      params,
      userNonce: 0,
      deadline: 0,
    });
    await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, gelatoRelayFee);

    // same nonce should revert
    await expect(
      sendCreateOrder({
        sender: gelatoRelaySigner,
        signer: user0,
        feeParams,
        collateralDeltaAmount,
        account: user0.address,
        params,
        userNonce: 0,
        deadline: 0,
      })
    ).to.be.revertedWithCustomError(errorsContract, "InvalidUserNonce");

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

    await stopImpersonatingAccount(GELATO_RELAY_ADDRESS);

    await logGasUsage({
      tx,
      label: "gelatoRelayRouter.createOrder",
    });
  });
});
