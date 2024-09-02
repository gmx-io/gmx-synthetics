import { HardhatRuntimeEnvironment } from "hardhat/types";
import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "MockRiskOracle",
  getDeployArgs: async () => {
    const [wallet] = await ethers.getSigners();
    const initialSenders = [wallet.address];
    const initialUpdateTypes = ["maxLongTokenPoolAmount", "maxShortTokenPoolAmount", "maxLongTokenPoolUsdForDeposit", "maxShortTokenPoolUsdForDeposit", "maxOpenInterestForLongs", "maxOpenInterestForShorts", "positivePositionImpactFactor", "negativePositionImpactFactor", "positionImpactExponentFactor", "positiveSwapImpactFactor", "negativeSwapImpactFactor", "swapImpactExponentFactor", "fundingIncreaseFactorPerSecond", "fundingDecreaseFactorPerSecond", "minFundingFactorPerSecond", "maxFundingFactorPerSecond", "borrowingFactorForLongs", "borrowingFactorForShorts", "borrowingExponentFactorForLongs", "borrowingExponentFactorForShorts", "reserveFactorLongs", "reserveFactorShorts", "openInterestReserveFactorLongs", "openInterestReserveFactorShorts", "optimalUsageFactor", "baseBorrowingFactor", "aboveOptimalUsageBorrowingFactor", "maxPnlFactorForTradersLongs"];
    return [initialSenders, initialUpdateTypes];
  },
});

func.skip = async ({ network }: HardhatRuntimeEnvironment) => {
  const shouldDeployForNetwork = ["hardhat"];
  return !shouldDeployForNetwork.includes(network.name);
};

export default func;
