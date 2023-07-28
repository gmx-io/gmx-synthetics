import { expect } from "chai";
import { deployFixture } from "../../utils/fixture";

import { EXCLUDED_CONFIG_KEYS } from "../../utils/config";
import { grantRole } from "../../utils/role";
import { encodeData, hashString } from "../../utils/hash";
import { decimalToFloat, expandDecimals } from "../../utils/math";
import { TOKEN_ORACLE_TYPES } from "../../utils/oracle";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";
import Keys from "../../artifacts/contracts/data/Keys.sol/Keys.json";

describe("Config", () => {
  let fixture;
  let user0, user1;
  let config, dataStore, roleStore, ethUsdMarket, wnt;
  const { AddressZero } = ethers.constants;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ config, dataStore, roleStore, ethUsdMarket, wnt } = fixture.contracts);
    ({ user0, user1 } = fixture.accounts);

    await grantRole(roleStore, user0.address, "CONFIG_KEEPER");
  });

  it("allows required keys", async () => {
    const keys = Keys.abi.map((i) => i.name);
    console.info(`checking ${keys.length} keys`);

    const excludedKeys = [];

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const hash = hashString(key);

      const isAllowed = (await config.allowedBaseKeys(hash)) === true;
      if (!isAllowed) {
        excludedKeys.push({ key, hash });
      }
    }

    const missingKeys = [];

    for (let i = 0; i < excludedKeys.length; i++) {
      const excludedKey = excludedKeys[i];
      if (!EXCLUDED_CONFIG_KEYS[excludedKey.key]) {
        missingKeys.push(excludedKey);
      }
    }

    if (missingKeys.length > 0) {
      throw new Error(`missing config keys: ${missingKeys.map((i) => i.key).join(", ")}`);
    }
  });

  it("reverts for unwhitelisted keys", async () => {
    await expect(
      config
        .connect(user0)
        .setUint(
          keys.POOL_AMOUNT,
          encodeData(["address", "address"], [ethUsdMarket.marketToken, wnt.address]),
          expandDecimals(100_000, 18)
        )
    )
      .to.be.revertedWithCustomError(errorsContract, "InvalidBaseKey")
      .withArgs(keys.POOL_AMOUNT);
  });

  it("setBool", async () => {
    const key = keys.isMarketDisabledKey(ethUsdMarket.marketToken);

    await expect(
      config.connect(user1).setBool(keys.IS_MARKET_DISABLED, encodeData(["address"], [ethUsdMarket.marketToken]), true)
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");

    expect(await dataStore.getBool(key)).eq(false);

    await config
      .connect(user0)
      .setBool(keys.IS_MARKET_DISABLED, encodeData(["address"], [ethUsdMarket.marketToken]), true);

    expect(await dataStore.getBool(key)).eq(true);
  });

  it("setAddress", async () => {
    const key = keys.isMarketDisabledKey(ethUsdMarket.marketToken);

    await expect(
      config
        .connect(user1)
        .setAddress(keys.IS_MARKET_DISABLED, encodeData(["address"], [ethUsdMarket.marketToken]), wnt.address)
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");

    expect(await dataStore.getAddress(key)).eq(AddressZero);

    await config
      .connect(user0)
      .setAddress(keys.IS_MARKET_DISABLED, encodeData(["address"], [ethUsdMarket.marketToken]), wnt.address);

    expect(await dataStore.getAddress(key)).eq(wnt.address);
  });

  it("setBytes32", async () => {
    const key = keys.oracleTypeKey(wnt.address);

    await expect(
      config
        .connect(user1)
        .setBytes32(
          keys.ORACLE_TYPE,
          encodeData(["address"], [wnt.address]),
          "0x0000000000000000000000000000000000000000000000000000000000000123"
        )
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");

    expect(await dataStore.getBytes32(key)).eq(TOKEN_ORACLE_TYPES.DEFAULT);

    await config
      .connect(user0)
      .setBytes32(
        keys.ORACLE_TYPE,
        encodeData(["address"], [wnt.address]),
        "0x0000000000000000000000000000000000000000000000000000000000000123"
      );

    expect(await dataStore.getBytes32(key)).eq("0x0000000000000000000000000000000000000000000000000000000000000123");
  });

  it("setUint", async () => {
    const key = keys.swapImpactFactorKey(ethUsdMarket.marketToken, true);

    await expect(
      config
        .connect(user1)
        .setUint(keys.SWAP_IMPACT_FACTOR, encodeData(["address", "bool"], [ethUsdMarket.marketToken, true]), 700)
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");

    expect(await dataStore.getUint(key)).eq(0);

    await config
      .connect(user0)
      .setUint(keys.SWAP_IMPACT_FACTOR, encodeData(["address", "bool"], [ethUsdMarket.marketToken, true]), 700);

    expect(await dataStore.getUint(key)).eq(700);
  });

  it("setInt", async () => {
    const key = keys.swapImpactFactorKey(ethUsdMarket.marketToken, true);

    await expect(
      config
        .connect(user1)
        .setInt(keys.SWAP_IMPACT_FACTOR, encodeData(["address", "bool"], [ethUsdMarket.marketToken, true]), -500)
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");

    expect(await dataStore.getInt(key)).eq(0);

    await config
      .connect(user0)
      .setInt(keys.SWAP_IMPACT_FACTOR, encodeData(["address", "bool"], [ethUsdMarket.marketToken, true]), -500);

    expect(await dataStore.getInt(key)).eq(-500);
  });

  it("sets values", async () => {
    const getValue = ({ type, initial, index }) => {
      if (type === "Address") {
        return user1.address;
      }
      if (type === "Bool") {
        return !initial;
      }
      return index + 1;
    };

    const list = [
      {
        key: keys.HOLDING_ADDRESS,
        initial: AddressZero,
        type: "Address",
      },
      {
        key: keys.MIN_HANDLE_EXECUTION_ERROR_GAS,
        initial: 1_000_000,
        type: "Uint",
      },
      {
        key: keys.MAX_SWAP_PATH_LENGTH,
        initial: 5,
        type: "Uint",
      },
      {
        key: keys.MAX_CALLBACK_GAS_LIMIT,
        initial: 2_000_000,
        type: "Uint",
      },
      {
        key: keys.MIN_POSITION_SIZE_USD,
        initial: decimalToFloat(1),
        type: "Uint",
      },
      {
        key: keys.MIN_ORACLE_BLOCK_CONFIRMATIONS,
        initial: 255,
        type: "Uint",
      },
      {
        key: keys.MAX_ORACLE_PRICE_AGE,
        initial: 3600,
        type: "Uint",
      },
      {
        key: keys.MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR,
        initial: decimalToFloat(5, 1),
        type: "Uint",
      },
      {
        key: keys.POSITION_FEE_RECEIVER_FACTOR,
        initial: 0,
        type: "Uint",
      },
      {
        key: keys.SWAP_FEE_RECEIVER_FACTOR,
        initial: 0,
        type: "Uint",
      },
      {
        key: keys.BORROWING_FEE_RECEIVER_FACTOR,
        initial: 0,
        type: "Uint",
      },
      {
        key: keys.ESTIMATED_GAS_FEE_BASE_AMOUNT,
        initial: 0,
        type: "Uint",
      },
      {
        key: keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR,
        initial: 0,
        type: "Uint",
      },
      {
        key: keys.SINGLE_SWAP_GAS_LIMIT,
        initial: 0,
        type: "Uint",
      },
      {
        key: keys.INCREASE_ORDER_GAS_LIMIT,
        initial: 0,
        type: "Uint",
      },
      {
        key: keys.DECREASE_ORDER_GAS_LIMIT,
        initial: 0,
        type: "Uint",
      },
      {
        key: keys.SWAP_ORDER_GAS_LIMIT,
        initial: 0,
        type: "Uint",
      },
      {
        key: keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT,
        initial: 50_000,
        type: "Uint",
      },
      {
        key: keys.REQUEST_EXPIRATION_BLOCK_AGE,
        initial: 0,
        type: "Uint",
      },
      {
        key: keys.MAX_UI_FEE_FACTOR,
        initial: decimalToFloat(5, 5),
        type: "Uint",
      },
      {
        key: keys.SKIP_BORROWING_FEE_FOR_SMALLER_SIDE,
        initial: false,
        type: "Bool",
      },
    ];

    for (let i = 0; i < list.length; i++) {
      const { key, initial, type } = list[i];
      const getMethod = `get${type}`;
      const setMethod = `set${type}`;
      expect(await dataStore[getMethod](key)).eq(initial, `initial ${i}: ${key}`);

      const value = getValue({ type, initial, index: i });
      await config.connect(user0)[setMethod](key, "0x", value);

      expect(await dataStore[getMethod](key)).eq(value, `after ${i}: ${key}`);
    }
  });

  it("sets max pnl factors", async () => {
    const key = keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_TRADERS, ethUsdMarket.marketToken, true);
    expect(await dataStore.getUint(key)).eq(decimalToFloat(5, 1));

    await config
      .connect(user0)
      .setUint(
        keys.MAX_PNL_FACTOR,
        encodeData(["bytes32", "address", "bool"], [keys.MAX_PNL_FACTOR_FOR_TRADERS, ethUsdMarket.marketToken, true]),
        700
      );

    expect(await dataStore.getUint(key)).eq(700);
  });
});
