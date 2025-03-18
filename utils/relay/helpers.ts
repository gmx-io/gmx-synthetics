import { BigNumberish, ethers } from "ethers";
import { GELATO_RELAY_ADDRESS } from "./addresses";

function getDefaultOracleParams() {
  return {
    tokens: [],
    providers: [],
    data: [],
  };
}

export async function getRelayParams(p: {
  oracleParams?: any;
  tokenPermits?: any;
  externalCalls?: any;
  feeParams: any;
  userNonce?: BigNumberish;
  deadline: BigNumberish;
  relayRouter: ethers.Contract;
  signer: ethers.Signer;
}) {
  let userNonce = p.userNonce;
  if (userNonce === undefined) {
    userNonce = await getUserNonce(await p.signer.getAddress(), p.relayRouter);
  }
  return {
    oracleParams: p.oracleParams || getDefaultOracleParams(),
    tokenPermits: p.tokenPermits || [],
    externalCalls: p.externalCalls || {
      externalCallTargets: [],
      externalCallDataList: [],
      refundTokens: [],
      refundReceivers: [],
    },
    fee: p.feeParams,
    userNonce,
    deadline: p.deadline,
  };
}

export function getDomain(chainId: BigNumberish, verifyingContract: string) {
  if (!chainId) {
    throw new Error("chainId is required");
  }
  if (!verifyingContract) {
    throw new Error("verifyingContract is required");
  }
  return {
    name: "GmxBaseGelatoRelayRouter",
    version: "1",
    chainId,
    verifyingContract,
  };
}

export function hashRelayParams(relayParams: any) {
  const encoded = ethers.utils.defaultAbiCoder.encode(
    [
      "tuple(address[] tokens, address[] providers, bytes[] data)",
      "tuple(address[] externalCallTargets, bytes[] externalCallDataList, address[] refundTokens, address[] refundReceivers)",
      "tuple(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s, address token)[]",
      "tuple(address feeToken, uint256 feeAmount, address[] feeSwapPath)",
      "uint256",
      "uint256",
    ],
    [
      [relayParams.oracleParams.tokens, relayParams.oracleParams.providers, relayParams.oracleParams.data],
      [
        relayParams.externalCalls.externalCallTargets,
        relayParams.externalCalls.externalCallDataList,
        relayParams.externalCalls.refundTokens,
        relayParams.externalCalls.refundReceivers,
      ],
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
    ]
  );

  return ethers.utils.keccak256(encoded);
}

export function hashSubaccountApproval(subaccountApproval: any) {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      [
        "tuple(address subaccount,bool shouldAdd,uint256 expiresAt,uint256 maxAllowedCount,bytes32 actionType,uint256 nonce,uint256 deadline,bytes signature)",
      ],
      [subaccountApproval]
    )
  );
}

export async function getUserNonce(account: string, relayRouter: ethers.Contract) {
  return relayRouter.userNonces(account);
}

export async function signTypedData(
  signer: ethers.Signer,
  domain: Record<string, any>,
  types: Record<string, any>,
  typedData: Record<string, any>
) {
  for (const [key, value] of Object.entries(domain)) {
    if (value === undefined) {
      throw new Error(`signTypedData: domain.${key} is undefined`);
    }
  }
  for (const [key, value] of Object.entries(typedData)) {
    if (value === undefined) {
      throw new Error(`signTypedData: typedData.${key} is undefined`);
    }
  }

  return (signer as any)._signTypedData(domain, types, typedData);
}

export async function sendRelayTransaction({
  calldata,
  gelatoRelayFeeToken,
  gelatoRelayFeeAmount,
  sender,
  relayRouter,
}: {
  calldata: string;
  gelatoRelayFeeToken: string;
  gelatoRelayFeeAmount: BigNumberish;
  sender: ethers.Signer;
  relayRouter: ethers.Contract;
}) {
  try {
    return await sender.sendTransaction({
      to: relayRouter.address,
      data: ethers.utils.solidityPack(
        ["bytes", "address", "address", "uint256"],
        [calldata, GELATO_RELAY_ADDRESS, gelatoRelayFeeToken, gelatoRelayFeeAmount]
      ),
      gasLimit: 5000000,
    });
  } catch (ex) {
    if (ex.error) {
      // this gives much more readable error in the console with a stacktrace
      throw ex.error;
    }
    throw ex;
  }
}
