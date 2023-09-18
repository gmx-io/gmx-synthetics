import { HardhatRuntimeEnvironment } from "hardhat/types";

export type RolesConfig = {
  account: string;
  label?: string;
  roles?: string[];
  rolesToRemove?: string[];
}[];

export default async function (hre: HardhatRuntimeEnvironment): Promise<RolesConfig> {
  const { deployer } = await hre.getNamedAccounts();

  const getMainnetRoles = ({ multisigAccount }) => {
    return [
      {
        account: "0xe7bfff2ab721264887230037940490351700a068",
        roles: ["CONTROLLER", "MARKET_KEEPER"],
      },
      {
        account: "0x43ce1d475e06c65dd879f4ec644b8e0e10ff2b6d",
        roles: ["FEE_KEEPER"],
      },
      {
        account: "0xF09d66CF7dEBcdEbf965F1Ac6527E1Aa5D47A745",
        roles: ["CONFIG_KEEPER"],
      },
      {
        account: "0x0765678B4f2B45fa9604264a63762E2fE460df64",
        roles: ["CONFIG_KEEPER", "MARKET_KEEPER"],
      },
      {
        account: "0x35ea3066F90Db13e737BBd41f1ED7B4bfF8323b3",
        roles: ["TIMELOCK_ADMIN"],
      },
      {
        account: multisigAccount,
        roles: ["CONFIG_KEEPER", "TIMELOCK_ADMIN", "TIMELOCK_MULTISIG"],
      },
      {
        account: "0xE47b36382DC50b90bCF6176Ddb159C4b9333A7AB",
        roles: ["ORDER_KEEPER", "ADL_KEEPER", "LIQUIDATION_KEEPER", "FROZEN_ORDER_KEEPER"],
      },
      {
        account: "0xC539cB358a58aC67185BaAD4d5E3f7fCfc903700",
        roles: ["ORDER_KEEPER", "ADL_KEEPER", "LIQUIDATION_KEEPER", "FROZEN_ORDER_KEEPER"],
      },
      {
        account: "0xf1e1B2F4796d984CCb8485d43db0c64B83C1FA6d",
        roles: ["ORDER_KEEPER", "ADL_KEEPER", "LIQUIDATION_KEEPER", "FROZEN_ORDER_KEEPER"],
      },
    ];
  };

  const config: {
    [network: string]: RolesConfig;
  } = {
    hardhat: [
      {
        account: deployer,
        roles: [
          "CONTROLLER",
          "ORDER_KEEPER",
          "ADL_KEEPER",
          "LIQUIDATION_KEEPER",
          "MARKET_KEEPER",
          "FROZEN_ORDER_KEEPER",
        ],
      },
    ],
    arbitrum: [
      ...getMainnetRoles({ multisigAccount: "0x4b6ACC5b2db1757bD49408FeE92e32D39608B5d9" }),

      {
        rolesToRemove: ["CONTROLLER"],
        account: "0xE7BfFf2aB721264887230037940490351700a068",
      },
      {
        rolesToRemove: ["MARKET_KEEPER"],
        account: "0xE7BfFf2aB721264887230037940490351700a068",
      },
    ],
    avalanche: [
      ...getMainnetRoles({ multisigAccount: "0x15F9eBC71c539926B8f652a534d29B4Af57CaD55" }),
      {
        rolesToRemove: ["CONTROLLER"],
        account: "0xE7BfFf2aB721264887230037940490351700a068",
      },
      {
        rolesToRemove: ["MARKET_KEEPER"],
        account: "0xE7BfFf2aB721264887230037940490351700a068",
      },
    ],
    arbitrumGoerli: [
      {
        account: "0xC84f3398eDf6336E1Ef55b50Ca3F9f9f96B8b504",
        roles: [
          "CONTROLLER",
          "ORDER_KEEPER",
          "ADL_KEEPER",
          "LIQUIDATION_KEEPER",
          "MARKET_KEEPER",
          "FROZEN_ORDER_KEEPER",
        ],
      },
      {
        account: "0xFb11f15f206bdA02c224EDC744b0E50E46137046",
        roles: [
          "CONTROLLER",
          "ORDER_KEEPER",
          "ADL_KEEPER",
          "LIQUIDATION_KEEPER",
          "MARKET_KEEPER",
          "FROZEN_ORDER_KEEPER",
        ],
      },
      {
        // Chainlink order executor
        account: "0xE0886d9baAaD385F37d460A4ec7b32b79a3731e0",
        rolesToRemove: ["ORDER_KEEPER"],
      },
      {
        // Chainlink deposit executor
        account: "0x239878637fA148819e32Fb8799152bf54F5A34a6",
        rolesToRemove: ["ORDER_KEEPER"],
      },
      {
        // Chainlink withdrawal executor
        account: "0x6b2e203597Fe6D28Ad44CEFb10Df34d6Ba00721A",
        rolesToRemove: ["ORDER_KEEPER"],
      },

      // new
      {
        // Chainlink order executor
        account: "0x30213e04b9c86492c044e6803315e82d86efbd09",
        label: "chainlink market orders keeper",
        rolesToRemove: ["ORDER_KEEPER"],
      },
      {
        // Chainlink deposit executor
        account: "0x5a686c999d6083a183a2a8d459e96e65fc864c96",
        label: "chainlink deposits keeper",
        rolesToRemove: ["ORDER_KEEPER"],
      },
      {
        // Chainlink withdrawal executor
        account: "0x27cce6af7ad5990014235ace4ddacd489e583b56",
        label: "chainlink withdrawals keeper",
        rolesToRemove: ["ORDER_KEEPER"],
      },

      // delist old handlers
      {
        account: "0x5B074a1874Ca3bA78e47DE3f3836A120C7ED8DF1",
        label: "deposit handler A",
        roles: ["CONTROLLER"],
      },
      {
        account: "0xC710E73201100FE6d7Ee73fcC5f8A7Cd51566588",
        label: "order handler A",
        roles: ["CONTROLLER"],
      },
      {
        account: "0x8d860ac6F995aB811a2239E9423447254c05Cd59",
        label: "withdrawal handler A",
        roles: ["CONTROLLER"],
      },
    ],
    avalancheFuji: [
      {
        account: "0xC84f3398eDf6336E1Ef55b50Ca3F9f9f96B8b504",
        roles: [
          "CONTROLLER",
          "ORDER_KEEPER",
          "ADL_KEEPER",
          "LIQUIDATION_KEEPER",
          "MARKET_KEEPER",
          "FROZEN_ORDER_KEEPER",
        ],
      },
      {
        account: "0xFb11f15f206bdA02c224EDC744b0E50E46137046",
        roles: [
          "CONTROLLER",
          "ORDER_KEEPER",
          "ADL_KEEPER",
          "LIQUIDATION_KEEPER",
          "MARKET_KEEPER",
          "FROZEN_ORDER_KEEPER",
        ],
      },
    ],
  };

  return config[hre.network.name];
}
