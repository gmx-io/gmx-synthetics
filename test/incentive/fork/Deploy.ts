import { expect } from "chai";
import hre, { ethers } from "hardhat";

import { deployFixture } from "../../../utils/fixture";
import { forkNetwork, unforkNetwork } from "../../../utils/fork";
import { getLegacyAddresses, getLegacyRouterConfig } from "../../../utils/incentive";

// Fork-only: the incentive deploy scripts against live Arbitrum or Avalanche state, on a runtime
// fork of the configured rpc (HARDHAT_FORK_BLOCK pins the block). Run in isolation:
// HARDHAT_FORK=arbitrum INCENTIVE_DEPLOY=1 npx hardhat test test/incentive/fork/Deploy.ts
// (or HARDHAT_FORK=avalanche)
const forkedNetwork = process.env.HARDHAT_FORK;
const forked = (forkedNetwork === "arbitrum" || forkedNetwork === "avalanche") && !!process.env.INCENTIVE_DEPLOY;

(forked ? describe : describe.skip)("Fork: incentive deployment", () => {
  let legacy: Awaited<ReturnType<typeof getLegacyAddresses>>;
  let referralVester: string;

  // eslint-disable-next-line no-undef
  before(async () => {
    await forkNetwork(
      forkedNetwork as string,
      process.env.HARDHAT_FORK_BLOCK ? Number(process.env.HARDHAT_FORK_BLOCK) : undefined
    );
    await deployFixture();
    legacy = await getLegacyAddresses(hre);
    referralVester = (await hre.gmx.getIncentive()).referralVester;
  });

  // eslint-disable-next-line no-undef
  after(async () => {
    await unforkNetwork();
  });

  it("deploys every incentive contract", async () => {
    for (const name of [
      "RewardRouterUtils",
      "IncentiveEventUtils",
      "EsGmxIssuer",
      "SeasonRatioVester",
      "OrphanRatioVester",
      "GmxVesterCapZeroer",
      "GlpVesterCapZeroer",
      "ReferralVesterCapZeroer",
      "RewardRouterV3",
      "RatioVesterReader",
    ]) {
      const deployment = await hre.deployments.get(name);
      expect(await ethers.provider.getCode(deployment.address), name).to.not.equal("0x");
    }
  });

  it("binds the vesters to the live legacy tokens and the issuer", async () => {
    const issuer = await hre.deployments.get("EsGmxIssuer");
    const season = await ethers.getContractAt("RatioVester", (await hre.deployments.get("SeasonRatioVester")).address);
    const orphan = await ethers.getContractAt("RatioVester", (await hre.deployments.get("OrphanRatioVester")).address);
    for (const vester of [season, orphan]) {
      expect(await vester.esToken()).to.equal(legacy.esGmx);
      expect(await vester.pairToken()).to.equal(legacy.feeGmxTracker);
      expect(await vester.claimableToken()).to.equal(legacy.gmx);
    }
    expect(await season.issuer()).to.equal(issuer.address);
    expect(await orphan.issuer()).to.equal(ethers.constants.AddressZero);
    expect(await season.isUncapped()).to.equal(false);
    expect(await orphan.isUncapped()).to.equal(false);
    const issuerContract = await ethers.getContractAt("EsGmxIssuer", issuer.address);
    expect(await issuerContract.esGmx()).to.equal(legacy.esGmx);
    // binding is a migration step, not part of the deploy
    expect(await issuerContract.vester()).to.equal(ethers.constants.AddressZero);
  });

  it("targets the three live legacy vesters with the zeroers", async () => {
    const zeroer = async (name: string) =>
      ethers.getContractAt("VesterCapZeroer", (await hre.deployments.get(name)).address);
    const gmx = await zeroer("GmxVesterCapZeroer");
    const glp = await zeroer("GlpVesterCapZeroer");
    const referral = await zeroer("ReferralVesterCapZeroer");
    expect(await gmx.vester()).to.equal(legacy.gmxVester);
    expect(await glp.vester()).to.equal(legacy.glpVester);
    expect(await referral.vester()).to.equal(referralVester);
  });

  it("mirrors the live router's addresses into RewardRouterV3", async () => {
    const router = await ethers.getContractAt("RewardRouterV3", (await hre.deployments.get("RewardRouterV3")).address);
    expect(await router.gmx()).to.equal(legacy.gmx);
    expect(await router.esGmx()).to.equal(legacy.esGmx);
    expect(await router.bnGmx()).to.equal(legacy.bnGmx);
    expect(await router.stakedGmxTracker()).to.equal(legacy.stakedGmxTracker);
    expect(await router.feeGmxTracker()).to.equal(legacy.feeGmxTracker);
    expect(await router.gmxVester()).to.equal(legacy.gmxVester);
    expect(await router.glpVester()).to.equal(legacy.glpVester);
    expect(await router.govToken()).to.equal(legacy.govToken);
    // the allowlist stays empty at deployment: the migration's transfer freeze
    expect(await router.designatedVestersLength()).to.equal(0);
    expect(await router.inRestakingMode()).to.equal(false);
  });

  it("deploys RewardRouterV3 with the live router's config", async () => {
    const router = await ethers.getContractAt("RewardRouterV3", (await hre.deployments.get("RewardRouterV3")).address);
    const config = await getLegacyRouterConfig(hre);
    expect(await router.maxBoostBasisPoints()).to.equal(config.maxBoostBasisPoints);
    expect(await router.inStrictTransferMode()).to.equal(config.inStrictTransferMode);
    expect(await router.votingPowerType()).to.equal(config.votingPowerType);
    // the live router syncs voting power, so a router left in None would stop burning votes on unstake
    expect(config.votingPowerType).to.not.equal(0);
  });
});
