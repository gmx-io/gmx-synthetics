import { expect } from "chai";

import { deployContract } from "../../utils/deploy";
import { deployFixture } from "../../utils/fixture";
import { errorsContract } from "../../utils/error";

import { grantRole } from "../../utils/role";
// import { getDepositCount, getDepositKeys, getAccountDepositCount, getAccountDepositKeys } from "../../utils/deposit";

describe("GlpMigrator", () => {
  let fixture;
  let user0;
  let roleStore,
    dataStore,
    eventEmitter,
    depositVault,
    depositHandler,
    marketStoreUtils,
    stakedGlp,
    glpVault,
    glpTimelock,
    glpRewardRouter,
    glpMigrator;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0 } = fixture.accounts);

    ({ roleStore, dataStore, eventEmitter, depositVault, depositHandler, marketStoreUtils } = fixture.contracts);

    stakedGlp = await deployContract("MintableToken", ["stakedGlp", "sGLP", 18]);
    glpVault = await deployContract("MockGlpVault", []);
    glpTimelock = await deployContract("MockGlpTimelock", []);
    glpRewardRouter = await deployContract("MockGlpRewardRouter", []);
    glpMigrator = await deployContract(
      "GlpMigrator",
      [
        roleStore.address,
        dataStore.address,
        eventEmitter.address,
        depositVault.address,
        depositHandler.address,
        stakedGlp.address,
        glpVault.address,
        glpTimelock.address,
        glpRewardRouter.address,
        5, // reducedMintBurnFeeBasisPoints
      ],
      {
        libraries: {
          MarketStoreUtils: marketStoreUtils.address,
        },
      }
    );

    await grantRole(roleStore, glpMigrator.address, "CONTROLLER");
  });

  it("initializes", async () => {
    expect(await glpMigrator.roleStore()).eq(roleStore.address);
    expect(await glpMigrator.dataStore()).eq(dataStore.address);
    expect(await glpMigrator.eventEmitter()).eq(eventEmitter.address);
    expect(await glpMigrator.depositVault()).eq(depositVault.address);
    expect(await glpMigrator.depositHandler()).eq(depositHandler.address);
    expect(await glpMigrator.stakedGlp()).eq(stakedGlp.address);
    expect(await glpMigrator.glpVault()).eq(glpVault.address);
    expect(await glpMigrator.glpTimelock()).eq(glpTimelock.address);
    expect(await glpMigrator.glpRewardRouter()).eq(glpRewardRouter.address);
    expect(await glpMigrator.reducedMintBurnFeeBasisPoints()).eq(5);
  });

  it("setReducedMintBurnFeeBasisPoints", async () => {
    await expect(glpMigrator.connect(user0).setReducedMintBurnFeeBasisPoints(20)).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized"
    );

    await grantRole(roleStore, user0.address, "CONFIG_KEEPER");

    expect(await glpMigrator.reducedMintBurnFeeBasisPoints()).eq(5);
    await glpMigrator.connect(user0).setReducedMintBurnFeeBasisPoints(20);
    expect(await glpMigrator.reducedMintBurnFeeBasisPoints()).eq(20);
  });
});
