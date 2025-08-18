import { ethers, BigNumberish } from "ethers";
import {
  getDomain,
  hashRelayParams,
  hashSubaccountApproval,
  RelayParams,
  signTypedData,
  SubaccountApproval,
  UpdateOrderParams,
  CreateOrderParams,
} from "./helpers";

export async function getCreateOrderSignature({
  signer,
  relayParams,
  subaccountApproval = undefined,
  account,
  verifyingContract,
  params,
  chainId,
  minified = false,
}: {
  signer: ethers.Signer;
  relayParams: RelayParams;
  subaccountApproval?: SubaccountApproval;
  account?: string;
  verifyingContract: string;
  params: any;
  chainId: BigNumberish;
  minified?: boolean;
}) {
  const types = {
    CreateOrder: [
      { name: "account", type: "address" },
      { name: "addresses", type: "CreateOrderAddresses" },
      { name: "numbers", type: "CreateOrderNumbers" },
      { name: "orderType", type: "uint256" },
      { name: "decreasePositionSwapType", type: "uint256" },
      { name: "isLong", type: "bool" },
      { name: "shouldUnwrapNativeToken", type: "bool" },
      { name: "autoCancel", type: "bool" },
      { name: "referralCode", type: "bytes32" },
      { name: "dataList", type: "bytes32[]" },
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
    account: subaccountApproval ? account : ethers.constants.AddressZero,
    addresses: params.addresses,
    numbers: params.numbers,
    orderType: params.orderType,
    decreasePositionSwapType: params.decreasePositionSwapType,
    isLong: params.isLong,
    shouldUnwrapNativeToken: params.shouldUnwrapNativeToken,
    autoCancel: false,
    referralCode: params.referralCode,
    dataList: params.dataList,
    relayParams: hashRelayParams(relayParams),
    subaccountApproval: subaccountApproval ? hashSubaccountApproval(subaccountApproval) : ethers.constants.HashZero,
  };

  return signTypedData(signer, domain, types, typedData, minified);
}

export async function getBatchSignature({
  signer,
  relayParams,
  createOrderParamsList,
  updateOrderParamsList,
  cancelOrderKeys,
  verifyingContract,
  chainId,
  account,
  subaccountApproval,
}: {
  signer: ethers.Signer;
  relayParams: RelayParams;
  createOrderParamsList: CreateOrderParams[];
  updateOrderParamsList: UpdateOrderParams[];
  cancelOrderKeys: string[];
  verifyingContract: string;
  chainId: BigNumberish;
  account?: string;
  subaccountApproval?: SubaccountApproval;
}) {
  if (relayParams.userNonce === undefined) {
    throw new Error("userNonce is required");
  }
  const types = {
    Batch: [
      { name: "account", type: "address" },
      { name: "createOrderParamsList", type: "CreateOrderParams[]" },
      { name: "updateOrderParamsList", type: "UpdateOrderParams[]" },
      { name: "cancelOrderKeys", type: "bytes32[]" },
      { name: "relayParams", type: "bytes32" },
      { name: "subaccountApproval", type: "bytes32" },
    ],
    CreateOrderParams: [
      { name: "addresses", type: "CreateOrderAddresses" },
      { name: "numbers", type: "CreateOrderNumbers" },
      { name: "orderType", type: "uint256" },
      { name: "decreasePositionSwapType", type: "uint256" },
      { name: "isLong", type: "bool" },
      { name: "shouldUnwrapNativeToken", type: "bool" },
      { name: "autoCancel", type: "bool" },
      { name: "referralCode", type: "bytes32" },
      { name: "dataList", type: "bytes32[]" },
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
    account: subaccountApproval ? account : ethers.constants.AddressZero,
    createOrderParamsList: createOrderParamsList.map((p) => ({
      addresses: p.addresses,
      numbers: p.numbers,
      orderType: p.orderType,
      decreasePositionSwapType: p.decreasePositionSwapType,
      isLong: p.isLong,
      shouldUnwrapNativeToken: p.shouldUnwrapNativeToken,
      autoCancel: false,
      referralCode: p.referralCode,
      dataList: p.dataList,
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
    subaccountApproval: subaccountApproval ? hashSubaccountApproval(subaccountApproval) : ethers.constants.HashZero,
  };

  return signTypedData(signer, domain, types, typedData);
}

export async function getUpdateOrderSignature({
  signer,
  relayParams,
  subaccountApproval = undefined,
  account = undefined,
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
    account: subaccountApproval ? account : ethers.constants.AddressZero,
    params,
    relayParams: hashRelayParams(relayParams),
    subaccountApproval: subaccountApproval ? hashSubaccountApproval(subaccountApproval) : ethers.constants.HashZero,
  };

  return signTypedData(signer, domain, types, typedData);
}

export async function getCancelOrderSignature({
  signer,
  relayParams,
  subaccountApproval = undefined,
  account = undefined,
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
    account: subaccountApproval ? account : ethers.constants.AddressZero,
    key,
    relayParams: hashRelayParams(relayParams),
    subaccountApproval: subaccountApproval ? hashSubaccountApproval(subaccountApproval) : ethers.constants.HashZero,
  };

  return signTypedData(signer, domain, types, typedData);
}

export async function getSetTraderReferralCodeSignature({
  signer,
  relayParams,
  verifyingContract,
  referralCode,
  chainId,
}) {
  if (relayParams.userNonce === undefined) {
    throw new Error("userNonce is required");
  }
  const types = {
    SetTraderReferralCode: [
      { name: "referralCode", type: "bytes32" },
      { name: "relayParams", type: "bytes32" },
    ],
  };
  const domain = {
    name: "GmxBaseGelatoRelayRouter",
    version: "1",
    chainId,
    verifyingContract,
  };
  const typedData = {
    referralCode: referralCode,
    relayParams: hashRelayParams(relayParams),
  };

  return signTypedData(signer, domain, types, typedData);
}

export async function getClaimFundingFeesSignature({ signer, relayParams, verifyingContract, params, chainId }) {
  if (relayParams.userNonce === undefined) {
    throw new Error("userNonce is required");
  }
  const types = {
    ClaimFundingFees: [
      { name: "markets", type: "address[]" },
      { name: "tokens", type: "address[]" },
      { name: "receiver", type: "address" },
      { name: "relayParams", type: "bytes32" },
    ],
  };
  const domain = {
    name: "GmxBaseGelatoRelayRouter",
    version: "1",
    chainId,
    verifyingContract,
  };
  const typedData = {
    markets: params.markets,
    tokens: params.tokens,
    receiver: params.receiver,
    relayParams: hashRelayParams(relayParams),
  };

  return signTypedData(signer, domain, types, typedData);
}

export async function getClaimCollateralSignature({ signer, relayParams, verifyingContract, params, chainId }) {
  if (relayParams.userNonce === undefined) {
    throw new Error("userNonce is required");
  }
  const types = {
    ClaimCollateral: [
      { name: "markets", type: "address[]" },
      { name: "tokens", type: "address[]" },
      { name: "timeKeys", type: "uint256[]" },
      { name: "receiver", type: "address" },
      { name: "relayParams", type: "bytes32" },
    ],
  };
  const domain = {
    name: "GmxBaseGelatoRelayRouter",
    version: "1",
    chainId,
    verifyingContract,
  };
  const typedData = {
    markets: params.markets,
    tokens: params.tokens,
    timeKeys: params.timeKeys,
    receiver: params.receiver,
    relayParams: hashRelayParams(relayParams),
  };

  return signTypedData(signer, domain, types, typedData);
}

export async function getClaimAffiliateRewardsSignature({ signer, relayParams, verifyingContract, params, chainId }) {
  if (relayParams.userNonce === undefined) {
    throw new Error("userNonce is required");
  }
  const types = {
    ClaimAffiliateRewards: [
      { name: "markets", type: "address[]" },
      { name: "tokens", type: "address[]" },
      { name: "receiver", type: "address" },
      { name: "relayParams", type: "bytes32" },
    ],
  };
  const domain = {
    name: "GmxBaseGelatoRelayRouter",
    version: "1",
    chainId,
    verifyingContract,
  };
  const typedData = {
    markets: params.markets,
    tokens: params.tokens,
    receiver: params.receiver,
    relayParams: hashRelayParams(relayParams),
  };

  return signTypedData(signer, domain, types, typedData);
}
