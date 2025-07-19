import * as keys from "../keys";
import { BigNumberish, ethers } from "ethers";
import {
  getDomain,
  hashRelayParams,
  getRelayParams,
  signTypedData,
  sendRelayTransaction,
  SubaccountApproval,
  CreateOrderParams,
  UpdateOrderParams,
} from "./helpers";
import {
  getBatchSignature,
  getCancelOrderSignature,
  getCreateOrderSignature,
  getUpdateOrderSignature,
} from "./signatures";

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
    integrationId: string;
    nonce: BigNumberish;
    signature?: string;
    signer?: ethers.Signer;
  };
  externalCalls?: {
    sendTokens: string[];
    sendAmounts: BigNumberish[];
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
  account: string;
  params: any;
  signature?: string;
  userNonce?: BigNumberish;
  deadline: BigNumberish;
  srcChainId?: BigNumberish; // for non-multichain actions, srcChainId is 0
  desChainId: BigNumberish;
  relayRouter: ethers.Contract;
  chainId: BigNumberish;
  gelatoRelayFeeToken: string;
  gelatoRelayFeeAmount: BigNumberish;
}) {
  const relayParams = await getRelayParams(p);
  const subaccountApproval = await getSubaccountApproval({
    ...p,
    signer: p.subaccountApprovalSigner,
  });

  let signature = p.signature;
  if (!signature) {
    signature = await getCreateOrderSignature({
      ...p,
      relayParams,
      verifyingContract: p.relayRouter.address,
      subaccountApproval,
    });
  }

  const createOrderCalldata = p.srcChainId
    ? p.relayRouter.interface.encodeFunctionData("createOrder", [
        { ...relayParams, signature },
        subaccountApproval,
        p.account,
        p.srcChainId,
        p.subaccount,
        p.params,
      ])
    : p.relayRouter.interface.encodeFunctionData("createOrder", [
        { ...relayParams, signature },
        subaccountApproval,
        p.account,
        p.subaccount,
        p.params,
      ]);
  return sendRelayTransaction({
    calldata: createOrderCalldata,
    ...p,
  });
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
  externalCalls?: {
    sendTokens: string[];
    sendAmounts: BigNumberish[];
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
    integrationId: string;
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
  srcChainId?: BigNumberish; // for non-multichain actions, srcChainId is 0
  desChainId: BigNumberish;
  userNonce?: BigNumberish;
  relayRouter: ethers.Contract;
  signature?: string;
  gelatoRelayFeeToken: string;
  gelatoRelayFeeAmount: BigNumberish;
}) {
  const relayParams = await getRelayParams(p);
  const subaccountApproval = await getSubaccountApproval({
    ...p,
    signer: p.subaccountApprovalSigner,
  });

  let signature = p.signature;
  if (!signature) {
    signature = await getUpdateOrderSignature({
      ...p,
      relayParams,
      subaccountApproval,
      verifyingContract: p.relayRouter.address,
    });
  }
  const updateOrderCalldata = p.srcChainId
    ? p.relayRouter.interface.encodeFunctionData("updateOrder", [
        { ...relayParams, signature },
        subaccountApproval,
        p.account,
        p.srcChainId,
        p.subaccount,
        p.params,
      ])
    : p.relayRouter.interface.encodeFunctionData("updateOrder", [
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

export function getEmptySubaccountApproval() {
  return {
    subaccount: ethers.constants.AddressZero,
    shouldAdd: false,
    expiresAt: 0,
    maxAllowedCount: 0,
    actionType: keys.SUBACCOUNT_ORDER_ACTION,
    nonce: 0,
    desChainId: 0,
    signature: "0x",
    integrationId: ethers.constants.HashZero,
    deadline: 9999999999,
  };
}

export async function getSubaccountApproval(p: {
  subaccountApproval?: Omit<SubaccountApproval, "nonce" | "signature"> & {
    nonce?: BigNumberish;
    signature?: string;
  };
  desChainId: BigNumberish;
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
      signer: p.signer,
      ...p.subaccountApproval,
      nonce,
      desChainId: p.desChainId,
      chainId: p.chainId,
      verifyingContract: p.relayRouter.address,
    });
  }

  return {
    ...p.subaccountApproval,
    nonce,
    desChainId: p.desChainId,
    signature,
  };
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
  externalCalls?: {
    sendTokens: string[];
    sendAmounts: BigNumberish[];
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
  srcChainId?: BigNumberish; // for non-multichain actions, srcChainId is 0
  desChainId: BigNumberish;
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
  const cancelOrderCalldata = p.srcChainId
    ? p.relayRouter.interface.encodeFunctionData("cancelOrder", [
        { ...relayParams, signature },
        subaccountApproval,
        p.account,
        p.srcChainId,
        p.subaccount,
        p.key,
      ])
    : p.relayRouter.interface.encodeFunctionData("cancelOrder", [
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
  integrationId: string;
  nonce: BigNumberish;
  desChainId: BigNumberish;
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
      { name: "desChainId", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "integrationId", type: "bytes32" },
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
    desChainId: p.desChainId,
    integrationId: p.integrationId,
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
    sendTokens: string[];
    sendAmounts: BigNumberish[];
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
  subaccount: string;
  chainId: BigNumberish;
  account: string;
  deadline: BigNumberish;
  srcChainId?: BigNumberish; // for non-multichain actions, srcChainId is 0
  desChainId: BigNumberish;
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

  const createOrderCalldata = p.srcChainId
    ? p.relayRouter.interface.encodeFunctionData("removeSubaccount", [
        { ...relayParams, signature },
        p.account,
        p.srcChainId,
        p.subaccount,
      ])
    : p.relayRouter.interface.encodeFunctionData("removeSubaccount", [
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
  createOrderParamsList: CreateOrderParams[];
  updateOrderParamsList: UpdateOrderParams[];
  chainId: BigNumberish;
  srcChainId?: BigNumberish; // for non-multichain actions, srcChainId is 0
  desChainId: BigNumberish;
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
  const batchCalldata = p.srcChainId
    ? p.relayRouter.interface.encodeFunctionData("batch", [
        { ...relayParams, signature },
        subaccountApproval,
        p.account,
        p.srcChainId,
        p.subaccount,
        {
          createOrderParamsList: p.createOrderParamsList,
          updateOrderParamsList: p.updateOrderParamsList,
          cancelOrderKeys: p.cancelOrderKeys,
        },
      ])
    : p.relayRouter.interface.encodeFunctionData("batch", [
        { ...relayParams, signature },
        subaccountApproval,
        p.account,
        p.subaccount,
        {
          createOrderParamsList: p.createOrderParamsList,
          updateOrderParamsList: p.updateOrderParamsList,
          cancelOrderKeys: p.cancelOrderKeys,
        },
      ]);
  return sendRelayTransaction({
    calldata: batchCalldata,
    ...p,
  });
}
