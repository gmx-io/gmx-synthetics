const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const { deployContract } = require("../../utils/deploy");
const { deployFixture } = require("../../utils/fixture");
const { signPrices, getSignerInfo, getCompactedPrices, getCompactedOracleBlockNumbers } = require("../../utils/oracle");
const { printGasUsage } = require("../../utils/gas");
const { expandDecimals } = require("../../utils/math");
const { grantRole } = require("../../utils/role");

describe("Oracle", () => {
  const { provider } = ethers;

  let user0, signer0, signer1, signer2, signer3, signer4, signer7, signer9;
  let keys, reader, roleStore, dataStore, eventEmitter, oracleStore, oracle, weth, wbtc, usdc;
  let oracleSalt;

  beforeEach(async () => {
    const fixture = await loadFixture(deployFixture);
    ({ user0, signer0, signer1, signer2, signer3, signer4, signer7, signer9 } = fixture.accounts);

    ({ keys, reader, roleStore, dataStore, eventEmitter, oracleStore, oracle, weth, wbtc, usdc } = fixture.contracts);
    ({ oracleSalt } = fixture.props);
  });

  it("inits", async () => {
    expect(await oracle.oracleStore()).to.eq(oracleStore.address);
    expect(await oracle.SALT()).to.eq(oracleSalt);
  });

  it("setPrices", async () => {
    await dataStore.setUint(await reader.oraclePrecisionKey(weth.address), 1);
    await dataStore.setUint(await reader.oraclePrecisionKey(wbtc.address), 1);

    await expect(
      oracle.connect(user0).setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        signerInfo: 2,
        tokens: [],
        compactedOracleBlockNumbers: [],
        compactedPrices: [],
        signatures: [],
      })
    )
      .to.be.revertedWithCustomError(oracle, "Unauthorized")
      .withArgs(user0.address, "CONTROLLER");

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        signerInfo: 2,
        tokens: [],
        compactedOracleBlockNumbers: [],
        compactedPrices: [],
        signatures: [],
      })
    ).to.be.revertedWithCustomError(oracle, "EmptyTokens");

    const blockNumber = (await provider.getBlock()).number;

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        signerInfo: 0,
        tokens: [weth.address],
        compactedOracleBlockNumbers: [blockNumber + 10],
        compactedPrices: [],
        signatures: [],
      })
    )
      .to.be.revertedWithCustomError(oracle, "InvalidBlockNumber")
      .withArgs(blockNumber + 10);

    let signerInfo = getSignerInfo([0, 1]);

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        signerInfo,
        tokens: [weth.address],
        compactedOracleBlockNumbers: [blockNumber],
        compactedPrices: [3000],
        signatures: ["0x00", "0x00"],
      })
    ).to.be.revertedWith("ECDSA: invalid signature length");

    await dataStore.setUint(await keys.MIN_ORACLE_SIGNERS(), 3);

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        signerInfo,
        tokens: [weth.address],
        compactedOracleBlockNumbers: [blockNumber],
        compactedPrices: [3000],
        signatures: ["0x00", "0x00"],
      })
    )
      .to.be.revertedWithCustomError(oracle, "MinOracleSigners")
      .withArgs(2, 3);

    signerInfo = getSignerInfo([0, 1, 2, 3, 4, 1, 9]);

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        signerInfo,
        tokens: [weth.address],
        compactedOracleBlockNumbers: [blockNumber],
        compactedPrices: [3000],
        signatures: ["0x00", "0x00"],
      })
    )
      .to.be.revertedWithCustomError(oracle, "DuplicateSigner")
      .withArgs(1);

    signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);

    const block = await provider.getBlock(blockNumber);
    let prices = [4990, 4991, 4995, 5000, 5001, 0, 5007];
    let signatures = await signPrices(
      [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      oracleSalt,
      blockNumber,
      block.hash,
      weth.address,
      prices
    );

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        signerInfo,
        tokens: [weth.address],
        compactedOracleBlockNumbers: [blockNumber],
        compactedPrices: getCompactedPrices(prices),
        signatures,
      })
    ).to.be.revertedWithCustomError(oracle, "EmptyPrice");

    signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);
    prices = [4990, 4990, 4989, 5000, 5001, 5005, 5007];
    signatures = await signPrices(
      [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      oracleSalt,
      blockNumber,
      block.hash,
      weth.address,
      prices
    );

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        signerInfo,
        tokens: [weth.address],
        compactedOracleBlockNumbers: [blockNumber],
        compactedPrices: getCompactedPrices(prices),
        signatures,
      })
    )
      .to.be.revertedWithCustomError(oracle, "PricesNotSorted")
      .withArgs(4989, 4990);

    signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);
    prices = [4990, 4991, 4995, 5000, 5001, 5005, 5007];
    signatures = await signPrices(
      [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      oracleSalt,
      blockNumber,
      block.hash,
      weth.address,
      prices
    );
    signatures[3] = signatures[4];

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        signerInfo,
        tokens: [weth.address],
        compactedOracleBlockNumbers: [blockNumber],
        compactedPrices: getCompactedPrices(prices),
        signatures,
      })
    ).to.be.revertedWithCustomError(oracle, "InvalidSignature");

    signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);
    prices = [4990, 4991, 4995, 5000, 5001, 5005, 5007];
    signatures = await signPrices(
      [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      oracleSalt,
      blockNumber,
      block.hash,
      weth.address,
      prices
    );

    const tx0 = await oracle.setPrices(dataStore.address, eventEmitter.address, {
      priceFeedTokens: [],
      signerInfo,
      tokens: [weth.address],
      compactedOracleBlockNumbers: [blockNumber],
      compactedPrices: getCompactedPrices(prices),
      signatures,
    });

    await printGasUsage(provider, tx0, "oracle.setPrices tx0");

    expect(await oracle.getPrimaryPrice(weth.address)).eq(5000);

    signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);
    let wethPrices = [5990, 5991, 5995, 6000, 6001, 6005, 6007];
    let wbtcPrices = [60100, 60101, 60102, 60110, 60200, 60300, 60500];

    let wethSignatures = await signPrices(
      [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      oracleSalt,
      blockNumber,
      block.hash,
      weth.address,
      wethPrices
    );

    let wbtcSignatures = await signPrices(
      [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      oracleSalt,
      blockNumber,
      block.hash,
      wbtc.address,
      wbtcPrices
    );

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        signerInfo,
        tokens: [weth.address, wbtc.address],
        compactedOracleBlockNumbers: [blockNumber],
        compactedPrices: getCompactedPrices(wethPrices.concat(wbtcPrices)),
        signatures: wethSignatures.concat(wbtcSignatures),
      })
    ).to.be.revertedWith("Oracle: tempTokens not cleared");

    await oracle.clearTempPrices();

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        signerInfo,
        tokens: [weth.address, wbtc.address],
        compactedOracleBlockNumbers: [blockNumber],
        compactedPrices: getCompactedPrices(wethPrices.concat(wbtcPrices)),
        signatures: wethSignatures.concat(wbtcSignatures),
      })
    ).to.be.revertedWithCustomError(oracle, "EmptyBlockNumber");

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        signerInfo,
        tokens: [wbtc.address, weth.address],
        compactedOracleBlockNumbers: getCompactedOracleBlockNumbers([blockNumber, blockNumber]),
        compactedPrices: getCompactedPrices(wethPrices.concat(wbtcPrices)),
        signatures: wethSignatures.concat(wbtcSignatures),
      })
    ).to.be.revertedWithCustomError(oracle, "InvalidSignature");

    const tx1 = await oracle.setPrices(dataStore.address, eventEmitter.address, {
      priceFeedTokens: [],
      signerInfo,
      tokens: [weth.address, wbtc.address],
      compactedOracleBlockNumbers: getCompactedOracleBlockNumbers([blockNumber, blockNumber]),
      compactedPrices: getCompactedPrices(wethPrices.concat(wbtcPrices)),
      signatures: wethSignatures.concat(wbtcSignatures),
    });

    await printGasUsage(provider, tx1, "oracle.setPrices tx1");

    expect(await oracle.getPrimaryPrice(weth.address)).eq(6000);
    expect(await oracle.getPrimaryPrice(wbtc.address)).eq(60110);

    signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);
    wethPrices = [5990, 5991, 5995, 6010, 6011, 6015, 6017];
    wbtcPrices = [60100, 60101, 60102, 60210, 60200, 60300, 60500];

    wethSignatures = await signPrices(
      [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      oracleSalt,
      blockNumber,
      block.hash,
      weth.address,
      wethPrices
    );

    wbtcSignatures = await signPrices(
      [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      oracleSalt,
      blockNumber,
      block.hash,
      wbtc.address,
      wbtcPrices
    );

    await oracle.clearTempPrices();

    await expect(
      oracle.setPrices(dataStore.address, eventEmitter.address, {
        priceFeedTokens: [],
        signerInfo,
        tokens: [weth.address, wbtc.address],
        compactedOracleBlockNumbers: getCompactedOracleBlockNumbers([blockNumber, blockNumber]),
        compactedPrices: getCompactedPrices(wethPrices.concat(wbtcPrices)),
        signatures: wethSignatures.concat(wbtcSignatures),
      })
    )
      .to.be.revertedWithCustomError(oracle, "PricesNotSorted")
      .withArgs(60200, 60210);

    signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);
    wbtcPrices = [60100, 60101, 60102, 60120, 60200, 60300, 60500];
    wethPrices = [5990, 5991, 5995, 6010, 6011, 6015, 6017];

    wbtcSignatures = await signPrices(
      [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      oracleSalt,
      blockNumber,
      block.hash,
      wbtc.address,
      wbtcPrices
    );

    wethSignatures = await signPrices(
      [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      oracleSalt,
      blockNumber,
      block.hash,
      weth.address,
      wethPrices
    );

    const tx2 = await oracle.setPrices(dataStore.address, eventEmitter.address, {
      priceFeedTokens: [],
      signerInfo,
      tokens: [wbtc.address, weth.address],
      compactedOracleBlockNumbers: getCompactedOracleBlockNumbers([blockNumber, blockNumber]),
      compactedPrices: getCompactedPrices(wbtcPrices.concat(wethPrices)),
      signatures: wbtcSignatures.concat(wethSignatures),
    });

    await printGasUsage(provider, tx2, "oracle.setPrices tx2");

    expect(await oracle.getPrimaryPrice(wbtc.address)).eq(60120);
    expect(await oracle.getPrimaryPrice(weth.address)).eq(6010);

    await dataStore.setUint(await reader.oraclePrecisionKey(wbtc.address), expandDecimals(1, 20));
    await dataStore.setUint(await reader.oraclePrecisionKey(weth.address), expandDecimals(1, 8));

    await oracle.clearTempPrices();

    const tx3 = await oracle.setPrices(dataStore.address, eventEmitter.address, {
      priceFeedTokens: [],
      signerInfo,
      tokens: [wbtc.address, weth.address],
      compactedOracleBlockNumbers: getCompactedOracleBlockNumbers([blockNumber, blockNumber]),
      compactedPrices: getCompactedPrices(wbtcPrices.concat(wethPrices)),
      signatures: wbtcSignatures.concat(wethSignatures),
    });

    await printGasUsage(provider, tx3, "oracle.setPrices tx3");

    expect(await oracle.getPrimaryPrice(wbtc.address)).eq(expandDecimals(60120, 20));
    expect(await oracle.getPrimaryPrice(weth.address)).eq(expandDecimals(6010, 8));

    expect(await oracle.getTempTokensCount()).eq(2);
    expect(await oracle.getTempTokens(0, 2)).eql([wbtc.address, weth.address]);
  });

  it("withOraclePrices", async () => {
    const oracleModuleTest = await deployContract("OracleModuleTest", []);
    await grantRole(roleStore, oracleModuleTest.address, "CONTROLLER");

    const signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);

    const wethPrices = [5990, 5991, 5995, 6010, 6011, 6015, 6017];
    const usdcPrices = [1, 1, 1, 1, 1, 1, 1];

    const block = await provider.getBlock();

    const wethSignatures = await signPrices(
      [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      oracleSalt,
      block.number,
      block.hash,
      weth.address,
      wethPrices
    );

    const usdcSignatures = await signPrices(
      [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
      oracleSalt,
      block.number,
      block.hash,
      usdc.address,
      usdcPrices
    );

    const tx0 = await oracleModuleTest.withOraclePricesTest(oracle.address, dataStore.address, eventEmitter.address, {
      signerInfo,
      tokens: [weth.address],
      compactedOracleBlockNumbers: getCompactedOracleBlockNumbers([block.number]),
      compactedPrices: getCompactedPrices(wethPrices),
      signatures: wethSignatures,
      priceFeedTokens: [usdc.address],
    });

    await printGasUsage(provider, tx0, "oracle.withOraclePrices tx0");

    const tx1 = await oracleModuleTest.withOraclePricesTest(oracle.address, dataStore.address, eventEmitter.address, {
      signerInfo,
      tokens: [weth.address, usdc.address],
      compactedOracleBlockNumbers: getCompactedOracleBlockNumbers([block.number, block.number]),
      compactedPrices: getCompactedPrices(wethPrices.concat(usdcPrices)),
      signatures: wethSignatures.concat(usdcSignatures),
      priceFeedTokens: [],
    });

    await printGasUsage(provider, tx1, "oracle.withOraclePrices tx1");

    const tx2 = await oracleModuleTest.withOraclePricesTest(oracle.address, dataStore.address, eventEmitter.address, {
      signerInfo,
      tokens: [weth.address, weth.address, usdc.address],
      compactedOracleBlockNumbers: getCompactedOracleBlockNumbers([block.number, block.number, block.number]),
      compactedPrices: getCompactedPrices(wethPrices.concat(wethPrices).concat(usdcPrices)),
      signatures: wethSignatures.concat(wethSignatures).concat(usdcSignatures),
      priceFeedTokens: [],
    });

    await printGasUsage(provider, tx2, "oracle.withOraclePrices tx2");
  });
});
