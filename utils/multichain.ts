import { BigNumberish, Contract } from "ethers";
import {
  sendSetTraderReferralCode,
  sendStakeGmx,
  sendUnstakeGmx,
  sendStakeEsGmx,
  sendUnstakeEsGmx,
  sendHandleStakingRewards,
  sendCompoundStakingRewards,
  sendVestEsGmx,
  sendDelegateGovGmx,
  sendSignalStakingTransfer,
  sendAcceptStakingTransfer,
  sendWithdrawFromWallet,
} from "./relay/gelatoRelay";
import { getRelayParams } from "./relay/helpers";
import {
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
} from "./relay/signatures";
import {
  getCreateDepositSignature,
  getCreateWithdrawalSignature,
  getCreateGlvDepositSignature,
  sendCreateDeposit,
  sendCreateGlvDeposit,
  sendCreateWithdrawal,
  sendCreateGlvWithdrawal,
  getCreateGlvWithdrawalSignature,
} from "./relay/multichain";
import * as keys from "../utils/keys";

export async function bridgeInTokens(
  fixture,
  overrides: {
    account: string;
    token?: Contract;
    amount: BigNumberish;
    data?: string;
    stargatePool?: Contract;
    nativeTopUpAmount?: BigNumberish;
  }
) {
  const { layerZeroProvider, mockStargatePoolUsdc, mockStargatePoolNative } = fixture.contracts;
  const { user0 } = fixture.accounts;

  const account = overrides.account || user0;
  const token = overrides.token;
  const amount = overrides.amount;
  const stargatePool = overrides.stargatePool || token ? mockStargatePoolUsdc : mockStargatePoolNative;
  let msgValue = token ? 0 : amount; // if token is provided, we don't send native token

  if (overrides.nativeTopUpAmount) {
    msgValue = ethers.BigNumber.from(msgValue).add(overrides.nativeTopUpAmount);
  }

  if (token) {
    // e.g. StargatePoolUsdc is being used to bridge USDC
    await token.mint(account.address, amount);
    await token.connect(account).approve(stargatePool.address, amount);
  }

  if (!overrides.data && overrides.nativeTopUpAmount) {
    overrides.data = ethers.utils.defaultAbiCoder.encode(
      ["uint8", "uint256", "bytes"],
      [0 /* ActionType.None */, overrides.nativeTopUpAmount, "0x"]
    );
  }

  // mock token bridging (increase user's multichain balance)
  const encodedMessageEth = ethers.utils.defaultAbiCoder.encode(
    ["address", "bytes"],
    [account.address, overrides.data || "0x"]
  );

  await stargatePool
    .connect(account)
    .sendToken(layerZeroProvider.address, amount, encodedMessageEth, { value: msgValue });
}

export async function fundMultichainBalance(
  fixture,
  overrides: {
    account: string;
    token: Contract;
    amount: BigNumberish;
  }
) {
  const { multichainVault, dataStore } = fixture.contracts;
  const { account, token, amount } = overrides;

  await token.mint(multichainVault.address, amount);
  await multichainVault.syncTokenBalance(token.address);
  await dataStore.incrementUint(keys.multichainBalanceKey(account, token.address), amount);
}

const relayParamsType = `tuple(
    tuple(
      address[] tokens,
      address[] providers,
      bytes[] data
    ) oracleParams,
    tuple(
      address[] sendTokens,
      uint256[] sendAmounts,
      address[] externalCallTargets,
      bytes[] externalCallDataList,
      address[] refundTokens,
      address[] refundReceivers
    ) externalCalls,
    tuple(
      address owner,
      address spender,
      uint256 value,
      uint256 deadline,
      address token
    )[] tokenPermits,
    tuple(
      address feeToken,
      uint256 feeAmount,
      address[] feeSwapPath
    ) fee,
    uint256 userNonce,
    uint256 deadline,
    bytes signature,
    uint256 desChainId,
    bytes32 eip6492SignatureWrapperHash
  )`;

const transferRequestsType = `tuple(
    address[] tokens,
    address[] receivers,
    uint256[] amounts
  ) transferRequests`;

const createDepositParamsType = `tuple(
    tuple(
      address receiver,
      address callbackContract,
      address uiFeeReceiver,
      address market,
      address initialLongToken,
      address initialShortToken,
      address[] longTokenSwapPath,
      address[] shortTokenSwapPath
    ) addresses,
    uint256 minMarketTokens,
    bool shouldUnwrapNativeToken,
    uint256 executionFee,
    uint256 callbackGasLimit,
    bytes32[] dataList
  )`;

const createWithdrawalParamsType = `tuple(
    tuple(
      address receiver,
      address callbackContract,
      address uiFeeReceiver,
      address market,
      address[] longTokenSwapPath,
      address[] shortTokenSwapPath
    ) addresses,
    uint256 minLongTokenAmount,
    uint256 minShortTokenAmount,
    bool shouldUnwrapNativeToken,
    uint256 executionFee,
    uint256 callbackGasLimit,
    bytes32[] dataList
  )`;

const createGlvDepositParamsType = `tuple(
    tuple(
      address glv,
      address market,
      address receiver,
      address callbackContract,
      address uiFeeReceiver,
      address initialLongToken,
      address initialShortToken,
      address[] longTokenSwapPath,
      address[] shortTokenSwapPath
    ) addresses,
    uint256 minGlvTokens,
    uint256 executionFee,
    uint256 callbackGasLimit,
    bool shouldUnwrapNativeToken,
    bool isMarketTokenDeposit,
    bytes32[] dataList
  )`;

const createGlvWithdrawalParamsType = `tuple(
    tuple(
      address receiver,
      address callbackContract,
      address uiFeeReceiver,
      address market,
      address glv,
      address[] longTokenSwapPath,
      address[] shortTokenSwapPath
    ) addresses,
    uint256 minLongTokenAmount,
    uint256 minShortTokenAmount,
    bool shouldUnwrapNativeToken,
    uint256 executionFee,
    uint256 callbackGasLimit,
    bytes32[] dataList
  )`;

export async function encodeDepositMessage(
  depositParams: Parameters<typeof sendCreateDeposit>[0],
  account: string,
  expectedNativeValue: BigNumberish = 0
): Promise<string> {
  const relayParams = await getRelayParams(depositParams);

  const signature = await getCreateDepositSignature({
    ...depositParams,
    relayParams,
    verifyingContract: depositParams.relayRouter.address,
  });

  const actionData = ethers.utils.defaultAbiCoder.encode(
    [relayParamsType, transferRequestsType, createDepositParamsType],
    [{ ...relayParams, signature }, depositParams.transferRequests, depositParams.params]
  );

  const ActionType = 1; // Deposit
  const data = ethers.utils.defaultAbiCoder.encode(
    ["uint8", "uint256", "bytes"],
    [ActionType, expectedNativeValue, actionData]
  );

  const message = ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, data]);

  return message;
}

export async function encodeWithdrawalMessage(
  withdrawalParams: Parameters<typeof sendCreateWithdrawal>[0],
  account: string,
  expectedNativeValue: BigNumberish = 0
): Promise<string> {
  const relayParams = await getRelayParams(withdrawalParams);

  const signature = await getCreateWithdrawalSignature({
    ...withdrawalParams,
    relayParams,
    verifyingContract: withdrawalParams.relayRouter.address,
  });

  const actionData = ethers.utils.defaultAbiCoder.encode(
    [relayParamsType, transferRequestsType, createWithdrawalParamsType],
    [{ ...relayParams, signature }, withdrawalParams.transferRequests, withdrawalParams.params]
  );

  const ActionType = 5; // Withdrawal
  const data = ethers.utils.defaultAbiCoder.encode(
    ["uint8", "uint256", "bytes"],
    [ActionType, expectedNativeValue, actionData]
  );

  const message = ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, data]);

  return message;
}

export async function encodeGlvDepositMessage(
  glvDepositParams: Parameters<typeof sendCreateGlvDeposit>[0],
  account: string,
  expectedNativeValue: BigNumberish = 0
): Promise<string> {
  const relayParams = await getRelayParams(glvDepositParams);

  const signature = await getCreateGlvDepositSignature({
    ...glvDepositParams,
    relayParams,
    verifyingContract: glvDepositParams.relayRouter.address,
  });

  const actionData = ethers.utils.defaultAbiCoder.encode(
    [relayParamsType, transferRequestsType, createGlvDepositParamsType],
    [{ ...relayParams, signature }, glvDepositParams.transferRequests, glvDepositParams.params]
  );

  const ActionType = 2; // GlvDeposit
  const data = ethers.utils.defaultAbiCoder.encode(
    ["uint8", "uint256", "bytes"],
    [ActionType, expectedNativeValue, actionData]
  );

  const message = ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, data]);

  return message;
}

export async function encodeGlvWithdrawalMessage(
  glvWithdrawalParams: Parameters<typeof sendCreateGlvWithdrawal>[0],
  account: string,
  expectedNativeValue: BigNumberish = 0
): Promise<string> {
  const relayParams = await getRelayParams(glvWithdrawalParams);

  const signature = await getCreateGlvWithdrawalSignature({
    ...glvWithdrawalParams,
    relayParams,
    verifyingContract: glvWithdrawalParams.relayRouter.address,
  });

  const actionData = ethers.utils.defaultAbiCoder.encode(
    [relayParamsType, transferRequestsType, createGlvWithdrawalParamsType],
    [{ ...relayParams, signature }, glvWithdrawalParams.transferRequests, glvWithdrawalParams.params]
  );

  const ActionType = 6; // GlvWithdrawal
  const data = ethers.utils.defaultAbiCoder.encode(
    ["uint8", "uint256", "bytes"],
    [ActionType, expectedNativeValue, actionData]
  );

  const message = ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, data]);

  return message;
}

export async function encodeSetTraderReferralCodeMessage(
  setTraderReferralCodeParams: Parameters<typeof sendSetTraderReferralCode>[0],
  referralCode: string,
  account: string,
  expectedNativeValue: BigNumberish = 0
): Promise<string> {
  const relayParams = await getRelayParams(setTraderReferralCodeParams);

  const signature = await getSetTraderReferralCodeSignature({
    ...setTraderReferralCodeParams,
    relayParams,
    verifyingContract: setTraderReferralCodeParams.relayRouter.address,
  });

  const actionData = ethers.utils.defaultAbiCoder.encode(
    [relayParamsType, "bytes32"],
    [{ ...relayParams, signature }, referralCode]
  );

  const ActionType = 4; // SetTraderReferralCode
  const data = ethers.utils.defaultAbiCoder.encode(
    ["uint8", "uint256", "bytes"],
    [ActionType, expectedNativeValue, actionData]
  );

  const message = ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, data]);

  return message;
}

export async function encodeRegisterCodeMessage(
  registerCodeParams: Parameters<typeof sendSetTraderReferralCode>[0], // Using same type as setTraderReferralCode
  referralCode: string,
  account: string,
  expectedNativeValue: BigNumberish = 0
): Promise<string> {
  const relayParams = await getRelayParams(registerCodeParams);

  const signature = await getRegisterCodeSignature({
    ...registerCodeParams,
    relayParams,
    verifyingContract: registerCodeParams.relayRouter.address,
  });

  const actionData = ethers.utils.defaultAbiCoder.encode(
    [relayParamsType, "bytes32"],
    [{ ...relayParams, signature }, referralCode]
  );

  const ActionType = 7; // RegisterCode
  const data = ethers.utils.defaultAbiCoder.encode(
    ["uint8", "uint256", "bytes"],
    [ActionType, expectedNativeValue, actionData]
  );

  const message = ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, data]);

  return message;
}

const handleStakingRewardsParamsType = `tuple(
    bool shouldClaimGmx,
    bool shouldStakeGmx,
    bool shouldClaimEsGmx,
    bool shouldStakeEsGmx,
    bool shouldStakeMultiplierPoints,
    bool shouldClaimWeth
  )`;

export async function encodeStakeGmxMessage(
  params: Parameters<typeof sendStakeGmx>[0],
  account: string,
  expectedNativeValue: BigNumberish = 0
): Promise<string> {
  const relayParams = await getRelayParams(params);
  const signature = await getStakeGmxSignature({
    ...params,
    relayParams,
    verifyingContract: params.relayRouter.address,
  });

  const actionData = ethers.utils.defaultAbiCoder.encode(
    [relayParamsType, "uint256"],
    [{ ...relayParams, signature }, params.amount]
  );

  const ActionType = 8; // StakeGmx
  const data = ethers.utils.defaultAbiCoder.encode(
    ["uint8", "uint256", "bytes"],
    [ActionType, expectedNativeValue, actionData]
  );

  return ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, data]);
}

export async function encodeUnstakeGmxMessage(
  params: Parameters<typeof sendUnstakeGmx>[0],
  account: string,
  expectedNativeValue: BigNumberish = 0
): Promise<string> {
  const relayParams = await getRelayParams(params);
  const signature = await getUnstakeGmxSignature({
    ...params,
    relayParams,
    verifyingContract: params.relayRouter.address,
  });

  const actionData = ethers.utils.defaultAbiCoder.encode(
    [relayParamsType, "uint256"],
    [{ ...relayParams, signature }, params.amount]
  );

  const ActionType = 9; // UnstakeGmx
  const data = ethers.utils.defaultAbiCoder.encode(
    ["uint8", "uint256", "bytes"],
    [ActionType, expectedNativeValue, actionData]
  );

  return ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, data]);
}

export async function encodeStakeEsGmxMessage(
  params: Parameters<typeof sendStakeEsGmx>[0],
  account: string,
  expectedNativeValue: BigNumberish = 0
): Promise<string> {
  const relayParams = await getRelayParams(params);
  const signature = await getStakeEsGmxSignature({
    ...params,
    relayParams,
    verifyingContract: params.relayRouter.address,
  });

  const actionData = ethers.utils.defaultAbiCoder.encode(
    [relayParamsType, "uint256"],
    [{ ...relayParams, signature }, params.amount]
  );

  const ActionType = 10; // StakeEsGmx
  const data = ethers.utils.defaultAbiCoder.encode(
    ["uint8", "uint256", "bytes"],
    [ActionType, expectedNativeValue, actionData]
  );

  return ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, data]);
}

export async function encodeUnstakeEsGmxMessage(
  params: Parameters<typeof sendUnstakeEsGmx>[0],
  account: string,
  expectedNativeValue: BigNumberish = 0
): Promise<string> {
  const relayParams = await getRelayParams(params);
  const signature = await getUnstakeEsGmxSignature({
    ...params,
    relayParams,
    verifyingContract: params.relayRouter.address,
  });

  const actionData = ethers.utils.defaultAbiCoder.encode(
    [relayParamsType, "uint256"],
    [{ ...relayParams, signature }, params.amount]
  );

  const ActionType = 11; // UnstakeEsGmx
  const data = ethers.utils.defaultAbiCoder.encode(
    ["uint8", "uint256", "bytes"],
    [ActionType, expectedNativeValue, actionData]
  );

  return ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, data]);
}

export async function encodeHandleStakingRewardsMessage(
  params: Parameters<typeof sendHandleStakingRewards>[0],
  account: string,
  expectedNativeValue: BigNumberish = 0
): Promise<string> {
  const relayParams = await getRelayParams(params);
  const signature = await getHandleStakingRewardsSignature({
    ...params,
    relayParams,
    verifyingContract: params.relayRouter.address,
  });

  const actionData = ethers.utils.defaultAbiCoder.encode(
    [relayParamsType, handleStakingRewardsParamsType],
    [{ ...relayParams, signature }, params.params]
  );

  const ActionType = 12; // HandleStakingRewards
  const data = ethers.utils.defaultAbiCoder.encode(
    ["uint8", "uint256", "bytes"],
    [ActionType, expectedNativeValue, actionData]
  );

  return ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, data]);
}

export async function encodeCompoundStakingRewardsMessage(
  params: Parameters<typeof sendCompoundStakingRewards>[0],
  account: string,
  expectedNativeValue: BigNumberish = 0
): Promise<string> {
  const relayParams = await getRelayParams(params);
  const signature = await getCompoundStakingRewardsSignature({
    ...params,
    relayParams,
    verifyingContract: params.relayRouter.address,
  });

  const actionData = ethers.utils.defaultAbiCoder.encode([relayParamsType], [{ ...relayParams, signature }]);

  const ActionType = 13; // CompoundStakingRewards
  const data = ethers.utils.defaultAbiCoder.encode(
    ["uint8", "uint256", "bytes"],
    [ActionType, expectedNativeValue, actionData]
  );

  return ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, data]);
}

export async function encodeVestEsGmxMessage(
  params: Parameters<typeof sendVestEsGmx>[0],
  account: string,
  expectedNativeValue: BigNumberish = 0
): Promise<string> {
  const relayParams = await getRelayParams(params);
  const signature = await getVestEsGmxSignature({
    ...params,
    relayParams,
    verifyingContract: params.relayRouter.address,
  });

  const actionData = ethers.utils.defaultAbiCoder.encode(
    [relayParamsType, "uint256"],
    [{ ...relayParams, signature }, params.amount]
  );

  const ActionType = 14; // VestEsGmx
  const data = ethers.utils.defaultAbiCoder.encode(
    ["uint8", "uint256", "bytes"],
    [ActionType, expectedNativeValue, actionData]
  );

  return ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, data]);
}

export async function encodeDelegateGovGmxMessage(
  params: Parameters<typeof sendDelegateGovGmx>[0],
  account: string,
  expectedNativeValue: BigNumberish = 0
): Promise<string> {
  const relayParams = await getRelayParams(params);
  const signature = await getDelegateGovGmxSignature({
    ...params,
    relayParams,
    verifyingContract: params.relayRouter.address,
  });

  const actionData = ethers.utils.defaultAbiCoder.encode(
    [relayParamsType, "address"],
    [{ ...relayParams, signature }, params.delegatee]
  );

  const ActionType = 15; // DelegateGovGmx
  const data = ethers.utils.defaultAbiCoder.encode(
    ["uint8", "uint256", "bytes"],
    [ActionType, expectedNativeValue, actionData]
  );

  return ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, data]);
}

export async function encodeSignalStakingTransferMessage(
  params: Parameters<typeof sendSignalStakingTransfer>[0],
  account: string,
  expectedNativeValue: BigNumberish = 0
): Promise<string> {
  const relayParams = await getRelayParams(params);
  const signature = await getSignalStakingTransferSignature({
    ...params,
    relayParams,
    verifyingContract: params.relayRouter.address,
  });

  const actionData = ethers.utils.defaultAbiCoder.encode(
    [relayParamsType, "address"],
    [{ ...relayParams, signature }, params.receiver]
  );

  const ActionType = 16; // SignalStakingTransfer
  const data = ethers.utils.defaultAbiCoder.encode(
    ["uint8", "uint256", "bytes"],
    [ActionType, expectedNativeValue, actionData]
  );

  return ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, data]);
}

export async function encodeAcceptStakingTransferMessage(
  params: Parameters<typeof sendAcceptStakingTransfer>[0],
  account: string,
  expectedNativeValue: BigNumberish = 0
): Promise<string> {
  const relayParams = await getRelayParams(params);
  const signature = await getAcceptStakingTransferSignature({
    ...params,
    relayParams,
    verifyingContract: params.relayRouter.address,
    sender: params.stakingSender,
  });

  const actionData = ethers.utils.defaultAbiCoder.encode(
    [relayParamsType, "address"],
    [{ ...relayParams, signature }, params.stakingSender]
  );

  const ActionType = 17; // AcceptStakingTransfer
  const data = ethers.utils.defaultAbiCoder.encode(
    ["uint8", "uint256", "bytes"],
    [ActionType, expectedNativeValue, actionData]
  );

  return ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, data]);
}

export async function encodeWithdrawFromWalletMessage(
  params: Parameters<typeof sendWithdrawFromWallet>[0],
  account: string,
  expectedNativeValue: BigNumberish = 0
): Promise<string> {
  const relayParams = await getRelayParams(params);
  const signature = await getWithdrawFromWalletSignature({
    ...params,
    relayParams,
    verifyingContract: params.relayRouter.address,
  });

  const actionData = ethers.utils.defaultAbiCoder.encode(
    [relayParamsType, "address", "uint256"],
    [{ ...relayParams, signature }, params.token, params.amount]
  );

  const ActionType = 18; // WithdrawFromWallet
  const data = ethers.utils.defaultAbiCoder.encode(
    ["uint8", "uint256", "bytes"],
    [ActionType, expectedNativeValue, actionData]
  );

  return ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, data]);
}

export function encodeBridgeOutDataList(
  actionType: number,
  desChainId: BigNumberish,
  deadline: BigNumberish,
  provider: string,
  providerData: string,
  minAmountOut: BigNumberish,
  secondaryProvider?: string,
  secondaryProviderData?: string,
  secondaryMinAmountOut?: BigNumberish,
  bridgeFee?: { feeToken: string; feeAmount: BigNumberish; feeSwapPath: string[] },
  secondaryBridgeFee?: { feeToken: string; feeAmount: BigNumberish; feeSwapPath: string[] }
): string[] {
  const defaultBridgeFee = { feeToken: ethers.constants.AddressZero, feeAmount: 0, feeSwapPath: [] };
  let actionData;
  if (secondaryProviderData) {
    const _bridgeFee = bridgeFee || defaultBridgeFee;
    const _secondaryBridgeFee = secondaryBridgeFee || defaultBridgeFee;
    actionData = ethers.utils.defaultAbiCoder.encode(
      [
        "tuple(uint256 desChainId, uint256 deadline, address provider, bytes providerData, uint256 minAmountOut, tuple(address feeToken, uint256 feeAmount, address[] feeSwapPath) bridgeFee, address secondaryProvider, bytes secondaryProviderData, uint256 secondaryMinAmountOut, tuple(address feeToken, uint256 feeAmount, address[] feeSwapPath) secondaryBridgeFee)",
      ],
      [
        [
          desChainId,
          deadline,
          provider,
          providerData,
          minAmountOut,
          [_bridgeFee.feeToken, _bridgeFee.feeAmount, _bridgeFee.feeSwapPath],
          secondaryProvider,
          secondaryProviderData,
          secondaryMinAmountOut,
          [_secondaryBridgeFee.feeToken, _secondaryBridgeFee.feeAmount, _secondaryBridgeFee.feeSwapPath],
        ],
      ]
    );
  } else {
    const _bridgeFee = bridgeFee || defaultBridgeFee;
    actionData = ethers.utils.defaultAbiCoder.encode(
      [
        "uint256",
        "uint256",
        "address",
        "bytes",
        "uint256",
        "tuple(address feeToken, uint256 feeAmount, address[] feeSwapPath)",
      ],
      [
        desChainId,
        deadline,
        provider,
        providerData,
        minAmountOut,
        [_bridgeFee.feeToken, _bridgeFee.feeAmount, _bridgeFee.feeSwapPath],
      ]
    );
  }

  let data = ethers.utils.defaultAbiCoder.encode(["uint8", "bytes"], [actionType, actionData]);

  const dataList = [keys.GMX_DATA_ACTION];

  // Remove '0x' prefix from the encoded data (re-added bellow for all array items)
  data = data.slice(2);

  // Transform the bytes data into an array of bytes32
  for (let i = 0; i < data.length; i += 64) {
    dataList.push(`0x${data.slice(i, i + 64)}`);
  }

  return dataList;
}
