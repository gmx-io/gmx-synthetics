import { BigNumberish, ethers } from "ethers";
import { CreateOrderParams, UpdateOrderParams, sendRelayTransaction, getRelayParams } from "./helpers";
import {
  getBatchSignature,
  getCreateOrderSignature,
  getUpdateOrderSignature,
  getCancelOrderSignature,
  getSetTraderReferralCodeSignature,
} from "./signatures";

export async function getSendCreateOrderCalldata(p: {
  signer: ethers.Signer;
  sender: ethers.Signer;
  oracleParams?: {
    tokens: string[];
    providers: string[];
    data: string[];
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
  srcChainId?: BigNumberish; // for multichain actions
  desChainId: BigNumberish;
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

  if (p.srcChainId) {
    return p.relayRouter.interface.encodeFunctionData("createOrder", [
      { ...relayParams, signature },
      p.account,
      p.srcChainId,
      p.params,
    ]);
  }

  return p.relayRouter.interface.encodeFunctionData("createOrder", [
    { ...relayParams, signature },
    p.account,
    p.params,
  ]);
}

export async function sendCreateOrder(p: Parameters<typeof getSendCreateOrderCalldata>[0]) {
  const calldata = await getSendCreateOrderCalldata(p);
  return sendRelayTransaction({
    calldata,
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
  srcChainId?: BigNumberish; // for multichain actions
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
    signature = await getUpdateOrderSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }

  const updateOrderCalldata = p.srcChainId
    ? p.relayRouter.interface.encodeFunctionData("updateOrder", [
        { ...relayParams, signature },
        p.account,
        p.srcChainId,
        p.params,
      ])
    : p.relayRouter.interface.encodeFunctionData("updateOrder", [{ ...relayParams, signature }, p.account, p.params]);
  return sendRelayTransaction({
    calldata: updateOrderCalldata,
    ...p,
  });
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
  srcChainId?: BigNumberish; // for multichain actions
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
    signature = await getCancelOrderSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }
  const cancelOrderCalldata = p.srcChainId
    ? p.relayRouter.interface.encodeFunctionData("cancelOrder", [
        { ...relayParams, signature },
        p.account,
        p.srcChainId,
        p.key,
      ])
    : p.relayRouter.interface.encodeFunctionData("cancelOrder", [{ ...relayParams, signature }, p.account, p.key]);
  return sendRelayTransaction({
    calldata: cancelOrderCalldata,
    ...p,
  });
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
  srcChainId?: BigNumberish;
  desChainId: BigNumberish;
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
  const batchCalldata = p.srcChainId
    ? p.relayRouter.interface.encodeFunctionData("batch", [
        { ...relayParams, signature },
        p.account,
        p.srcChainId,
        {
          createOrderParamsList: p.createOrderParamsList,
          updateOrderParamsList: p.updateOrderParamsList,
          cancelOrderKeys: p.cancelOrderKeys,
        },
      ])
    : p.relayRouter.interface.encodeFunctionData("batch", [
        { ...relayParams, signature },
        p.account,
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

export async function sendSetTraderReferralCode(p: {
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
  referralCode: string;
  chainId: BigNumberish;
  account: string;
  deadline: BigNumberish;
  srcChainId?: BigNumberish; // for multichain actions
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
    signature = await getSetTraderReferralCodeSignature({
      ...p,
      relayParams,
      verifyingContract: p.relayRouter.address,
    });
  }

  const setTraderReferralCodeCalldata = p.relayRouter.interface.encodeFunctionData("setTraderReferralCode", [
    { ...relayParams, signature },
    p.account,
    p.srcChainId,
    p.referralCode,
  ]);

  return sendRelayTransaction({
    calldata: setTraderReferralCodeCalldata,
    ...p,
  });
}
