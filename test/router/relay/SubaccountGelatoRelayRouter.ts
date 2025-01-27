import { expect } from "chai";
import {
  impersonateAccount,
  stopImpersonatingAccount,
  setBalance,
  time,
} from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../../utils/math";
import { logGasUsage } from "../../../utils/gas";
import { hashString } from "../../../utils/hash";
import { OrderType, DecreasePositionSwapType, getOrderKeys } from "../../../utils/order";
import { errorsContract } from "../../../utils/error";
import { expectBalance } from "../../../utils/validation";
import { BigNumberish } from "ethers";
import { handleDeposit } from "../../../utils/deposit";
import * as keys from "../../../utils/keys";

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
  subaccountApproval,
  collateralDeltaAmount,
  account,
  verifyingContract,
  params,
  deadline,
  userNonce,
  chainId,
}) {
  const types = {
    CreateOrder: [
      { name: "collateralDeltaAmount", type: "uint256" },
      { name: "account", type: "address" },
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
      { name: "subaccountApproval", type: "bytes32" },
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
  const subaccountApprovalHash = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      [
        "tuple(address subaccount,uint256 expiresAt,uint256 maxAllowedCount,bytes32 actionType,uint256 nonce,uint256 deadline,bytes signature)",
      ],
      [subaccountApproval]
    )
  );

  const typedData = {
    collateralDeltaAmount,
    account,
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
    subaccountApproval: subaccountApprovalHash,
  };

  return signer._signTypedData(domain, types, typedData);
}

async function sendCreateOrder({
  signer,
  subaccountApprovalSigner,
  sender,
  oracleParams = undefined,
  tokenPermits = undefined,
  feeParams,
  collateralDeltaAmount,
  account,
  subaccount,
  params,
  signature = undefined,
  userNonce,
  deadline,
  relayRouter,
  chainId,
  relayFeeToken,
  relayFeeAmount,
  subaccountApproval,
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

  if (!subaccountApproval) {
    subaccountApproval = {
      subaccount,
      expiresAt: 9999999999,
      maxAllowedCount: 10,
      actionType: keys.SUBACCOUNT_ORDER_ACTION,
      deadline: 0,
      nonce: 0,
    } as any;
  }
  if (!subaccountApproval.signature) {
    subaccountApproval.signature = await getSubaccountApprovalSignature({
      signer: subaccountApprovalSigner,
      chainId,
      verifyingContract: relayRouter.address,
      ...subaccountApproval,
    });
  }

  if (!signature) {
    signature = await getCreateOrderSignature({
      signer,
      account,
      relayParams,
      subaccountApproval,
      collateralDeltaAmount,
      verifyingContract: relayRouter.address,
      params,
      deadline,
      userNonce,
      chainId,
    });
  }
  const createOrderCalldata = relayRouter.interface.encodeFunctionData("createOrder", [
    relayParams,
    subaccountApproval,
    collateralDeltaAmount,
    account,
    subaccount,
    params,
    signature,
    userNonce,
    deadline,
  ]);
  const calldata = ethers.utils.solidityPack(
    ["bytes", "address", "address", "uint256"],
    [createOrderCalldata, GELATO_RELAY_ADDRESS, relayFeeToken, relayFeeAmount]
  );
  return sender.sendTransaction({
    to: relayRouter.address,
    data: calldata,
  });
}

async function getSubaccountApprovalSignature(p: {
  signer: any;
  chainId: BigNumberish;
  verifyingContract: string;
  subaccount: string;
  expiresAt: BigNumberish;
  maxAllowedCount: BigNumberish;
  actionType: string;
  deadline: BigNumberish;
  nonce: BigNumberish;
}) {
  const domain = {
    name: "GmxBaseGelatoRelayRouter",
    version: "1",
    chainId: p.chainId,
    verifyingContract: p.verifyingContract,
  };

  const types = {
    SubaccountApproval: [
      { name: "subaccount", type: "address" },
      { name: "expiresAt", type: "uint256" },
      { name: "maxAllowedCount", type: "uint256" },
      { name: "actionType", type: "bytes32" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const typedData = {
    subaccount: p.subaccount,
    expiresAt: p.expiresAt,
    maxAllowedCount: p.maxAllowedCount,
    actionType: p.actionType,
    deadline: p.deadline,
    nonce: p.nonce,
  };

  return p.signer._signTypedData(domain, types, typedData);
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

describe("SubaccountGelatoRelayRouter", () => {
  let fixture;
  let user0, user1, user2, user3;
  let reader, dataStore, router, subaccountGelatoRelayRouter, ethUsdMarket, wnt, usdc, chainlinkPriceFeedProvider;
  let relaySigner;
  let chainId;
  const referralCode = hashString("referralCode");

  let defaultParams;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2, user3 } = fixture.accounts);
    ({ reader, dataStore, router, subaccountGelatoRelayRouter, ethUsdMarket, wnt, usdc, chainlinkPriceFeedProvider } =
      fixture.contracts);

    defaultParams = {
      addresses: {
        receiver: user1.address,
        cancellationReceiver: user1.address,
        callbackContract: user2.address,
        uiFeeReceiver: user3.address,
        market: ethUsdMarket.marketToken,
        initialCollateralToken: ethUsdMarket.longToken,
        swapPath: [ethUsdMarket.marketToken],
      },
      numbers: {
        sizeDeltaUsd: decimalToFloat(1000),
        initialCollateralDeltaAmount: 0,
        triggerPrice: decimalToFloat(4800),
        acceptablePrice: decimalToFloat(4900),
        executionFee: 0,
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

    await impersonateAccount(GELATO_RELAY_ADDRESS);
    await setBalance(GELATO_RELAY_ADDRESS, expandDecimals(100, 18));
    await usdc.mint(user1.address, expandDecimals(1, 30)); // very large amount
    await wnt.connect(user1).deposit({ value: expandDecimals(1000, 18) });

    relaySigner = await hre.ethers.getSigner(GELATO_RELAY_ADDRESS);
    chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);
  });

  describe("createOrder", () => {
    let createOrderParams;

    beforeEach(async () => {
      createOrderParams = {
        sender: relaySigner,
        // signer is subaccount
        signer: user0,
        // subaccountApprovalSigner is the main account
        subaccountApprovalSigner: user1,
        feeParams: {
          feeToken: wnt.address,
          feeAmount: expandDecimals(2, 15), // 0.002 ETH
          feeSwapPath: [],
        },
        tokenPermits: [],
        collateralDeltaAmount: expandDecimals(1, 17),
        account: user1.address,
        // TODO use different subaccount wallet
        subaccount: user0.address,
        params: defaultParams,
        userNonce: 0,
        deadline: 9999999999,
        relayRouter: subaccountGelatoRelayRouter,
        chainId,
        relayFeeToken: wnt.address,
        relayFeeAmount: expandDecimals(1, 15),
      };
    });

    it("InsufficientRelayFee", async () => {
      await wnt.connect(user1).approve(router.address, expandDecimals(1, 18));
      createOrderParams.feeParams.feeAmount = 1;
      await expect(sendCreateOrder(createOrderParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InsufficientRelayFee"
      );
    });

    it("SubaccountApprovalDeadlinePassed", async () => {
      await wnt.connect(user1).approve(router.address, expandDecimals(1, 18));
      await time.setNextBlockTimestamp(9999999100);
      await expect(
        sendCreateOrder({
          ...createOrderParams,
          subaccountApproval: {
            subaccount: user0.address,
            expiresAt: 9999999999,
            maxAllowedCount: 10,
            actionType: keys.SUBACCOUNT_ORDER_ACTION,
            deadline: 9999999099,
            nonce: 0,
          },
        })
      ).to.be.revertedWithCustomError(errorsContract, "SubaccountApprovalDeadlinePassed");

      await time.setNextBlockTimestamp(9999999200);
      await sendCreateOrder({
        ...createOrderParams,
        subaccountApproval: {
          subaccount: user0.address,
          expiresAt: 9999999999,
          maxAllowedCount: 10,
          actionType: keys.SUBACCOUNT_ORDER_ACTION,
          deadline: 9999999201,
          nonce: 0,
        },
      });
    });

    it("InvalidSubaccountApprovalNonce", async () => {
      await wnt.connect(user1).approve(router.address, expandDecimals(1, 18));
      await expect(
        sendCreateOrder({
          ...createOrderParams,
          subaccountApproval: {
            subaccount: user0.address,
            expiresAt: 9999999999,
            maxAllowedCount: 10,
            actionType: keys.SUBACCOUNT_ORDER_ACTION,
            deadline: 0,
            nonce: 1,
          },
        })
      ).to.be.revertedWithCustomError(errorsContract, "InvalidSubaccountApprovalNonce");

      await sendCreateOrder({
        ...createOrderParams,
        subaccountApproval: {
          subaccount: user0.address,
          expiresAt: 9999999999,
          maxAllowedCount: 10,
          actionType: keys.SUBACCOUNT_ORDER_ACTION,
          deadline: 0,
          nonce: 0,
        },
      });

      await sendCreateOrder({
        ...createOrderParams,
        subaccountApproval: {
          subaccount: user0.address,
          expiresAt: 9999999999,
          maxAllowedCount: 10,
          actionType: keys.SUBACCOUNT_ORDER_ACTION,
          deadline: 0,
          nonce: 1,
        },
        userNonce: 1,
      });

      await expect(
        sendCreateOrder({
          ...createOrderParams,
          subaccountApproval: {
            subaccount: user0.address,
            expiresAt: 9999999999,
            maxAllowedCount: 10,
            actionType: keys.SUBACCOUNT_ORDER_ACTION,
            deadline: 0,
            nonce: 1,
          },
          userNonce: 2,
        })
      ).to.be.revertedWithCustomError(errorsContract, "InvalidSubaccountApprovalNonce");
    });

    it("updates subaccount approval", async () => {
      await wnt.connect(user1).approve(router.address, expandDecimals(1, 18));

      const subaccountListKey = keys.subaccountListKey(user1.address);
      expect(await dataStore.getAddressCount(subaccountListKey)).to.eq(0);

      expect(
        await dataStore.getUint(
          keys.maxAllowedSubaccountActionCountKey(user1.address, user0.address, keys.SUBACCOUNT_ORDER_ACTION)
        )
      ).to.eq(0);
      expect(
        await dataStore.getUint(keys.subaccountExpiresAtKey(user1.address, user0.address, keys.SUBACCOUNT_ORDER_ACTION))
      ).to.eq(0);

      await sendCreateOrder({
        ...createOrderParams,
        subaccountApproval: {
          subaccount: user0.address,
          expiresAt: 9999999999,
          maxAllowedCount: 10,
          actionType: keys.SUBACCOUNT_ORDER_ACTION,
          deadline: 0,
          nonce: 0,
        },
      });

      expect(await dataStore.getAddressCount(subaccountListKey)).to.eq(1);
      expect(await dataStore.getAddressValuesAt(subaccountListKey, 0, 1)).to.deep.eq([user0.address]);
      expect(
        await dataStore.getUint(
          keys.maxAllowedSubaccountActionCountKey(user1.address, user0.address, keys.SUBACCOUNT_ORDER_ACTION)
        )
      ).to.eq(10);
      expect(
        await dataStore.getUint(keys.subaccountExpiresAtKey(user1.address, user0.address, keys.SUBACCOUNT_ORDER_ACTION))
      ).to.eq(9999999999);
    });

    it("creates order and sends relayer fee", async () => {
      const collateralDeltaAmount = createOrderParams.collateralDeltaAmount;
      const gelatoRelayFee = createOrderParams.relayFeeAmount;

      const tokenPermit = await getTokenPermit(
        wnt,
        user1,
        router.address,
        expandDecimals(1, 18),
        0,
        9999999999,
        chainId
      );

      expect(await wnt.allowance(user0.address, router.address)).to.eq(0);
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, 0);
      const tx = await sendCreateOrder({
        ...createOrderParams,
        tokenPermits: [tokenPermit],
      });

      // allowance was set
      expect(await wnt.allowance(user1.address, router.address)).to.eq(
        expandDecimals(1, 18).sub(collateralDeltaAmount).sub(gelatoRelayFee).sub(expandDecimals(1, 15))
      );
      // relay fee was sent
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, gelatoRelayFee);

      // same nonce should revert
      await expect(
        sendCreateOrder({
          ...createOrderParams,
        })
      ).to.be.revertedWithCustomError(errorsContract, "InvalidUserNonce");

      const orderKeys = await getOrderKeys(dataStore, 0, 1);
      const order = await reader.getOrder(dataStore.address, orderKeys[0]);

      expect(order.addresses.account).eq(user1.address);
      expect(order.addresses.receiver).eq(user1.address);
      expect(order.addresses.callbackContract).eq(user2.address);
      expect(order.addresses.uiFeeReceiver).eq(user3.address);
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
});
