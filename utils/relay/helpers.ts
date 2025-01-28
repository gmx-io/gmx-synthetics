import { BigNumberish, ethers } from "ethers";

function getDefaultOracleParams() {
  return {
    tokens: [],
    providers: [],
    data: [],
  };
}

export function getRelayParams(oracleParams: any, tokenPermits: any, fee: any) {
  return {
    oracleParams: oracleParams || getDefaultOracleParams(),
    tokenPermits: tokenPermits || [],
    fee,
  };
}

export function getDomain(chainId: BigNumberish, verifyingContract: string) {
  return {
    name: "GmxBaseGelatoRelayRouter",
    version: "1",
    chainId,
    verifyingContract,
  };
}

export function hashRelayParams(relayParams: any) {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      [
        "tuple(tuple(address[] tokens, address[] providers, bytes[] data) oracleParams, tuple(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s, address token)[] tokenPermits, tuple(address feeToken, uint256 feeAmount, address[] feeSwapPath) fee)",
      ],
      [relayParams]
    )
  );
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
