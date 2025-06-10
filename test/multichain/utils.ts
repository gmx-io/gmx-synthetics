import { RelayParams } from "../../utils/relay/helpers";
import { BigNumber } from "ethers";

export type CreateDepositParamsAddresses = {
  receiver: string;
  callbackContract: string;
  uiFeeReceiver: string;
  market: string;
  initialLongToken: string;
  initialShortToken: string;
  longTokenSwapPath: string[];
  shortTokenSwapPath: string[];
};

export type CreateDepositParams = {
  addresses: CreateDepositParamsAddresses;
  minMarketTokens: BigNumber;
  shouldUnwrapNativeToken: boolean;
  executionFee: BigNumber;
  callbackGasLimit: BigNumber;
  dataList: string[];
};

export type TransferRequests = {
  tokens: string[];
  receivers: string[];
  amounts: BigNumber[];
};

export function encodeDepositData(
  relayParams: RelayParams,
  transferRequests: TransferRequests,
  createDepositParam: CreateDepositParams
) {
  const relayAbiTypes = `tuple(
          tuple(address[] tokens, address[] providers, bytes[] data),
          tuple(address[] sendTokens,uint256[] sendAmounts,address[] externalCallTargets, bytes[] externalCallDataList, address[] refundTokens, address[] refundReceivers),
          tuple(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s,address token)[] tokenPermits,
          tuple(address feeToken, uint256 feeAmount, address[] feeSwapPath),
          uint256 userNonce,
          uint256 deadline,
          bytes signature,
          uint256 desChainId
      )`;
  const transferRequestsAbiTypes = `tuple(address[], address[], uint256[])`;
  const depositPramsAbiTypes = `tuple(
        tuple(address receiver,address callbackContract,address uiFeeReceiver,address market,address initialLongToken,
        address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath),
        uint256, bool, uint256, uint256, bytes32[]
      )`;

  const abiTypes = [relayAbiTypes, transferRequestsAbiTypes, depositPramsAbiTypes];

  const abiValues = [
    // RelayParams
    [
      [relayParams.oracleParams.tokens, relayParams.oracleParams.providers, relayParams.oracleParams.data],
      relayParams.externalCalls,
      relayParams.tokenPermits.map((permit) => [
        permit.owner,
        permit.spender,
        permit.value,
        permit.deadline,
        permit.v,
        permit.r,
        permit.s,
        permit.token,
      ]),
      [relayParams.fee.feeToken, relayParams.fee.feeAmount, relayParams.fee.feeSwapPath],
      relayParams.userNonce,
      relayParams.deadline,
      relayParams.signature,
      relayParams.desChainId,
    ],

    // // TransferRequests
    [transferRequests.tokens, transferRequests.receivers, transferRequests.amounts],
    //
    //CreateDeposit
    // CreateDepositParamsAddresses
    [
      [
        createDepositParam.addresses.receiver,
        createDepositParam.addresses.callbackContract,
        createDepositParam.addresses.uiFeeReceiver,
        createDepositParam.addresses.market,
        createDepositParam.addresses.initialLongToken,
        createDepositParam.addresses.initialShortToken,
        createDepositParam.addresses.longTokenSwapPath,
        createDepositParam.addresses.shortTokenSwapPath,
      ],

      createDepositParam.minMarketTokens,
      createDepositParam.shouldUnwrapNativeToken,
      createDepositParam.executionFee,
      createDepositParam.callbackGasLimit,
      createDepositParam.dataList,
    ],
  ];
  return ethers.utils.defaultAbiCoder.encode(abiTypes, abiValues);
}
