import fs from "fs";
import path from "path";
import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../../utils/fixture";
import { forkNetwork, unforkNetwork } from "../../../utils/fork";
import { getLegacyAddresses } from "../../../utils/incentive";
import { grantRole } from "../../../utils/role";
import { expandDecimals } from "../../../utils/math";

// Fork-only: the deployed zeroers against the real legacy vesters, using accounts from the
// cap enumeration artifact; measures gas per account to size the zeroing batches.
// HARDHAT_FORK=arbitrum INCENTIVE_DEPLOY=1 npx hardhat test test/incentive/fork/Zeroing.ts
const forked = process.env.HARDHAT_FORK === "arbitrum" && !!process.env.INCENTIVE_DEPLOY;
const SAMPLE = process.env.ZEROING_SAMPLE ? parseInt(process.env.ZEROING_SAMPLE) : 100;

const VESTER_ABI = [
  "function gov() view returns (address)",
  "function setHandler(address handler, bool isActive)",
  "function isHandler(address) view returns (bool)",
  "function getMaxVestableAmount(address) view returns (uint256)",
  "function cumulativeRewardDeductions(address) view returns (uint256)",
];

(forked ? describe : describe.skip)("Fork: legacy cap zeroing", () => {
  let legacy: Awaited<ReturnType<typeof getLegacyAddresses>>;
  let capAccounts: any;
  let keeper;

  // eslint-disable-next-line no-undef
  before(async () => {
    await forkNetwork("arbitrum", process.env.HARDHAT_FORK_BLOCK ? Number(process.env.HARDHAT_FORK_BLOCK) : undefined);
    const fixture = await deployFixture();
    keeper = fixture.accounts.user7;
    await grantRole(fixture.contracts.roleStore, keeper.address, "INCENTIVE_DISTRIBUTOR");
    legacy = await getLegacyAddresses(hre);
    const artifact = path.join(__dirname, "../../../scripts/incentive/out/legacy-cap-accounts.json");
    if (!fs.existsSync(artifact)) {
      throw new Error("run enumerateLegacyCapAccounts first: out/legacy-cap-accounts.json is missing");
    }
    capAccounts = JSON.parse(fs.readFileSync(artifact, "utf8"));
  });

  // eslint-disable-next-line no-undef
  after(async () => {
    await unforkNetwork();
  });

  const sampleOf = (list: any[], size: number) => {
    const stride = Math.max(1, Math.floor(list.length / size));
    return list
      .filter((_, i) => i % stride === 0)
      .slice(0, size)
      .map((e) => e.account);
  };

  const zeroAndMeasure = async (deploymentName: string, vesterAddress: string, accounts: string[]) => {
    const vester = new ethers.Contract(vesterAddress, VESTER_ABI, ethers.provider);
    const zeroerAddress = (await hre.deployments.get(deploymentName)).address;
    const zeroer = await ethers.getContractAt("VesterCapZeroer", zeroerAddress);
    expect(await zeroer.vester()).to.equal(vesterAddress);

    // the legacy gov Timelock is impersonated directly; the signal and execute pair is the rehearsal's job
    const gov = await vester.gov();
    await impersonateAccount(gov);
    await setBalance(gov, expandDecimals(1, 18));
    await vester.connect(await ethers.getSigner(gov)).setHandler(zeroerAddress, true);
    expect(await vester.isHandler(zeroerAddress)).to.equal(true);

    const open = [];
    for (const account of accounts) {
      if (!(await vester.getMaxVestableAmount(account)).isZero()) {
        open.push(account);
      }
    }
    expect(open.length, `${deploymentName}: sampled accounts still open at the fork block`).to.be.greaterThan(0);

    const tx = await zeroer.connect(keeper).zeroCaps(open);
    const receipt = await tx.wait();
    for (const account of open) {
      expect(await vester.getMaxVestableAmount(account)).to.equal(0);
      expect(await vester.cumulativeRewardDeductions(account)).to.equal(ethers.constants.MaxUint256);
    }
    const perAccount = receipt.gasUsed.div(open.length);
    const repeat = await (await zeroer.connect(keeper).zeroCaps(open)).wait();
    console.log(
      `      ${deploymentName}: ${
        open.length
      } accounts, ${receipt.gasUsed.toString()} gas, ${perAccount.toString()} per account, repeat pass ${repeat.gasUsed
        .div(open.length)
        .toString()} per account (skip path)`
    );
    return perAccount;
  };

  it("closes real gmxVester caps and measures gas", async () => {
    const perAccount = await zeroAndMeasure(
      "GmxVesterCapZeroer",
      legacy.gmxVester,
      sampleOf(capAccounts.gmxVester.accounts, SAMPLE)
    );
    console.log(`      batch size at a 20M gas budget: ${Math.floor(20_000_000 / perAccount.toNumber())}`);
  });

  it("closes real glpVester caps and measures gas", async () => {
    await zeroAndMeasure("GlpVesterCapZeroer", legacy.glpVester, sampleOf(capAccounts.glpVester.accounts, SAMPLE));
  });

  it("closes every open referral vester cap", async () => {
    const referralVester = (await hre.gmx.getIncentive()).referralVester;
    await zeroAndMeasure(
      "ReferralVesterCapZeroer",
      referralVester,
      capAccounts.referralVester.accounts.map((e: any) => e.account)
    );
  });
});
