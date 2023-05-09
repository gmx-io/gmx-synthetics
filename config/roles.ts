import { HardhatRuntimeEnvironment } from "hardhat/types";

export type RolesConfig = {
  account: string;
  roles: string[];
}[];

export default async function (hre: HardhatRuntimeEnvironment): Promise<RolesConfig> {
  const { deployer } = await hre.getNamedAccounts();
  const config: {
    [network: string]: RolesConfig;
  } = {
    hardhat: [
      {
        account: deployer,
        roles: ["CONTROLLER", "ORDER_KEEPER", "LIQUIDATION_KEEPER", "MARKET_KEEPER", "FROZEN_ORDER_KEEPER"],
      },
    ],
    arbitrumGoerli: [
      {
        account: "0xC84f3398eDf6336E1Ef55b50Ca3F9f9f96B8b504",
        roles: ["CONTROLLER", "ORDER_KEEPER", "LIQUIDATION_KEEPER", "MARKET_KEEPER", "FROZEN_ORDER_KEEPER"],
      },
      {
        account: "0xFb11f15f206bdA02c224EDC744b0E50E46137046",
        roles: ["CONTROLLER", "ORDER_KEEPER", "LIQUIDATION_KEEPER", "MARKET_KEEPER", "FROZEN_ORDER_KEEPER"],
      },
    ],
    avalancheFuji: [
      {
        account: "0xC84f3398eDf6336E1Ef55b50Ca3F9f9f96B8b504",
        roles: ["CONTROLLER", "ORDER_KEEPER", "LIQUIDATION_KEEPER", "MARKET_KEEPER", "FROZEN_ORDER_KEEPER"],
      },
      {
        account: "0xFb11f15f206bdA02c224EDC744b0E50E46137046",
        roles: ["CONTROLLER", "ORDER_KEEPER", "LIQUIDATION_KEEPER", "MARKET_KEEPER", "FROZEN_ORDER_KEEPER"],
      },
    ],
  };

  return config[hre.network.name];
}
