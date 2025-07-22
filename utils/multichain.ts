import { BigNumberish, Contract } from "ethers";
import { sendSetTraderReferralCode } from "./relay/gelatoRelay";
import { getRelayParams } from "./relay/helpers";
import { getSetTraderReferralCodeSignature } from "./relay/signatures";
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
  }
) {
  const { layerZeroProvider, mockStargatePoolUsdc, mockStargatePoolNative } = fixture.contracts;
  const { user0 } = fixture.accounts;

  const account = overrides.account || user0;
  const token = overrides.token;
  const amount = overrides.amount;
  const stargatePool = overrides.stargatePool || token ? mockStargatePoolUsdc : mockStargatePoolNative;
  const msgValue = token ? 0 : amount; // if token is provided, we don't send native token

  if (token) {
    // e.g. StargatePoolUsdc is being used to bridge USDC
    await token.mint(account.address, amount);
    await token.connect(account).approve(stargatePool.address, amount);
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
    uint256 desChainId
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
  account: string
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
  const data = ethers.utils.defaultAbiCoder.encode(["uint8", "bytes"], [ActionType, actionData]);

  const message = ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, data]);

  return message;
}

export async function encodeWithdrawalMessage(
  withdrawalParams: Parameters<typeof sendCreateWithdrawal>[0],
  account: string
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
  const data = ethers.utils.defaultAbiCoder.encode(["uint8", "bytes"], [ActionType, actionData]);

  const message = ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, data]);

  return message;
}

export async function encodeGlvDepositMessage(
  glvDepositParams: Parameters<typeof sendCreateGlvDeposit>[0],
  account: string
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
  const data = ethers.utils.defaultAbiCoder.encode(["uint8", "bytes"], [ActionType, actionData]);

  const message = ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, data]);

  return message;
}

export async function encodeGlvWithdrawalMessage(
  glvWithdrawalParams: Parameters<typeof sendCreateGlvWithdrawal>[0],
  account: string
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
  const data = ethers.utils.defaultAbiCoder.encode(["uint8", "bytes"], [ActionType, actionData]);

  const message = ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, data]);

  return message;
}

export async function encodeSetTraderReferralCodeMessage(
  setTraderReferralCodeParams: Parameters<typeof sendSetTraderReferralCode>[0],
  referralCode: string,
  account: string
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
  const data = ethers.utils.defaultAbiCoder.encode(["uint8", "bytes"], [ActionType, actionData]);

  const message = ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, data]);

  return message;
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
  secondaryMinAmountOut?: BigNumberish
): string[] {
  let actionData;
  if (secondaryProviderData) {
    actionData = ethers.utils.defaultAbiCoder.encode(
      [
        "tuple(uint256 desChainId, uint256 deadline, address provider, bytes providerData, uint256 minAmountOut, address secondaryProvider, bytes secondaryProviderData, uint256 secondaryMinAmountOut)",
      ],
      [
        [
          desChainId,
          deadline,
          provider,
          providerData,
          minAmountOut,
          secondaryProvider,
          secondaryProviderData,
          secondaryMinAmountOut,
        ],
      ]
    );
  } else {
    actionData = ethers.utils.defaultAbiCoder.encode(
      ["uint256", "uint256", "address", "bytes", "uint256"],
      [desChainId, deadline, provider, providerData, minAmountOut]
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
