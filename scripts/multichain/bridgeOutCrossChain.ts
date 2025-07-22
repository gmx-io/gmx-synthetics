import hre from "hardhat";
import { BigNumber } from "ethers";
import { ERC20, IStargate } from "../../typechain-types";
import { expandDecimals } from "../../utils/math";
import { checkMultichainBalance, getDeployments, logMultichainBalance, logTokenBalance } from "./utils";
import { getRelayParams } from "../../utils/relay/helpers";
import { getBridgeOutSignature, sendBridgeOut } from "../../utils/relay/multichain";
import * as keys from "../../utils/keys";

const { ethers } = hre;

// Sepolia
const GM_OFT = "0xe4EBcAC4a2e6CBEE385eE407f7D5E278Bc07e11e";
const GLV_OFT = "0xD5BdEa6dC8E4B7429b72675386fC903DEf06599d";
const EID_SEPOLIA = 40161;

// ArbitrumSepolia
const STARGATE_POOL_USDC_ARB_SEPOLIA = "0x543BdA7c6cA4384FE90B1F5929bb851F52888983";
const GM_ADDRESS = "0xb6fC4C9eB02C35A134044526C62bb15014Ac0Bcc"; // GM { indexToken: "WETH", longToken: "WETH", shortToken: "USDC.SG" }
const GLV_ADDRESS = "0xAb3567e55c205c62B141967145F37b7695a9F854"; // GMX Liquidity Vault [WETH-USDC.SG]
const GM_OFT_ADAPTER = "0xe4EBcAC4a2e6CBEE385eE407f7D5E278Bc07e11e";
const GLV_OFT_ADAPTER = "0xd5bdea6dc8e4b7429b72675386fc903def06599d";
const ETH_USD_MARKET_TOKEN = "0xb6fC4C9eB02C35A134044526C62bb15014Ac0Bcc"; // GM { indexToken: "WETH", longToken: "WETH", shortToken: "USDC.SG" }
const ETH_USD_GLV_ADDRESS = "0xAb3567e55c205c62B141967145F37b7695a9F854"; // GMX Liquidity Vault [WETH-USDC.SG]

// TOKEN=<USDC/GM/GLV> AMOUNT=<number> npx hardhat run --network arbitrumSepolia scripts/multichain/bridgeOutCrossChain.ts
async function main() {
  const [wallet] = await hre.ethers.getSigners();
  const account = wallet.address;

  const chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);
  const { dataStore, multichainTransferRouter } = await getDeployments();

  const wntAddress = await dataStore.getAddress(keys.WNT);
  const feeAmount = expandDecimals(6, 15);
  const relayFeeAmount = expandDecimals(3, 15);

  let amount: BigNumber;
  let stargatePool: IStargate;
  let token: ERC20;

  if (process.env.TOKEN === "USDC") {
    amount = expandDecimals(Number(process.env.AMOUNT) || 30, 6); // 30 USDC
    stargatePool = await ethers.getContractAt("IStargate", STARGATE_POOL_USDC_ARB_SEPOLIA);
    token = await ethers.getContractAt("ERC20", await stargatePool.token());
    logMultichainBalance(account, "USDC", token.address, 6);
  } else if (process.env.TOKEN === "GM") {
    amount = expandDecimals(Number(process.env.AMOUNT) || 10, 18); // 10 GM
    stargatePool = await ethers.getContractAt("IStargate", GM_OFT_ADAPTER);
    token = await ethers.getContractAt("ERC20", GM_ADDRESS);
    logMultichainBalance(account, "GM", ETH_USD_MARKET_TOKEN);
  } else if (process.env.TOKEN === "GLV") {
    amount = expandDecimals(Number(process.env.AMOUNT) || 5, 18); // 5 GLV
    stargatePool = await ethers.getContractAt("IStargate", GLV_OFT_ADAPTER);
    token = await ethers.getContractAt("ERC20", GLV_ADDRESS);
    logMultichainBalance(account, "GLV", ETH_USD_GLV_ADDRESS);
  } else {
    throw new Error("⚠️ Unsupported TOKEN type. Use 'USDC', 'GM', or 'GLV'.");
  }

  await checkMultichainBalance({ account, token, amount });

  const bridgeOutParams = {
    token: token.address,
    amount: amount,
    provider: stargatePool.address,
    data: ethers.utils.defaultAbiCoder.encode(["uint32"], [EID_SEPOLIA]), // sepolia eid
  };
  const sendBridgeOutParams: Parameters<typeof sendBridgeOut>[0] = {
    sender: await hre.ethers.getSigner(account),
    signer: await hre.ethers.getSigner(account),
    feeParams: {
      feeToken: wntAddress,
      feeAmount,
      feeSwapPath: [],
    },
    account,
    params: bridgeOutParams,
    deadline: 9999999999,
    srcChainId: process.env.TO_CHAIN_ID || 11155111, // default to Sepolia
    desChainId: chainId, // desChainId must be the settlement chain id (e.g. arbitrum)
    relayRouter: multichainTransferRouter,
    relayFeeToken: wntAddress,
    relayFeeAmount,
  };
  const relayParams = await getRelayParams(sendBridgeOutParams);
  const signature = await getBridgeOutSignature({
    ...sendBridgeOutParams,
    relayParams,
    verifyingContract: multichainTransferRouter.address,
  });

  const tx = await multichainTransferRouter.bridgeOut(
    { ...relayParams, signature },
    account,
    sendBridgeOutParams.srcChainId,
    bridgeOutParams
  );

  console.log("Bridge out tx:", tx.hash);
  await tx.wait();
  console.log("Tx receipt received");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
