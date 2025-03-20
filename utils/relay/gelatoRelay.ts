import { BigNumberish, ethers } from "ethers";
import { hashRelayParams, sendRelayTransaction, signTypedData } from "./helpers";
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
  externalCalls?: {
    externalCallTargets: string[];
    externalCallDataList: string[];
    refundTokens: string[];
    refundReceivers: string[];
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
  gelatoRelayFeeToken: string;
  gelatoRelayFeeAmount: BigNumberish;
}) {
  const relayParams = await getRelayParams(p);

  let signature = p.signature;
  if (!signature) {
    signature = await getCreateOrderSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }

  const createOrderCalldata = p.relayRouter.interface.encodeFunctionData("createOrder", [
    { ...relayParams, signature },
    p.account,
    p.collateralDeltaAmount,
    p.params,
  ]);
  return sendRelayTransaction({
    calldata: createOrderCalldata,
    ...p,
  });
}

async function getCreateOrderSignature({
  signer,
  relayParams,
  collateralDeltaAmount,
  verifyingContract,
  params,
  chainId,
}) {
  if (relayParams.userNonce === undefined) {
    throw new Error("userNonce is required");
  }
  const types = {
    CreateOrder: [
      { name: "collateralDeltaAmount", type: "uint256" },
      { name: "addresses", type: "CreateOrderAddresses" },
      { name: "numbers", type: "CreateOrderNumbers" },
      { name: "orderType", type: "uint256" },
      { name: "decreasePositionSwapType", type: "uint256" },
      { name: "isLong", type: "bool" },
      { name: "shouldUnwrapNativeToken", type: "bool" },
      { name: "autoCancel", type: "bool" },
      { name: "referralCode", type: "bytes32" },
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
  const typedData = {
    collateralDeltaAmount,
    addresses: params.addresses,
    numbers: params.numbers,
    orderType: params.orderType,
    decreasePositionSwapType: params.decreasePositionSwapType,
    isLong: params.isLong,
    shouldUnwrapNativeToken: params.shouldUnwrapNativeToken,
    autoCancel: false,
    referralCode: params.referralCode,
    relayParams: hashRelayParams(relayParams),
  };

  return signTypedData(signer, domain, types, typedData);
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
  chainId: BigNumberish;
  account: string;
  params: {
    key: string;
    sizeDeltaUsd: BigNumberish;
    acceptablePrice: BigNumberish;
    triggerPrice: BigNumberish;
    minOutputAmount: BigNumberish;
    validFromTime: BigNumberish;
    autoCancel: boolean;
    executionFeeIncrease: BigNumberish;
  };
  deadline: BigNumberish;
  userNonce?: BigNumberish;
  relayRouter: ethers.Contract;
  signature?: string;
  gelatoRelayFeeToken: string;
  gelatoRelayFeeAmount: BigNumberish;
}) {
  const relayParams = await getRelayParams(p);

  let signature = p.signature;
  if (!signature) {
    signature = await getUpdateOrderSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }

  const updateOrderCalldata = p.relayRouter.interface.encodeFunctionData("updateOrder", [
    { ...relayParams, signature },
    p.account,
    p.params,
  ]);
  return sendRelayTransaction({
    calldata: updateOrderCalldata,
    ...p,
  });
}

async function getUpdateOrderSignature({ signer, relayParams, verifyingContract, params, deadline, chainId }) {
  if (relayParams.userNonce === undefined) {
    throw new Error("userNonce is required");
  }
  const types = {
    UpdateOrder: [
      { name: "params", type: "UpdateOrderParams" },
      { name: "relayParams", type: "bytes32" },
    ],
    UpdateOrderParams: [
      { name: "key", type: "bytes32" },
      { name: "sizeDeltaUsd", type: "uint256" },
      { name: "acceptablePrice", type: "uint256" },
      { name: "triggerPrice", type: "uint256" },
      { name: "minOutputAmount", type: "uint256" },
      { name: "validFromTime", type: "uint256" },
      { name: "autoCancel", type: "bool" },
      { name: "executionFeeIncrease", type: "uint256" },
    ],
  };

  const domain = getDomain(chainId, verifyingContract);
  const typedData = {
    params,
    deadline,
    relayParams: hashRelayParams(relayParams),
  };

  return signTypedData(signer, domain, types, typedData);
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
  gelatoRelayFeeToken: string;
  gelatoRelayFeeAmount: BigNumberish;
}) {
  const relayParams = await getRelayParams(p);

  let signature = p.signature;
  if (!signature) {
    signature = await getCancelOrderSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }
  const cancelOrderCalldata = p.relayRouter.interface.encodeFunctionData("cancelOrder", [
    { ...relayParams, signature },
    p.account,
    p.key,
  ]);
  return sendRelayTransaction({
    calldata: cancelOrderCalldata,
    ...p,
  });
}

async function getCancelOrderSignature({ signer, relayParams, verifyingContract, key, chainId }) {
  if (relayParams.userNonce === undefined) {
    throw new Error("userNonce is required");
  }

  const types = {
    CancelOrder: [
      { name: "key", type: "bytes32" },
      { name: "relayParams", type: "bytes32" },
    ],
  };

  const domain = getDomain(chainId, verifyingContract);
  const typedData = {
    key,
    relayParams: hashRelayParams(relayParams),
  };

  return signTypedData(signer, domain, types, typedData);
}

export async function sendBatch(p: {
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
  cancelOrderKeys: string[];
  batchCreateOrderParamsList: {
    collateralDeltaAmount: BigNumberish;
    params: any;
  }[];
  updateOrderParamsList: {
    key: string;
    sizeDeltaUsd: BigNumberish;
    acceptablePrice: BigNumberish;
    triggerPrice: BigNumberish;
    minOutputAmount: BigNumberish;
    validFromTime: BigNumberish;
    autoCancel: boolean;
    executionFeeIncrease: BigNumberish;
  }[];
  chainId: BigNumberish;
  account: string;
  deadline: BigNumberish;
  userNonce?: BigNumberish;
  relayRouter: ethers.Contract;
  signature?: string;
  gelatoRelayFeeToken: string;
  gelatoRelayFeeAmount: BigNumberish;
}) {
  const relayParams = await getRelayParams(p);

  let signature = p.signature;
  if (!signature) {
    signature = await getBatchSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }
  const batchCalldata = p.relayRouter.interface.encodeFunctionData("batch", [
    { ...relayParams, signature },
    p.account,
    p.batchCreateOrderParamsList,
    p.updateOrderParamsList,
    p.cancelOrderKeys,
  ]);
  return sendRelayTransaction({
    calldata: batchCalldata,
    ...p,
  });
}

async function getBatchSignature({
  signer,
  relayParams,
  batchCreateOrderParamsList,
  updateOrderParamsList,
  cancelOrderKeys,
  verifyingContract,
  chainId,
}) {
  if (relayParams.userNonce === undefined) {
    throw new Error("userNonce is required");
  }
  const types = {
    Batch: [
      { name: "batchCreateOrderParamsList", type: "BatchCreateOrderParams[]" },
      { name: "updateOrderParamsList", type: "UpdateOrderParams[]" },
      { name: "cancelOrderKeys", type: "bytes32[]" },
      { name: "relayParams", type: "bytes32" },
    ],
    BatchCreateOrderParams: [
      { name: "collateralDeltaAmount", type: "uint256" },
      { name: "addresses", type: "CreateOrderAddresses" },
      { name: "numbers", type: "CreateOrderNumbers" },
      { name: "orderType", type: "uint256" },
      { name: "decreasePositionSwapType", type: "uint256" },
      { name: "isLong", type: "bool" },
      { name: "shouldUnwrapNativeToken", type: "bool" },
      { name: "autoCancel", type: "bool" },
      { name: "referralCode", type: "bytes32" },
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
    UpdateOrderParams: [
      { name: "key", type: "bytes32" },
      { name: "sizeDeltaUsd", type: "uint256" },
      { name: "acceptablePrice", type: "uint256" },
      { name: "triggerPrice", type: "uint256" },
      { name: "minOutputAmount", type: "uint256" },
      { name: "validFromTime", type: "uint256" },
      { name: "autoCancel", type: "bool" },
      { name: "executionFeeIncrease", type: "uint256" },
    ],
  };
  const domain = {
    name: "GmxBaseGelatoRelayRouter",
    version: "1",
    chainId,
    verifyingContract,
  };
  const typedData = {
    batchCreateOrderParamsList: batchCreateOrderParamsList.map((p) => ({
      collateralDeltaAmount: p.collateralDeltaAmount,
      addresses: p.params.addresses,
      numbers: p.params.numbers,
      orderType: p.params.orderType,
      decreasePositionSwapType: p.params.decreasePositionSwapType,
      isLong: p.params.isLong,
      shouldUnwrapNativeToken: p.params.shouldUnwrapNativeToken,
      autoCancel: false,
      referralCode: p.params.referralCode,
    })),
    updateOrderParamsList: updateOrderParamsList.map((p) => ({
      key: p.key,
      sizeDeltaUsd: p.sizeDeltaUsd,
      acceptablePrice: p.acceptablePrice,
      triggerPrice: p.triggerPrice,
      minOutputAmount: p.minOutputAmount,
      validFromTime: p.validFromTime,
      autoCancel: p.autoCancel,
      executionFeeIncrease: p.executionFeeIncrease,
    })),
    cancelOrderKeys,
    relayParams: hashRelayParams(relayParams),
  };

  return signTypedData(signer, domain, types, typedData);
}
