import hre from "hardhat";
import { ERC20, MultichainTransferRouter, MultichainVault } from "../../typechain-types";

import { expandDecimals } from "../../utils/math";
import * as keys from "../../utils/keys";

const { ethers } = hre;

// ArbitrumSepolia
const multichainTransferRouterJson = import("../../deployments/arbitrumSepolia/MultichainTransferRouter.json");
const multichainVaultJson = import("../../deployments/arbitrumSepolia/MultichainVault.json");
const dataStoreJson = import("../../deployments/arbitrumSepolia/DataStore.json");

// npx hardhat run --network arbitrumSepolia scripts/multichain/bridgeInSameChain.ts
async function main() {
  const [wallet] = await hre.ethers.getSigners();
  const account = wallet.address;
  const wntAmount = expandDecimals(1, 15); // 0.001 WETH (~3 USD)

  const dataStore = await ethers.getContractAt("DataStore", (await dataStoreJson).address);
  const multichainVault: MultichainVault = await ethers.getContractAt(
    "MultichainVault",
    (
      await multichainVaultJson
    ).address
  );
  const multichainTransferRouter: MultichainTransferRouter = await ethers.getContractAt(
    "MultichainTransferRouter",
    (
      await multichainTransferRouterJson
    ).address
  );

  const wntAddress = await dataStore.getAddress(keys.WNT);

  // log balance before
  const wnt: ERC20 = await ethers.getContractAt("ERC20", wntAddress);
  const wntBalanceBefore = await wnt.balanceOf(multichainVault.address);
  console.log("Vault balance before:", ethers.utils.formatEther(wntBalanceBefore), "WETH");

  const multichainBalanceKeyWnt = keys.multichainBalanceKey(account, wntAddress); // e.g. 0x487938563d300c53a3eaea0091be6a32dad931c6f1679a900b34306ab07dbfbf
  const multichainBalanceBefore = await dataStore.getUint(multichainBalanceKeyWnt);
  console.log("Multichain balance before:", ethers.utils.formatEther(multichainBalanceBefore), "WETH");

  const tx = await multichainTransferRouter.multicall(
    [
      multichainTransferRouter.interface.encodeFunctionData("sendWnt", [multichainVault.address, wntAmount]),
      multichainTransferRouter.interface.encodeFunctionData("bridgeIn", [
        account, // account
        wntAddress, // token
      ]),
    ],
    { value: wntAmount }
  );

  console.log("Tx bridgeIn usdc", tx.hash);
  await tx.wait();
  console.log("Tx receipt received");

  // log balance after
  const wntBalanceAfter = await wnt.balanceOf(multichainVault.address);
  console.log("Vault balance after:", ethers.utils.formatEther(wntBalanceAfter), "WETH");
  console.log("Vault diff balance:", ethers.utils.formatEther(wntBalanceAfter.sub(wntBalanceBefore)), "WETH");
  const multichainBalanceAfter = await dataStore.getUint(multichainBalanceKeyWnt);
  console.log("Multichain balance after:", ethers.utils.formatEther(multichainBalanceAfter), "WETH");
  console.log(
    "Multichain diff balance:",
    ethers.utils.formatEther(multichainBalanceAfter.sub(multichainBalanceBefore)),
    "WETH"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
