import hre from "hardhat";
import { BigNumber } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import {
  ERC20,
  IStargate,
  DepositVault,
  RoleStore,
  GlvFactory,
  GlvVault,
  WithdrawalVault,
} from "../../typechain-types";

import { Options } from "@layerzerolabs/lz-v2-utilities";

import { expandDecimals } from "../../utils/math";
import {
  encodeBridgeOutDataList,
  encodeDepositMessage,
  encodeGlvDepositMessage,
  encodeGlvWithdrawalMessage,
  encodeSetTraderReferralCodeMessage,
  encodeWithdrawalMessage,
} from "../../utils/multichain";
import {
  sendCreateDeposit,
  sendCreateGlvDeposit,
  sendCreateGlvWithdrawal,
  sendCreateWithdrawal,
} from "../../utils/relay/multichain";
import * as keys from "../../utils/keys";
import { checkAllowance, getIncreasedValues } from "./utils";

const { ethers } = hre;

// Sepolia
const STARGATE_POOL_USDC_SEPOLIA = "0x4985b8fcEA3659FD801a5b857dA1D00e985863F0";
const STARGATE_USDC_SEPOLIA = "0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590";
const SRC_EID = 40161;

// ArbitrumSepolia
// const WNT = "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73"; // WETH from DataStore
// const WNT = "0x3031a6d5d9648ba5f50f656cd4a1672e1167a34a"; // aeWETH
const STARGATE_POOL_USDC_ARB_SEPOLIA = "0x543BdA7c6cA4384FE90B1F5929bb851F52888983";
const STARGATE_USDC_ARB_SEPOLIA = "0x3253a335E7bFfB4790Aa4C25C4250d206E9b9773";
const DST_CHAIN_ID = 421614;
const DST_EID = 40231;
const ETH_USD_MARKET_TOKEN = "0xb6fC4C9eB02C35A134044526C62bb15014Ac0Bcc"; // GM { indexToken: "WETH", longToken: "WETH", shortToken: "USDC.SG" }
const ETH_USD_GLV_ADDRESS = "0xAb3567e55c205c62B141967145F37b7695a9F854"; // GMX Liquidity Vault [WETH-USDC.SG]
const GM_OFT_ADAPTER = "0xe4EBcAC4a2e6CBEE385eE407f7D5E278Bc07e11e";
const GLV_OFT_ADAPTER = "0xd5bdea6dc8e4b7429b72675386fc903def06599d";

const dataStoreJson = import("../../deployments/arbitrumSepolia/DataStore.json");
const roleStoreJson = import("../../deployments/arbitrumSepolia/RoleStore.json");
const glvFactoryJson = import("../../deployments/arbitrumSepolia/GlvFactory.json");
const glvVaultJson = import("../../deployments/arbitrumSepolia/GlvVault.json");
const layerZeroProviderJson = import("../../deployments/arbitrumSepolia/LayerZeroProvider.json");
const multichainGmRouterJson = import("../../deployments/arbitrumSepolia/MultichainGmRouter.json");
const multichainGlvRouterJson = import("../../deployments/arbitrumSepolia/MultichainGlvRouter.json");
const multichainOrderRouterJson = import("../../deployments/arbitrumSepolia/MultichainOrderRouter.json");
const depositVaultJson = import("../../deployments/arbitrumSepolia/DepositVault.json");
const withdrawalVaultJson = import("../../deployments/arbitrumSepolia/WithdrawalVault.json");

async function prepareSend(
  amount: number | string | BigNumber,
  composeMsg: string,
  stargatePoolAddress: string,
  decimals: number,
  extraGas = 500000,
  slippageBps = 100 // Default 1% slippage tolerance
) {
  const GAS_LIMIT = 8000000; // 8M gas limit for the executor
  const LZ_RECEIVE_GAS_ESTIMATION = 8000000; // 8M gas units needed for lzCompose
  // Calculate msgValue for lzReceive on destination chain
  // e.g. 50,000 gas * 0.1 gwei (100,000,000 wei) = 5,000,000,000,000 wei
  const destProvider = new ethers.providers.JsonRpcProvider("https://sepolia-rollup.arbitrum.io/rpc");
  const gasPrice = await destProvider.getGasPrice();
  const msgValue = LZ_RECEIVE_GAS_ESTIMATION * gasPrice.toNumber();
  const extraOptions = Options.newOptions().addExecutorComposeOption(0, GAS_LIMIT, msgValue);

  const stargatePool: IStargate = await ethers.getContractAt("IStargate", stargatePoolAddress);
  console.log(`extraOptions: ${extraOptions.toHex()}`);
  // Calculate minAmountLD with slippage tolerance
  const amountBN = BigNumber.from(amount);
  const minAmountLD = amountBN.sub(amountBN.mul(slippageBps).div(10000)); // without this --> Fails with Stargate_SlippageTooHigh
  console.log(
    `Bridging amount: ${ethers.utils.formatUnits(amount, decimals)}, Min Amount (with ${
      slippageBps / 100
    }% slippage): ${ethers.utils.formatUnits(minAmountLD, decimals)}`
  );
  const sendParam = {
    dstEid: DST_EID,
    to: ethers.utils.hexZeroPad(ethers.utils.hexlify((await layerZeroProviderJson).address), 32),
    amountLD: amount,
    minAmountLD: minAmountLD, // Apply slippage tolerance
    extraOptions: extraOptions.toHex(),
    composeMsg: composeMsg || "0x",
    oftCmd: "0x",
  };
  const messagingFee = await stargatePool.quoteSend(sendParam, false);
  let valueToSend = messagingFee.nativeFee;
  const tokenAddress = await stargatePool.token();
  if (tokenAddress === ethers.constants.AddressZero) {
    valueToSend = valueToSend.add(sendParam.amountLD);
  }
  console.log(`valueToSend: ${ethers.utils.formatUnits(valueToSend)} ETH`);
  return {
    valueToSend,
    sendParam,
    messagingFee,
    stargatePool,
  };
}

async function retrieveFromDestination(account: string, relayRouterJson: any): Promise<any> {
  const provider = new JsonRpcProvider("https://sepolia-rollup.arbitrum.io/rpc");

  // contracts with destination provider
  const dataStore = new ethers.Contract(
    (await dataStoreJson).address,
    ["function getAddress(bytes32 key) view returns (address)", "function getUint(bytes32 key) view returns (uint256)"],
    provider
  );
  const relayRouter = new ethers.Contract(
    (await relayRouterJson).address,
    ["function digests(bytes32 dicest) view returns (bool)"],
    provider
  );

  // contracts with default provider
  const roleStore: RoleStore = await ethers.getContractAt("RoleStore", (await roleStoreJson).address);
  const glvFactory: GlvFactory = await ethers.getContractAt("GlvFactory", (await glvFactoryJson).address);
  const glvVault: GlvVault = await ethers.getContractAt("GlvVault", (await glvVaultJson).address);
  const depositVault: DepositVault = await ethers.getContractAt("DepositVault", (await depositVaultJson).address);
  const withdrawalVault: WithdrawalVault = await ethers.getContractAt(
    "WithdrawalVault",
    (
      await withdrawalVaultJson
    ).address
  );

  return {
    dataStore,
    roleStore,
    glvFactory,
    glvVault,
    depositVault,
    withdrawalVault,
    relayRouter,
  };
}

enum ActionType {
  None,
  Deposit,
  GlvDeposit,
  BridgeOut,
  SetTraderReferralCode,
  Withdrawal,
  GlvWithdrawal,
}

async function getComposedMsg({
  account,
  actionType,
  wntAmount,
  usdcAmount,
  gmAmount,
  glvAmount,
}: {
  account: string;
  actionType: ActionType;
  wntAmount: BigNumber;
  usdcAmount: BigNumber;
  gmAmount: BigNumber;
  glvAmount: BigNumber;
}): Promise<string> {
  if (actionType === ActionType.None) {
    return ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, "0x"]);
  }

  const srcChainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);
  const { dataStore } = await retrieveFromDestination(account, multichainGmRouterJson);
  const wntAddress = await dataStore.getAddress(keys.WNT);
  const executionFee = expandDecimals(1, 17); // 0.1 ETH
  const deadline = Math.floor(Date.now() / 1000) + 86400; // 86400 seconds = 1 day

  const ethUsdMarket = {
    marketToken: ETH_USD_MARKET_TOKEN,
    longToken: wntAddress, // WETH
    shortToken: STARGATE_USDC_ARB_SEPOLIA, // USDC.SG
  };

  if (actionType === ActionType.Deposit) {
    const { dataStore, depositVault, relayRouter } = await retrieveFromDestination(account, multichainGmRouterJson);

    const defaultDepositParams = {
      addresses: {
        receiver: account,
        callbackContract: account,
        uiFeeReceiver: account,
        market: ethUsdMarket.marketToken,
        initialLongToken: ethUsdMarket.longToken,
        initialShortToken: ethUsdMarket.shortToken,
        longTokenSwapPath: [],
        shortTokenSwapPath: [],
      },
      minMarketTokens: 100,
      shouldUnwrapNativeToken: false,
      executionFee,
      callbackGasLimit: "200000",
      dataList: [],
    };
    const depositParams: Parameters<typeof sendCreateDeposit>[0] = {
      sender: await hre.ethers.getSigner(account),
      signer: await hre.ethers.getSigner(account),
      feeParams: {
        feeToken: wntAddress, // feeToken must default to WNT, otherwise the Gelato Relay will revert with UnexpectedRelayFeeToken
        feeAmount: executionFee, // needed to execute "IERC20(wnt).safeTransfer(address(depositVault), params.executionFee);"
        feeSwapPath: [],
      },
      // transferRequests contains the execution fee + collateral tokens
      transferRequests: {
        tokens: [wntAddress, STARGATE_USDC_ARB_SEPOLIA],
        receivers: [depositVault.address, depositVault.address],
        amounts: [wntAmount, usdcAmount],
      },
      account,
      params: defaultDepositParams,
      deadline,
      chainId: srcChainId,
      srcChainId: srcChainId, // 0 would mean same chain action
      desChainId: DST_CHAIN_ID,
      relayRouter,
      relayFeeToken: wntAddress, // WETH
      relayFeeAmount: 0,
    };

    const userMultichainBalanceWnt = await dataStore.getUint(keys.multichainBalanceKey(account, wntAddress));
    console.log(
      "User's multichain WNT: %s, amount: %s",
      ethers.utils.formatUnits(userMultichainBalanceWnt),
      ethers.utils.formatUnits(wntAmount)
    );
    const userMultichainBalanceUsdc = await dataStore.getUint(
      keys.multichainBalanceKey(account, STARGATE_USDC_ARB_SEPOLIA)
    );
    console.log(
      "User's multichain USDC: %s, amount: %s",
      ethers.utils.formatUnits(userMultichainBalanceUsdc, 6),
      ethers.utils.formatUnits(usdcAmount, 6)
    );
    const userMultichainBalanceGM = await dataStore.getUint(
      keys.multichainBalanceKey(account, ethUsdMarket.marketToken)
    );
    console.log(
      "User's multichain GM: %s for marketToken: %s",
      ethers.utils.formatUnits(userMultichainBalanceGM),
      ethUsdMarket.marketToken
    );

    const message = await encodeDepositMessage(depositParams, account);

    return message;
  }

  if (actionType === ActionType.Withdrawal) {
    const { dataStore, withdrawalVault, relayRouter } = await retrieveFromDestination(account, multichainGmRouterJson);

    const defaultWithdrawalParams = {
      addresses: {
        receiver: account,
        callbackContract: account,
        uiFeeReceiver: account,
        market: ethUsdMarket.marketToken,
        longTokenSwapPath: [],
        shortTokenSwapPath: [],
      },
      minLongTokenAmount: 0,
      minShortTokenAmount: 0,
      shouldUnwrapNativeToken: false,
      executionFee,
      callbackGasLimit: "200000",
      dataList: [],
    };
    const withdrawalParams: Parameters<typeof sendCreateWithdrawal>[0] = {
      sender: await hre.ethers.getSigner(account),
      signer: await hre.ethers.getSigner(account),
      feeParams: {
        feeToken: wntAddress,
        feeAmount: executionFee,
        feeSwapPath: [],
      },
      transferRequests: {
        tokens: [ethUsdMarket.marketToken],
        receivers: [withdrawalVault.address],
        amounts: [gmAmount],
      },
      account: account,
      params: defaultWithdrawalParams,
      deadline,
      chainId: srcChainId,
      srcChainId: srcChainId,
      desChainId: DST_CHAIN_ID,
      relayRouter: relayRouter,
      relayFeeToken: wntAddress,
      relayFeeAmount: 0,
    };

    const userMultichainBalanceWnt = await dataStore.getUint(keys.multichainBalanceKey(account, wntAddress));
    console.log(
      "User's multichain WNT: %s, amount: %s",
      ethers.utils.formatUnits(userMultichainBalanceWnt),
      ethers.utils.formatUnits(wntAmount)
    );
    const userMultichainBalanceUsdc = await dataStore.getUint(
      keys.multichainBalanceKey(account, STARGATE_USDC_ARB_SEPOLIA)
    );
    console.log(
      "User's multichain USDC: %s, amount: %s",
      ethers.utils.formatUnits(userMultichainBalanceUsdc, 6),
      ethers.utils.formatUnits(usdcAmount, 6)
    );
    const userMultichainBalanceGM = await dataStore.getUint(
      keys.multichainBalanceKey(account, ethUsdMarket.marketToken)
    );
    console.log(
      "User's multichain GM: %s for marketToken: %s",
      ethers.utils.formatUnits(userMultichainBalanceGM),
      ethUsdMarket.marketToken
    );
    const userMultichainBalanceGLV = await dataStore.getUint(keys.multichainBalanceKey(account, ETH_USD_GLV_ADDRESS));
    console.log(
      "User's multichain GLV: %s for GlvToken: %s",
      ethers.utils.formatUnits(userMultichainBalanceGLV),
      ETH_USD_GLV_ADDRESS
    );

    if (userMultichainBalanceGM.lt(gmAmount)) {
      throw new Error("Insufficient GM in user's multichain account");
    }

    const message = await encodeWithdrawalMessage(withdrawalParams, account);

    return message;
  }

  if (actionType === ActionType.GlvDeposit) {
    const { glvVault, relayRouter } = await retrieveFromDestination(account, multichainGlvRouterJson);

    const defaultGlvDepositParams = {
      addresses: {
        glv: ETH_USD_GLV_ADDRESS,
        receiver: account,
        callbackContract: account,
        uiFeeReceiver: account,
        market: ethUsdMarket.marketToken,
        initialLongToken: ethUsdMarket.longToken,
        initialShortToken: ethUsdMarket.shortToken,
        longTokenSwapPath: [],
        shortTokenSwapPath: [],
      },
      minGlvTokens: 100,
      executionFee,
      callbackGasLimit: "200000",
      shouldUnwrapNativeToken: true,
      isMarketTokenDeposit: false,
      dataList: [],
    };
    const createGlvDepositParams: Parameters<typeof sendCreateGlvDeposit>[0] = {
      sender: await hre.ethers.getSigner(account),
      signer: await hre.ethers.getSigner(account),
      feeParams: {
        feeToken: wntAddress,
        feeAmount: executionFee,
        feeSwapPath: [],
      },
      transferRequests: {
        tokens: [wntAddress, STARGATE_USDC_ARB_SEPOLIA],
        receivers: [glvVault.address, glvVault.address],
        amounts: [wntAmount, usdcAmount],
      },
      account,
      params: defaultGlvDepositParams,
      deadline,
      chainId: srcChainId,
      srcChainId: srcChainId, // 0 would mean same chain action
      desChainId: DST_CHAIN_ID,
      relayRouter,
      relayFeeToken: wntAddress, // WETH
      relayFeeAmount: 0,
    };

    const userMultichainBalanceWnt = await dataStore.getUint(keys.multichainBalanceKey(account, wntAddress));
    console.log(
      "User's multichain WNT: %s, amount: %s",
      ethers.utils.formatUnits(userMultichainBalanceWnt),
      ethers.utils.formatUnits(wntAmount)
    );
    const userMultichainBalanceUsdc = await dataStore.getUint(
      keys.multichainBalanceKey(account, STARGATE_USDC_ARB_SEPOLIA)
    );
    console.log(
      "User's multichain USDC: %s, amount: %s",
      ethers.utils.formatUnits(userMultichainBalanceUsdc, 6),
      ethers.utils.formatUnits(usdcAmount, 6)
    );
    const userMultichainBalanceGM = await dataStore.getUint(
      keys.multichainBalanceKey(account, ethUsdMarket.marketToken)
    );
    console.log(
      "User's multichain GM: %s for marketToken: %s",
      ethers.utils.formatUnits(userMultichainBalanceGM),
      ethUsdMarket.marketToken
    );
    const userMultichainBalanceGLV = await dataStore.getUint(keys.multichainBalanceKey(account, ETH_USD_GLV_ADDRESS));
    console.log(
      "User's multichain GLV: %s for GlvToken: %s",
      ethers.utils.formatUnits(userMultichainBalanceGLV),
      ETH_USD_GLV_ADDRESS
    );

    const message = await encodeGlvDepositMessage(createGlvDepositParams, account);

    return message;
  }

  if (actionType === ActionType.GlvWithdrawal) {
    const { glvVault, relayRouter } = await retrieveFromDestination(account, multichainGlvRouterJson);

    const defaultGlvWithdrawalParams = {
      addresses: {
        receiver: account,
        callbackContract: account,
        uiFeeReceiver: account,
        market: ethUsdMarket.marketToken,
        glv: ETH_USD_GLV_ADDRESS,
        longTokenSwapPath: [],
        shortTokenSwapPath: [],
      },
      minLongTokenAmount: 0,
      minShortTokenAmount: 0,
      shouldUnwrapNativeToken: false,
      executionFee,
      callbackGasLimit: "200000",
      dataList: [],
    };
    const createGlvWithdrawalParams: Parameters<typeof sendCreateGlvWithdrawal>[0] = {
      sender: await hre.ethers.getSigner(account),
      signer: await hre.ethers.getSigner(account),
      feeParams: {
        feeToken: wntAddress,
        feeAmount: executionFee,
        feeSwapPath: [],
      },
      transferRequests: {
        tokens: [ETH_USD_GLV_ADDRESS],
        receivers: [glvVault.address],
        amounts: [glvAmount],
      },
      account: account,
      params: defaultGlvWithdrawalParams,
      deadline,
      chainId: srcChainId,
      srcChainId: srcChainId,
      desChainId: DST_CHAIN_ID,
      relayRouter,
      relayFeeToken: wntAddress,
      relayFeeAmount: 0,
    };

    const userMultichainBalanceWnt = await dataStore.getUint(keys.multichainBalanceKey(account, wntAddress));
    console.log(
      "User's multichain WNT: %s, amount: %s",
      ethers.utils.formatUnits(userMultichainBalanceWnt),
      ethers.utils.formatUnits(wntAmount)
    );
    const userMultichainBalanceUsdc = await dataStore.getUint(
      keys.multichainBalanceKey(account, STARGATE_USDC_ARB_SEPOLIA)
    );
    console.log(
      "User's multichain USDC: %s, amount: %s",
      ethers.utils.formatUnits(userMultichainBalanceUsdc, 6),
      ethers.utils.formatUnits(usdcAmount, 6)
    );
    const userMultichainBalanceGM = await dataStore.getUint(
      keys.multichainBalanceKey(account, ethUsdMarket.marketToken)
    );
    console.log(
      "User's multichain GM: %s for marketToken: %s",
      ethers.utils.formatUnits(userMultichainBalanceGM),
      ethUsdMarket.marketToken
    );
    const userMultichainBalanceGLV = await dataStore.getUint(keys.multichainBalanceKey(account, ETH_USD_GLV_ADDRESS));
    console.log(
      "User's multichain GLV: %s for GlvToken: %s",
      ethers.utils.formatUnits(userMultichainBalanceGLV),
      ETH_USD_GLV_ADDRESS
    );

    const message = await encodeGlvWithdrawalMessage(createGlvWithdrawalParams, account);

    return message;
  }

  if (actionType === ActionType.SetTraderReferralCode) {
    const referralCode = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`ReferralCode-${Date.now()}`));
    const { relayRouter } = await retrieveFromDestination(account, multichainOrderRouterJson);

    const setTraderReferralCodeParams = {
      sender: await hre.ethers.getSigner(account),
      signer: await hre.ethers.getSigner(account),
      feeParams: {
        feeToken: wntAddress, // feeToken must default to WNT, otherwise the Gelato Relay will revert with UnexpectedRelayFeeToken
        feeAmount: 0,
        feeSwapPath: [],
      },
      account,
      referralCode,
      deadline,
      srcChainId, // 0 means non-multichain action
      desChainId: DST_CHAIN_ID, // for non-multichain actions, desChainId is the same as chainId
      relayRouter,
      chainId: srcChainId,
      gelatoRelayFeeToken: ethers.constants.AddressZero,
      gelatoRelayFeeAmount: 0,
    };

    const message = await encodeSetTraderReferralCodeMessage(setTraderReferralCodeParams, referralCode, account);

    return message;
  }

  if (actionType === ActionType.BridgeOut) {
    const { dataStore, depositVault, relayRouter } = await retrieveFromDestination(account, multichainGmRouterJson);

    // dataList determines if the GM / GLV tokens are being bridged out or not
    const deadline = Math.floor(Date.now() / 1000) + 3600; // deadline (1 hour from now)
    const providerData = ethers.utils.defaultAbiCoder.encode(["uint32"], [SRC_EID]); // providerData (on bridgeOut desEid is referring to the chain where the tokens are bridged out i.e. back to the source chain)

    if (!process.env.token || process.env.token === "GM") {
      const dataList = encodeBridgeOutDataList(
        actionType,
        DST_CHAIN_ID, // desChainId
        deadline,
        GM_OFT_ADAPTER, // provider
        providerData
      );

      const defaultDepositParams = {
        addresses: {
          receiver: account,
          callbackContract: account,
          uiFeeReceiver: account,
          market: ethUsdMarket.marketToken,
          initialLongToken: ethUsdMarket.longToken,
          initialShortToken: ethUsdMarket.shortToken,
          longTokenSwapPath: [],
          shortTokenSwapPath: [],
        },
        minMarketTokens: 100,
        shouldUnwrapNativeToken: false,
        executionFee,
        callbackGasLimit: "200000",
        dataList,
      };
      const depositParams: Parameters<typeof sendCreateDeposit>[0] = {
        sender: await hre.ethers.getSigner(account),
        signer: await hre.ethers.getSigner(account),
        feeParams: {
          feeToken: wntAddress, // feeToken must default to WNT, otherwise the Gelato Relay will revert with UnexpectedRelayFeeToken
          feeAmount: executionFee, // needed to execute "IERC20(wnt).safeTransfer(address(depositVault), params.executionFee);"
          feeSwapPath: [],
        },
        // transferRequests contains the execution fee + collateral tokens
        transferRequests: {
          tokens: [wntAddress, STARGATE_USDC_ARB_SEPOLIA],
          receivers: [depositVault.address, depositVault.address],
          amounts: [wntAmount, usdcAmount],
        },
        account,
        params: defaultDepositParams,
        deadline,
        chainId: srcChainId,
        srcChainId: srcChainId, // 0 would mean same chain action
        desChainId: DST_CHAIN_ID,
        relayRouter,
        relayFeeToken: wntAddress, // WETH
        relayFeeAmount: 0,
      };

      const userMultichainBalanceWnt = await dataStore.getUint(keys.multichainBalanceKey(account, wntAddress));
      console.log(
        "User's multichain WNT: %s, amount: %s",
        ethers.utils.formatUnits(userMultichainBalanceWnt),
        ethers.utils.formatUnits(wntAmount)
      );
      const userMultichainBalanceUsdc = await dataStore.getUint(
        keys.multichainBalanceKey(account, STARGATE_USDC_ARB_SEPOLIA)
      );
      console.log(
        "User's multichain USDC: %s, amount: %s",
        ethers.utils.formatUnits(userMultichainBalanceUsdc, 6),
        ethers.utils.formatUnits(usdcAmount, 6)
      );
      const userMultichainBalanceGM = await dataStore.getUint(
        keys.multichainBalanceKey(account, ethUsdMarket.marketToken)
      );
      console.log(
        "User's multichain GM: %s for marketToken: %s",
        ethers.utils.formatUnits(userMultichainBalanceGM),
        ethUsdMarket.marketToken
      );

      const message = await encodeDepositMessage(depositParams, account);

      return message;
    }

    if (process.env.token === "GLV") {
      const { glvVault, relayRouter } = await retrieveFromDestination(account, multichainGlvRouterJson);

      const dataList = encodeBridgeOutDataList(
        actionType,
        DST_CHAIN_ID, // desChainId
        deadline,
        GLV_OFT_ADAPTER, // provider
        providerData
      );

      const defaultGlvDepositParams = {
        addresses: {
          glv: ETH_USD_GLV_ADDRESS,
          receiver: account,
          callbackContract: account,
          uiFeeReceiver: account,
          market: ethUsdMarket.marketToken,
          initialLongToken: ethUsdMarket.longToken,
          initialShortToken: ethUsdMarket.shortToken,
          longTokenSwapPath: [],
          shortTokenSwapPath: [],
        },
        minGlvTokens: 100,
        executionFee,
        callbackGasLimit: "200000",
        shouldUnwrapNativeToken: true,
        isMarketTokenDeposit: false,
        dataList,
      };
      const createGlvDepositParams: Parameters<typeof sendCreateGlvDeposit>[0] = {
        sender: await hre.ethers.getSigner(account),
        signer: await hre.ethers.getSigner(account),
        feeParams: {
          feeToken: wntAddress,
          feeAmount: executionFee,
          feeSwapPath: [],
        },
        transferRequests: {
          tokens: [wntAddress, STARGATE_USDC_ARB_SEPOLIA],
          receivers: [glvVault.address, glvVault.address],
          amounts: [wntAmount, usdcAmount],
        },
        account,
        params: defaultGlvDepositParams,
        deadline,
        chainId: srcChainId,
        srcChainId: srcChainId, // 0 would mean same chain action
        desChainId: DST_CHAIN_ID,
        relayRouter,
        relayFeeToken: wntAddress, // WETH
        relayFeeAmount: 0,
      };

      const userMultichainBalanceWnt = await dataStore.getUint(keys.multichainBalanceKey(account, wntAddress));
      console.log(
        "User's multichain WNT: %s, amount: %s",
        ethers.utils.formatUnits(userMultichainBalanceWnt),
        ethers.utils.formatUnits(wntAmount)
      );
      const userMultichainBalanceUsdc = await dataStore.getUint(
        keys.multichainBalanceKey(account, STARGATE_USDC_ARB_SEPOLIA)
      );
      console.log(
        "User's multichain USDC: %s, amount: %s",
        ethers.utils.formatUnits(userMultichainBalanceUsdc, 6),
        ethers.utils.formatUnits(usdcAmount, 6)
      );
      const userMultichainBalanceGM = await dataStore.getUint(
        keys.multichainBalanceKey(account, ethUsdMarket.marketToken)
      );
      console.log(
        "User's multichain GM: %s for marketToken: %s",
        ethers.utils.formatUnits(userMultichainBalanceGM),
        ethUsdMarket.marketToken
      );
      const userMultichainBalanceGLV = await dataStore.getUint(keys.multichainBalanceKey(account, ETH_USD_GLV_ADDRESS));
      console.log(
        "User's multichain GLV: %s for GlvToken: %s",
        ethers.utils.formatUnits(userMultichainBalanceGLV),
        ETH_USD_GLV_ADDRESS
      );

      const message = await encodeGlvDepositMessage(createGlvDepositParams, account);

      return message;
    }
  }
}

// ACTION_TYPE=<None/Deposit/GlvDeposit/SetTraderReferralCode/Withdrawal/GlvWithdrawal> npx hardhat run --network sepolia scripts/multichain/bridgeInComposedMsg.ts
async function main() {
  if (!process.env.ACTION_TYPE) {
    throw new Error(
      "⚠️ ACTION_TYPE is mandatory: None / Deposit / GlvDeposit / SetTraderReferralCode / Withdrawal / GlvWithdrawal"
    );
  }

  const [wallet] = await hre.ethers.getSigners();
  const account = wallet.address;

  // Bridge USDC (ETH bridging fails due to Stargate insufficient funds for path)
  const usdc: ERC20 = await ethers.getContractAt("ERC20", STARGATE_USDC_SEPOLIA);
  const usdcBalance = await usdc.balanceOf(account);
  const usdcAmount = expandDecimals(300, 6); // to send a composed msg, we need to send the min stargate amount for bridging if user's multichain balance already has the deposit funds (e.g. 0.1 USDC)
  const wntAmount = expandDecimals(2, 17); // 0.2 WETH (~600 USD) --> amount is not being bridged, it's only used for the glv deposit as the long token and comes from user's multichain balance
  const gmAmount = expandDecimals(50, 18);
  const glvAmount = expandDecimals(40, 18);
  if (usdcBalance.lt(usdcAmount)) {
    throw new Error(
      `Insufficient USDC balance: need ${ethers.utils.formatUnits(usdcAmount, 6)} but have ${ethers.utils.formatUnits(
        usdcBalance,
        6
      )}`
    );
  }
  await checkAllowance({ account, token: usdc, spender: STARGATE_POOL_USDC_SEPOLIA, amount: usdcAmount });

  const composedMsg = await getComposedMsg({
    account,
    actionType: ActionType[process.env.ACTION_TYPE],
    wntAmount,
    usdcAmount,
    gmAmount,
    glvAmount,
  });

  const {
    valueToSend,
    sendParam,
    messagingFee,
    stargatePool: stargatePoolUsdc,
  } = await prepareSend(usdcAmount, composedMsg, STARGATE_POOL_USDC_SEPOLIA, 6);

  const { gasPrice, gasLimit } = await getIncreasedValues({
    sendParam,
    messagingFee,
    account,
    valueToSend,
    stargatePool: stargatePoolUsdc,
  });

  const tx = await stargatePoolUsdc.sendToken(sendParam, messagingFee, account /* refundAddress */, {
    value: valueToSend,
    gasLimit,
    gasPrice,
  });

  console.log("Composed message sent (with usdc)", tx.hash);
  await tx.wait();
  console.log("Composed message receipt received");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
