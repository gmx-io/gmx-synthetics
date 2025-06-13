import { BigNumberish, Contract } from "ethers";
import { sendSetTraderReferralCode } from "./relay/gelatoRelay";
import { getRelayParams } from "./relay/helpers";
import { getSetTraderReferralCodeSignature } from "./relay/signatures";
import { getCreateDepositSignature, sendCreateDeposit } from "./relay/multichain";

export async function mintAndBridge(
  fixture,
  overrides: {
    account?: string;
    token: Contract;
    tokenAmount: BigNumberish;
    data?: string;
  }
) {
  const { usdc, wnt, mockStargatePoolUsdc, mockStargatePoolWnt, layerZeroProvider } = fixture.contracts;
  const { user0 } = fixture.accounts;

  const account = overrides.account || user0;
  const token = overrides.token;
  const tokenAmount = overrides.tokenAmount;

  await token.mint(account.address, tokenAmount);

  // mock token bridging (increase user's multichain balance)
  const encodedMessageEth = ethers.utils.defaultAbiCoder.encode(
    ["address", "bytes"],
    [account.address, overrides.data || "0x"]
  );

  if (token.address == usdc.address) {
    await token.connect(account).approve(mockStargatePoolUsdc.address, tokenAmount);
    await mockStargatePoolUsdc.connect(account).sendToken(layerZeroProvider.address, tokenAmount, encodedMessageEth);
  } else if (token.address == wnt.address) {
    await token.connect(account).approve(mockStargatePoolWnt.address, tokenAmount);
    await mockStargatePoolWnt.connect(account).sendToken(layerZeroProvider.address, tokenAmount, encodedMessageEth);
  } else {
    throw new Error("Unsupported Stargate");
  }
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
