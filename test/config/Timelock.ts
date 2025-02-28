import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture } from "../../utils/fixture";

import { grantRole } from "../../utils/role";
import { hashString } from "../../utils/hash";
import { decimalToFloat, expandDecimals, percentageToFloat } from "../../utils/math";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";

describe("Timelock", () => {
  let fixture;
  let timelockAdmin, timelockMultisig, user2, user3, signer0, signer9;
  let timelockConfig, configTimelockController, dataStore, roleStore, oracleStore, wnt;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ timelockConfig, configTimelockController, dataStore, roleStore, oracleStore, wnt } = fixture.contracts);
    ({ user2, user3, signer0, signer9 } = fixture.accounts);

    timelockAdmin = fixture.accounts.user0;
    timelockMultisig = fixture.accounts.user1;

    await grantRole(roleStore, timelockAdmin.address, "TIMELOCK_ADMIN");
    await grantRole(roleStore, timelockMultisig.address, "TIMELOCK_MULTISIG");
  });

  it("multisig revokeRole", async () => {
    const orderKeeperRole = hashString("ORDER_KEEPER");

    expect(await roleStore.hasRole(user3.address, orderKeeperRole)).eq(false);

    await timelockConfig.connect(timelockAdmin).signalGrantRole(user3.address, orderKeeperRole);
    await time.increase(1 * 24 * 60 * 60 + 10);
    const grantRolePayload = roleStore.interface.encodeFunctionData("grantRole", [user3.address, orderKeeperRole]);
    await timelockConfig.connect(timelockAdmin).execute(roleStore.address, grantRolePayload);

    expect(await roleStore.hasRole(user3.address, orderKeeperRole)).eq(true);

    await expect(timelockConfig.connect(timelockAdmin).revokeRole(user3.address, orderKeeperRole))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(timelockAdmin.address, "TIMELOCK_MULTISIG");

    expect(await roleStore.hasRole(user3.address, orderKeeperRole)).eq(true);

    expect(await timelockConfig.connect(timelockMultisig).revokeRole(user3.address, orderKeeperRole));

    expect(await roleStore.hasRole(user3.address, orderKeeperRole)).eq(false);
  });

  it("increaseTimelockDelay", async () => {
    await expect(timelockConfig.connect(user2).increaseTimelockDelay(2 * 24 * 60 * 60))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await expect(timelockConfig.connect(timelockAdmin).increaseTimelockDelay(1 * 24 * 60 * 60 - 10))
      .to.be.revertedWithCustomError(errorsContract, "InvalidTimelockDelay")
      .withArgs(1 * 24 * 60 * 60 - 10);

    await expect(timelockConfig.connect(timelockAdmin).increaseTimelockDelay(5 * 24 * 60 * 60 + 10))
      .to.be.revertedWithCustomError(errorsContract, "MaxTimelockDelayExceeded")
      .withArgs(5 * 24 * 60 * 60 + 10);

    expect(await configTimelockController.getMinDelay()).eq(1 * 24 * 60 * 60);
    await timelockConfig.connect(timelockAdmin).increaseTimelockDelay(2 * 24 * 60 * 60);
    await time.increase(1 * 24 * 60 * 60 + 10);
    const payload = configTimelockController.interface.encodeFunctionData("updateDelay", [2 * 24 * 60 * 60]);
    await timelockConfig.connect(timelockAdmin).execute(configTimelockController.address, payload);
    expect(await configTimelockController.getMinDelay()).eq(2 * 24 * 60 * 60);
  });

  it("addOracleSigner", async () => {
    await expect(timelockConfig.connect(user2).signalAddOracleSigner(user3.address))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await timelockConfig.connect(timelockAdmin).signalAddOracleSigner(user3.address);

    const payload = oracleStore.interface.encodeFunctionData("addSigner", [user3.address]);
    await expect(timelockConfig.connect(user2).execute(oracleStore.address, payload))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await expect(timelockConfig.connect(timelockAdmin).execute(oracleStore.address, payload)).to.be.revertedWith(
      "TimelockController: operation is not ready"
    );

    await time.increase(1 * 24 * 60 * 60 + 10);

    expect(await oracleStore.getSignerCount()).eq(10);

    await timelockConfig.connect(timelockAdmin).execute(oracleStore.address, payload);

    expect(await oracleStore.getSignerCount()).eq(11);
    expect(await oracleStore.getSigner(10)).eq(user3.address);
  });

  it("removeOracleSigner", async () => {
    await expect(timelockConfig.connect(user2).signalRemoveOracleSigner(signer0.address))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await timelockConfig.connect(timelockAdmin).signalRemoveOracleSigner(signer0.address);

    const payload = oracleStore.interface.encodeFunctionData("removeSigner", [signer0.address]);
    await expect(timelockConfig.connect(user2).execute(oracleStore.address, payload))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await expect(timelockConfig.connect(timelockAdmin).execute(oracleStore.address, payload)).to.be.revertedWith(
      "TimelockController: operation is not ready"
    );

    await time.increase(1 * 24 * 60 * 60 + 10);

    expect(await oracleStore.getSignerCount()).eq(10);
    expect(await oracleStore.getSigner(0)).eq(signer0.address);

    await timelockConfig.connect(timelockAdmin).execute(oracleStore.address, payload);

    expect(await oracleStore.getSignerCount()).eq(9);
    expect(await oracleStore.getSigner(0)).eq(signer9.address);
  });

  it("setFeeReceiver", async () => {
    await expect(timelockConfig.connect(user2).signalSetFeeReceiver(user3.address))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await timelockConfig.connect(timelockAdmin).signalSetFeeReceiver(user3.address);

    const feeReceiverKey = hashString("FEE_RECEIVER");
    const payload = dataStore.interface.encodeFunctionData("setAddress", [feeReceiverKey, user3.address]);
    await expect(timelockConfig.connect(user2).execute(dataStore.address, payload))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await expect(timelockConfig.connect(timelockAdmin).execute(dataStore.address, payload)).to.be.revertedWith(
      "TimelockController: operation is not ready"
    );

    await time.increase(1 * 24 * 60 * 60 + 10);

    expect(await dataStore.getAddress(keys.FEE_RECEIVER)).eq(ethers.constants.AddressZero);

    await timelockConfig.connect(timelockAdmin).execute(dataStore.address, payload);

    expect(await dataStore.getAddress(keys.FEE_RECEIVER)).eq(user3.address);
  });

  it("grantRole", async () => {
    const orderKeeperRole = hashString("ORDER_KEEPER");

    await expect(timelockConfig.connect(user2).signalGrantRole(user3.address, orderKeeperRole))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await timelockConfig.connect(timelockAdmin).signalGrantRole(user3.address, orderKeeperRole);

    const payload = roleStore.interface.encodeFunctionData("grantRole", [user3.address, orderKeeperRole]);
    await expect(timelockConfig.connect(user2).execute(roleStore.address, payload))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await expect(timelockConfig.connect(timelockAdmin).execute(roleStore.address, payload)).to.be.revertedWith(
      "TimelockController: operation is not ready"
    );

    await time.increase(1 * 24 * 60 * 60 + 10);

    expect(await roleStore.hasRole(user3.address, orderKeeperRole)).eq(false);

    await timelockConfig.connect(timelockAdmin).execute(roleStore.address, payload);

    expect(await roleStore.hasRole(user3.address, orderKeeperRole)).eq(true);
  });

  it("revokeRole", async () => {
    const orderKeeperRole = hashString("ORDER_KEEPER");

    expect(await roleStore.hasRole(user3.address, orderKeeperRole)).eq(false);
    const payloadGrantRole = roleStore.interface.encodeFunctionData("grantRole", [user3.address, orderKeeperRole]);
    const payloadRevokeRole = roleStore.interface.encodeFunctionData("revokeRole", [user3.address, orderKeeperRole]);

    await timelockConfig.connect(timelockAdmin).signalGrantRole(user3.address, orderKeeperRole);
    await time.increase(1 * 24 * 60 * 60 + 10);
    await timelockConfig.connect(timelockAdmin).execute(roleStore.address, payloadGrantRole);

    expect(await roleStore.hasRole(user3.address, orderKeeperRole)).eq(true);

    await expect(timelockConfig.connect(user2).signalRevokeRole(user3.address, orderKeeperRole))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await timelockConfig.connect(timelockAdmin).signalRevokeRole(user3.address, orderKeeperRole);

    await expect(timelockConfig.connect(user2).execute(roleStore.address, payloadRevokeRole))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await expect(
      timelockConfig.connect(timelockAdmin).execute(roleStore.address, payloadRevokeRole)
    ).to.be.revertedWith("TimelockController: operation is not ready");

    await time.increase(1 * 24 * 60 * 60 + 10);

    expect(await roleStore.hasRole(user3.address, orderKeeperRole)).eq(true);

    await timelockConfig.connect(timelockAdmin).execute(roleStore.address, payloadRevokeRole);

    expect(await roleStore.hasRole(user3.address, orderKeeperRole)).eq(false);
  });

  it("setOracleProviderForToken", async () => {
    await expect(timelockConfig.connect(user2).signalSetOracleProviderForToken(wnt.address, user3.address))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await timelockConfig.connect(timelockAdmin).signalSetOracleProviderForToken(wnt.address, user3.address);

    const payload = dataStore.interface.encodeFunctionData("setAddress", [
      keys.oracleProviderForTokenKey(wnt.address),
      user3.address,
    ]);
    await expect(timelockConfig.connect(user2).execute(dataStore.address, payload))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await expect(timelockConfig.connect(timelockAdmin).execute(dataStore.address, payload)).to.be.revertedWith(
      "TimelockController: operation is not ready"
    );

    await time.increase(1 * 24 * 60 * 60 + 10);

    expect(await dataStore.getAddress(keys.oracleProviderForTokenKey(wnt.address))).eq(
      fixture.contracts.gmOracleProvider.address
    );

    await timelockConfig.connect(timelockAdmin).execute(dataStore.address, payload);

    expect(await dataStore.getAddress(keys.oracleProviderForTokenKey(wnt.address))).eq(user3.address);
  });

  it("setPriceFeed", async () => {
    await dataStore.setAddress(keys.priceFeedKey(wnt.address), ethers.constants.AddressZero);
    await dataStore.setUint(keys.priceFeedMultiplierKey(wnt.address), 0);

    await expect(
      timelockConfig
        .connect(user2)
        .signalSetPriceFeed(wnt.address, user3.address, 1000, 24 * 60 * 60, decimalToFloat(5000))
    )
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await timelockConfig
      .connect(timelockAdmin)
      .signalSetPriceFeed(wnt.address, user3.address, 1000, 24 * 60 * 60, decimalToFloat(5000));

    const targets = [dataStore.address, dataStore.address, dataStore.address, dataStore.address];
    const values = [0, 0, 0, 0];
    const payloads = [
      dataStore.interface.encodeFunctionData("setAddress", [keys.priceFeedKey(wnt.address), user3.address]),
      dataStore.interface.encodeFunctionData("setUint", [keys.priceFeedMultiplierKey(wnt.address), 1000]),
      dataStore.interface.encodeFunctionData("setUint", [
        keys.priceFeedHeartbeatDurationKey(wnt.address),
        24 * 60 * 60,
      ]),
      dataStore.interface.encodeFunctionData("setUint", [keys.stablePriceKey(wnt.address), decimalToFloat(5000)]),
    ];

    await expect(timelockConfig.connect(user2).executeBatch(targets, values, payloads))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await expect(timelockConfig.connect(timelockAdmin).executeBatch(targets, values, payloads)).to.be.revertedWith(
      "TimelockController: operation is not ready"
    );

    await time.increase(1 * 24 * 60 * 60 + 10);

    expect(await dataStore.getAddress(keys.priceFeedKey(wnt.address))).eq(ethers.constants.AddressZero);
    expect(await dataStore.getUint(keys.priceFeedMultiplierKey(wnt.address))).eq(0);
    expect(await dataStore.getUint(keys.stablePriceKey(wnt.address))).eq(0);

    await timelockConfig.connect(timelockAdmin).executeBatch(targets, values, payloads);

    expect(await dataStore.getAddress(keys.priceFeedKey(wnt.address))).eq(user3.address);
    expect(await dataStore.getUint(keys.priceFeedMultiplierKey(wnt.address))).eq(1000);
    expect(await dataStore.getUint(keys.priceFeedHeartbeatDurationKey(wnt.address))).eq(24 * 60 * 60);
    expect(await dataStore.getUint(keys.stablePriceKey(wnt.address))).eq(decimalToFloat(5000));
  });

  it("setDataStream", async () => {
    const p99 = percentageToFloat("99%");

    await expect(
      timelockConfig.connect(user2).signalSetDataStream(wnt.address, hashString("WNT"), expandDecimals(1, 34), p99)
    )
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await expect(
      timelockConfig
        .connect(timelockAdmin)
        .signalSetDataStream(wnt.address, hashString("WNT"), expandDecimals(1, 34), percentageToFloat("101%"))
    ).to.be.revertedWithCustomError(errorsContract, "ConfigValueExceedsAllowedRange");

    await timelockConfig
      .connect(timelockAdmin)
      .signalSetDataStream(wnt.address, hashString("WNT"), expandDecimals(1, 34), p99);

    const targets = [dataStore.address, dataStore.address, dataStore.address];
    const values = [0, 0, 0];
    const payloads = [
      dataStore.interface.encodeFunctionData("setBytes32", [keys.dataStreamIdKey(wnt.address), hashString("WNT")]),
      dataStore.interface.encodeFunctionData("setUint", [
        keys.dataStreamMultiplierKey(wnt.address),
        expandDecimals(1, 34),
      ]),
      dataStore.interface.encodeFunctionData("setUint", [keys.dataStreamSpreadReductionFactorKey(wnt.address), p99]),
    ];

    await expect(timelockConfig.connect(user2).executeBatch(targets, values, payloads))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "TIMELOCK_ADMIN");

    await expect(timelockConfig.connect(timelockAdmin).executeBatch(targets, values, payloads)).to.be.revertedWith(
      "TimelockController: operation is not ready"
    );

    await time.increase(1 * 24 * 60 * 60 + 10);

    expect(await dataStore.getBytes32(keys.dataStreamIdKey(wnt.address))).eq(ethers.constants.HashZero);
    expect(await dataStore.getUint(keys.dataStreamMultiplierKey(wnt.address))).eq(0);
    expect(await dataStore.getUint(keys.dataStreamSpreadReductionFactorKey(wnt.address))).eq(0);

    await timelockConfig.connect(timelockAdmin).executeBatch(targets, values, payloads);

    expect(await dataStore.getBytes32(keys.dataStreamIdKey(wnt.address))).eq(hashString("WNT"));
    expect(await dataStore.getUint(keys.dataStreamMultiplierKey(wnt.address))).eq(expandDecimals(1, 34));
    expect(await dataStore.getUint(keys.dataStreamSpreadReductionFactorKey(wnt.address))).eq(p99);
  });
});
