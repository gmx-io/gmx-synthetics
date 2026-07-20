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
  account: string;
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
    account,
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

export async function getCreateTwapOrderSignature({
  signer,
  relayParams,
  subaccountApproval = undefined,
  account,
  verifyingContract,
  params,
  twapCount,
  interval,
  chainId,
  minified = false,
}: {
  signer: ethers.Signer;
  relayParams: RelayParams;
  subaccountApproval?: SubaccountApproval;
  account: string;
  verifyingContract: string;
  params: any;
  twapCount: BigNumberish;
  interval: BigNumberish;
  chainId: BigNumberish;
  minified?: boolean;
}) {
  const types = {
    CreateTwapOrder: [
      { name: "account", type: "address" },
      { name: "params", type: "CreateOrderParams" },
      { name: "twapCount", type: "uint256" },
      { name: "interval", type: "uint256" },
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
  };

  const domain = getDomain(chainId, verifyingContract);
  const typedData = {
    account,
    params: {
      addresses: params.addresses,
      numbers: params.numbers,
      orderType: params.orderType,
      decreasePositionSwapType: params.decreasePositionSwapType,
      isLong: params.isLong,
      shouldUnwrapNativeToken: params.shouldUnwrapNativeToken,
      autoCancel: false,
      referralCode: params.referralCode,
      dataList: params.dataList,
    },
    twapCount,
    interval,
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
  account: string;
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
      { name: "decreasePositionSwapType", type: "uint256" },
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
      decreasePositionSwapType: p.decreasePositionSwapType,
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
      { name: "decreasePositionSwapType", type: "uint256" },
      { name: "autoCancel", type: "bool" },
      { name: "executionFeeIncrease", type: "uint256" },
    ],
  };

  const domain = getDomain(chainId, verifyingContract);
  const typedData = {
    account,
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
    subaccountApproval: subaccountApproval ? hashSubaccountApproval(subaccountApproval) : ethers.constants.HashZero,
  };

  return signTypedData(signer, domain, types, typedData);
}

export async function getSetTraderReferralCodeSignature({
  signer,
  relayParams,
  account,
  verifyingContract,
  referralCode,
  chainId,
}) {
  if (relayParams.userNonce === undefined) {
    throw new Error("userNonce is required");
  }
  const types = {
    SetTraderReferralCode: [
      { name: "account", type: "address" },
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
    account,
    referralCode: referralCode,
    relayParams: hashRelayParams(relayParams),
  };

  return signTypedData(signer, domain, types, typedData);
}

export async function getRegisterCodeSignature({
  signer,
  relayParams,
  account,
  verifyingContract,
  referralCode,
  chainId,
}) {
  if (relayParams.userNonce === undefined) {
    throw new Error("userNonce is required");
  }
  const types = {
    RegisterCode: [
      { name: "account", type: "address" },
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
    account,
    referralCode: referralCode,
    relayParams: hashRelayParams(relayParams),
  };

  return signTypedData(signer, domain, types, typedData);
}

export async function getClaimFundingFeesSignature({
  signer,
  relayParams,
  account,
  verifyingContract,
  params,
  chainId,
}) {
  if (relayParams.userNonce === undefined) {
    throw new Error("userNonce is required");
  }
  const types = {
    ClaimFundingFees: [
      { name: "account", type: "address" },
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
    account,
    markets: params.markets,
    tokens: params.tokens,
    receiver: params.receiver,
    relayParams: hashRelayParams(relayParams),
  };

  return signTypedData(signer, domain, types, typedData);
}

export async function getClaimCollateralSignature({
  signer,
  relayParams,
  account,
  verifyingContract,
  params,
  chainId,
}) {
  if (relayParams.userNonce === undefined) {
    throw new Error("userNonce is required");
  }
  const types = {
    ClaimCollateral: [
      { name: "account", type: "address" },
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
    account,
    markets: params.markets,
    tokens: params.tokens,
    timeKeys: params.timeKeys,
    receiver: params.receiver,
    relayParams: hashRelayParams(relayParams),
  };

  return signTypedData(signer, domain, types, typedData);
}

export async function getClaimAffiliateRewardsSignature({
  signer,
  relayParams,
  account,
  verifyingContract,
  params,
  chainId,
}) {
  if (relayParams.userNonce === undefined) {
    throw new Error("userNonce is required");
  }
  const types = {
    ClaimAffiliateRewards: [
      { name: "account", type: "address" },
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
    account,
    markets: params.markets,
    tokens: params.tokens,
    receiver: params.receiver,
    relayParams: hashRelayParams(relayParams),
  };

  return signTypedData(signer, domain, types, typedData);
}

// Staking signature helpers

export async function getStakeGmxSignature({ signer, relayParams, account, verifyingContract, amount, chainId }) {
  const types = {
    StakeGmx: [
      { name: "account", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "relayParams", type: "bytes32" },
    ],
  };
  const domain = getDomain(chainId, verifyingContract);
  return signTypedData(signer, domain, types, { account, amount, relayParams: hashRelayParams(relayParams) });
}

export async function getUnstakeGmxSignature({ signer, relayParams, account, verifyingContract, amount, chainId }) {
  const types = {
    UnstakeGmx: [
      { name: "account", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "relayParams", type: "bytes32" },
    ],
  };
  const domain = getDomain(chainId, verifyingContract);
  return signTypedData(signer, domain, types, { account, amount, relayParams: hashRelayParams(relayParams) });
}

export async function getStakeEsGmxSignature({ signer, relayParams, account, verifyingContract, amount, chainId }) {
  const types = {
    StakeEsGmx: [
      { name: "account", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "relayParams", type: "bytes32" },
    ],
  };
  const domain = getDomain(chainId, verifyingContract);
  return signTypedData(signer, domain, types, { account, amount, relayParams: hashRelayParams(relayParams) });
}

export async function getUnstakeEsGmxSignature({ signer, relayParams, account, verifyingContract, amount, chainId }) {
  const types = {
    UnstakeEsGmx: [
      { name: "account", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "relayParams", type: "bytes32" },
    ],
  };
  const domain = getDomain(chainId, verifyingContract);
  return signTypedData(signer, domain, types, { account, amount, relayParams: hashRelayParams(relayParams) });
}

export async function getHandleStakingRewardsSignature({
  signer,
  relayParams,
  account,
  verifyingContract,
  params,
  chainId,
}) {
  const types = {
    HandleStakingRewards: [
      { name: "account", type: "address" },
      { name: "shouldClaimGmx", type: "bool" },
      { name: "shouldStakeGmx", type: "bool" },
      { name: "shouldClaimEsGmx", type: "bool" },
      { name: "shouldStakeEsGmx", type: "bool" },
      { name: "shouldStakeMultiplierPoints", type: "bool" },
      { name: "shouldClaimWeth", type: "bool" },
      { name: "relayParams", type: "bytes32" },
    ],
  };
  const domain = getDomain(chainId, verifyingContract);
  return signTypedData(signer, domain, types, {
    account,
    shouldClaimGmx: params.shouldClaimGmx,
    shouldStakeGmx: params.shouldStakeGmx,
    shouldClaimEsGmx: params.shouldClaimEsGmx,
    shouldStakeEsGmx: params.shouldStakeEsGmx,
    shouldStakeMultiplierPoints: params.shouldStakeMultiplierPoints,
    shouldClaimWeth: params.shouldClaimWeth,
    relayParams: hashRelayParams(relayParams),
  });
}

export async function getCompoundStakingRewardsSignature({ signer, relayParams, account, verifyingContract, chainId }) {
  const types = {
    CompoundStakingRewards: [
      { name: "account", type: "address" },
      { name: "relayParams", type: "bytes32" },
    ],
  };
  const domain = getDomain(chainId, verifyingContract);
  return signTypedData(signer, domain, types, { account, relayParams: hashRelayParams(relayParams) });
}

export async function getVestEsGmxSignature({ signer, relayParams, account, verifyingContract, amount, chainId }) {
  const types = {
    VestEsGmx: [
      { name: "account", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "relayParams", type: "bytes32" },
    ],
  };
  const domain = getDomain(chainId, verifyingContract);
  return signTypedData(signer, domain, types, { account, amount, relayParams: hashRelayParams(relayParams) });
}

export async function getDelegateGovGmxSignature({
  signer,
  relayParams,
  account,
  verifyingContract,
  delegatee,
  chainId,
}) {
  const types = {
    DelegateGovGmx: [
      { name: "account", type: "address" },
      { name: "delegatee", type: "address" },
      { name: "relayParams", type: "bytes32" },
    ],
  };
  const domain = getDomain(chainId, verifyingContract);
  return signTypedData(signer, domain, types, { account, delegatee, relayParams: hashRelayParams(relayParams) });
}

export async function getSignalStakingTransferSignature({
  signer,
  relayParams,
  account,
  verifyingContract,
  receiver,
  chainId,
}) {
  const types = {
    SignalStakingTransfer: [
      { name: "account", type: "address" },
      { name: "receiver", type: "address" },
      { name: "relayParams", type: "bytes32" },
    ],
  };
  const domain = getDomain(chainId, verifyingContract);
  return signTypedData(signer, domain, types, { account, receiver, relayParams: hashRelayParams(relayParams) });
}

export async function getAcceptStakingTransferSignature({
  signer,
  relayParams,
  account,
  verifyingContract,
  sender,
  chainId,
}) {
  const types = {
    AcceptStakingTransfer: [
      { name: "account", type: "address" },
      { name: "sender", type: "address" },
      { name: "relayParams", type: "bytes32" },
    ],
  };
  const domain = getDomain(chainId, verifyingContract);
  return signTypedData(signer, domain, types, { account, sender, relayParams: hashRelayParams(relayParams) });
}

export async function getWithdrawFromWalletSignature({
  signer,
  relayParams,
  account,
  verifyingContract,
  token,
  amount,
  chainId,
}) {
  const types = {
    WithdrawFromWallet: [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "relayParams", type: "bytes32" },
    ],
  };
  const domain = getDomain(chainId, verifyingContract);
  return signTypedData(signer, domain, types, { account, token, amount, relayParams: hashRelayParams(relayParams) });
}
