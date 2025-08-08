import prompts from "prompts";
import hre from "hardhat";
import { expandDecimals } from "../../utils/math";
import { hashString } from "../../utils/hash";
import { BigNumber, BigNumberish, Contract } from "ethers";

// 0x196A492f60696930D6eE0551D3f4eD56b668Aa00
// 0x8F091A33f310EFd8Ca31f7aE4362d6306cA6Ec8d

const WETH = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1";
const distributionId = 4672592;
let write = process.env.WRITE === "true";
const CLAIM_ADMIN = hashString("CLAIM_ADMIN");

async function main() {
  if (hre.network.name !== "arbitrum") {
    throw new Error("This script is only for Arbitrum");
  }

  const claimHandler = await hre.ethers.getContract("ClaimHandler");
  const roleStore = await hre.ethers.getContract("RoleStore");
  const tokenContract = await hre.ethers.getContractAt("IERC20", WETH);

  const params = [
    WETH, // token
    distributionId,
    [
      {
        account: "0x196A492f60696930D6eE0551D3f4eD56b668Aa00",
        amount: expandDecimals(1, 13), // 0.00001 WETH
      },
      {
        account: "0x8F091A33f310EFd8Ca31f7aE4362d6306cA6Ec8d",
        amount: expandDecimals(2, 13), // 0.00002 WETH
      },
    ],
  ] as const;
  const totalAmount = params[2].reduce((acc, curr) => acc.add(curr.amount), BigNumber.from(0));

  if (!write) {
    ({ write } = await prompts({
      type: "confirm",
      name: "write",
      message: "Do you want to execute the transactions?",
    }));
  }

  if (write) {
    const [account] = await hre.ethers.getSigners();
    console.log("account", account.address);
    await checkAllowance(account.address, claimHandler.address, tokenContract, totalAmount, write);

    const tx = await claimHandler.depositFunds(...params);
    console.log("tx", tx.hash);
    await tx.wait();
  } else {
    const claimAdmin = (await roleStore.getRoleMembers(CLAIM_ADMIN, 0, 1))[0];
    await checkAllowance(claimAdmin, claimHandler.address, tokenContract.connect(claimAdmin), totalAmount, write);
    const result = await claimHandler.connect(claimAdmin).callStatic.depositFunds(...params);
    console.log("result", result);
  }

  const amount = await claimHandler.getTotalClaimableAmount(WETH);
  console.log("total claimable amount", amount.toString());
}

async function checkAllowance(
  account: string,
  spender: string,
  tokenContract: Contract,
  amount: BigNumberish,
  write: boolean
) {
  const allowance = await tokenContract.allowance(account, spender);
  console.log("allowance", allowance.toString());

  if (allowance.lt(amount)) {
    if (write) {
      const tx = await tokenContract.approve(spender, amount);
      console.log("approve tx", tx.hash);
      await tx.wait();
    } else {
      const result = await tokenContract.callStatic.approve(spender, amount);
      console.log("approve result", result);
    }
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
