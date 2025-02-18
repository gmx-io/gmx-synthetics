import { BigNumberish, ethers } from "ethers";
import { GELATO_RELAY_ADDRESS } from "./addresses";
import { hashRelayParams, signTypedData } from "./helpers";
import { getDomain } from "./helpers";
import { getRelayParams } from "./helpers";

export async function sendCreateDeposit(p: {
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
  transferRequests: {
    token: string;
    receiver: string;
    amount: BigNumberish;
  }[];
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
}) {
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

async function getCreateDepositSignature({
  signer,
  relayParams,
  transferRequests,
  verifyingContract,
  params,
  chainId,
}) {
  if (relayParams.userNonce === undefined) {
    throw new Error("userNonce is required");
  }
  const types = {
    CreateDeposit: [
      // { name: "transferRequests", type: "TransferRequest[]" },
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
    // TransferRequest: [
    //   { name: "token", type: "address" },
    //   { name: "receiver", type: "address" },
    //   { name: "amount", type: "uint256" },
    // ],
  };

  const domain = getDomain(chainId, verifyingContract);

  const typedData = {
    // transferRequests,
    addresses: params.addresses,
    minMarketTokens: params.minMarketTokens,
    shouldUnwrapNativeToken: params.shouldUnwrapNativeToken,
    executionFee: params.executionFee,
    callbackGasLimit: params.callbackGasLimit,
    dataList: params.dataList,
    relayParams: hashRelayParams(relayParams),
  };

  return signTypedData(signer, domain, types, typedData);
}
