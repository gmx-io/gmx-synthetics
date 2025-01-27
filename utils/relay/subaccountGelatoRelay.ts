import { BigNumberish, ethers } from "ethers";
import * as keys from "../keys";
import { GELATO_RELAY_ADDRESS } from "./addresses";

export async function sendCreateOrder(p: {
  subaccountApprovalSigner: ethers.Signer;
  subaccount: string;
  subaccountApproval: {
    subaccount: string;
    expiresAt: BigNumberish;
    maxAllowedCount: BigNumberish;
    actionType: string;
    deadline: BigNumberish;
    nonce: BigNumberish;
    signature: string | undefined;
  };
  signer: ethers.Signer;
  sender: ethers.Signer;
  oracleParams: {
    tokens: string[];
    providers: string[];
    data: string[];
  };
  tokenPermits: {
    token: string;
    spender: string;
    value: BigNumberish;
    nonce: BigNumberish;
    deadline: BigNumberish;
    chainId: BigNumberish;
  }[];
  feeParams: {
    feeToken: string;
    feeAmount: BigNumberish;
    feeSwapPath: string[];
  };
  collateralDeltaAmount: BigNumberish;
  account: string;
  params: any;
  signature: string | undefined;
  userNonce: BigNumberish;
  deadline: BigNumberish;
  relayRouter: ethers.Contract;
  chainId: BigNumberish;
  relayFeeToken: string;
  relayFeeAmount: BigNumberish;
}) {
  if (!p.oracleParams) {
    p.oracleParams = {
      tokens: [],
      providers: [],
      data: [],
    };
  }
  if (!p.tokenPermits) {
    p.tokenPermits = [];
  }

  const relayParams = {
    oracleParams: p.oracleParams,
    tokenPermits: p.tokenPermits,
    fee: p.feeParams,
  };

  if (!p.subaccountApproval) {
    p.subaccountApproval = {
      subaccount: p.subaccount,
      expiresAt: 9999999999,
      maxAllowedCount: 10,
      actionType: keys.SUBACCOUNT_ORDER_ACTION,
      deadline: 0,
      nonce: 0,
    } as any;
  }
  if (!p.subaccountApproval.signature) {
    p.subaccountApproval.signature = await getSubaccountApprovalSignature({
      signer: p.subaccountApprovalSigner,
      chainId: p.chainId,
      verifyingContract: p.relayRouter.address,
      ...p.subaccountApproval,
    });
  }

  if (!p.signature) {
    p.signature = await getCreateOrderSignature({
      signer: p.signer,
      account: p.account,
      relayParams,
      subaccountApproval: p.subaccountApproval,
      collateralDeltaAmount: p.collateralDeltaAmount,
      verifyingContract: p.relayRouter.address,
      params: p.params,
      deadline: p.deadline,
      userNonce: p.userNonce,
      chainId: p.chainId,
    });
  }
  const createOrderCalldata = p.relayRouter.interface.encodeFunctionData("createOrder", [
    relayParams,
    p.subaccountApproval,
    p.collateralDeltaAmount,
    p.account,
    p.subaccount,
    p.params,
    p.signature,
    p.userNonce,
    p.deadline,
  ]);
  const calldata = ethers.utils.solidityPack(
    ["bytes", "address", "address", "uint256"],
    [createOrderCalldata, GELATO_RELAY_ADDRESS, p.relayFeeToken, p.relayFeeAmount]
  );
  return p.sender.sendTransaction({
    to: p.relayRouter.address,
    data: calldata,
  });
}

async function getCreateOrderSignature({
  signer,
  relayParams,
  subaccountApproval,
  collateralDeltaAmount,
  account,
  verifyingContract,
  params,
  deadline,
  userNonce,
  chainId,
}) {
  const types = {
    CreateOrder: [
      { name: "collateralDeltaAmount", type: "uint256" },
      { name: "account", type: "address" },
      { name: "addresses", type: "CreateOrderAddresses" },
      { name: "numbers", type: "CreateOrderNumbers" },
      { name: "orderType", type: "uint256" },
      { name: "isLong", type: "bool" },
      { name: "shouldUnwrapNativeToken", type: "bool" },
      { name: "autoCancel", type: "bool" },
      { name: "referralCode", type: "bytes32" },
      { name: "userNonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
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
  const domain = {
    name: "GmxBaseGelatoRelayRouter",
    version: "1",
    chainId,
    verifyingContract,
  };
  const relayParamsHash = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      [
        "tuple(tuple(address[] tokens, address[] providers, bytes[] data) oracleParams, tuple(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s, address token)[] tokenPermits, tuple(address feeToken, uint256 feeAmount, address[] feeSwapPath) fee)",
      ],
      [relayParams]
    )
  );
  const subaccountApprovalHash = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      [
        "tuple(address subaccount,uint256 expiresAt,uint256 maxAllowedCount,bytes32 actionType,uint256 nonce,uint256 deadline,bytes signature)",
      ],
      [subaccountApproval]
    )
  );

  const typedData = {
    collateralDeltaAmount,
    account,
    addresses: params.addresses,
    numbers: params.numbers,
    orderType: params.orderType,
    isLong: params.isLong,
    shouldUnwrapNativeToken: params.shouldUnwrapNativeToken,
    autoCancel: false,
    referralCode: params.referralCode,
    userNonce,
    deadline,
    relayParams: relayParamsHash,
    subaccountApproval: subaccountApprovalHash,
  };

  return signer._signTypedData(domain, types, typedData);
}

async function getSubaccountApprovalSignature(p: {
  signer: any;
  chainId: BigNumberish;
  verifyingContract: string;
  subaccount: string;
  expiresAt: BigNumberish;
  maxAllowedCount: BigNumberish;
  actionType: string;
  deadline: BigNumberish;
  nonce: BigNumberish;
}) {
  const domain = {
    name: "GmxBaseGelatoRelayRouter",
    version: "1",
    chainId: p.chainId,
    verifyingContract: p.verifyingContract,
  };

  const types = {
    SubaccountApproval: [
      { name: "subaccount", type: "address" },
      { name: "expiresAt", type: "uint256" },
      { name: "maxAllowedCount", type: "uint256" },
      { name: "actionType", type: "bytes32" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const typedData = {
    subaccount: p.subaccount,
    expiresAt: p.expiresAt,
    maxAllowedCount: p.maxAllowedCount,
    actionType: p.actionType,
    deadline: p.deadline,
    nonce: p.nonce,
  };

  return p.signer._signTypedData(domain, types, typedData);
}
