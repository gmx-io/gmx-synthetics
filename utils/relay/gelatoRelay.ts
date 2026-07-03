import { BigNumberish, ethers } from "ethers";
import { CreateOrderParams, UpdateOrderParams, sendRelayTransaction, getRelayParams } from "./helpers";
import {
  getBatchSignature,
  getCreateOrderSignature,
  getCreateTwapOrderSignature,
  getUpdateOrderSignature,
  getCancelOrderSignature,
  getSetTraderReferralCodeSignature,
  getRegisterCodeSignature,
  getStakeGmxSignature,
  getUnstakeGmxSignature,
  getStakeEsGmxSignature,
  getUnstakeEsGmxSignature,
  getHandleStakingRewardsSignature,
  getCompoundStakingRewardsSignature,
  getVestEsGmxSignature,
  getDelegateGovGmxSignature,
  getSignalStakingTransferSignature,
  getAcceptStakingTransferSignature,
  getWithdrawFromWalletSignature,
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

export async function getSendCreateTwapOrderCalldata(
  p: Parameters<typeof getSendCreateOrderCalldata>[0] & {
    twapCount: BigNumberish;
    interval: BigNumberish;
  }
) {
  const relayParams = await getRelayParams(p);

  let signature = p.signature;
  if (!signature) {
    signature = await getCreateTwapOrderSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }

  return p.relayRouter.interface.encodeFunctionData("createTwapOrder", [
    { ...relayParams, signature },
    p.account,
    p.params,
    p.twapCount,
    p.interval,
  ]);
}

export async function sendCreateTwapOrder(p: Parameters<typeof getSendCreateTwapOrderCalldata>[0]) {
  const calldata = await getSendCreateTwapOrderCalldata(p);
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
    decreasePositionSwapType: BigNumberish;
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

export async function sendRegisterCode(p: {
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
    signature = await getRegisterCodeSignature({
      ...p,
      relayParams,
      verifyingContract: p.relayRouter.address,
    });
  }

  const registerCodeCalldata = p.relayRouter.interface.encodeFunctionData("registerCode", [
    { ...relayParams, signature },
    p.account,
    p.srcChainId,
    p.referralCode,
  ]);

  return sendRelayTransaction({
    calldata: registerCodeCalldata,
    ...p,
  });
}

// Staking relay helpers

interface StakingRelayParams {
  sender: ethers.Signer;
  signer: ethers.Signer;
  feeParams: {
    feeToken: string;
    feeAmount: BigNumberish;
    feeSwapPath: string[];
  };
  chainId: BigNumberish;
  account: string;
  deadline: BigNumberish;
  srcChainId?: BigNumberish;
  desChainId: BigNumberish;
  userNonce?: BigNumberish;
  relayRouter: ethers.Contract;
  signature?: string;
  gelatoRelayFeeToken: string;
  gelatoRelayFeeAmount: BigNumberish;
}

export async function sendStakeGmx(p: StakingRelayParams & { amount: BigNumberish }) {
  const relayParams = await getRelayParams(p);
  let signature = p.signature;
  if (!signature) {
    signature = await getStakeGmxSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }
  const calldata = p.relayRouter.interface.encodeFunctionData("stakeGmx", [
    { ...relayParams, signature },
    p.account,
    p.srcChainId,
    p.amount,
  ]);
  return sendRelayTransaction({ calldata, ...p });
}

export async function sendUnstakeGmx(p: StakingRelayParams & { amount: BigNumberish }) {
  const relayParams = await getRelayParams(p);
  let signature = p.signature;
  if (!signature) {
    signature = await getUnstakeGmxSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }
  const calldata = p.relayRouter.interface.encodeFunctionData("unstakeGmx", [
    { ...relayParams, signature },
    p.account,
    p.srcChainId,
    p.amount,
  ]);
  return sendRelayTransaction({ calldata, ...p });
}

export async function sendStakeEsGmx(p: StakingRelayParams & { amount: BigNumberish }) {
  const relayParams = await getRelayParams(p);
  let signature = p.signature;
  if (!signature) {
    signature = await getStakeEsGmxSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }
  const calldata = p.relayRouter.interface.encodeFunctionData("stakeEsGmx", [
    { ...relayParams, signature },
    p.account,
    p.srcChainId,
    p.amount,
  ]);
  return sendRelayTransaction({ calldata, ...p });
}

export async function sendUnstakeEsGmx(p: StakingRelayParams & { amount: BigNumberish }) {
  const relayParams = await getRelayParams(p);
  let signature = p.signature;
  if (!signature) {
    signature = await getUnstakeEsGmxSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }
  const calldata = p.relayRouter.interface.encodeFunctionData("unstakeEsGmx", [
    { ...relayParams, signature },
    p.account,
    p.srcChainId,
    p.amount,
  ]);
  return sendRelayTransaction({ calldata, ...p });
}

export async function sendHandleStakingRewards(p: StakingRelayParams & { params: any }) {
  const relayParams = await getRelayParams(p);
  let signature = p.signature;
  if (!signature) {
    signature = await getHandleStakingRewardsSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }
  const calldata = p.relayRouter.interface.encodeFunctionData("handleStakingRewards", [
    { ...relayParams, signature },
    p.account,
    p.srcChainId,
    p.params,
  ]);
  return sendRelayTransaction({ calldata, ...p });
}

export async function sendCompoundStakingRewards(p: StakingRelayParams) {
  const relayParams = await getRelayParams(p);
  let signature = p.signature;
  if (!signature) {
    signature = await getCompoundStakingRewardsSignature({
      ...p,
      relayParams,
      verifyingContract: p.relayRouter.address,
    });
  }
  const calldata = p.relayRouter.interface.encodeFunctionData("compoundStakingRewards", [
    { ...relayParams, signature },
    p.account,
    p.srcChainId,
  ]);
  return sendRelayTransaction({ calldata, ...p });
}

export async function sendVestEsGmx(p: StakingRelayParams & { amount: BigNumberish }) {
  const relayParams = await getRelayParams(p);
  let signature = p.signature;
  if (!signature) {
    signature = await getVestEsGmxSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }
  const calldata = p.relayRouter.interface.encodeFunctionData("vestEsGmx", [
    { ...relayParams, signature },
    p.account,
    p.srcChainId,
    p.amount,
  ]);
  return sendRelayTransaction({ calldata, ...p });
}

export async function sendDelegateGovGmx(p: StakingRelayParams & { delegatee: string }) {
  const relayParams = await getRelayParams(p);
  let signature = p.signature;
  if (!signature) {
    signature = await getDelegateGovGmxSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }
  const calldata = p.relayRouter.interface.encodeFunctionData("delegateGovGmx", [
    { ...relayParams, signature },
    p.account,
    p.srcChainId,
    p.delegatee,
  ]);
  return sendRelayTransaction({ calldata, ...p });
}

export async function sendSignalStakingTransfer(p: StakingRelayParams & { receiver: string }) {
  const relayParams = await getRelayParams(p);
  let signature = p.signature;
  if (!signature) {
    signature = await getSignalStakingTransferSignature({
      ...p,
      relayParams,
      verifyingContract: p.relayRouter.address,
    });
  }
  const calldata = p.relayRouter.interface.encodeFunctionData("signalStakingTransfer", [
    { ...relayParams, signature },
    p.account,
    p.srcChainId,
    p.receiver,
  ]);
  return sendRelayTransaction({ calldata, ...p });
}

export async function sendAcceptStakingTransfer(p: StakingRelayParams & { stakingSender: string }) {
  const relayParams = await getRelayParams(p);
  let signature = p.signature;
  if (!signature) {
    signature = await getAcceptStakingTransferSignature({
      ...p,
      relayParams,
      verifyingContract: p.relayRouter.address,
      sender: p.stakingSender,
    });
  }
  const calldata = p.relayRouter.interface.encodeFunctionData("acceptStakingTransfer", [
    { ...relayParams, signature },
    p.account,
    p.srcChainId,
    p.stakingSender,
  ]);
  return sendRelayTransaction({ calldata, ...p });
}

export async function sendWithdrawFromWallet(p: StakingRelayParams & { token: string; amount: BigNumberish }) {
  const relayParams = await getRelayParams(p);
  let signature = p.signature;
  if (!signature) {
    signature = await getWithdrawFromWalletSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }
  const calldata = p.relayRouter.interface.encodeFunctionData("withdrawFromWallet", [
    { ...relayParams, signature },
    p.account,
    p.srcChainId,
    p.token,
    p.amount,
  ]);
  return sendRelayTransaction({ calldata, ...p });
}
