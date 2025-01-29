import { BigNumberish, ethers } from "ethers";
import { GELATO_RELAY_ADDRESS } from "./addresses";
import { getUserNonce, hashRelayParams } from "./helpers";
import { getDomain } from "./helpers";
import { getRelayParams } from "./helpers";

export async function sendCreateOrder(p: {
  signer: ethers.Signer;
  sender: ethers.Signer;
  oracleParams?: {
    tokens: string[];
    providers: string[];
    data: string[];
  };
  tokenPermits?: {
    token: string;
    spender: string;
    value: BigNumberish;
    deadline: BigNumberish;
  }[];
  feeParams: {
    feeToken: string;
    feeAmount: BigNumberish;
    feeSwapPath: string[];
  };
  collateralDeltaAmount: BigNumberish;
  account: string;
  params: any;
  signature?: string;
  userNonce?: BigNumberish;
  deadline: BigNumberish;
  relayRouter: ethers.Contract;
  chainId: BigNumberish;
  relayFeeToken: string;
  relayFeeAmount: BigNumberish;
}) {
  const relayParams = getRelayParams(p.oracleParams, p.tokenPermits, p.feeParams);
  if (p.userNonce === undefined) {
    p.userNonce = await getUserNonce(p.account, p.relayRouter);
  }

  if (!p.signature) {
    p.signature = await getCreateOrderSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }
  const createOrderCalldata = p.relayRouter.interface.encodeFunctionData("createOrder", [
    relayParams,
    p.account,
    p.collateralDeltaAmount,
    p.params,
    p.userNonce,
    p.deadline,
    p.signature,
  ]);
  const calldata = ethers.utils.solidityPack(
    ["bytes", "address", "address", "uint256"],
    [createOrderCalldata, GELATO_RELAY_ADDRESS, p.relayFeeToken, p.relayFeeAmount]
  );
  return p.sender.sendTransaction({
    to: p.relayRouter.address,
    data: calldata,
  });
}

async function getCreateOrderSignature({
  signer,
  relayParams,
  collateralDeltaAmount,
  verifyingContract,
  params,
  deadline,
  userNonce = undefined,
  chainId,
}) {
  if (userNonce === undefined) {
    throw new Error("userNonce is required");
  }
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

export async function sendUpdateOrder(p: {
  sender: ethers.Signer;
  signer: ethers.Signer;
  oracleParams?: {
    tokens: string[];
    providers: string[];
    data: string[];
  };
  tokenPermits?: {
    token: string;
    spender: string;
    value: BigNumberish;
    deadline: BigNumberish;
  }[];
  feeParams: {
    feeToken: string;
    feeAmount: BigNumberish;
    feeSwapPath: string[];
  };
  key: string;
  chainId: BigNumberish;
  account: string;
  params: {
    sizeDeltaUsd: BigNumberish;
    acceptablePrice: BigNumberish;
    triggerPrice: BigNumberish;
    minOutputAmount: BigNumberish;
    validFromTime: BigNumberish;
    autoCancel: boolean;
  };
  deadline: BigNumberish;
  userNonce?: BigNumberish;
  relayRouter: ethers.Contract;
  signature?: string;
  relayFeeToken: string;
  relayFeeAmount: BigNumberish;
}) {
  const relayParams = getRelayParams(p.oracleParams, p.tokenPermits, p.feeParams);
  if (p.userNonce === undefined) {
    p.userNonce = await getUserNonce(p.account, p.relayRouter);
  }

  if (!p.signature) {
    p.signature = await getUpdateOrderSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }
  const updateOrderCalldata = p.relayRouter.interface.encodeFunctionData("updateOrder", [
    relayParams,
    p.account,
    p.key,
    p.params,
    p.userNonce,
    p.deadline,
    p.signature,
  ]);
  const calldata = ethers.utils.solidityPack(
    ["bytes", "address", "address", "uint256"],
    [updateOrderCalldata, GELATO_RELAY_ADDRESS, p.relayFeeToken, p.relayFeeAmount]
  );
  return p.sender.sendTransaction({
    to: p.relayRouter.address,
    data: calldata,
  });
}

async function getUpdateOrderSignature({
  signer,
  relayParams,
  verifyingContract,
  params,
  key,
  deadline,
  userNonce = undefined,
  chainId,
}) {
  if (userNonce === undefined) {
    throw new Error("userNonce is required");
  }
  const types = {
    UpdateOrder: [
      { name: "key", type: "bytes32" },
      { name: "params", type: "UpdateOrderParams" },
      { name: "userNonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "relayParams", type: "bytes32" },
    ],
    UpdateOrderParams: [
      { name: "sizeDeltaUsd", type: "uint256" },
      { name: "acceptablePrice", type: "uint256" },
      { name: "triggerPrice", type: "uint256" },
      { name: "minOutputAmount", type: "uint256" },
      { name: "validFromTime", type: "uint256" },
      { name: "autoCancel", type: "bool" },
    ],
  };

  const domain = getDomain(chainId, verifyingContract);
  const typedData = {
    key,
    params,
    userNonce,
    deadline,
    relayParams: hashRelayParams(relayParams),
  };

  return signer._signTypedData(domain, types, typedData);
}

export async function sendCancelOrder(p: {
  sender: ethers.Signer;
  signer: ethers.Signer;
  oracleParams?: {
    tokens: string[];
    providers: string[];
    data: string[];
  };
  tokenPermits?: {
    token: string;
    spender: string;
    value: BigNumberish;
    deadline: BigNumberish;
  }[];
  feeParams: {
    feeToken: string;
    feeAmount: BigNumberish;
    feeSwapPath: string[];
  };
  key: string;
  chainId: BigNumberish;
  account: string;
  deadline: BigNumberish;
  userNonce?: BigNumberish;
  relayRouter: ethers.Contract;
  signature?: string;
  relayFeeToken: string;
  relayFeeAmount: BigNumberish;
}) {
  const relayParams = getRelayParams(p.oracleParams, p.tokenPermits, p.feeParams);
  if (p.userNonce === undefined) {
    p.userNonce = await getUserNonce(p.account, p.relayRouter);
  }

  if (!p.signature) {
    p.signature = await getCancelOrderSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }
  const cancelOrderCalldata = p.relayRouter.interface.encodeFunctionData("cancelOrder", [
    relayParams,
    p.account,
    p.key,
    p.userNonce,
    p.deadline,
    p.signature,
  ]);
  const calldata = ethers.utils.solidityPack(
    ["bytes", "address", "address", "uint256"],
    [cancelOrderCalldata, GELATO_RELAY_ADDRESS, p.relayFeeToken, p.relayFeeAmount]
  );
  return p.sender.sendTransaction({
    to: p.relayRouter.address,
    data: calldata,
  });
}

async function getCancelOrderSignature({
  signer,
  relayParams,
  verifyingContract,
  key,
  deadline,
  userNonce = undefined,
  chainId,
}) {
  if (userNonce === undefined) {
    throw new Error("userNonce is required");
  }
  const types = {
    CancelOrder: [
      { name: "key", type: "bytes32" },
      { name: "userNonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "relayParams", type: "bytes32" },
    ],
  };

  const domain = getDomain(chainId, verifyingContract);
  const typedData = {
    key,
    userNonce,
    deadline,
    relayParams: hashRelayParams(relayParams),
  };

  return signer._signTypedData(domain, types, typedData);
}
