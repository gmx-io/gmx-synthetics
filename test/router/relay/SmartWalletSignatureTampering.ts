import { expect } from "chai";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "ethers";
import { _TypedDataEncoder } from "ethers/lib/utils";

import { deployFixture } from "../../../utils/fixture";
import { deployContract } from "../../../utils/deploy";
import { expandDecimals, decimalToFloat } from "../../../utils/math";
import { hashString } from "../../../utils/hash";
import { OrderType, DecreasePositionSwapType, getOrderKeys, getOrderCount } from "../../../utils/order";
import { errorsContract } from "../../../utils/error";
import { expectBalance } from "../../../utils/validation";
import * as keys from "../../../utils/keys";
import { GELATO_RELAY_ADDRESS } from "../../../utils/relay/addresses";
import { getRelayParams, sendRelayTransaction } from "../../../utils/relay/helpers";
import { getCreateOrderSignature } from "../../../utils/relay/signatures";

const EIP6492_MAGIC_BYTES = "0x6492649264926492649264926492649264926492649264926492649264926492";

// the factory call a relayer would swap in; it is never executed because the wrapper hash check reverts first
const ATTACKER_FACTORY = "0x0000000000000000000000000000000000001234";
const ATTACKER_CALLDATA = "0xdeadbeef";

function wrapperHash(factory: string, factoryCalldata: string) {
  return ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [factory, factoryCalldata]));
}

function wrapSignature(factory: string, factoryCalldata: string, innerSignature: string) {
  return ethers.utils.solidityPack(
    ["bytes", "bytes32"],
    [
      ethers.utils.defaultAbiCoder.encode(["address", "bytes", "bytes"], [factory, factoryCalldata, innerSignature]),
      EIP6492_MAGIC_BYTES,
    ]
  );
}

// sign the minified digest (for Ledger hardware wallet support)
async function signMinified(signer, domain, types, value) {
  const digest = _TypedDataEncoder.hash(domain, types, value);
  const minifiedTypes = { Minified: [{ name: "digest", type: "bytes32" }] };
  return signer._signTypedData(domain, minifiedTypes, { digest });
}

// The signed relay digest includes a hash of the EIP-6492 wrapper (eip6492SignatureWrapperHash). A relayer
// can no longer keep every signed field but swap the wrapper's factory/factoryCalldata to run its own call
// during signature validation, while the externalCalls collateral sits unaccounted in the OrderVault.
describe("EIP-6492 wrapper tampering", () => {
  let fixture;
  let user0, user3;
  let chainId;
  let reader, dataStore, router, gelatoRelayRouter, orderVault, ethUsdMarket, wnt, usdc;
  let relaySigner;
  let walletFactory, victimWallet, salt, realFactoryCalldata, legitWrapperHash;

  const collateralAmount = expandDecimals(5000, 6); // 5000 USDC swapped into the OrderVault

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user3 } = fixture.accounts);
    ({ reader, dataStore, router, gelatoRelayRouter, orderVault, ethUsdMarket, wnt, usdc } = fixture.contracts);

    chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);

    await impersonateAccount(GELATO_RELAY_ADDRESS);
    await setBalance(GELATO_RELAY_ADDRESS, expandDecimals(100, 18));
    relaySigner = await hre.ethers.getSigner(GELATO_RELAY_ADDRESS);

    await dataStore.setBool(keys.isSrcChainIdEnabledKey(chainId), true);
    await dataStore.setUint(keys.MAX_RELAY_FEE_SWAP_USD, decimalToFloat(10000));

    // deploy the victim's smart contract wallet (owner = user0)
    walletFactory = await deployContract("MockERC1271WalletFactory", []);
    salt = ethers.utils.formatBytes32String("victim");
    await walletFactory.createWallet(user0.address, salt);
    victimWallet = await walletFactory.getWalletAddress(user0.address, salt);
    realFactoryCalldata = walletFactory.interface.encodeFunctionData("createWallet", [user0.address, salt]);
    legitWrapperHash = wrapperHash(walletFactory.address, realFactoryCalldata);

    // fund the victim wallet and let it spend through the Router (collateral + relay fee)
    await usdc.mint(victimWallet, collateralAmount);
    await wnt.connect(user0).deposit({ value: expandDecimals(10, 18) });
    await wnt.connect(user0).transfer(victimWallet, expandDecimals(1, 18));
    await impersonateAccount(victimWallet);
    await setBalance(victimWallet, expandDecimals(10, 18));
    const walletSigner = await hre.ethers.getSigner(victimWallet);
    await usdc.connect(walletSigner).approve(router.address, ethers.constants.MaxUint256);
    await wnt.connect(walletSigner).approve(router.address, ethers.constants.MaxUint256);
  });

  function getCreateOrderParams(receiver: string) {
    return {
      addresses: {
        receiver,
        cancellationReceiver: ethers.constants.AddressZero,
        callbackContract: ethers.constants.AddressZero,
        uiFeeReceiver: ethers.constants.AddressZero,
        market: ethUsdMarket.marketToken,
        initialCollateralToken: usdc.address,
        swapPath: [],
      },
      numbers: {
        sizeDeltaUsd: decimalToFloat(1000),
        initialCollateralDeltaAmount: 0, // collateral comes from externalCalls / the OrderVault balance
        triggerPrice: 0,
        acceptablePrice: 0,
        executionFee: expandDecimals(2, 15),
        callbackGasLimit: 0,
        minOutputAmount: 0,
        validFromTime: 0,
      },
      orderType: OrderType.MarketIncrease,
      decreasePositionSwapType: DecreasePositionSwapType.NoSwap,
      isLong: false,
      shouldUnwrapNativeToken: false,
      referralCode: hashString("ref"),
      dataList: [],
    };
  }

  // the victim signs a relay createOrder whose externalCalls swap collateral into the OrderVault;
  // the signed wrapper hash is for the real wallet factory call
  // a minified digest is the exploitable surface for an already-deployed wallet: the attacker's factory
  // calldata would otherwise run on the EIP-6492 retry path
  async function signVictimOrder(minified: boolean) {
    const victimParams = getCreateOrderParams(victimWallet);

    const createOrderParams = {
      sender: relaySigner,
      signer: user0, // wallet owner signs
      account: victimWallet,
      params: victimParams,
      feeParams: { feeToken: wnt.address, feeAmount: expandDecimals(6, 15), feeSwapPath: [] },
      externalCalls: {
        sendTokens: [usdc.address],
        sendAmounts: [collateralAmount],
        externalCallTargets: [usdc.address],
        externalCallDataList: [usdc.interface.encodeFunctionData("transfer", [orderVault.address, collateralAmount])],
        refundTokens: [],
        refundReceivers: [],
      },
      deadline: 9999999999,
      desChainId: chainId,
      eip6492SignatureWrapperHash: legitWrapperHash,
      relayRouter: gelatoRelayRouter,
      chainId,
      gelatoRelayFeeToken: wnt.address,
      gelatoRelayFeeAmount: expandDecimals(1, 15),
    };

    const relayParams = await getRelayParams(createOrderParams);
    const innerSignature = await getCreateOrderSignature({
      ...createOrderParams,
      relayParams,
      verifyingContract: gelatoRelayRouter.address,
      minified,
    });

    return { victimParams, relayParams, innerSignature };
  }

  it("rejects a tampered wrapper and moves no funds", async () => {
    const { victimParams, relayParams, innerSignature } = await signVictimOrder(true);

    // relayer keeps every signed field but points the wrapper at a factory call it controls
    const tamperedWrapper = wrapSignature(ATTACKER_FACTORY, ATTACKER_CALLDATA, innerSignature);

    const calldata = gelatoRelayRouter.interface.encodeFunctionData("createOrder", [
      { ...relayParams, signature: tamperedWrapper },
      victimWallet,
      victimParams,
    ]);

    await expect(
      sendRelayTransaction({
        calldata,
        gelatoRelayFeeToken: wnt.address,
        gelatoRelayFeeAmount: expandDecimals(1, 15),
        sender: relaySigner,
        relayRouter: gelatoRelayRouter,
      })
    ).to.be.revertedWithCustomError(errorsContract, "InvalidEIP6492SignatureWrapper");

    // the whole transaction reverted: no order created and the wallet keeps its USDC
    expect(await getOrderCount(dataStore)).eq(0);
    await expectBalance(usdc.address, victimWallet, collateralAmount);
  });

  it("rejects when only the factoryCalldata is tampered", async () => {
    const { victimParams, relayParams, innerSignature } = await signVictimOrder(true);

    // same real factory, but attacker-chosen calldata -> wrapper hash mismatch
    const tamperedCalldata = walletFactory.interface.encodeFunctionData("createWallet", [user3.address, salt]);
    const tamperedWrapper = wrapSignature(walletFactory.address, tamperedCalldata, innerSignature);

    const calldata = gelatoRelayRouter.interface.encodeFunctionData("createOrder", [
      { ...relayParams, signature: tamperedWrapper },
      victimWallet,
      victimParams,
    ]);

    await expect(
      sendRelayTransaction({
        calldata,
        gelatoRelayFeeToken: wnt.address,
        gelatoRelayFeeAmount: expandDecimals(1, 15),
        sender: relaySigner,
        relayRouter: gelatoRelayRouter,
      })
    ).to.be.revertedWithCustomError(errorsContract, "InvalidEIP6492SignatureWrapper");
  });

  it("rejects swapping the wrapper and its committed hash together", async () => {
    const { victimParams, relayParams, innerSignature } = await signVictimOrder(true);

    // the relayer also overwrites eip6492SignatureWrapperHash so the wrapper hash check passes;
    // the signed relay digest is the second line of defense, because eip6492SignatureWrapperHash is
    // part of the digest, changing it makes the victim signature no longer validate
    const attackerWrapperHash = wrapperHash(ATTACKER_FACTORY, ATTACKER_CALLDATA);
    const calldata = gelatoRelayRouter.interface.encodeFunctionData("createOrder", [
      {
        ...relayParams,
        eip6492SignatureWrapperHash: attackerWrapperHash,
        signature: wrapSignature(ATTACKER_FACTORY, ATTACKER_CALLDATA, innerSignature),
      },
      victimWallet,
      victimParams,
    ]);

    await expect(
      sendRelayTransaction({
        calldata,
        gelatoRelayFeeToken: wnt.address,
        gelatoRelayFeeAmount: expandDecimals(1, 15),
        sender: relaySigner,
        relayRouter: gelatoRelayRouter,
      })
    ).to.be.revertedWithCustomError(errorsContract, "InvalidSignature");

    // the whole transaction reverted: no order created and the wallet keeps its USDC
    expect(await getOrderCount(dataStore)).eq(0);
    await expectBalance(usdc.address, victimWallet, collateralAmount);
  });

  it("accepts the untampered wrapper and records collateral to the victim order", async () => {
    // standard digest: an already-deployed wallet validates on the first ERC-1271 check, no factory call
    const { victimParams, relayParams, innerSignature } = await signVictimOrder(false);

    // the legit wrapper matches the signed wrapper hash
    const wrappedSignature = wrapSignature(walletFactory.address, realFactoryCalldata, innerSignature);

    const calldata = gelatoRelayRouter.interface.encodeFunctionData("createOrder", [
      { ...relayParams, signature: wrappedSignature },
      victimWallet,
      victimParams,
    ]);
    await sendRelayTransaction({
      calldata,
      gelatoRelayFeeToken: wnt.address,
      gelatoRelayFeeAmount: expandDecimals(1, 15),
      sender: relaySigner,
      relayRouter: gelatoRelayRouter,
    });

    expect(await getOrderCount(dataStore)).eq(1);
    const orderKeys = await getOrderKeys(dataStore, 0, 1);
    const order = await reader.getOrder(dataStore.address, orderKeys[0]);
    expect(order.addresses.account).eq(victimWallet);
    expect(order.numbers.initialCollateralDeltaAmount).eq(collateralAmount);
  });
});

// The subaccount approval is a second EIP-6492 signature (signed by the main account) and is bound the
// same way as the relay signature. It carries no live theft window of its own (subaccount orders reject
// externalCalls and the approval is validated before any funds move), but binding it keeps the signing
// scheme consistent so it never has to break a second time.
describe("EIP-6492 subaccount approval wrapper binding", () => {
  let fixture;
  let user0, user1;
  let chainId;
  let dataStore, router, subaccountGelatoRelayRouter, ethUsdMarket, wnt;
  let relaySigner;
  let walletFactory, mainWallet;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({ dataStore, router, subaccountGelatoRelayRouter, ethUsdMarket, wnt } = fixture.contracts);

    chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);

    await impersonateAccount(GELATO_RELAY_ADDRESS);
    await setBalance(GELATO_RELAY_ADDRESS, expandDecimals(100, 18));
    relaySigner = await hre.ethers.getSigner(GELATO_RELAY_ADDRESS);

    await dataStore.setBool(keys.isSrcChainIdEnabledKey(chainId), true);
    await dataStore.setUint(keys.MAX_RELAY_FEE_SWAP_USD, decimalToFloat(10000));

    // the main account is a smart contract wallet (owner = user1)
    walletFactory = await deployContract("MockERC1271WalletFactory", []);
    const salt = ethers.utils.formatBytes32String("main");
    await walletFactory.createWallet(user1.address, salt);
    mainWallet = await walletFactory.getWalletAddress(user1.address, salt);

    // fund the main wallet so the relay fee transfer (runs before the approval check) does not revert
    await wnt.connect(user1).deposit({ value: expandDecimals(10, 18) });
    await wnt.connect(user1).transfer(mainWallet, expandDecimals(1, 18));
    await impersonateAccount(mainWallet);
    await setBalance(mainWallet, expandDecimals(10, 18));
    const mainWalletSigner = await hre.ethers.getSigner(mainWallet);
    await wnt.connect(mainWalletSigner).approve(router.address, ethers.constants.MaxUint256);
  });

  it("rejects a tampered subaccount approval wrapper", async () => {
    const subaccount = user0; // the subaccount signs the action

    const realFactoryCalldata = walletFactory.interface.encodeFunctionData("createWallet", [
      user1.address,
      ethers.utils.formatBytes32String("main"),
    ]);
    const legitWrapperHash = wrapperHash(walletFactory.address, realFactoryCalldata);

    const approvalValues = {
      subaccount: subaccount.address,
      shouldAdd: true,
      expiresAt: 9999999999,
      maxAllowedCount: 10,
      actionType: keys.SUBACCOUNT_ORDER_ACTION,
      nonce: 0,
      desChainId: chainId,
      deadline: 9999999999,
      integrationId: ethers.constants.HashZero,
      revocationCounter: 0,
      eip6492SignatureWrapperHash: legitWrapperHash,
    };

    // the main wallet owner signs the approval over the legit wrapper hash
    const approvalDomain = {
      name: "GmxBaseGelatoRelayRouter",
      version: "1",
      chainId,
      verifyingContract: subaccountGelatoRelayRouter.address,
    };
    const approvalTypes = {
      SubaccountApproval: [
        { name: "account", type: "address" },
        { name: "subaccount", type: "address" },
        { name: "shouldAdd", type: "bool" },
        { name: "expiresAt", type: "uint256" },
        { name: "maxAllowedCount", type: "uint256" },
        { name: "actionType", type: "bytes32" },
        { name: "nonce", type: "uint256" },
        { name: "desChainId", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "integrationId", type: "bytes32" },
        { name: "revocationCounter", type: "uint256" },
        { name: "eip6492SignatureWrapperHash", type: "bytes32" },
      ],
    };
    const ownerInnerSignature = await user1._signTypedData(approvalDomain, approvalTypes, {
      account: mainWallet,
      ...approvalValues,
    });

    // relayer points the approval wrapper at a factory call it controls -> wrapper hash mismatch
    const tamperedApproval = {
      ...approvalValues,
      signature: wrapSignature(ATTACKER_FACTORY, ATTACKER_CALLDATA, ownerInnerSignature),
    };

    const orderParams = {
      addresses: {
        receiver: mainWallet, // subaccount orders must pay out to the main account
        cancellationReceiver: ethers.constants.AddressZero,
        callbackContract: ethers.constants.AddressZero,
        uiFeeReceiver: ethers.constants.AddressZero,
        market: ethUsdMarket.marketToken,
        initialCollateralToken: wnt.address,
        swapPath: [],
      },
      numbers: {
        sizeDeltaUsd: decimalToFloat(1000),
        initialCollateralDeltaAmount: 0,
        triggerPrice: 0,
        acceptablePrice: 0,
        executionFee: expandDecimals(1, 15),
        callbackGasLimit: 0,
        minOutputAmount: 0,
        validFromTime: 0,
      },
      orderType: OrderType.MarketIncrease,
      decreasePositionSwapType: DecreasePositionSwapType.NoSwap,
      isLong: false,
      shouldUnwrapNativeToken: false,
      referralCode: hashString("ref"),
      dataList: [],
    };

    const relayParams = await getRelayParams({
      signer: subaccount,
      feeParams: { feeToken: wnt.address, feeAmount: expandDecimals(2, 15), feeSwapPath: [] },
      deadline: 9999999999,
      desChainId: chainId,
      relayRouter: subaccountGelatoRelayRouter,
    });

    // the subaccount signs the action over the tampered approval, so validation reaches the approval check
    const actionSignature = await getCreateOrderSignature({
      signer: subaccount,
      relayParams,
      subaccountApproval: tamperedApproval,
      account: mainWallet,
      params: orderParams,
      verifyingContract: subaccountGelatoRelayRouter.address,
      chainId,
    });

    const calldata = subaccountGelatoRelayRouter.interface.encodeFunctionData("createOrder", [
      { ...relayParams, signature: actionSignature },
      tamperedApproval,
      mainWallet,
      subaccount.address,
      orderParams,
    ]);

    await expect(
      sendRelayTransaction({
        calldata,
        gelatoRelayFeeToken: wnt.address,
        gelatoRelayFeeAmount: expandDecimals(1, 15),
        sender: relaySigner,
        relayRouter: subaccountGelatoRelayRouter,
      })
    ).to.be.revertedWithCustomError(errorsContract, "InvalidEIP6492SignatureWrapper");
  });
});

// signature-level coverage of the wrapper hash check, isolated from the order flow: a wrapper that does
// not match the committed hash reverts before any factory call, for both the standard digest and the
// minified retry path an already-deployed wallet would use
describe("EIP-6492 wrapper binding", () => {
  let fixture;
  let user0;
  let chainId;
  let domain;
  let mockContract, mockFactory;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0 } = fixture.accounts);
    ({ chainId } = await hre.ethers.provider.getNetwork());

    const {
      dataStore,
      roleStore,
      eventEmitter,
      oracle,
      orderHandler,
      orderVault,
      swapHandler,
      router,
      relayUtils,
      signatureUtils,
      orderStoreUtils,
      gasUtils,
    } = fixture.contracts;

    mockContract = await deployContract(
      "MockGelatoRelayRouter",
      [
        router.address,
        roleStore.address,
        dataStore.address,
        eventEmitter.address,
        oracle.address,
        orderHandler.address,
        orderVault.address,
        swapHandler.address,
        ethers.constants.AddressZero,
      ],
      {
        libraries: {
          OrderStoreUtils: orderStoreUtils.address,
          RelayUtils: relayUtils.address,
          SignatureUtils: signatureUtils.address,
          GasUtils: gasUtils.address,
        },
      }
    );

    mockFactory = await deployContract("MockERC1271WalletFactory", []);

    domain = {
      name: "GmxBaseGelatoRelayRouter",
      version: "1",
      chainId,
      verifyingContract: mockContract.address,
    };
  });

  it("reverts when the wrapper hash does not match the signature (standard digest)", async () => {
    const salt = ethers.utils.formatBytes32String("binding-standard");
    const walletAddress = await mockFactory.getWalletAddress(user0.address, salt);

    const types = { PrimaryStruct: [{ name: "account", type: "address" }] };
    const value = { account: walletAddress };
    const innerSignature = await user0._signTypedData(domain, types, value);
    const factoryCalldata = mockFactory.interface.encodeFunctionData("createWallet", [user0.address, salt]);
    const wrappedSignature = wrapSignature(mockFactory.address, factoryCalldata, innerSignature);

    // the wrapper is valid, but the signer committed to a different wrapper hash
    const wrongWrapperHash = wrapperHash(mockFactory.address, "0xdeadbeef");
    await expect(
      mockContract.testEIP6492Signature(walletAddress, wrappedSignature, chainId, wrongWrapperHash)
    ).to.be.revertedWithCustomError(errorsContract, "InvalidEIP6492SignatureWrapper");

    // wallet was not deployed, the check fires before any factory call
    expect(await hre.ethers.provider.getCode(walletAddress)).to.equal("0x");
  });

  it("reverts when the wrapper hash does not match the signature (minified digest)", async () => {
    const salt = ethers.utils.formatBytes32String("binding-minified");
    await mockFactory.createWallet(user0.address, salt);
    const walletAddress = await mockFactory.getWalletAddress(user0.address, salt);

    const types = { PrimaryStruct: [{ name: "account", type: "address" }] };
    const value = { account: walletAddress };
    const innerSignature = await signMinified(user0, domain, types, value);
    const factoryCalldata = mockFactory.interface.encodeFunctionData("createWallet", [user0.address, salt]);
    const wrappedSignature = wrapSignature(mockFactory.address, factoryCalldata, innerSignature);

    const wrongWrapperHash = wrapperHash(mockFactory.address, "0xdeadbeef");
    await expect(
      mockContract.testEIP6492Signature(walletAddress, wrappedSignature, chainId, wrongWrapperHash)
    ).to.be.revertedWithCustomError(errorsContract, "InvalidEIP6492SignatureWrapper");
  });
});
