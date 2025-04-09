import { BigNumberish, ethers } from "ethers";
import { sendRelayTransaction, UpdateOrderParams } from "./helpers";
import { getRelayParams, CreateOrderParams } from "./helpers";
import { getBatchSignature } from "./signatures";
import { getCancelOrderSignature } from "./signatures";
import { getUpdateOrderSignature } from "./signatures";
import { getCreateOrderSignature } from "./signatures";

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

  return p.relayRouter.interface.encodeFunctionData("createOrder", [
    { ...relayParams, signature },
    p.account,
    p.params,
  ]);
}

// export async function getCreateOrderSignature({
//   signer,
//   relayParams,
//   collateralDeltaAmount,
//   verifyingContract,
//   params,
//   chainId,
// }) {
//   if (relayParams.userNonce === undefined) {
//     throw new Error("userNonce is required");
//   }
//   const types = {
//     CreateOrder: [
//       { name: "collateralDeltaAmount", type: "uint256" },
//       { name: "addresses", type: "CreateOrderAddresses" },
//       { name: "numbers", type: "CreateOrderNumbers" },
//       { name: "orderType", type: "uint256" },
//       { name: "decreasePositionSwapType", type: "uint256" },
//       { name: "isLong", type: "bool" },
//       { name: "shouldUnwrapNativeToken", type: "bool" },
//       { name: "autoCancel", type: "bool" },
//       { name: "referralCode", type: "bytes32" },
//       { name: "dataList", type: "bytes32[]" },
//       { name: "relayParams", type: "bytes32" },
//     ],
//     CreateOrderAddresses: [
//       { name: "receiver", type: "address" },
//       { name: "cancellationReceiver", type: "address" },
//       { name: "callbackContract", type: "address" },
//       { name: "uiFeeReceiver", type: "address" },
//       { name: "market", type: "address" },
//       { name: "initialCollateralToken", type: "address" },
//       { name: "swapPath", type: "address[]" },
//     ],
//     CreateOrderNumbers: [
//       { name: "sizeDeltaUsd", type: "uint256" },
//       { name: "initialCollateralDeltaAmount", type: "uint256" },
//       { name: "triggerPrice", type: "uint256" },
//       { name: "acceptablePrice", type: "uint256" },
//       { name: "executionFee", type: "uint256" },
//       { name: "callbackGasLimit", type: "uint256" },
//       { name: "minOutputAmount", type: "uint256" },
//       { name: "validFromTime", type: "uint256" },
//     ],
//   };
//   const domain = {
//     name: "GmxBaseGelatoRelayRouter",
//     version: "1",
//     chainId,
//     verifyingContract,
//   };
//   const typedData = {
//     collateralDeltaAmount,
//     addresses: params.addresses,
//     numbers: params.numbers,
//     orderType: params.orderType,
//     decreasePositionSwapType: params.decreasePositionSwapType,
//     isLong: params.isLong,
//     shouldUnwrapNativeToken: params.shouldUnwrapNativeToken,
//     autoCancel: false,
//     referralCode: params.referralCode,
//     dataList: params.dataList,
//     relayParams: hashRelayParams(relayParams),
//   };

//   return signTypedData(signer, domain, types, typedData);
// }

// export async function getClaimFundingFeesSignature({ signer, relayParams, verifyingContract, params, chainId }) {
//   if (relayParams.userNonce === undefined) {
//     throw new Error("userNonce is required");
//   }
//   const types = {
//     ClaimFundingFees: [
//       { name: "markets", type: "address[]" },
//       { name: "tokens", type: "address[]" },
//       { name: "receiver", type: "address" },
//       { name: "relayParams", type: "bytes32" },
//     ],
//   };
//   const domain = {
//     name: "GmxBaseGelatoRelayRouter",
//     version: "1",
//     chainId,
//     verifyingContract,
//   };
//   const typedData = {
//     markets: params.markets,
//     tokens: params.tokens,
//     receiver: params.receiver,
//     relayParams: hashRelayParams(relayParams),
//   };

//   return signTypedData(signer, domain, types, typedData);
// }

// export async function getClaimCollateralSignature({ signer, relayParams, verifyingContract, params, chainId }) {
//   if (relayParams.userNonce === undefined) {
//     throw new Error("userNonce is required");
//   }
//   const types = {
//     ClaimCollateral: [
//       { name: "markets", type: "address[]" },
//       { name: "tokens", type: "address[]" },
//       { name: "timeKeys", type: "uint256[]" },
//       { name: "receiver", type: "address" },
//       { name: "relayParams", type: "bytes32" },
//     ],
//   };
//   const domain = {
//     name: "GmxBaseGelatoRelayRouter",
//     version: "1",
//     chainId,
//     verifyingContract,
//   };
//   const typedData = {
//     markets: params.markets,
//     tokens: params.tokens,
//     timeKeys: params.timeKeys,
//     receiver: params.receiver,
//     relayParams: hashRelayParams(relayParams),
//   };

//   return signTypedData(signer, domain, types, typedData);
// }

// export async function getClaimAffiliateRewardsSignature({ signer, relayParams, verifyingContract, params, chainId }) {
//   if (relayParams.userNonce === undefined) {
//     throw new Error("userNonce is required");
//   }
//   const types = {
//     ClaimAffiliateRewards: [
//       { name: "markets", type: "address[]" },
//       { name: "tokens", type: "address[]" },
//       { name: "receiver", type: "address" },
//       { name: "relayParams", type: "bytes32" },
//     ],
//   };
//   const domain = {
//     name: "GmxBaseGelatoRelayRouter",
//     version: "1",
//     chainId,
//     verifyingContract,
//   };
//   const typedData = {
//     markets: params.markets,
//     tokens: params.tokens,
//     receiver: params.receiver,
//     relayParams: hashRelayParams(relayParams),
//   };

//   return signTypedData(signer, domain, types, typedData);
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

// export async function getUpdateOrderSignature({
//   signer,
//   relayParams,
//   verifyingContract,
//   params,
//   key,
//   deadline,
//   chainId,
//   increaseExecutionFee,
// }) {
//   if (relayParams.userNonce === undefined) {
//     throw new Error("userNonce is required");
//   }
//   const types = {
//     UpdateOrder: [
//       { name: "key", type: "bytes32" },
//       { name: "params", type: "UpdateOrderParams" },
//       { name: "increaseExecutionFee", type: "bool" },
//       { name: "relayParams", type: "bytes32" },
//     ],
//     UpdateOrderParams: [
//       { name: "sizeDeltaUsd", type: "uint256" },
//       { name: "acceptablePrice", type: "uint256" },
//       { name: "triggerPrice", type: "uint256" },
//       { name: "minOutputAmount", type: "uint256" },
//       { name: "validFromTime", type: "uint256" },
//       { name: "autoCancel", type: "bool" },
//     ],
//   };

//   const domain = getDomain(chainId, verifyingContract);
//   const typedData = {
//     key,
//     params,
//     deadline,
//     increaseExecutionFee,
//     relayParams: hashRelayParams(relayParams),
//   };

//   return signTypedData(signer, domain, types, typedData);
// }

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

// export async function getCancelOrderSignature({ signer, relayParams, verifyingContract, key, chainId }) {
//   if (relayParams.userNonce === undefined) {
//     throw new Error("userNonce is required");
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
  const batchCalldata = p.relayRouter.interface.encodeFunctionData("batch", [
    { ...relayParams, signature },
    p.account,
    {
      createOrderParamsList: p.createOrderParamsList,
      updateOrderParamsList: p.updateOrderParamsList,
      cancelOrderKeys: p.cancelOrderKeys,
    },
  ]);
  console.log("batchCalldata: ", batchCalldata);
  return sendRelayTransaction({
    calldata: batchCalldata,
    ...p,
  });
}
