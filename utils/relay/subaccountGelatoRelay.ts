import { BigNumberish, ethers } from "ethers";
import * as keys from "../keys";
import {
  getDomain,
  hashSubaccountApproval,
  hashRelayParams,
  getRelayParams,
  signTypedData,
  sendRelayTransaction,
  SubaccountApproval,
} from "./helpers";

export async function sendCreateOrder(p: {
  subaccountApprovalSigner: ethers.Signer;
  subaccount: string;
  subaccountApproval?: {
    subaccount: string;
    shouldAdd: boolean;
    expiresAt: BigNumberish;
    maxAllowedCount: BigNumberish;
    actionType: string;
    deadline: BigNumberish;
    nonce: BigNumberish;
    signature?: string;
  };
  externalCalls?: {
    externalCallTargets: string[];
    externalCallDataList: string[];
    refundTokens: string[];
    refundReceivers: string[];
  };
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
  gelatoRelayFeeToken: string;
  gelatoRelayFeeAmount: BigNumberish;
}) {
  const relayParams = await getRelayParams(p);
  const subaccountApproval = await getSubaccountApproval({ ...p, signer: p.subaccountApprovalSigner });

  let signature = p.signature;
  if (!signature) {
    signature = await getCreateOrderSignature({
      ...p,
      relayParams,
      verifyingContract: p.relayRouter.address,
      subaccountApproval,
    });
  }

  const createOrderCalldata = p.relayRouter.interface.encodeFunctionData("createOrder", [
    { ...relayParams, signature },
    subaccountApproval,
    p.account,
    p.subaccount,
    p.collateralDeltaAmount,
    p.params,
  ]);
  return sendRelayTransaction({
    calldata: createOrderCalldata,
    ...p,
  });
}

function getEmptySubaccountApproval() {
  return {
    subaccount: ethers.constants.AddressZero,
    shouldAdd: false,
    expiresAt: 0,
    maxAllowedCount: 0,
    actionType: keys.SUBACCOUNT_ORDER_ACTION,
    nonce: 0,
    signature: "0x",
    deadline: 9999999999,
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
  chainId,
}) {
  const types = {
    CreateOrder: [
      { name: "collateralDeltaAmount", type: "uint256" },
      { name: "account", type: "address" },
      { name: "addresses", type: "CreateOrderAddresses" },
      { name: "numbers", type: "CreateOrderNumbers" },
      { name: "orderType", type: "uint256" },
      { name: "decreasePositionSwapType", type: "uint256" },
      { name: "isLong", type: "bool" },
      { name: "shouldUnwrapNativeToken", type: "bool" },
      { name: "autoCancel", type: "bool" },
      { name: "referralCode", type: "bytes32" },
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

  const domain = getDomain(chainId, verifyingContract);
  const typedData = {
    collateralDeltaAmount,
    account,
    addresses: params.addresses,
    numbers: params.numbers,
    orderType: params.orderType,
    decreasePositionSwapType: params.decreasePositionSwapType,
    isLong: params.isLong,
    shouldUnwrapNativeToken: params.shouldUnwrapNativeToken,
    autoCancel: false,
    referralCode: params.referralCode,
    relayParams: hashRelayParams(relayParams),
    subaccountApproval: hashSubaccountApproval(subaccountApproval),
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
    nonce: BigNumberish;
    deadline: BigNumberish;
    chainId: BigNumberish;
  }[];
  feeParams: {
    feeToken: string;
    feeAmount: BigNumberish;
    feeSwapPath: string[];
  };
  externalCalls?: {
    externalCallTargets: string[];
    externalCallDataList: string[];
    refundTokens: string[];
    refundReceivers: string[];
  };
  subaccount: string;
  subaccountApproval: {
    subaccount: string;
    shouldAdd: boolean;
    expiresAt: BigNumberish;
    maxAllowedCount: BigNumberish;
    actionType: string;
    deadline: BigNumberish;
    nonce?: BigNumberish;
    signature?: string;
  };
  subaccountApprovalSigner: ethers.Signer;
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
  const subaccountApproval = await getSubaccountApproval({ ...p, signer: p.subaccountApprovalSigner });

  let signature = p.signature;
  if (!signature) {
    signature = await getUpdateOrderSignature({
      ...p,
      relayParams,
      subaccountApproval,
      verifyingContract: p.relayRouter.address,
    });
  }
  const updateOrderCalldata = p.relayRouter.interface.encodeFunctionData("updateOrder", [
    { ...relayParams, signature },
    subaccountApproval,
    p.account,
    p.subaccount,
    p.params,
  ]);
  return sendRelayTransaction({
    calldata: updateOrderCalldata,
    ...p,
  });
}

async function getSubaccountApproval(p: {
  subaccountApproval?: Omit<SubaccountApproval, "nonce" | "signature"> & {
    nonce?: BigNumberish;
    signature?: string;
  };
  account: string;
  relayRouter: ethers.Contract;
  chainId: BigNumberish;
  signer: ethers.Signer;
}): Promise<SubaccountApproval> {
  if (!p.subaccountApproval) {
    return getEmptySubaccountApproval();
  }

  let nonce = p.subaccountApproval.nonce;
  if (!nonce) {
    nonce = await p.relayRouter.subaccountApprovalNonces(p.account);
  }

  let signature = p.subaccountApproval.signature;
  if (!signature) {
    signature = await getSubaccountApprovalSignature({
      ...p.subaccountApproval,
      nonce,
      signer: p.signer,
      chainId: p.chainId,
      verifyingContract: p.relayRouter.address,
    });
  }

  return {
    ...p.subaccountApproval,
    nonce,
    signature,
  };
}

async function getUpdateOrderSignature({
  signer,
  relayParams,
  subaccountApproval,
  account,
  verifyingContract,
  params,
  chainId,
}) {
  const types = {
    UpdateOrder: [
      { name: "account", type: "address" },
      { name: "params", type: "UpdateOrderParams" },
      { name: "relayParams", type: "bytes32" },
      { name: "subaccountApproval", type: "bytes32" },
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
    account,
    params,
    relayParams: hashRelayParams(relayParams),
    subaccountApproval: hashSubaccountApproval(subaccountApproval),
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
    nonce: BigNumberish;
    deadline: BigNumberish;
    chainId: BigNumberish;
  }[];
  externalCalls?: {
    externalCallTargets: string[];
    externalCallDataList: string[];
    refundTokens: string[];
    refundReceivers: string[];
  };
  feeParams: {
    feeToken: string;
    feeAmount: BigNumberish;
    feeSwapPath: string[];
  };
  subaccount: string;
  key: string;
  subaccountApproval: any;
  subaccountApprovalSigner: ethers.Signer;
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
  const subaccountApproval = await getSubaccountApproval({ ...p, signer: p.subaccountApprovalSigner });

  let signature = p.signature;
  if (!signature) {
    signature = await getCancelOrderSignature({
      ...p,
      relayParams,
      subaccountApproval,
      verifyingContract: p.relayRouter.address,
    });
  }
  const cancelOrderCalldata = p.relayRouter.interface.encodeFunctionData("cancelOrder", [
    { ...relayParams, signature },
    subaccountApproval,
    p.account,
    p.subaccount,
    p.key,
  ]);
  return sendRelayTransaction({
    calldata: cancelOrderCalldata,
    ...p,
  });
}

async function getCancelOrderSignature({
  signer,
  relayParams,
  subaccountApproval,
  account,
  verifyingContract,
  key,
  chainId,
}) {
  const types = {
    CancelOrder: [
      { name: "account", type: "address" },
      { name: "key", type: "bytes32" },
      { name: "relayParams", type: "bytes32" },
      { name: "subaccountApproval", type: "bytes32" },
    ],
  };

  const domain = getDomain(chainId, verifyingContract);
  const typedData = {
    account,
    key,
    relayParams: hashRelayParams(relayParams),
    subaccountApproval: hashSubaccountApproval(subaccountApproval),
  };

  return signTypedData(signer, domain, types, typedData);
}

async function getSubaccountApprovalSignature(p: {
  signer: any;
  chainId: BigNumberish;
  verifyingContract: string;
  subaccount: string;
  shouldAdd: boolean;
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
      { name: "shouldAdd", type: "bool" },
      { name: "expiresAt", type: "uint256" },
      { name: "maxAllowedCount", type: "uint256" },
      { name: "actionType", type: "bytes32" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const typedData = {
    subaccount: p.subaccount,
    shouldAdd: p.shouldAdd,
    expiresAt: p.expiresAt,
    maxAllowedCount: p.maxAllowedCount,
    actionType: p.actionType,
    deadline: p.deadline,
    nonce: p.nonce,
  };

  return signTypedData(p.signer, domain, types, typedData);
}

export async function sendRemoveSubaccount(p: {
  sender: ethers.Signer;
  signer: ethers.Signer;
  oracleParams?: {
    tokens: string[];
    providers: string[];
    data: string[];
  };
  feeParams: {
    feeToken: string;
    feeAmount: BigNumberish;
    feeSwapPath: string[];
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
    nonce: BigNumberish;
    deadline: BigNumberish;
    chainId: BigNumberish;
  }[];
  subaccount: string;
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
    signature = await getRemoveSubaccountSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }

  const createOrderCalldata = p.relayRouter.interface.encodeFunctionData("removeSubaccount", [
    { ...relayParams, signature },
    p.account,
    p.subaccount,
  ]);
  return sendRelayTransaction({
    calldata: createOrderCalldata,
    ...p,
  });
}

async function getRemoveSubaccountSignature({ signer, relayParams, subaccount, verifyingContract, chainId }) {
  const types = {
    RemoveSubaccount: [
      { name: "subaccount", type: "address" },
      { name: "relayParams", type: "bytes32" },
    ],
  };

  const domain = getDomain(chainId, verifyingContract);
  const typedData = {
    subaccount,
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
  subaccountApproval: Omit<SubaccountApproval, "nonce" | "signature"> & {
    nonce?: BigNumberish;
    signature?: string;
  };
  subaccountApprovalSigner: ethers.Signer;
  subaccount: string;
}) {
  const relayParams = await getRelayParams(p);
  const subaccountApproval = await getSubaccountApproval({ ...p, signer: p.subaccountApprovalSigner });

  let signature = p.signature;
  if (!signature) {
    signature = await getBatchSignature({
      ...p,
      relayParams,
      subaccountApproval,
      verifyingContract: p.relayRouter.address,
    });
  }
  const batchCalldata = p.relayRouter.interface.encodeFunctionData("batch", [
    { ...relayParams, signature },
    subaccountApproval,
    p.account,
    p.subaccount,
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
  account,
  subaccountApproval,
}: {
  signer: ethers.Signer;
  relayParams: any;
  batchCreateOrderParamsList: any[];
  updateOrderParamsList: any[];
  cancelOrderKeys: string[];
  verifyingContract: string;
  chainId: BigNumberish;
  account: string;
  subaccountApproval: SubaccountApproval;
}) {
  if (relayParams.userNonce === undefined) {
    throw new Error("userNonce is required");
  }
  const types = {
    Batch: [
      { name: "account", type: "address" },
      { name: "batchCreateOrderParamsList", type: "BatchCreateOrderParams[]" },
      { name: "updateOrderParamsList", type: "UpdateOrderParams[]" },
      { name: "cancelOrderKeys", type: "bytes32[]" },
      { name: "relayParams", type: "bytes32" },
      { name: "subaccountApproval", type: "bytes32" },
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
    account,
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
    subaccountApproval: hashSubaccountApproval(subaccountApproval),
  };

  return signTypedData(signer, domain, types, typedData);
}
