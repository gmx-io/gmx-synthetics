import fs from "fs";
import path from "path";
import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { impersonateAccount, setBalance, takeSnapshot } from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../../utils/fixture";
import { forkNetwork, unforkNetwork } from "../../../utils/fork";
import { getLegacyAddresses } from "../../../utils/incentive";
import { grantRole } from "../../../utils/role";
import { expandDecimals } from "../../../utils/math";
import { hashString } from "../../../utils/hash";
import { errorsContract } from "../../../utils/error";

// Fork-only: the migration's real-state steps on a fork of Arbitrum against the live legacy
// contracts, from the pre-cutover sweep to the V2-versus-V3 transfer differential. Needs the
// enumeration artifacts in scripts/incentive/out. Run alone:
// HARDHAT_FORK=arbitrum INCENTIVE_DEPLOY=1 npx hardhat test test/incentive/fork/Migration.ts
const forked = process.env.HARDHAT_FORK === "arbitrum" && !!process.env.INCENTIVE_DEPLOY;

const GOV_ABI = ["function gov() view returns (address)"];
const HANDLER_ABI = [
  ...GOV_ABI,
  "function setHandler(address, bool)",
  "function isHandler(address) view returns (bool)",
];
const MINTER_ABI = [...GOV_ABI, "function setMinter(address, bool)", "function isMinter(address) view returns (bool)"];
const TRACKER_ABI = [
  ...HANDLER_ABI,
  "function depositBalances(address, address) view returns (uint256)",
  "function stakedAmounts(address) view returns (uint256)",
  "function claimable(address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
];
const VESTER_ABI = [
  ...HANDLER_ABI,
  "function balanceOf(address) view returns (uint256)",
  "function pairAmounts(address) view returns (uint256)",
  "function getMaxVestableAmount(address) view returns (uint256)",
  "function cumulativeRewardDeductions(address) view returns (uint256)",
  "function transferredCumulativeRewards(address) view returns (uint256)",
  "function claimable(address) view returns (uint256)",
  "function deposit(uint256)",
  "function claim() returns (uint256)",
  "function withdraw()",
];
const V2_ABI = [
  ...GOV_ABI,
  "function maxBoostBasisPoints() view returns (uint256)",
  "function votingPowerType() view returns (uint8)",
  "function inRestakingMode() view returns (bool)",
  "function inStrictTransferMode() view returns (bool)",
  "function batchRestakeForAccounts(address[])",
  "function signalTransfer(address)",
  "function acceptTransfer(address)",
];
const ROLE_STORE_ABI = [
  "function getRoleMembers(bytes32, uint256, uint256) view returns (address[])",
  "function grantRole(address, bytes32)",
  "function hasRole(address, bytes32) view returns (bool)",
];

(forked ? describe : describe.skip)("Fork: migration sequence", () => {
  let fixture;
  let legacy: Awaited<ReturnType<typeof getLegacyAddresses>>;
  let wallet, receiverV2, receiverV3;
  let v2, v3, season, orphan, issuer, gmxZeroer;
  let stakedGmxTracker, bonusGmxTracker, extendedGmxTracker, feeGmxTracker, gmxVester;
  let sender: string;
  let senderStakedGmx;

  const readOut = (name: string) => {
    const file = path.join(__dirname, "../../../scripts/incentive/out", name);
    if (!fs.existsSync(file)) {
      throw new Error(`missing ${file}; run the enumeration scripts first`);
    }
    return JSON.parse(fs.readFileSync(file, "utf8"));
  };

  const signerFor = async (address: string) => {
    await impersonateAccount(address);
    await setBalance(address, expandDecimals(1, 18));
    return ethers.getSigner(address);
  };

  const govSigner = async (target: string) =>
    signerFor(await new ethers.Contract(target, GOV_ABI, ethers.provider).gov());

  // eslint-disable-next-line no-undef
  before(async () => {
    await forkNetwork("arbitrum", process.env.HARDHAT_FORK_BLOCK ? Number(process.env.HARDHAT_FORK_BLOCK) : undefined);
    fixture = await deployFixture();
    ({ wallet } = fixture.accounts);
    receiverV2 = fixture.accounts.user1;
    receiverV3 = fixture.accounts.user2;
    legacy = await getLegacyAddresses(hre);
    for (const role of ["TIMELOCK_ADMIN", "INCENTIVE_ADMIN", "INCENTIVE_DISTRIBUTOR"]) {
      await grantRole(fixture.contracts.roleStore, wallet.address, role);
    }
    const at = async (name: string, contract: string) =>
      ethers.getContractAt(contract, (await hre.deployments.get(name)).address);
    v3 = await at("RewardRouterV3", "RewardRouterV3");
    season = await at("SeasonRatioVester", "RatioVester");
    orphan = await at("OrphanRatioVester", "RatioVester");
    issuer = await at("EsGmxIssuer", "EsGmxIssuer");
    gmxZeroer = await at("GmxVesterCapZeroer", "VesterCapZeroer");
    v2 = new ethers.Contract(legacy.rewardRouterV2, V2_ABI, ethers.provider);
    stakedGmxTracker = new ethers.Contract(legacy.stakedGmxTracker, TRACKER_ABI, ethers.provider);
    bonusGmxTracker = new ethers.Contract(legacy.bonusGmxTracker, TRACKER_ABI, ethers.provider);
    extendedGmxTracker = new ethers.Contract(legacy.extendedGmxTracker, TRACKER_ABI, ethers.provider);
    feeGmxTracker = new ethers.Contract(legacy.feeGmxTracker, TRACKER_ABI, ethers.provider);
    gmxVester = new ethers.Contract(legacy.gmxVester, VESTER_ABI, ethers.provider);

    // a transferable real staker: open cap, no legacy vesting position, no code
    const capAccounts = readOut("legacy-cap-accounts.json");
    for (const entry of capAccounts.gmxVester.accounts.slice(0, 200)) {
      const account = entry.account;
      if ((await ethers.provider.getCode(account)) !== "0x") continue;
      const staked = await stakedGmxTracker.depositBalances(account, legacy.gmx);
      if (staked.isZero()) continue;
      if (!(await gmxVester.balanceOf(account)).isZero() || !(await gmxVester.pairAmounts(account)).isZero()) continue;
      sender = account;
      senderStakedGmx = staked;
      break;
    }
    expect(sender, "no suitable sender among the first 200 cap accounts").to.not.equal(undefined);
  });

  // eslint-disable-next-line no-undef
  after(async () => {
    await unforkNetwork();
  });

  it("step 1: the restake sweep converges on the live RewardRouterV2", async () => {
    const sweep = readOut("sweep-accounts.json");
    const accounts = [...new Set([...sweep.bonusInFee.accounts, ...sweep.bnInFee.accounts].map((e: any) => e.account))];
    expect(await v2.inRestakingMode()).to.equal(true);
    expect(await v2.maxBoostBasisPoints()).to.equal(0);
    const gov = await govSigner(legacy.rewardRouterV2);
    const blocked: string[] = [];
    try {
      await v2.connect(gov).batchRestakeForAccounts(accounts);
    } catch (e) {
      for (const account of accounts) {
        try {
          await v2.connect(gov).batchRestakeForAccounts([account]);
        } catch {
          blocked.push(account);
        }
      }
    }
    expect(blocked, `accounts the restake sweep cannot process: ${blocked.join(", ")}`).to.deep.equal([]);
    for (const account of accounts) {
      expect(
        await feeGmxTracker.depositBalances(account, legacy.bonusGmxTracker),
        `${account} bonus receipts`
      ).to.equal(0);
      expect(await feeGmxTracker.depositBalances(account, legacy.bnGmx), `${account} bnGmx`).to.equal(0);
    }
  });

  it("step 3: V3 is gated until the legacy grants and the govToken role land", async () => {
    await v3.connect(wallet).addDesignatedVester(season.address);
    // sender validation runs the vester's transfer guard, so the signal itself is gated on provisioning
    await expect(v3.connect(await signerFor(sender)).signalTransfer(receiverV3.address)).to.be.revertedWithCustomError(
      errorsContract,
      "VesterProvisioningNotComplete"
    );
    await season.connect(wallet).setProvisioningComplete();
    // strict transfer mode is on from deployment, so the receiver needs the sender's approval before the signal
    await feeGmxTracker.connect(await signerFor(sender)).approve(receiverV3.address, ethers.constants.MaxUint256);
    await v3.connect(await signerFor(sender)).signalTransfer(receiverV3.address);
    await expect(v3.connect(receiverV3).acceptTransfer(sender)).to.be.reverted;

    const trackers = [
      legacy.stakedGmxTracker,
      legacy.bonusGmxTracker,
      legacy.extendedGmxTracker,
      legacy.feeGmxTracker,
      legacy.stakedGlpTracker,
      legacy.feeGlpTracker,
    ];
    for (const tracker of trackers) {
      const contract = new ethers.Contract(tracker, HANDLER_ABI, ethers.provider);
      await contract.connect(await govSigner(tracker)).setHandler(v3.address, true);
      expect(await contract.isHandler(v3.address)).to.equal(true);
    }
    const esGmx = new ethers.Contract(legacy.esGmx, HANDLER_ABI, ethers.provider);
    await esGmx.connect(await govSigner(legacy.esGmx)).setHandler(v3.address, true);
    const bnGmx = new ethers.Contract(legacy.bnGmx, MINTER_ABI, ethers.provider);
    await bnGmx.connect(await govSigner(legacy.bnGmx)).setMinter(v3.address, true);
    const feeTracker = new ethers.Contract(legacy.feeGmxTracker, HANDLER_ABI, ethers.provider);
    for (const vester of [season.address, orphan.address]) {
      await feeTracker.connect(await govSigner(legacy.feeGmxTracker)).setHandler(vester, true);
    }
    await esGmx.connect(await govSigner(legacy.esGmx)).setHandler(season.address, true);
    await esGmx.connect(await govSigner(legacy.esGmx)).setHandler(orphan.address, true);

    // the live govToken checks the live RoleStore, not the fixture's
    const liveRoleStore = new ethers.Contract(
      JSON.parse(fs.readFileSync(path.join(__dirname, "../../../deployments/arbitrum/RoleStore.json"), "utf8")).address,
      ROLE_STORE_ABI,
      ethers.provider
    );
    const [roleAdmin] = await liveRoleStore.getRoleMembers(hashString("ROLE_ADMIN"), 0, 1);
    await liveRoleStore.connect(await signerFor(roleAdmin)).grantRole(v3.address, hashString("GOV_TOKEN_CONTROLLER"));
    expect(await liveRoleStore.hasRole(v3.address, hashString("GOV_TOKEN_CONTROLLER"))).to.equal(true);
  });

  it("steps 2 and 8: binding and wiring, with the router config set at deployment", async () => {
    await issuer.connect(wallet).setVester(season.address);
    await season.confirmIssuerBinding();
    expect(await v3.maxBoostBasisPoints()).to.equal(await v2.maxBoostBasisPoints());
    expect(await v3.votingPowerType()).to.equal(await v2.votingPowerType());
    expect(await v3.inStrictTransferMode()).to.equal(await v2.inStrictTransferMode());
    expect(await v3.inRestakingMode()).to.equal(false);
    await season.connect(wallet).setProvisioningComplete();
    await orphan.connect(wallet).setProvisioningComplete();
    await v3.connect(wallet).addDesignatedVester(orphan.address);
    expect(await v3.designatedVestersLength()).to.equal(2);
  });

  it("step 9: zeroing closes the sender's real cap", async () => {
    await gmxVester.connect(await govSigner(legacy.gmxVester)).setHandler(gmxZeroer.address, true);
    expect(await gmxVester.getMaxVestableAmount(sender)).to.not.equal(0);
    await gmxZeroer.connect(wallet).zeroCaps([sender]);
    expect(await gmxVester.getMaxVestableAmount(sender)).to.equal(0);
  });

  it("differential: the deployed V2 reopens the zeroed cap on the receiver, V3 keeps it closed", async () => {
    const senderSigner = await signerFor(sender);
    // strict transfer mode: the receiver must be approved for the sender's staked amount
    const stakedAmount = await feeGmxTracker.stakedAmounts(sender);
    await feeGmxTracker.connect(senderSigner).approve(receiverV2.address, stakedAmount);
    await feeGmxTracker.connect(senderSigner).approve(receiverV3.address, stakedAmount);
    expect(await gmxVester.cumulativeRewardDeductions(sender)).to.equal(ethers.constants.MaxUint256);

    const snapshot = await takeSnapshot();
    await v2.connect(senderSigner).signalTransfer(receiverV2.address);
    await v2.connect(receiverV2).acceptTransfer(sender);
    expect(await gmxVester.transferredCumulativeRewards(receiverV2.address)).to.not.equal(0);
    expect(await gmxVester.getMaxVestableAmount(receiverV2.address)).to.not.equal(0);
    expect(await gmxVester.cumulativeRewardDeductions(sender)).to.not.equal(ethers.constants.MaxUint256);
    await snapshot.restore();

    // acceptTransfer compounds the sender first: claimed GMX fees join the GMX deposit
    const senderGmx = await stakedGmxTracker.depositBalances(sender, legacy.gmx);
    const senderGmxFees = await extendedGmxTracker.claimable(sender);
    await v3.connect(senderSigner).signalTransfer(receiverV3.address);
    await v3.connect(receiverV3).acceptTransfer(sender);

    expect(await gmxVester.getMaxVestableAmount(receiverV3.address)).to.equal(0);
    expect(await gmxVester.cumulativeRewardDeductions(sender)).to.equal(ethers.constants.MaxUint256);
    expect(await stakedGmxTracker.depositBalances(sender, legacy.gmx)).to.equal(0);
    expect(await stakedGmxTracker.depositBalances(receiverV3.address, legacy.gmx)).to.equal(
      senderGmx.add(senderGmxFees)
    );
    const staked = await stakedGmxTracker.stakedAmounts(receiverV3.address);
    expect(await bonusGmxTracker.depositBalances(receiverV3.address, legacy.stakedGmxTracker)).to.equal(staked);
    expect(await extendedGmxTracker.depositBalances(receiverV3.address, legacy.bonusGmxTracker)).to.equal(staked);
    expect(await feeGmxTracker.depositBalances(receiverV3.address, legacy.extendedGmxTracker)).to.equal(staked);
    expect(await feeGmxTracker.depositBalances(sender, legacy.extendedGmxTracker)).to.equal(0);
  });

  it("the real legacy vester after zeroing: deposits are refused, positions still claim and withdraw", async () => {
    const capAccounts = readOut("legacy-cap-accounts.json");
    let vesting: string | undefined;
    for (const entry of capAccounts.gmxVester.accounts.slice(0, 400)) {
      if ((await ethers.provider.getCode(entry.account)) !== "0x") continue;
      if (!(await gmxVester.balanceOf(entry.account)).isZero()) {
        vesting = entry.account;
        break;
      }
    }
    expect(vesting, "no account mid-vesting among the first 400 cap accounts").to.not.equal(undefined);
    await gmxZeroer.connect(wallet).zeroCaps([vesting!]);
    expect(await gmxVester.getMaxVestableAmount(vesting!)).to.equal(0);

    const signer = await signerFor(vesting!);
    const esGmx = await ethers.getContractAt("IERC20", legacy.esGmx);
    if (!(await esGmx.balanceOf(vesting!)).isZero()) {
      await esGmx.connect(signer).approve(legacy.gmxVester, 1);
      await expect(gmxVester.connect(signer).deposit(1)).to.be.revertedWith("Vester: max vestable amount exceeded");
    }
    await gmxVester.connect(signer).claim();
    await gmxVester.connect(signer).withdraw();
    expect(await gmxVester.balanceOf(vesting!)).to.equal(0);
  });
});
