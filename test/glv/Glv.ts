import { expect } from "chai";
import { ethers } from "hardhat";

import { usingResult } from "../../utils/use";
import { getGlvAddress } from "../../utils/glv";
import { deployFixture } from "../../utils/fixture";
import { deployContract } from "../../utils/deploy";
import { bigNumberify, expandDecimals, decimalToFloat } from "../../utils/math";
import { getBalanceOf, getSupplyOf } from "../../utils/token";
import { getClaimableFeeAmount } from "../../utils/fee";
import {
  getPoolAmount,
  getSwapImpactPoolAmount,
  getMarketTokenPrice,
  getMarketTokenPriceWithPoolValue,
} from "../../utils/market";
import { getDepositCount, getDepositKeys, createDeposit, executeDeposit, handleDeposit } from "../../utils/deposit";
import { getExecuteParams } from "../../utils/exchange";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";
import { TOKEN_ORACLE_TYPES } from "../../utils/oracle";
import { SwapPricingType } from "../../utils/swap";
import { prices } from "../../utils/prices";

describe("Glv", () => {
  const { provider } = ethers;
  const { AddressZero, HashZero } = ethers.constants;

  let fixture;
  let user0, user1, user2;
  let reader,
    dataStore,
    roleStore,
    depositVault,
    depositHandler,
    depositStoreUtils,
    ethUsdMarket,
    ethUsdSpotOnlyMarket,
    ethUsdSingleTokenMarket,
    btcUsdMarket,
    solUsdMarket,
    wnt,
    usdc,
    wbtc,
    glvFactory,
    glvHandler,
    glvType,
    glvAddress;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0, user1, user2 } = fixture.accounts);
    ({
      reader,
      dataStore,
      roleStore,
      depositVault,
      depositHandler,
      depositStoreUtils,
      ethUsdMarket,
      ethUsdSpotOnlyMarket,
      ethUsdSingleTokenMarket,
      btcUsdMarket,
      solUsdMarket,
      wnt,
      usdc,
      wbtc,
      glvFactory,
      glvHandler,
    } = fixture.contracts);

    glvType = ethers.constants.HashZero;
    glvAddress = getGlvAddress(
      wnt.address,
      usdc.address,
      glvType,
      glvFactory.address,
      roleStore.address,
      dataStore.address
    );

    await glvFactory.createGlv(wnt.address, usdc.address, glvType);
  });

  it("glv vault is created", async () => {
    const [glvLongToken, glvShortToken] = await Promise.all([
      dataStore.getAddress(keys.glvLongTokenKey(glvAddress)),
      dataStore.getAddress(keys.glvShortTokenKey(glvAddress)),
    ]);

    expect(glvLongToken).eq(wnt.address);
    expect(glvShortToken).eq(usdc.address);
  });

  it("adds markets to Glv", async () => {
    const marketListKey = keys.glvSupportedMarketListKey(glvAddress);
    let marketListCount = await dataStore.getAddressCount(marketListKey);
    expect(marketListCount.toNumber()).eq(0);

    await glvHandler.addMarket(glvAddress, ethUsdMarket.marketToken);
    await glvHandler.addMarket(glvAddress, solUsdMarket.marketToken);

    marketListCount = await dataStore.getAddressCount(marketListKey);
    expect(marketListCount.toNumber()).eq(2);

    const listedMarkets = await dataStore.getAddressValuesAt(
      keys.glvSupportedMarketListKey(glvAddress),
      0,
      marketListCount
    );
    expect(listedMarkets[0]).eq(ethUsdMarket.marketToken);
    expect(listedMarkets[1]).eq(solUsdMarket.marketToken);
  });

  it("reverts if market is already added", async () => {
    await glvHandler.addMarket(glvAddress, ethUsdMarket.marketToken);
    await expect(glvHandler.addMarket(glvAddress, ethUsdMarket.marketToken))
      .to.be.revertedWithCustomError(errorsContract, "GlvMarketAlreadyExists")
      .withArgs(glvAddress, ethUsdMarket.marketToken);
  });

  it("reverts if market has incorrect tokens", async () => {
    // console.log("btcUsdMarket", btcUsdMarket)
    await expect(glvHandler.addMarket(glvAddress, btcUsdMarket.marketToken))
      .to.be.revertedWithCustomError(errorsContract, "GlvInvalidLongToken")
      .withArgs(glvAddress, wbtc.address, wnt.address);
  });
});
