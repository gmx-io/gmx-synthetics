import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import { deployContract } from "../../utils/deploy";
import { deployFixture } from "../../utils/fixture";
import {
  TOKEN_ORACLE_TYPES,
  signPrices,
  getSignerInfo,
  getCompactedPrices,
  getCompactedPriceIndexes,
  getCompactedPrecisions,
  getCompactedOracleBlockNumbers,
} from "../../utils/oracle";
import { printGasUsage } from "../../utils/gas";
import { grantRole } from "../../utils/role";
import * as keys from "../../utils/keys";

describe("Oracle", () => {
  const { provider } = ethers;

  let user0, signer0, signer1, signer2, signer3, signer4, signer7, signer9;
  let roleStore, dataStore, eventEmitter, oracleStore, oracle, weth, wbtc, usdc;
  let oracleSalt;

  beforeEach(async () => {
    const fixture = await loadFixture(deployFixture);
    ({ user0, signer0, signer1, signer2, signer3, signer4, signer7, signer9 } = fixture.accounts);

    ({ roleStore, dataStore, eventEmitter, oracleStore, oracle, weth, wbtc, usdc } = fixture.contracts);
    ({ oracleSalt } = fixture.props);
  });

  it("inits", async () => {
    expect(await oracle.oracleStore()).to.eq(oracleStore.address);
    expect(await oracle.SALT()).to.eq(oracleSalt);
  });

  it("setPrices", async () => {
    await expect(
      oracle.connect(user0).setPrices(dataStore.address, eventEmitter.address, {
        signerInfo: 2,
        tokens: [],
        compactedOracleBlockNumbers: [],
        compactedPrecisions: [],
        compactedMinPrices: [],
        compactedMinPricesIndexes: [],
        compactedMaxPrices: [],
        compactedMaxPricesIndexes: [],
        signatures: [],
        priceFeedTokens: [],
      })
    )
      .to.be.revertedWithCustomError(oracle, "Unauthorized")
      .withArgs(user0.address, "CONTROLLER");

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        signerInfo: 2,
        tokens: [],
        compactedOracleBlockNumbers: [],
        compactedPrecisions: [],
        compactedMinPrices: [],
        compactedMinPricesIndexes: [],
        compactedMaxPrices: [],
        compactedMaxPricesIndexes: [],
        signatures: [],
        priceFeedTokens: [],
      })
    ).to.be.revertedWithCustomError(oracle, "EmptyTokens");

    const blockNumber = (await provider.getBlock()).number;

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        signerInfo: 0,
        tokens: [weth.address],
        compactedOracleBlockNumbers: [blockNumber + 10],
        compactedPrecisions: [],
        compactedMinPrices: [],
        compactedMinPricesIndexes: [],
        compactedMaxPrices: [],
        compactedMaxPricesIndexes: [],
        signatures: [],
        priceFeedTokens: [],
      })
    )
      .to.be.revertedWithCustomError(oracle, "InvalidBlockNumber")
      .withArgs(blockNumber + 10);

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        signerInfo: getSignerInfo([0, 1]),
        tokens: [weth.address],
        compactedOracleBlockNumbers: [blockNumber],
        compactedPrecisions: getCompactedPrecisions([1]),
        compactedMinPrices: getCompactedPrices([3000, 3000]),
        compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1]),
        compactedMaxPrices: getCompactedPrices([3000, 3000]),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1]),
        signatures: ["0x00", "0x00"],
        priceFeedTokens: [],
      })
    ).to.be.revertedWith("ECDSA: invalid signature length");

    await dataStore.setUint(keys.MIN_ORACLE_SIGNERS, 3);

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        signerInfo: getSignerInfo([0, 1]),
        tokens: [weth.address],
        compactedOracleBlockNumbers: [blockNumber],
        compactedPrecisions: getCompactedPrecisions([1]),
        compactedMinPrices: getCompactedPrices([3000, 3000]),
        compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1]),
        compactedMaxPrices: getCompactedPrices([3000, 3000]),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1]),
        signatures: ["0x00", "0x00"],
        priceFeedTokens: [],
      })
    )
      .to.be.revertedWithCustomError(oracle, "MinOracleSigners")
      .withArgs(2, 3);

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        signerInfo: getSignerInfo([0, 1, 2, 3, 4, 1, 9]),
        tokens: [weth.address],
        compactedOracleBlockNumbers: [blockNumber],
        compactedPrecisions: getCompactedPrecisions([1]),
        compactedMinPrices: getCompactedPrices([3000, 3000]),
        compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1]),
        compactedMaxPrices: getCompactedPrices([3000, 3000]),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1]),
        signatures: ["0x00", "0x00"],
        priceFeedTokens: [],
      })
    )
      .to.be.revertedWithCustomError(oracle, "DuplicateSigner")
      .withArgs(1);

    let signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);
    const block = await provider.getBlock(blockNumber);
    let minPrices = [4990, 4991, 4995, 5000, 5001, 0, 5007];
    let maxPrices = [4990, 4991, 4995, 5000, 5001, 0, 5007];
    let signatures = await signPrices({
      signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      salt: oracleSalt,
      oracleBlockNumber: blockNumber,
      blockHash: block.hash,
      token: weth.address,
      tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
      precision: 1,
      minPrices,
      maxPrices,
    });

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        signerInfo,
        tokens: [weth.address],
        compactedOracleBlockNumbers: [blockNumber],
        compactedPrecisions: getCompactedPrecisions([1]),
        compactedMinPrices: getCompactedPrices(minPrices),
        compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
        compactedMaxPrices: getCompactedPrices(maxPrices),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
        signatures: signatures,
        priceFeedTokens: [],
      })
    )
      .to.be.revertedWithCustomError(oracle, "EmptyCompactedPrice")
      .withArgs(5);

    signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);
    minPrices = [4990, 4990, 4989, 5000, 5001, 5005, 5007];
    maxPrices = [4990, 4990, 4989, 5000, 5001, 5005, 5007];
    signatures = await signPrices({
      signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      salt: oracleSalt,
      oracleBlockNumber: blockNumber,
      blockHash: block.hash,
      token: weth.address,
      tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
      precision: 1,
      minPrices,
      maxPrices,
    });

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        signerInfo,
        tokens: [weth.address],
        compactedOracleBlockNumbers: [blockNumber],
        compactedPrecisions: getCompactedPrecisions([1]),
        compactedMinPrices: getCompactedPrices(minPrices),
        compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
        compactedMaxPrices: getCompactedPrices(maxPrices),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
        signatures,
      })
    )
      .to.be.revertedWithCustomError(oracle, "MinPricesNotSorted")
      .withArgs(weth.address, 4989, 4990);

    signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);
    minPrices = [4990, 4990, 4991, 5000, 5001, 5005, 5007];
    maxPrices = [4990, 4995, 4979, 5000, 5001, 5005, 5007];
    signatures = await signPrices({
      signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      salt: oracleSalt,
      oracleBlockNumber: blockNumber,
      blockHash: block.hash,
      token: weth.address,
      tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
      precision: 1,
      minPrices,
      maxPrices,
    });

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        signerInfo,
        tokens: [weth.address],
        compactedOracleBlockNumbers: [blockNumber],
        compactedPrecisions: getCompactedPrecisions([1]),
        compactedMinPrices: getCompactedPrices(minPrices),
        compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
        compactedMaxPrices: getCompactedPrices(maxPrices),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
        signatures,
      })
    )
      .to.be.revertedWithCustomError(oracle, "MaxPricesNotSorted")
      .withArgs(weth.address, 4979, 4995);

    signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);
    minPrices = [4990, 4991, 4995, 5000, 5001, 5005, 5007];
    maxPrices = [4990, 4991, 4995, 5000, 5001, 5005, 5007];
    signatures = await signPrices({
      signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      salt: oracleSalt,
      oracleBlockNumber: blockNumber,
      blockHash: block.hash,
      token: weth.address,
      tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
      precision: 1,
      minPrices,
      maxPrices,
    });

    signatures[3] = signatures[4];

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        signerInfo,
        tokens: [weth.address],
        compactedOracleBlockNumbers: [blockNumber],
        compactedPrecisions: getCompactedPrecisions([1]),
        compactedMinPrices: getCompactedPrices(minPrices),
        compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
        compactedMaxPrices: getCompactedPrices(maxPrices),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
        signatures,
      })
    ).to.be.revertedWithCustomError(oracle, "InvalidSignature");

    signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);
    minPrices = [4990, 4991, 4995, 5000, 5001, 5005, 5007];
    maxPrices = [4990, 4991, 4995, 5010, 5011, 5015, 5017];
    signatures = await signPrices({
      signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      salt: oracleSalt,
      oracleBlockNumber: blockNumber,
      blockHash: block.hash,
      token: weth.address,
      tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
      precision: 1,
      minPrices,
      maxPrices,
    });

    const tx0 = await oracle.setPrices(dataStore.address, eventEmitter.address, {
      priceFeedTokens: [],
      signerInfo,
      tokens: [weth.address],
      compactedOracleBlockNumbers: [blockNumber],
      compactedPrecisions: getCompactedPrecisions([1]),
      compactedMinPrices: getCompactedPrices(minPrices),
      compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
      compactedMaxPrices: getCompactedPrices(maxPrices),
      compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
      signatures,
    });

    await printGasUsage(provider, tx0, "oracle.setPrices tx0");

    expect((await oracle.getPrimaryPrice(weth.address)).min).eq(50000);
    expect((await oracle.getPrimaryPrice(weth.address)).max).eq(50100);

    signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);
    const wethMinPrices = [4990, 4991, 4995, 5000, 5001, 5005, 5007];
    const wethMaxPrices = [4990, 4991, 4995, 5010, 5011, 5015, 5017];
    const wbtcMinPrices = [60100, 60101, 60102, 60110, 60200, 60300, 60500];
    const wbtcMaxPrices = [60100, 60101, 60102, 60510, 60700, 60800, 60900];

    const wethSignatures = await signPrices({
      signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      salt: oracleSalt,
      oracleBlockNumber: blockNumber,
      blockHash: block.hash,
      token: weth.address,
      tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
      precision: 1,
      minPrices: wethMinPrices,
      maxPrices: wethMaxPrices,
    });

    const wbtcSignatures = await signPrices({
      signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      salt: oracleSalt,
      oracleBlockNumber: blockNumber,
      blockHash: block.hash,
      token: wbtc.address,
      tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
      precision: 2,
      minPrices: wbtcMinPrices,
      maxPrices: wbtcMaxPrices,
    });

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        signerInfo,
        tokens: [weth.address, wbtc.address],
        compactedOracleBlockNumbers: [blockNumber],
        compactedPrecisions: getCompactedPrecisions([1, 2]),
        compactedMinPrices: getCompactedPrices(wethMinPrices.concat(wbtcMinPrices)),
        compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
        compactedMaxPrices: getCompactedPrices(wethMaxPrices.concat(wbtcMaxPrices)),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
        signatures: wethSignatures.concat(wbtcSignatures),
      })
    ).to.be.revertedWith("Oracle: tempTokens not cleared");

    await oracle.clearTempPrices();

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        signerInfo,
        tokens: [weth.address, wbtc.address],
        compactedOracleBlockNumbers: getCompactedOracleBlockNumbers([blockNumber]),
        compactedPrecisions: getCompactedPrecisions([1, 2]),
        compactedMinPrices: getCompactedPrices(wethMinPrices.concat(wbtcMinPrices)),
        compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
        compactedMaxPrices: getCompactedPrices(wethMaxPrices.concat(wbtcMaxPrices)),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
        signatures: wethSignatures.concat(wbtcSignatures),
      })
    ).to.be.revertedWithCustomError(oracle, "EmptyCompactedBlockNumber");

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        signerInfo,
        tokens: [wbtc.address, weth.address],
        compactedOracleBlockNumbers: getCompactedOracleBlockNumbers([blockNumber, blockNumber]),
        compactedPrecisions: getCompactedPrecisions([1, 2]),
        compactedMinPrices: getCompactedPrices(wethMinPrices.concat(wbtcMinPrices)),
        compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
        compactedMaxPrices: getCompactedPrices(wethMaxPrices.concat(wbtcMaxPrices)),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
        signatures: wethSignatures.concat(wbtcSignatures),
      })
    ).to.be.revertedWithCustomError(oracle, "InvalidSignature");

    const tx1 = await oracle.setPrices(dataStore.address, eventEmitter.address, {
      priceFeedTokens: [],
      signerInfo,
      tokens: [weth.address, wbtc.address],
      compactedOracleBlockNumbers: getCompactedOracleBlockNumbers([blockNumber, blockNumber]),
      compactedPrecisions: getCompactedPrecisions([1, 2]),
      compactedMinPrices: getCompactedPrices(wethMinPrices.concat(wbtcMinPrices)),
      compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
      compactedMaxPrices: getCompactedPrices(wethMaxPrices.concat(wbtcMaxPrices)),
      compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
      signatures: wethSignatures.concat(wbtcSignatures),
    });

    await printGasUsage(provider, tx1, "oracle.setPrices tx1");

    expect((await oracle.getPrimaryPrice(weth.address)).min).eq(50000);
    expect((await oracle.getPrimaryPrice(weth.address)).max).eq(50100);
    expect((await oracle.getPrimaryPrice(wbtc.address)).min).eq(6011000);
    expect((await oracle.getPrimaryPrice(wbtc.address)).max).eq(6051000);

    expect(await oracle.getTempTokensCount()).eq(2);
    expect(await oracle.getTempTokens(0, 2)).eql([weth.address, wbtc.address]);
  });

  it("withOraclePrices", async () => {
    const oracleModuleTest = await deployContract("OracleModuleTest", []);
    await grantRole(roleStore, oracleModuleTest.address, "CONTROLLER");

    const signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);

    const wethPrices = [5990, 5991, 5995, 6010, 6011, 6015, 6017];
    const usdcPrices = [1, 1, 1, 1, 1, 1, 1];

    const block = await provider.getBlock();

    const wethSignatures = await signPrices({
      signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      salt: oracleSalt,
      oracleBlockNumber: block.number,
      blockHash: block.hash,
      token: weth.address,
      tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
      precision: 1,
      minPrices: wethPrices,
      maxPrices: wethPrices,
    });

    const usdcSignatures = await signPrices({
      signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      salt: oracleSalt,
      oracleBlockNumber: block.number,
      blockHash: block.hash,
      token: usdc.address,
      tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
      precision: 6,
      minPrices: usdcPrices,
      maxPrices: usdcPrices,
    });

    const tx0 = await oracleModuleTest.withOraclePricesTest(oracle.address, dataStore.address, eventEmitter.address, {
      signerInfo,
      tokens: [weth.address],
      compactedOracleBlockNumbers: getCompactedOracleBlockNumbers([block.number]),
      compactedPrecisions: getCompactedPrecisions([1]),
      compactedMinPrices: getCompactedPrices(wethPrices),
      compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
      compactedMaxPrices: getCompactedPrices(wethPrices),
      compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6]),
      signatures: wethSignatures,
      priceFeedTokens: [usdc.address],
    });

    await printGasUsage(provider, tx0, "oracle.withOraclePrices tx0");

    const tx1 = await oracleModuleTest.withOraclePricesTest(oracle.address, dataStore.address, eventEmitter.address, {
      signerInfo,
      tokens: [weth.address, usdc.address],
      compactedOracleBlockNumbers: getCompactedOracleBlockNumbers([block.number, block.number]),
      compactedPrecisions: getCompactedPrecisions([1, 6]),
      compactedMinPrices: getCompactedPrices(wethPrices.concat(usdcPrices)),
      compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
      compactedMaxPrices: getCompactedPrices(wethPrices.concat(usdcPrices)),
      compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
      signatures: wethSignatures.concat(usdcSignatures),
      priceFeedTokens: [],
    });

    await printGasUsage(provider, tx1, "oracle.withOraclePrices tx1");

    const tx2 = await oracleModuleTest.withOraclePricesTest(oracle.address, dataStore.address, eventEmitter.address, {
      signerInfo,
      tokens: [weth.address, weth.address, usdc.address],
      compactedOracleBlockNumbers: getCompactedOracleBlockNumbers([block.number, block.number, block.number]),
      compactedPrecisions: getCompactedPrecisions([1, 1, 6]),
      compactedMinPrices: getCompactedPrices(wethPrices.concat(wethPrices).concat(usdcPrices)),
      compactedMinPricesIndexes: getCompactedPriceIndexes([
        0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6,
      ]),
      compactedMaxPrices: getCompactedPrices(wethPrices.concat(wethPrices).concat(usdcPrices)),
      compactedMaxPricesIndexes: getCompactedPriceIndexes([
        0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6,
      ]),
      signatures: wethSignatures.concat(wethSignatures).concat(usdcSignatures),
      priceFeedTokens: [],
    });

    await printGasUsage(provider, tx2, "oracle.withOraclePrices tx2");
  });
});
