import { BigNumberish, ethers } from "ethers";
import { GELATO_RELAY_ADDRESS } from "./addresses";
import { hashRelayParams, signTypedData } from "./helpers";
import { getDomain } from "./helpers";
import { getRelayParams } from "./helpers";
import { exec } from "child_process";
import {
  getCancelOrderSignature,
  getClaimAffiliateRewardsSignature,
  getCreateOrderSignature,
  getUpdateOrderSignature,
} from "./gelatoRelay";

interface SendCreate {
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
  feeParams: {
    feeToken: string;
    feeAmount: BigNumberish;
    feeSwapPath: string[];
  };
  transferRequests: {
    tokens: string[];
    receivers: string[];
    amounts: BigNumberish[];
  };
  account: string;
  params: any;
  signature?: string;
  userNonce?: BigNumberish;
  deadline: BigNumberish;
  chainId: BigNumberish;
  srcChainId: BigNumberish;
  desChainId: BigNumberish;
  relayRouter: ethers.Contract;
  relayFeeToken: string;
  relayFeeAmount: BigNumberish;
}

export async function sendCreateDeposit(p: SendCreate) {
  const relayParams = await getRelayParams(p);

  let signature = p.signature;
  if (!signature) {
    signature = await getCreateDepositSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }

  const createDepositCalldata = p.relayRouter.interface.encodeFunctionData("createDeposit", [
    { ...relayParams, signature },
    p.account,
    p.srcChainId,
    p.transferRequests,
    p.params,
  ]);
  const calldata = ethers.utils.solidityPack(
    ["bytes", "address", "address", "uint256"],
    [createDepositCalldata, GELATO_RELAY_ADDRESS, p.relayFeeToken, p.relayFeeAmount]
  );
  return p.sender.sendTransaction({
    to: p.relayRouter.address,
    data: calldata,
  });
}

export async function sendCreateWithdrawal(p: SendCreate) {
  const relayParams = await getRelayParams(p);
  let signature = p.signature;
  if (!signature) {
    signature = await getCreateWithdrawalSignature({
      signer: p.signer,
      relayParams,
      transferRequests: p.transferRequests,
      verifyingContract: p.relayRouter.address,
      params: p.params,
      chainId: p.chainId,
    });
  }
  const createWithdrawalCalldata = p.relayRouter.interface.encodeFunctionData("createWithdrawal", [
    { ...relayParams, signature },
    p.account,
    p.srcChainId,
    p.transferRequests,
    p.params,
  ]);
  const calldata = ethers.utils.solidityPack(
    ["bytes", "address", "address", "uint256"],
    [createWithdrawalCalldata, GELATO_RELAY_ADDRESS, p.relayFeeToken, p.relayFeeAmount]
  );
  return p.sender.sendTransaction({
    to: p.relayRouter.address,
    data: calldata,
  });
}

export async function sendCreateShift(p: SendCreate) {
  const relayParams = await getRelayParams(p);
  let signature = p.signature;
  if (!signature) {
    signature = await getCreateShiftSignature({
      signer: p.signer,
      relayParams,
      transferRequests: p.transferRequests,
      verifyingContract: p.relayRouter.address,
      params: p.params,
      chainId: p.chainId,
    });
  }
  const createShiftCalldata = p.relayRouter.interface.encodeFunctionData("createShift", [
    { ...relayParams, signature },
    p.account,
    p.srcChainId,
    p.transferRequests,
    p.params,
  ]);
  const calldata = ethers.utils.solidityPack(
    ["bytes", "address", "address", "uint256"],
    [createShiftCalldata, GELATO_RELAY_ADDRESS, p.relayFeeToken, p.relayFeeAmount]
  );
  return p.sender.sendTransaction({
    to: p.relayRouter.address,
    data: calldata,
  });
}

export async function sendCreateGlvDeposit(p: SendCreate) {
  const relayParams = await getRelayParams(p);

  let signature = p.signature;
  if (!signature) {
    signature = await getCreateGlvDepositSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }

  const createGlvDepositCalldata = p.relayRouter.interface.encodeFunctionData("createGlvDeposit", [
    { ...relayParams, signature },
    p.account,
    p.srcChainId,
    p.transferRequests,
    p.params,
  ]);
  const calldata = ethers.utils.solidityPack(
    ["bytes", "address", "address", "uint256"],
    [createGlvDepositCalldata, GELATO_RELAY_ADDRESS, p.relayFeeToken, p.relayFeeAmount]
  );
  return p.sender.sendTransaction({
    to: p.relayRouter.address,
    data: calldata,
  });
}

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
  srcChainId: BigNumberish;
  deadline: BigNumberish;
  desChainId: BigNumberish;
  relayRouter: ethers.Contract;
  chainId: BigNumberish;
  relayFeeToken: string;
  relayFeeAmount: BigNumberish;
}) {
  const relayParams = await getRelayParams(p);

  let signature = p.signature;
  if (!signature) {
    signature = await getCreateOrderSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }

  const createOrderCalldata = p.relayRouter.interface.encodeFunctionData("createOrder", [
    { ...relayParams, signature },
    p.account,
    p.srcChainId,
    p.collateralDeltaAmount,
    p.params,
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

export async function sendClaimAffiliateRewards(p: {
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
  feeParams: {
    feeToken: string;
    feeAmount: BigNumberish;
    feeSwapPath: string[];
  };
  account: string;
  params: any;
  signature?: string;
  userNonce?: BigNumberish;
  srcChainId: BigNumberish;
  deadline: BigNumberish;
  desChainId: BigNumberish;
  relayRouter: ethers.Contract;
  chainId: BigNumberish;
  relayFeeToken: string;
  relayFeeAmount: BigNumberish;
}) {
  const relayParams = await getRelayParams(p);

  let signature = p.signature;
  if (!signature) {
    signature = await getClaimAffiliateRewardsSignature({
      ...p,
      relayParams,
      verifyingContract: p.relayRouter.address,
    });
  }

  const claimAffiliateRewardsCalldata = p.relayRouter.interface.encodeFunctionData("claimAffiliateRewards", [
    { ...relayParams, signature },
    p.account,
    p.srcChainId,
    p.params.markets,
    p.params.tokens,
    p.params.receiver,
  ]);
  const calldata = ethers.utils.solidityPack(
    ["bytes", "address", "address", "uint256"],
    [claimAffiliateRewardsCalldata, GELATO_RELAY_ADDRESS, p.relayFeeToken, p.relayFeeAmount]
  );
  return p.sender.sendTransaction({
    to: p.relayRouter.address,
    data: calldata,
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
  srcChainId: BigNumberish;
  desChainId: BigNumberish;
  userNonce?: BigNumberish;
  relayRouter: ethers.Contract;
  signature?: string;
  relayFeeToken: string;
  relayFeeAmount: BigNumberish;
  increaseExecutionFee: boolean;
}) {
  const relayParams = await getRelayParams(p);

  let signature = p.signature;
  if (!signature) {
    signature = await getUpdateOrderSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }

  const UpdateOrderCalldata = p.relayRouter.interface.encodeFunctionData("updateOrder", [
    { ...relayParams, signature },
    p.account,
    p.srcChainId,
    p.key,
    p.params,
    p.increaseExecutionFee,
  ]);
  const calldata = ethers.utils.solidityPack(
    ["bytes", "address", "address", "uint256"],
    [UpdateOrderCalldata, GELATO_RELAY_ADDRESS, p.relayFeeToken, p.relayFeeAmount]
  );
  return p.sender.sendTransaction({
    to: p.relayRouter.address,
    data: calldata,
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
  feeParams: {
    feeToken: string;
    feeAmount: BigNumberish;
    feeSwapPath: string[];
  };
  key: string;
  chainId: BigNumberish;
  account: string;
  deadline: BigNumberish;
  srcChainId: BigNumberish;
  desChainId: BigNumberish;
  userNonce?: BigNumberish;
  relayRouter: ethers.Contract;
  signature?: string;
  relayFeeToken: string;
  relayFeeAmount: BigNumberish;
}) {
  const relayParams = await getRelayParams(p);

  let signature = p.signature;
  if (!signature) {
    signature = await getCancelOrderSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }

  const CancelOrderCalldata = p.relayRouter.interface.encodeFunctionData("cancelOrder", [
    { ...relayParams, signature },
    p.account,
    p.srcChainId,
    p.key,
  ]);
  const calldata = ethers.utils.solidityPack(
    ["bytes", "address", "address", "uint256"],
    [CancelOrderCalldata, GELATO_RELAY_ADDRESS, p.relayFeeToken, p.relayFeeAmount]
  );
  return p.sender.sendTransaction({
    to: p.relayRouter.address,
    data: calldata,
  });
}

export async function sendCreateGlvWithdrawal(p: SendCreate) {
  const relayParams = await getRelayParams(p);

  let signature = p.signature;
  if (!signature) {
    signature = await getCreateGlvWithdrawalSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }

  const createGlvWithdrawalCalldata = p.relayRouter.interface.encodeFunctionData("createGlvWithdrawal", [
    { ...relayParams, signature },
    p.account,
    p.srcChainId,
    p.transferRequests,
    p.params,
  ]);
  const calldata = ethers.utils.solidityPack(
    ["bytes", "address", "address", "uint256"],
    [createGlvWithdrawalCalldata, GELATO_RELAY_ADDRESS, p.relayFeeToken, p.relayFeeAmount]
  );
  return p.sender.sendTransaction({
    to: p.relayRouter.address,
    data: calldata,
  });
}

export async function sendBridgeOut(p: {
  signer: ethers.Signer;
  sender: ethers.Signer;
  feeParams: {
    feeToken: string;
    feeAmount: BigNumberish;
    feeSwapPath: string[];
  };
  provider: string;
  account: string;
  data: string;
  params: any;
  signature?: string;
  userNonce?: BigNumberish;
  deadline: BigNumberish;
  chainId: BigNumberish;
  srcChainId: BigNumberish;
  desChainId: BigNumberish;
  relayRouter: ethers.Contract;
  relayFeeToken: string;
  relayFeeAmount: BigNumberish;
}) {
  const relayParams = await getRelayParams(p);
  let signature = p.signature;
  if (!signature) {
    signature = await getBridgeOutSignature({ ...p, relayParams, verifyingContract: p.relayRouter.address });
  }

  const bridgeOutCalldata = p.relayRouter.interface.encodeFunctionData("bridgeOut", [
    { ...relayParams, signature },
    p.provider,
    p.account,
    p.srcChainId,
    p.data,
    p.params,
  ]);
  const calldata = ethers.utils.solidityPack(
    ["bytes", "address", "address", "uint256"],
    [bridgeOutCalldata, GELATO_RELAY_ADDRESS, p.relayFeeToken, p.relayFeeAmount]
  );
  return p.sender.sendTransaction({
    to: p.relayRouter.address,
    data: calldata,
  });
}

async function getBridgeOutSignature({
  signer,
  relayParams,
  verifyingContract,
  params,
  chainId,
}: {
  signer: ethers.Signer;
  relayParams: any;
  verifyingContract: string;
  params: any;
  chainId: BigNumberish;
}) {
  if (relayParams.userNonce === undefined) {
    throw new Error("userNonce is required");
  }
  const types = {
    BridgeOut: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "relayParams", type: "bytes32" },
    ],
  };
  const typedData = {
    token: params.token,
    amount: params.amount,
    relayParams: hashRelayParams(relayParams),
  };
  const domain = getDomain(chainId, verifyingContract);

  return signTypedData(signer, domain, types, typedData);
}

async function getCreateDepositSignature({
  signer,
  relayParams,
  transferRequests,
  verifyingContract,
  params,
  chainId,
}: {
  signer: ethers.Signer;
  relayParams: any;
  transferRequests: { tokens: string[]; receivers: string[]; amounts: BigNumberish[] };
  verifyingContract: string;
  params: any;
  chainId: BigNumberish;
}) {
  if (relayParams.userNonce === undefined) {
    throw new Error("userNonce is required");
  }
  const types = {
    CreateDeposit: [
      { name: "transferTokens", type: "address[]" },
      { name: "transferReceivers", type: "address[]" },
      { name: "transferAmounts", type: "uint256[]" },
      { name: "addresses", type: "CreateDepositAddresses" },
      { name: "minMarketTokens", type: "uint256" },
      { name: "shouldUnwrapNativeToken", type: "bool" },
      { name: "executionFee", type: "uint256" },
      { name: "callbackGasLimit", type: "uint256" },
      { name: "dataList", type: "bytes32[]" },
      { name: "relayParams", type: "bytes32" },
    ],
    CreateDepositAddresses: [
      { name: "receiver", type: "address" },
      { name: "callbackContract", type: "address" },
      { name: "uiFeeReceiver", type: "address" },
      { name: "market", type: "address" },
      { name: "initialLongToken", type: "address" },
      { name: "initialShortToken", type: "address" },
      { name: "longTokenSwapPath", type: "address[]" },
      { name: "shortTokenSwapPath", type: "address[]" },
    ],
  };
  const typedData = {
    transferTokens: transferRequests.tokens,
    transferReceivers: transferRequests.receivers,
    transferAmounts: transferRequests.amounts,
    addresses: params.addresses,
    minMarketTokens: params.minMarketTokens,
    shouldUnwrapNativeToken: params.shouldUnwrapNativeToken,
    executionFee: params.executionFee,
    callbackGasLimit: params.callbackGasLimit,
    dataList: params.dataList,
    relayParams: hashRelayParams(relayParams),
  };
  const domain = getDomain(chainId, verifyingContract);

  return signTypedData(signer, domain, types, typedData);
}

async function getCreateWithdrawalSignature({
  signer,
  relayParams,
  transferRequests,
  verifyingContract,
  params,
  chainId,
}: {
  signer: ethers.Signer;
  relayParams: any;
  transferRequests: { tokens: string[]; receivers: string[]; amounts: BigNumberish[] };
  verifyingContract: string;
  params: any;
  chainId: BigNumberish;
}) {
  if (relayParams.userNonce === undefined) {
    throw new Error("userNonce is required");
  }
  const types = {
    CreateWithdrawal: [
      { name: "transferTokens", type: "address[]" },
      { name: "transferReceivers", type: "address[]" },
      { name: "transferAmounts", type: "uint256[]" },
      { name: "addresses", type: "CreateWithdrawalAddresses" },
      { name: "minLongTokenAmount", type: "uint256" },
      { name: "minShortTokenAmount", type: "uint256" },
      { name: "shouldUnwrapNativeToken", type: "bool" },
      { name: "executionFee", type: "uint256" },
      { name: "callbackGasLimit", type: "uint256" },
      { name: "dataList", type: "bytes32[]" },
      { name: "relayParams", type: "bytes32" },
    ],
    CreateWithdrawalAddresses: [
      { name: "receiver", type: "address" },
      { name: "callbackContract", type: "address" },
      { name: "uiFeeReceiver", type: "address" },
      { name: "market", type: "address" },
      { name: "longTokenSwapPath", type: "address[]" },
      { name: "shortTokenSwapPath", type: "address[]" },
    ],
  };
  const typedData = {
    transferTokens: transferRequests.tokens,
    transferReceivers: transferRequests.receivers,
    transferAmounts: transferRequests.amounts,
    addresses: params.addresses,
    minLongTokenAmount: params.minLongTokenAmount,
    minShortTokenAmount: params.minShortTokenAmount,
    shouldUnwrapNativeToken: params.shouldUnwrapNativeToken,
    executionFee: params.executionFee,
    callbackGasLimit: params.callbackGasLimit,
    dataList: params.dataList,
    relayParams: hashRelayParams(relayParams),
  };
  const domain = getDomain(chainId, verifyingContract);
  return signTypedData(signer, domain, types, typedData);
}

async function getCreateShiftSignature({
  signer,
  relayParams,
  transferRequests,
  verifyingContract,
  params,
  chainId,
}: {
  signer: ethers.Signer;
  relayParams: any;
  transferRequests: { tokens: string[]; receivers: string[]; amounts: BigNumberish[] };
  verifyingContract: string;
  params: {
    addresses: {
      receiver: string;
      callbackContract: string;
      uiFeeReceiver: string;
      fromMarket: string;
      toMarket: string;
    };
    minMarketTokens: BigNumberish;
    executionFee: BigNumberish;
    callbackGasLimit: BigNumberish;
    dataList: string[];
  };
  chainId: BigNumberish;
}) {
  if (relayParams.userNonce === undefined) {
    throw new Error("userNonce is required");
  }

  const types = {
    CreateShift: [
      { name: "transferTokens", type: "address[]" },
      { name: "transferReceivers", type: "address[]" },
      { name: "transferAmounts", type: "uint256[]" },
      { name: "addresses", type: "CreateShiftAddresses" },
      { name: "minMarketTokens", type: "uint256" },
      { name: "executionFee", type: "uint256" },
      { name: "callbackGasLimit", type: "uint256" },
      { name: "dataList", type: "bytes32[]" },
      { name: "relayParams", type: "bytes32" },
    ],
    CreateShiftAddresses: [
      { name: "receiver", type: "address" },
      { name: "callbackContract", type: "address" },
      { name: "uiFeeReceiver", type: "address" },
      { name: "fromMarket", type: "address" },
      { name: "toMarket", type: "address" },
    ],
  };

  const typedData = {
    transferTokens: transferRequests.tokens,
    transferReceivers: transferRequests.receivers,
    transferAmounts: transferRequests.amounts,
    addresses: params.addresses,
    minMarketTokens: params.minMarketTokens,
    executionFee: params.executionFee,
    callbackGasLimit: params.callbackGasLimit,
    dataList: params.dataList,
    relayParams: hashRelayParams(relayParams),
  };

  const domain = getDomain(chainId, verifyingContract);
  return signTypedData(signer, domain, types, typedData);
}

async function getCreateGlvDepositSignature({
  signer,
  relayParams,
  transferRequests,
  verifyingContract,
  params,
  chainId,
}: {
  signer: ethers.Signer;
  relayParams: any;
  transferRequests: { tokens: string[]; receivers: string[]; amounts: BigNumberish[] };
  verifyingContract: string;
  params: any;
  chainId: BigNumberish;
}) {
  if (relayParams.userNonce === undefined) {
    throw new Error("userNonce is required");
  }
  const types = {
    CreateGlvDeposit: [
      { name: "transferTokens", type: "address[]" },
      { name: "transferReceivers", type: "address[]" },
      { name: "transferAmounts", type: "uint256[]" },
      { name: "addresses", type: "CreateGlvDepositAddresses" },
      { name: "minGlvTokens", type: "uint256" },
      { name: "executionFee", type: "uint256" },
      { name: "callbackGasLimit", type: "uint256" },
      { name: "shouldUnwrapNativeToken", type: "bool" },
      { name: "isMarketTokenDeposit", type: "bool" },
      { name: "dataList", type: "bytes32[]" },
      { name: "relayParams", type: "bytes32" },
    ],
    CreateGlvDepositAddresses: [
      { name: "glv", type: "address" },
      { name: "market", type: "address" },
      { name: "receiver", type: "address" },
      { name: "callbackContract", type: "address" },
      { name: "uiFeeReceiver", type: "address" },
      { name: "initialLongToken", type: "address" },
      { name: "initialShortToken", type: "address" },
      { name: "longTokenSwapPath", type: "address[]" },
      { name: "shortTokenSwapPath", type: "address[]" },
    ],
  };
  const typedData = {
    transferTokens: transferRequests.tokens,
    transferReceivers: transferRequests.receivers,
    transferAmounts: transferRequests.amounts,
    addresses: params.addresses,
    minGlvTokens: params.minGlvTokens,
    executionFee: params.executionFee,
    callbackGasLimit: params.callbackGasLimit,
    shouldUnwrapNativeToken: params.shouldUnwrapNativeToken,
    isMarketTokenDeposit: params.isMarketTokenDeposit,
    dataList: params.dataList,
    relayParams: hashRelayParams(relayParams),
  };
  const domain = getDomain(chainId, verifyingContract);

  return signTypedData(signer, domain, types, typedData);
}

async function getCreateGlvWithdrawalSignature({
  signer,
  relayParams,
  transferRequests,
  verifyingContract,
  params,
  chainId,
}: {
  signer: ethers.Signer;
  relayParams: any;
  transferRequests: { tokens: string[]; receivers: string[]; amounts: BigNumberish[] };
  verifyingContract: string;
  params: any;
  chainId: BigNumberish;
}) {
  if (relayParams.userNonce === undefined) {
    throw new Error("userNonce is required");
  }
  const types = {
    CreateGlvWithdrawal: [
      { name: "transferTokens", type: "address[]" },
      { name: "transferReceivers", type: "address[]" },
      { name: "transferAmounts", type: "uint256[]" },
      { name: "addresses", type: "CreateGlvWithdrawalAddresses" },
      { name: "minLongTokenAmount", type: "uint256" },
      { name: "minShortTokenAmount", type: "uint256" },
      { name: "shouldUnwrapNativeToken", type: "bool" },
      { name: "executionFee", type: "uint256" },
      { name: "callbackGasLimit", type: "uint256" },
      { name: "dataList", type: "bytes32[]" },
      { name: "relayParams", type: "bytes32" },
    ],
    CreateGlvWithdrawalAddresses: [
      { name: "receiver", type: "address" },
      { name: "callbackContract", type: "address" },
      { name: "uiFeeReceiver", type: "address" },
      { name: "market", type: "address" },
      { name: "glv", type: "address" },
      { name: "longTokenSwapPath", type: "address[]" },
      { name: "shortTokenSwapPath", type: "address[]" },
    ],
  };
  const typedData = {
    transferTokens: transferRequests.tokens,
    transferReceivers: transferRequests.receivers,
    transferAmounts: transferRequests.amounts,
    addresses: params.addresses,
    minLongTokenAmount: params.minLongTokenAmount,
    minShortTokenAmount: params.minShortTokenAmount,
    shouldUnwrapNativeToken: params.shouldUnwrapNativeToken,
    executionFee: params.executionFee,
    callbackGasLimit: params.callbackGasLimit,
    dataList: params.dataList,
    relayParams: hashRelayParams(relayParams),
  };
  const domain = getDomain(chainId, verifyingContract);

  return signTypedData(signer, domain, types, typedData);
}
