import { expect } from "chai";
import { deployments, ethers } from "hardhat";
import {
  impersonateAccount,
  setBalance,
  stopImpersonatingAccount,
  time,
} from "@nomicfoundation/hardhat-network-helpers";

import { contractAt, deployContract } from "../../utils/deploy";
import { createDeposit, executeDeposit, getDepositCount, getDepositKeys, handleDeposit } from "../../utils/deposit";
import { errorsContract } from "../../utils/error";
import { getEventData, getEventDataArray, parseLogs } from "../../utils/event";
import { executeWithOracleParams } from "../../utils/exchange";
import { deployFixture } from "../../utils/fixture";
import { handleGlvDeposit } from "../../utils/glv";
import { hashString } from "../../utils/hash";
import * as keys from "../../utils/keys";
import { expandDecimals, percentageToFloat } from "../../utils/math";
import { grantRole, revokeRole } from "../../utils/role";

describe("GmDepositProxy", () => {
  let fixture, proxy;
  let keeper, fundingWallet, outsider;
  let roleStore, dataStore, reader, exchangeRouter, depositHandler, depositVault, marketFactory;
  let wnt, usdc, ethUsdMarket, ethUsdSingleTokenMarket, ethUsdSingleTokenMarket2;

  const executionFee = expandDecimals(1, 16);
  const callbackGasLimit = 300_000;
  const longAmount = expandDecimals(1, 18);
  const shortAmount = expandDecimals(5000, 6);
  const emptyEventData = {
    addressItems: { items: [], arrayItems: [] },
    uintItems: { items: [], arrayItems: [] },
    intItems: { items: [], arrayItems: [] },
    boolItems: { items: [], arrayItems: [] },
    bytes32Items: { items: [], arrayItems: [] },
    bytesItems: { items: [], arrayItems: [] },
    stringItems: { items: [], arrayItems: [] },
  };

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0: keeper, user1: fundingWallet, user2: outsider } = fixture.accounts);
    ({
      roleStore,
      dataStore,
      reader,
      exchangeRouter,
      depositHandler,
      depositVault,
      marketFactory,
      wnt,
      usdc,
      ethUsdMarket,
      ethUsdSingleTokenMarket,
      ethUsdSingleTokenMarket2,
    } = fixture.contracts);
    proxy = await deployContract("GmDepositProxy", [exchangeRouter.address, reader.address, fundingWallet.address]);
    await grantRole(roleStore, keeper.address, "DONATION_KEEPER");
    await dataStore.setUint(keys.MAX_CALLBACK_GAS_LIMIT, 2_000_000);
    await dataStore.setUint(keys.REQUEST_EXPIRATION_TIME, 300);
    await wnt.mint(fundingWallet.address, expandDecimals(20, 18));
    await usdc.mint(fundingWallet.address, expandDecimals(50_000, 6));
    await wnt.connect(fundingWallet).approve(proxy.address, ethers.constants.MaxUint256);
    await usdc.connect(fundingWallet).approve(proxy.address, ethers.constants.MaxUint256);
  });

  function create(overrides: any = {}) {
    return proxy
      .connect(overrides.caller || keeper)
      .createDeposit(
        overrides.market?.marketToken || ethUsdMarket.marketToken,
        overrides.longAmount ?? longAmount,
        overrides.shortAmount ?? shortAmount,
        overrides.minMarketTokens ?? 0,
        overrides.executionFee ?? executionFee,
        overrides.callbackGasLimit ?? callbackGasLimit,
        { value: overrides.value ?? 0 }
      );
  }

  async function createRequest(overrides: any = {}) {
    const receipt = await (await create(overrides)).wait();
    const event = receipt.events.find((item) => item.event === "ProxyDepositCreated");
    const key = event.args.key;
    expect(event.args.caller).eq((overrides.caller || keeper).address);
    expect(await proxy.isProxyDeposit(key)).eq(true);
    expect(await proxy.isPendingDeposit(key)).eq(true);
    return key;
  }

  async function createMarket(longToken, shortToken) {
    await dataStore.setUint(keys.tokenTransferGasLimit(longToken.address), 200_000);
    await dataStore.setUint(keys.tokenTransferGasLimit(shortToken.address), 200_000);
    const receipt = await (
      await marketFactory.createMarket(wnt.address, longToken.address, shortToken.address, hashString("proxy-test"))
    ).wait();
    const event = getEventData(parseLogs(fixture, receipt), "MarketCreated");
    return reader.getMarket(dataStore.address, event.marketToken);
  }

  async function handlerSigner() {
    await setBalance(depositHandler.address, expandDecimals(1, 18));
    await impersonateAccount(depositHandler.address);
    return ethers.getSigner(depositHandler.address);
  }

  function proxyEvents(receipt, name) {
    return receipt.logs
      .filter((log) => log.address === proxy.address)
      .map((log) => proxy.interface.parseLog(log))
      .filter((log) => log.name === name);
  }

  function callbackErrors(logs, name) {
    // CallbackUtils emits native Solidity events through DepositHandler, not EventEmitter.
    const topic = fixture.contracts.callbackUtils.interface.getEventTopic(name);
    return logs.filter((log) => log.address === depositHandler.address && log.topics[0] === topic);
  }

  it("uses immutable dependencies without adding DataStore entries or requiring a privileged role", async () => {
    expect(await proxy.fundingWallet()).eq(fundingWallet.address);
    expect(await proxy.exchangeRouter()).eq(exchangeRouter.address);
    expect(await proxy.depositHandler()).eq(depositHandler.address);
    expect(await proxy.depositVault()).eq(depositVault.address);
    expect(await proxy.reader()).eq(reader.address);
    expect(await proxy.dataStore()).eq(dataStore.address);
    expect(await proxy.roleStore()).eq(roleStore.address);
    expect(await proxy.wnt()).eq(wnt.address);
    expect(await proxy.DONATION_KEEPER()).eq(hashString("DONATION_KEEPER"));
    for (const role of ["CONTROLLER", "ROUTER_PLUGIN", "DONATION_KEEPER", "ORDER_KEEPER"]) {
      expect(await roleStore.hasRole(proxy.address, hashString(role))).eq(false);
    }
    await expect(
      deployContract("GmDepositProxy", [exchangeRouter.address, reader.address, ethers.constants.AddressZero])
    ).to.be.revertedWithCustomError(proxy, "InvalidFundingWallet");
    await expect(deployContract("GmDepositProxy", [exchangeRouter.address, outsider.address, fundingWallet.address]))
      .to.be.revertedWithCustomError(proxy, "InvalidDependency")
      .withArgs(outsider.address);
    expect(proxy.interface.functions["EXCHANGE_ROUTER()"]).eq(undefined);
    expect(proxy.interface.functions["READER()"]).eq(undefined);
  });

  it("creates a fixed-recipient direct deposit and mints GM straight to the funding wallet", async () => {
    const key = await createRequest({ minMarketTokens: expandDecimals(9999, 18) });
    const deposit = await reader.getDeposit(dataStore.address, key);
    expect(deposit.addresses.account).eq(proxy.address);
    expect(deposit.addresses.receiver).eq(fundingWallet.address);
    expect(deposit.addresses.callbackContract).eq(proxy.address);
    expect(deposit.addresses.uiFeeReceiver).eq(ethers.constants.AddressZero);
    expect(deposit.addresses.initialLongToken).eq(wnt.address);
    expect(deposit.addresses.initialShortToken).eq(usdc.address);
    expect(deposit.addresses.longTokenSwapPath).deep.eq([]);
    expect(deposit.addresses.shortTokenSwapPath).deep.eq([]);
    expect(deposit.flags.shouldUnwrapNativeToken).eq(false);
    expect(deposit.numbers.srcChainId).eq(0);
    expect(deposit.numbers.initialLongTokenAmount).eq(longAmount);
    expect(deposit.numbers.initialShortTokenAmount).eq(shortAmount);
    expect(deposit.numbers.executionFee).eq(executionFee);
    expect(deposit.numbers.callbackGasLimit).eq(callbackGasLimit);
    expect(await wnt.balanceOf(depositVault.address)).eq(longAmount.add(executionFee));
    expect(await usdc.balanceOf(depositVault.address)).eq(shortAmount);
    expect(await wnt.balanceOf(fundingWallet.address)).eq(expandDecimals(20, 18).sub(longAmount).sub(executionFee));

    const nativeBefore = await ethers.provider.getBalance(keeper.address);
    const fundingNativeBefore = await ethers.provider.getBalance(fundingWallet.address);
    const fundingWntBefore = await wnt.balanceOf(fundingWallet.address);
    const { txReceipt, logs } = await executeDeposit(fixture, { depositKey: key });
    expect(proxyEvents(txReceipt, "ProxyDepositCallbackReceived")[0].args.cancelled).eq(false);
    expect(callbackErrors(logs, "AfterDepositExecutionError")).length(0);
    expect(getEventDataArray(logs, "ExecutionFeeRefundCallback")).length(1);
    const refund = proxyEvents(txReceipt, "ExecutionFeeReturned")[0].args;
    expect(refund.receiver).eq(fundingWallet.address);
    expect(await ethers.provider.getBalance(keeper.address)).eq(nativeBefore);
    expect(await wnt.balanceOf(fundingWallet.address)).eq(fundingWntBefore.add(refund.amount));
    expect(await ethers.provider.getBalance(fundingWallet.address)).eq(fundingNativeBefore);
    const gm = await contractAt("MarketToken", ethUsdMarket.marketToken);
    expect(await gm.balanceOf(fundingWallet.address)).eq(expandDecimals(10_000, 18));
    for (const address of [keeper.address, proxy.address]) {
      expect(await gm.balanceOf(address)).eq(0);
      expect(await wnt.balanceOf(address)).eq(0);
      expect(await usdc.balanceOf(address)).eq(0);
    }
    expect(await proxy.isPendingDeposit(key)).eq(false);
    expect(await proxy.isProxyDeposit(key)).eq(true);
  });

  it("supports the funding wallet without a keeper role and blocks revoked / unauthorized callers", async () => {
    await createRequest({ caller: fundingWallet });
    await revokeRole(roleStore, keeper.address, "DONATION_KEEPER");
    for (const caller of [keeper, outsider]) {
      await expect(create({ caller })).to.be.revertedWithCustomError(errorsContract, "Unauthorized");
      await expect(proxy.connect(caller).cancelDeposit(ethers.constants.HashZero)).to.be.revertedWithCustomError(
        errorsContract,
        "Unauthorized"
      );
      await expect(proxy.connect(caller).recoverTokens([usdc.address])).to.be.revertedWithCustomError(
        errorsContract,
        "Unauthorized"
      );
      await expect(proxy.connect(caller).recoverNativeToken()).to.be.revertedWithCustomError(
        errorsContract,
        "Unauthorized"
      );
    }
  });

  it("pulls WNT fees from the funding wallet while the caller pays only transaction gas", async () => {
    const before = await ethers.provider.getBalance(keeper.address);
    const receipt = await (await create({ market: ethUsdSingleTokenMarket, longAmount: shortAmount })).wait();
    expect(await ethers.provider.getBalance(keeper.address)).eq(
      before.sub(receipt.gasUsed.mul(receipt.effectiveGasPrice))
    );
    expect(await wnt.balanceOf(fundingWallet.address)).eq(expandDecimals(20, 18).sub(executionFee));
    expect(await wnt.balanceOf(depositVault.address)).eq(executionFee);
    expect(await wnt.balanceOf(keeper.address)).eq(0);
  });

  it("rejects native fee funding on the nonpayable createDeposit entrypoint", async () => {
    const data = proxy.interface.encodeFunctionData("createDeposit", [
      ethUsdMarket.marketToken,
      longAmount,
      shortAmount,
      0,
      executionFee,
      callbackGasLimit,
    ]);
    await expect(keeper.sendTransaction({ to: proxy.address, data, value: executionFee })).to.be.reverted;
    expect(await getDepositCount(dataStore)).eq(0);
    expect(await wnt.balanceOf(fundingWallet.address)).eq(expandDecimals(20, 18));
  });

  it("reuses one WNT approval across requests and returns refunds as reusable WNT", async () => {
    await wnt.connect(fundingWallet).approve(proxy.address, executionFee.mul(2));
    for (let i = 0; i < 2; i++) {
      const key = await createRequest({ market: ethUsdSingleTokenMarket, longAmount: shortAmount, shortAmount: 0 });
      expect(await wnt.balanceOf(fundingWallet.address)).eq(expandDecimals(20, 18).sub(executionFee));
      const { txReceipt, logs } = await executeDeposit(fixture, { depositKey: key });
      const used = getEventData(logs, "KeeperExecutionFee").executionFeeAmount;
      expect(used).eq(0); // Fixture fee factor is zero.
      expect(proxyEvents(txReceipt, "ExecutionFeeReturned")[0].args.receiver).eq(fundingWallet.address);
      expect(await wnt.balanceOf(fundingWallet.address)).eq(expandDecimals(20, 18));
      expect(await wnt.allowance(fundingWallet.address, proxy.address)).eq(executionFee.mul(1 - i));
    }
    await expect(
      create({ market: ethUsdSingleTokenMarket, longAmount: shortAmount, shortAmount: 0 })
    ).to.be.revertedWith("ERC20: insufficient allowance");
    expect(await getDepositCount(dataStore)).eq(0);
  });

  it("requires sufficient WNT allowance and balance even for stable-only markets", async () => {
    const params = { market: ethUsdSingleTokenMarket, longAmount: shortAmount, shortAmount: 0 };
    await wnt.connect(fundingWallet).approve(proxy.address, executionFee.sub(1));
    await expect(create(params)).to.be.revertedWith("ERC20: insufficient allowance");
    await wnt.connect(fundingWallet).approve(proxy.address, executionFee);
    await wnt.burn(fundingWallet.address, expandDecimals(20, 18).sub(executionFee).add(1));
    await expect(create(params)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    expect(await getDepositCount(dataStore)).eq(0);
    expect(await wnt.balanceOf(depositVault.address)).eq(0);
    expect(await usdc.balanceOf(depositVault.address)).eq(0);
    expect(await usdc.balanceOf(fundingWallet.address)).eq(expandDecimals(50_000, 6));
  });

  it("returns all refunds to the funding wallet even when a different keeper cancels", async () => {
    await grantRole(roleStore, outsider.address, "DONATION_KEEPER");
    const key = await createRequest();
    await revokeRole(roleStore, keeper.address, "DONATION_KEEPER");
    await time.increase(300);
    const before = await ethers.provider.getBalance(keeper.address);
    await proxy.connect(outsider).cancelDeposit(key);
    expect(await ethers.provider.getBalance(keeper.address)).eq(before);
    expect(await wnt.balanceOf(keeper.address)).eq(0);
    expect(await wnt.balanceOf(fundingWallet.address)).eq(expandDecimals(20, 18));
  });

  it("rejects inconsistent router and handler DataStores at deployment", async () => {
    const otherStore = await deployContract("DataStore", [roleStore.address]);
    const deployment = await deployments.get("ExchangeRouter");
    const args = [...deployment.args];
    args[2] = otherStore.address;
    const otherRouter = await deployContract("ExchangeRouter", args, { libraries: deployment.libraries });
    await expect(deployContract("GmDepositProxy", [otherRouter.address, reader.address, fundingWallet.address]))
      .to.be.revertedWithCustomError(proxy, "InvalidDependency")
      .withArgs(depositHandler.address);
    expect(await wnt.balanceOf(fundingWallet.address)).eq(expandDecimals(20, 18));
    expect(await getDepositCount(dataStore)).eq(0);
  });

  it("reads WNT from DataStore instead of caching the deployment-time address", async () => {
    const newWnt = await deployContract("WNT", []);
    await dataStore.setAddress(keys.WNT, newWnt.address);
    expect(await proxy.wnt()).eq(newWnt.address);
    await newWnt.mint(fundingWallet.address, executionFee);
    await newWnt.connect(fundingWallet).approve(proxy.address, executionFee);
    const key = await createRequest({ market: ethUsdSingleTokenMarket, longAmount: shortAmount });
    expect(await newWnt.balanceOf(depositVault.address)).eq(executionFee);
    expect(await wnt.balanceOf(depositVault.address)).eq(0);
    expect((await reader.getDeposit(dataStore.address, key)).numbers.executionFee).eq(executionFee);
  });

  it("rejects an invalid existing WNT configuration without moving principal", async () => {
    await dataStore.setAddress(keys.WNT, ethers.constants.AddressZero);
    await expect(deployContract("GmDepositProxy", [exchangeRouter.address, reader.address, fundingWallet.address]))
      .to.be.revertedWithCustomError(proxy, "InvalidDependency")
      .withArgs(ethers.constants.AddressZero);
    await expect(create())
      .to.be.revertedWithCustomError(proxy, "InvalidDependency")
      .withArgs(ethers.constants.AddressZero);
    expect(await wnt.balanceOf(fundingWallet.address)).eq(expandDecimals(20, 18));
    expect(await usdc.balanceOf(fundingWallet.address)).eq(expandDecimals(50_000, 6));
    expect(await getDepositCount(dataStore)).eq(0);
  });

  it("authenticates fee callbacks independently of completion callbacks and rejects replay", async () => {
    const key = await createRequest({ callbackGasLimit: 1 });
    await expect(proxy.connect(outsider).refundExecutionFee(key, emptyEventData, { value: 1 }))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(outsider.address, "DEPOSIT_HANDLER");
    const { txReceipt } = await executeDeposit(fixture, { depositKey: key });
    expect(proxyEvents(txReceipt, "ExecutionFeeReturned")).length(1);
    const signer = await handlerSigner();
    await expect(
      proxy.connect(signer).refundExecutionFee(key, emptyEventData, { value: 1 })
    ).to.be.revertedWithCustomError(proxy, "ExecutionFeeRefundAlreadyReceived");
    await expect(
      proxy.connect(signer).refundExecutionFee(ethers.constants.HashZero, emptyEventData)
    ).to.be.revertedWithCustomError(proxy, "UnknownProxyDeposit");
    await stopImpersonatingAccount(depositHandler.address);
  });

  for (const outcome of ["execution", "automatic cancellation", "manual cancellation"]) {
    it(`returns WNT to a native-rejecting funding contract on ${outcome}`, async () => {
      const multisig = await deployContract("MockGmDepositFundingWallet", []);
      proxy = await deployContract("GmDepositProxy", [exchangeRouter.address, reader.address, multisig.address]);
      await wnt.mint(multisig.address, expandDecimals(20, 18));
      await usdc.mint(multisig.address, expandDecimals(50_000, 6));
      await multisig.approveToken(wnt.address, proxy.address, ethers.constants.MaxUint256);
      await multisig.approveToken(usdc.address, proxy.address, ethers.constants.MaxUint256);
      await dataStore.setUint(keys.EXECUTION_GAS_FEE_BASE_AMOUNT_V2_1, 100_000);
      const key = await createRequest(
        outcome === "automatic cancellation" ? { minMarketTokens: expandDecimals(20_000, 18) } : {}
      );
      const keeperBefore = await ethers.provider.getBalance(keeper.address);
      let receipt, logs;
      if (outcome === "manual cancellation") {
        await time.increase(300);
        receipt = await (await proxy.connect(keeper).cancelDeposit(key, { gasPrice: expandDecimals(1, 9) })).wait();
        logs = parseLogs(fixture, receipt);
        expect(await ethers.provider.getBalance(keeper.address)).eq(
          keeperBefore.sub(receipt.gasUsed.mul(receipt.effectiveGasPrice))
        );
      } else {
        ({ txReceipt: receipt, logs } = await executeDeposit(fixture, {
          depositKey: key,
          ...(outcome === "automatic cancellation" ? { expectedCancellationReason: "MinMarketTokens" } : {}),
        }));
        expect(await ethers.provider.getBalance(keeper.address)).eq(keeperBefore);
      }
      const compensation = getEventData(logs, "KeeperExecutionFee");
      const feeSpent = outcome === "manual cancellation" ? ethers.constants.Zero : compensation.executionFeeAmount;
      const principalSpent = outcome === "execution" ? longAmount : ethers.constants.Zero;
      expect(await wnt.balanceOf(multisig.address)).eq(expandDecimals(20, 18).sub(principalSpent).sub(feeSpent));
      expect(await usdc.balanceOf(multisig.address)).eq(
        expandDecimals(50_000, 6).sub(outcome === "execution" ? shortAmount : 0)
      );
      expect(proxyEvents(receipt, "ExecutionFeeReturned")[0].args.receiver).eq(multisig.address);
      expect(getEventDataArray(logs, "ExecutionFeeRefundCallback")).length(1);
      expect(await ethers.provider.getBalance(multisig.address)).eq(0);
      expect(await ethers.provider.getBalance(proxy.address)).eq(0);
      expect(await wnt.balanceOf(proxy.address)).eq(0);
      expect(await wnt.balanceOf(keeper.address)).eq(0);
      expect(await proxy.isPendingDeposit(key)).eq(false);
    });
  }

  it("allows the funding contract itself to create without native value or a keeper role", async () => {
    const multisig = await deployContract("MockGmDepositFundingWallet", []);
    proxy = await deployContract("GmDepositProxy", [exchangeRouter.address, reader.address, multisig.address]);
    await wnt.mint(multisig.address, executionFee);
    await usdc.mint(multisig.address, shortAmount);
    await multisig.approveToken(wnt.address, proxy.address, executionFee);
    await multisig.approveToken(usdc.address, proxy.address, shortAmount);
    const receipt = await (
      await multisig.callProxy(
        proxy.address,
        proxy.interface.encodeFunctionData("createDeposit", [
          ethUsdSingleTokenMarket.marketToken,
          shortAmount,
          0,
          0,
          executionFee,
          callbackGasLimit,
        ])
      )
    ).wait();
    const event = proxyEvents(receipt, "ProxyDepositCreated")[0];
    expect(event.args.caller).eq(multisig.address);
    await executeDeposit(fixture, { depositKey: event.args.key });
    const gm = await contractAt("MarketToken", ethUsdSingleTokenMarket.marketToken);
    expect(await gm.balanceOf(multisig.address)).eq(expandDecimals(5000, 18));
    expect(await wnt.balanceOf(multisig.address)).eq(executionFee);
    expect(await ethers.provider.getBalance(multisig.address)).eq(0);
  });

  for (const manual of [false, true]) {
    it(`blocks WNT refund reentry (manual cancellation: ${manual})`, async () => {
      const feeToken = await deployContract("MockGmDepositReentrantWnt", []);
      await dataStore.setAddress(keys.WNT, feeToken.address);
      await dataStore.setUint(keys.tokenTransferGasLimit(feeToken.address), 200_000);
      // The adversarial mock persists the reentry result, unlike ordinary WNT.
      await dataStore.setUint(keys.REFUND_EXECUTION_FEE_GAS_LIMIT, 500_000);
      await feeToken.connect(fundingWallet).deposit({ value: executionFee });
      await feeToken.connect(fundingWallet).approve(proxy.address, executionFee);
      await grantRole(roleStore, feeToken.address, "DONATION_KEEPER");
      await feeToken.setCallback(
        proxy.address,
        proxy.interface.encodeFunctionData("recoverTokens", [[feeToken.address]])
      );
      const key = await createRequest({ market: ethUsdSingleTokenMarket, longAmount: shortAmount, shortAmount: 0 });
      if (manual) {
        await time.increase(300);
        await proxy.connect(keeper).cancelDeposit(key);
      } else {
        await executeDeposit(fixture, { depositKey: key });
      }
      expect(await feeToken.attempts()).eq(1);
      expect(await feeToken.reentrySucceeded()).eq(false);
      const reason = ethers.utils.defaultAbiCoder.decode(["string"], "0x" + (await feeToken.reentryResult()).slice(10));
      expect(reason[0]).eq("ReentrancyGuard: reentrant call");
      expect(await feeToken.balanceOf(fundingWallet.address)).eq(executionFee);
      expect(await feeToken.balanceOf(proxy.address)).eq(0);
    });
  }

  for (const stableOnly of [false, true]) {
    it(`returns WNT compensation and principal to the funding wallet (stable-only: ${stableOnly})`, async () => {
      proxy = await deployContract("MockGmDepositProxyWrappedCompensation", [
        exchangeRouter.address,
        reader.address,
        fundingWallet.address,
      ]);
      await wnt.connect(fundingWallet).approve(proxy.address, ethers.constants.MaxUint256);
      await usdc.connect(fundingWallet).approve(proxy.address, ethers.constants.MaxUint256);
      await dataStore.setUint(keys.EXECUTION_GAS_FEE_BASE_AMOUNT_V2_1, 100_000);
      // Leave another failed cancellation's principal in the proxy to check isolation.
      const staleKey = await createRequest({ callbackGasLimit: 1, minMarketTokens: expandDecimals(20_000, 18) });
      const { logs: staleLogs } = await executeDeposit(fixture, {
        depositKey: staleKey,
        expectedCancellationReason: "MinMarketTokens",
      });
      const staleFee = getEventData(staleLogs, "KeeperExecutionFee").executionFeeAmount;
      expect(await wnt.balanceOf(proxy.address)).eq(longAmount);
      await wnt.mint(depositVault.address, 1); // Core includes vault dust in the new request.
      const key = await createRequest(stableOnly ? { market: ethUsdSingleTokenMarket, longAmount: shortAmount } : {});
      await time.increase(300);
      const before = await ethers.provider.getBalance(keeper.address);
      const receipt = await (await proxy.connect(keeper).cancelDeposit(key, { gasPrice: expandDecimals(1, 9) })).wait();
      expect(await ethers.provider.getBalance(keeper.address)).eq(
        before.sub(receipt.gasUsed.mul(receipt.effectiveGasPrice))
      );
      expect(await wnt.balanceOf(keeper.address)).eq(0);
      expect(await wnt.balanceOf(proxy.address)).eq(0);
      expect(await wnt.balanceOf(fundingWallet.address)).eq(expandDecimals(20, 18).sub(staleFee).add(1));
      expect(await usdc.balanceOf(fundingWallet.address)).eq(expandDecimals(50_000, 6));
      expect(await ethers.provider.getBalance(proxy.address)).eq(0);
    });
  }

  for (const sameToken of ["USDC", "WNT"]) {
    it(`combines both amounts exactly once for ${sameToken}/${sameToken} markets`, async () => {
      const market = sameToken === "USDC" ? ethUsdSingleTokenMarket : ethUsdSingleTokenMarket2;
      const amount = sameToken === "USDC" ? shortAmount : longAmount;
      const key = await createRequest({ market, longAmount: amount, shortAmount: amount });
      const deposit = await reader.getDeposit(dataStore.address, key);
      expect(deposit.numbers.initialLongTokenAmount).eq(amount.mul(2));
      expect(deposit.numbers.initialShortTokenAmount).eq(0);
      expect(deposit.numbers.executionFee).eq(executionFee);
      await executeDeposit(fixture, { depositKey: key });
      const gm = await contractAt("MarketToken", market.marketToken);
      expect(await gm.balanceOf(fundingWallet.address)).eq(expandDecimals(10_000, 18));
    });
  }

  it("handles execution fees when WNT is the short token", async () => {
    const market = await createMarket(usdc, wnt);
    const key = await createRequest({ market, longAmount: shortAmount, shortAmount: longAmount });
    const deposit = await reader.getDeposit(dataStore.address, key);
    expect(deposit.numbers.initialLongTokenAmount).eq(shortAmount);
    expect(deposit.numbers.initialShortTokenAmount).eq(longAmount);
    expect(deposit.numbers.executionFee).eq(executionFee);
    await time.increase(300);
    await proxy.connect(keeper).cancelDeposit(key);
    expect(await usdc.balanceOf(fundingWallet.address)).eq(expandDecimals(50_000, 6));
    expect(await wnt.balanceOf(proxy.address)).eq(0);
  });

  for (const side of ["long", "short"]) {
    it(`supports a ${side}-only deposit`, async () => {
      const key = await createRequest(side === "long" ? { shortAmount: 0 } : { longAmount: 0 });
      await executeDeposit(fixture, { depositKey: key });
      const gm = await contractAt("MarketToken", ethUsdMarket.marketToken);
      expect(await gm.balanceOf(fundingWallet.address)).eq(expandDecimals(5000, 18));
    });
  }

  it("does not let unsolicited unrecorded vault dust deny deposits", async () => {
    await wnt.mint(depositVault.address, 1);
    await usdc.mint(depositVault.address, 1);
    const key = await createRequest();
    const deposit = await reader.getDeposit(dataStore.address, key);
    expect(deposit.numbers.initialLongTokenAmount).eq(longAmount.add(1));
    expect(deposit.numbers.initialShortTokenAmount).eq(shortAmount.add(1));
    await executeDeposit(fixture, { depositKey: key });
  });

  it("rejects empty amounts, missing callbacks, unknown markets and rolls back core validation failures", async () => {
    await expect(create({ longAmount: 0, shortAmount: 0 })).to.be.revertedWithCustomError(proxy, "EmptyDepositAmounts");
    await expect(create({ callbackGasLimit: 0 })).to.be.revertedWithCustomError(proxy, "EmptyCallbackGasLimit");
    await expect(create({ market: { marketToken: outsider.address } })).to.be.revertedWithCustomError(
      proxy,
      "InvalidMarket"
    );
    await expect(create({ callbackGasLimit: 2_000_001 })).to.be.revertedWithCustomError(
      errorsContract,
      "MaxCallbackGasLimitExceeded"
    );
    await dataStore.setBool(keys.isMarketDisabledKey(ethUsdMarket.marketToken), true);
    await expect(create()).to.be.revertedWithCustomError(errorsContract, "DisabledMarket");
    expect(await wnt.balanceOf(fundingWallet.address)).eq(expandDecimals(20, 18));
    expect(await usdc.balanceOf(fundingWallet.address)).eq(expandDecimals(50_000, 6));
    expect(await wnt.balanceOf(depositVault.address)).eq(0);
    expect(await usdc.balanceOf(depositVault.address)).eq(0);
    expect(await getDepositCount(dataStore)).eq(0);
  });

  it("requires funding-wallet approvals and atomically rolls back an earlier token transfer", async () => {
    await usdc.connect(fundingWallet).approve(proxy.address, 0);
    await expect(create()).to.be.revertedWith("ERC20: insufficient allowance");
    expect(await wnt.balanceOf(fundingWallet.address)).eq(expandDecimals(20, 18));
    expect(await wnt.balanceOf(depositVault.address)).eq(0);
    expect(await getDepositCount(dataStore)).eq(0);
  });

  it("rolls back funding when the execution fee is insufficient", async () => {
    await dataStore.setUint(keys.ESTIMATED_GAS_FEE_BASE_AMOUNT_V2_1, 100_000);
    await expect(create({ executionFee: 0 })).to.be.revertedWithCustomError(errorsContract, "InsufficientExecutionFee");
    expect(await wnt.balanceOf(fundingWallet.address)).eq(expandDecimals(20, 18));
    expect(await usdc.balanceOf(fundingWallet.address)).eq(expandDecimals(50_000, 6));
    expect(await wnt.balanceOf(depositVault.address)).eq(0);
    expect(await getDepositCount(dataStore)).eq(0);
  });

  it("preserves GMX bootstrap rules and can buy GM after the required dead-share deposit", async () => {
    await dataStore.setUint(keys.minMarketTokensForFirstDeposit(ethUsdMarket.marketToken), expandDecimals(10, 18));
    const key = await createRequest({ minMarketTokens: expandDecimals(10, 18) });
    await executeDeposit(fixture, { depositKey: key, expectedCancellationReason: "InvalidReceiverForFirstDeposit" });
    expect(await usdc.balanceOf(fundingWallet.address)).eq(expandDecimals(50_000, 6));
    await handleDeposit(fixture, {
      create: {
        receiver: { address: "0x0000000000000000000000000000000000000001" },
        shortTokenAmount: expandDecimals(10, 6),
        minMarketTokens: expandDecimals(10, 18),
      },
    });
    const fundedKey = await createRequest();
    await executeDeposit(fixture, { depositKey: fundedKey });
    const gm = await contractAt("MarketToken", ethUsdMarket.marketToken);
    expect(await gm.balanceOf(fundingWallet.address)).eq(expandDecimals(10_000, 18));
  });

  it("rejects fee-on-transfer inputs before creating any GMX request", async () => {
    const token = await deployContract("MockFeeOnTransferToken", ["Fee", "FEE", 18, 100]);
    const market = await createMarket(token, usdc);
    await token.mint(fundingWallet.address, longAmount);
    await token.connect(fundingWallet).approve(proxy.address, longAmount);
    await expect(create({ market }))
      .to.be.revertedWithCustomError(proxy, "UnexpectedTransferAmount")
      .withArgs(token.address, longAmount, longAmount.mul(99).div(100));
    expect(await token.balanceOf(fundingWallet.address)).eq(longAmount);
    expect(await wnt.balanceOf(fundingWallet.address)).eq(expandDecimals(20, 18));
    expect(await getDepositCount(dataStore)).eq(0);
  });

  it("forwards automatic cancellation refunds in the same transaction", async () => {
    const key = await createRequest({ minMarketTokens: expandDecimals(20_000, 18) });
    const { txReceipt, logs } = await executeDeposit(fixture, {
      depositKey: key,
      expectedCancellationReason: "MinMarketTokens",
    });
    expect(proxyEvents(txReceipt, "ProxyDepositCallbackReceived")[0].args.cancelled).eq(true);
    expect(callbackErrors(logs, "AfterDepositCancellationError")).length(0);
    expect(await wnt.balanceOf(fundingWallet.address)).eq(expandDecimals(20, 18));
    expect(await usdc.balanceOf(fundingWallet.address)).eq(expandDecimals(50_000, 6));
    expect(await wnt.balanceOf(proxy.address)).eq(0);
    expect(await usdc.balanceOf(proxy.address)).eq(0);
    expect(await wnt.balanceOf(keeper.address)).eq(0);
    expect(await usdc.balanceOf(keeper.address)).eq(0);
    expect(await proxy.isPendingDeposit(key)).eq(false);
  });

  it("returns a single-token refund once even after approvals and the keeper role are revoked", async () => {
    const key = await createRequest({
      market: ethUsdSingleTokenMarket,
      longAmount: shortAmount,
      shortAmount,
      minMarketTokens: expandDecimals(20_000, 18),
    });
    await wnt.connect(fundingWallet).approve(proxy.address, 0);
    await usdc.connect(fundingWallet).approve(proxy.address, 0);
    await revokeRole(roleStore, keeper.address, "DONATION_KEEPER");
    const { txReceipt, logs } = await executeDeposit(fixture, {
      depositKey: key,
      expectedCancellationReason: "MinMarketTokens",
    });
    expect(callbackErrors(logs, "AfterDepositCancellationError")).length(0);
    const returned = proxyEvents(txReceipt, "TokensReturned");
    expect(returned).length(1);
    expect(returned[0].args.token).eq(usdc.address);
    expect(returned[0].args.amount).eq(shortAmount.mul(2));
    expect(await usdc.balanceOf(fundingWallet.address)).eq(expandDecimals(50_000, 6));
    expect(await proxy.isPendingDeposit(key)).eq(false);
  });

  for (const limit of [callbackGasLimit, 1]) {
    it(`manually cancels after expiry and returns principal and cancellation compensation (callback gas ${limit})`, async () => {
      await dataStore.setUint(keys.EXECUTION_GAS_FEE_BASE_AMOUNT_V2_1, 100_000);
      const key = await createRequest({ callbackGasLimit: limit });
      await expect(proxy.connect(keeper).cancelDeposit(key)).to.be.revertedWithCustomError(
        errorsContract,
        "RequestNotYetCancellable"
      );
      expect(await proxy.isPendingDeposit(key)).eq(true);
      await time.increase(300);
      const receipt = await (await proxy.connect(keeper).cancelDeposit(key, { gasPrice: expandDecimals(1, 9) })).wait();
      const logs = parseLogs(fixture, receipt);
      expect(callbackErrors(logs, "AfterDepositCancellationError")).length(limit === 1 ? 1 : 0);
      const compensation = getEventData(logs, "KeeperExecutionFee");
      expect(compensation.keeper).eq(proxy.address);
      expect(compensation.executionFeeAmount).gt(0);
      expect(await wnt.balanceOf(fundingWallet.address)).eq(expandDecimals(20, 18));
      const returns = proxyEvents(receipt, "ExecutionFeeReturned");
      expect(returns.every((event) => event.args.receiver === fundingWallet.address)).eq(true);
      expect(returns.reduce((sum, event) => sum.add(event.args.amount), ethers.constants.Zero)).eq(
        executionFee.sub(compensation.executionFeeAmount)
      );
      expect(await usdc.balanceOf(fundingWallet.address)).eq(expandDecimals(50_000, 6));
      expect(await wnt.balanceOf(proxy.address)).eq(0);
      expect(await ethers.provider.getBalance(proxy.address)).eq(0);
      expect(await proxy.isPendingDeposit(key)).eq(false);
      await expect(proxy.connect(keeper).cancelDeposit(key)).to.be.revertedWithCustomError(
        errorsContract,
        "EmptyDeposit"
      );
    });
  }

  it("recovers failed automatic cancellation callbacks without stale pending state", async () => {
    const key = await createRequest({ callbackGasLimit: 1, minMarketTokens: expandDecimals(20_000, 18) });
    const { logs } = await executeDeposit(fixture, { depositKey: key, expectedCancellationReason: "MinMarketTokens" });
    expect(callbackErrors(logs, "AfterDepositCancellationError")).length(1);
    expect(await proxy.isPendingDeposit(key)).eq(false);
    expect(await wnt.balanceOf(proxy.address)).eq(longAmount);
    expect(await usdc.balanceOf(proxy.address)).eq(shortAmount);
    await proxy.connect(fundingWallet).recoverTokens([wnt.address, usdc.address]);
    expect(await wnt.balanceOf(fundingWallet.address)).eq(expandDecimals(20, 18));
    expect(await usdc.balanceOf(fundingWallet.address)).eq(expandDecimals(50_000, 6));
    expect(await wnt.balanceOf(proxy.address)).eq(0);
    expect(await usdc.balanceOf(proxy.address)).eq(0);
  });

  it("does not leave successful deposits pending when their execution callback runs out of gas", async () => {
    const key = await createRequest({ callbackGasLimit: 1 });
    const { logs } = await executeDeposit(fixture, { depositKey: key });
    expect(callbackErrors(logs, "AfterDepositExecutionError")).length(1);
    expect(await proxy.isPendingDeposit(key)).eq(false);
    const gm = await contractAt("MarketToken", ethUsdMarket.marketToken);
    expect(await gm.balanceOf(fundingWallet.address)).eq(expandDecimals(10_000, 18));
  });

  it("authenticates callbacks and rejects unrelated requests and replayed completions", async () => {
    const key = await createRequest();
    for (const name of ["afterDepositExecution", "afterDepositCancellation"]) {
      await expect(proxy.connect(outsider)[name](key, emptyEventData, emptyEventData))
        .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
        .withArgs(outsider.address, "DEPOSIT_HANDLER");
    }
    await executeDeposit(fixture, { depositKey: key });
    const signer = await handlerSigner();
    for (const name of ["afterDepositExecution", "afterDepositCancellation"]) {
      await expect(
        proxy.connect(signer)[name](ethers.constants.HashZero, emptyEventData, emptyEventData)
      ).to.be.revertedWithCustomError(proxy, "UnknownProxyDeposit");
      await expect(proxy.connect(signer)[name](key, emptyEventData, emptyEventData)).to.be.revertedWithCustomError(
        proxy,
        "DepositCallbackAlreadyReceived"
      );
    }
    await stopImpersonatingAccount(depositHandler.address);
    expect(await proxy.isProxyDeposit(ethers.constants.HashZero)).eq(false);
    expect(await proxy.isPendingDeposit(ethers.constants.HashZero)).eq(false);
    await expect(proxy.connect(keeper).cancelDeposit(ethers.constants.HashZero)).to.be.revertedWithCustomError(
      proxy,
      "UnknownProxyDeposit"
    );
  });

  it("rejects callbacks from genuine GMX execution of another account's request", async () => {
    await createDeposit(fixture, {
      account: outsider,
      callbackContract: proxy,
      longTokenAmount: longAmount,
      callbackGasLimit,
    });
    const [key] = await getDepositKeys(dataStore, 0, 1);
    const { logs } = await executeDeposit(fixture, { depositKey: key });
    expect(callbackErrors(logs, "AfterDepositExecutionError")).length(1);
    expect(await proxy.isProxyDeposit(key)).eq(false);
    const gm = await contractAt("MarketToken", ethUsdMarket.marketToken);
    expect(await gm.balanceOf(outsider.address)).eq(expandDecimals(5000, 18));
  });

  it("recovers only to the funding wallet, without touching other pending requests", async () => {
    const key = await createRequest();
    await usdc.mint(proxy.address, 100);
    await proxy.connect(keeper).recoverTokens([usdc.address, usdc.address, wnt.address]);
    expect(await usdc.balanceOf(fundingWallet.address)).eq(expandDecimals(50_000, 6).sub(shortAmount).add(100));
    expect(await wnt.balanceOf(depositVault.address)).eq(longAmount.add(executionFee));
    expect(await proxy.isPendingDeposit(key)).eq(true);
    await outsider.sendTransaction({ to: proxy.address, value: 123 });
    const balanceBefore = await wnt.balanceOf(fundingWallet.address);
    await proxy.connect(keeper).recoverNativeToken();
    expect(await wnt.balanceOf(fundingWallet.address)).eq(balanceBefore.add(123));
    expect(await ethers.provider.getBalance(proxy.address)).eq(0);
    await proxy.connect(fundingWallet).recoverNativeToken();
  });

  it("keeps simultaneous requests isolated when one cancels and the other executes", async () => {
    const cancelledKey = await createRequest({ minMarketTokens: expandDecimals(20_000, 18) });
    const executedKey = await createRequest();
    await executeDeposit(fixture, { depositKey: cancelledKey, expectedCancellationReason: "MinMarketTokens" });
    expect(await proxy.isPendingDeposit(cancelledKey)).eq(false);
    expect(await proxy.isPendingDeposit(executedKey)).eq(true);
    expect(await wnt.balanceOf(depositVault.address)).eq(longAmount.add(executionFee));
    await executeDeposit(fixture, { depositKey: executedKey });
    const gm = await contractAt("MarketToken", ethUsdMarket.marketToken);
    expect(await gm.balanceOf(fundingWallet.address)).eq(expandDecimals(10_000, 18));
    expect(await getDepositCount(dataStore)).eq(0);
  });

  it("supports the approved funding-wallet fallback if the fee callback fails", async () => {
    const multisig = await deployContract("MockGmDepositFundingWallet", []);
    proxy = await deployContract("GmDepositProxy", [exchangeRouter.address, reader.address, multisig.address]);
    await wnt.mint(multisig.address, longAmount.add(executionFee));
    await dataStore.setUint(keys.REFUND_EXECUTION_FEE_GAS_LIMIT, 1);
    await multisig.approveToken(wnt.address, proxy.address, ethers.constants.MaxUint256);
    const key = await createRequest({ shortAmount: 0 });
    const { logs } = await executeDeposit(fixture, { depositKey: key });
    const refund = getEventData(logs, "ExecutionFeeRefund");
    expect(refund.receiver).eq(multisig.address);
    expect(await wnt.balanceOf(multisig.address)).eq(refund.refundFeeAmount);
    const gm = await contractAt("MarketToken", ethUsdMarket.marketToken);
    expect(await gm.balanceOf(multisig.address)).eq(expandDecimals(5000, 18));
    await outsider.sendTransaction({ to: proxy.address, value: 123 });
    await proxy.connect(keeper).recoverNativeToken();
    expect(await wnt.balanceOf(multisig.address)).eq(refund.refundFeeAmount.add(123));
  });

  for (const during of ["creation", "automatic cancellation"]) {
    it(`blocks authorized token reentry during ${during}`, async () => {
      const token = await deployContract("MockGmDepositReentrantToken", []);
      const market = await createMarket(token, usdc);
      await token.mint(fundingWallet.address, longAmount);
      await token.connect(fundingWallet).approve(proxy.address, longAmount);
      await grantRole(roleStore, token.address, "DONATION_KEEPER");
      await token.setCallback(
        during === "creation" ? fundingWallet.address : proxy.address,
        proxy.address,
        proxy.interface.encodeFunctionData("recoverTokens", [[token.address]])
      );
      const key = await createRequest({ market });
      if (during === "automatic cancellation") {
        await time.increase(300);
        const receipt = await (await depositHandler.cancelDeposit(key)).wait();
        expect(callbackErrors(receipt.logs, "AfterDepositCancellationError")).length(0);
        expect(await token.balanceOf(fundingWallet.address)).eq(longAmount);
      }
      expect(await token.attempts()).eq(1);
      expect(await token.reentrySucceeded()).eq(false);
      const revertReason = ethers.utils.defaultAbiCoder.decode(
        ["string"],
        "0x" + (await token.reentryResult()).slice(10)
      );
      expect(revertReason[0]).eq("ReentrancyGuard: reentrant call");
    });
  }

  it("leaves minted GM available for the existing GLV donation handler without keeper custody", async () => {
    const { glvDonationHandler, ethUsdGlvAddress, sol } = fixture.contracts;
    await handleGlvDeposit(fixture, {
      create: { longTokenAmount: expandDecimals(10, 18), shortTokenAmount: expandDecimals(50_000, 6) },
    });
    const key = await createRequest();
    await executeDeposit(fixture, { depositKey: key });
    const gm = await contractAt("MarketToken", ethUsdMarket.marketToken);
    const glv = await contractAt("GlvToken", ethUsdGlvAddress);
    const amount = expandDecimals(5, 18);
    await gm.connect(fundingWallet).approve(glvDonationHandler.address, amount);
    await glvDonationHandler.setGlvDonationConfig(
      ethUsdGlvAddress,
      ethUsdMarket.marketToken,
      fundingWallet.address,
      percentageToFloat("0.01%"),
      86400,
      amount,
      true
    );
    const supply = await glv.totalSupply();
    const balance = await glv.tokenBalances(gm.address);
    await executeWithOracleParams(fixture, {
      args: [ethUsdGlvAddress, gm.address, amount],
      oracleBlockNumber: await ethers.provider.getBlockNumber(),
      tokens: [wnt.address, usdc.address, sol.address],
      precisions: [8, 18, 8],
      minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4)],
      maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4)],
      dataStreamTokens: [],
      dataStreamData: [],
      priceFeedTokens: [],
      execute: glvDonationHandler.connect(keeper).donate,
      simulate: false,
    });
    expect(await glv.totalSupply()).eq(supply);
    expect(await glv.tokenBalances(gm.address)).eq(balance.add(amount));
    expect(await gm.balanceOf(fundingWallet.address)).eq(expandDecimals(10_000, 18).sub(amount));
    expect(await gm.balanceOf(keeper.address)).eq(0);
    expect(await gm.balanceOf(proxy.address)).eq(0);
  });
});
