import { HardhatRuntimeEnvironment } from "hardhat/types";

export type RolesConfig = {
  [role: string]: {
    [account: string]: boolean;
  };
}[];

// roles are granted in deploy/configureRoles.ts
// to add / remove roles after deployment, scripts/updateRoles.ts can be used
export default async function (hre: HardhatRuntimeEnvironment): Promise<RolesConfig> {
  const { deployer } = await hre.getNamedAccounts();

  const syntheticKeepers = {
    mainnet: {
      "0xE47b36382DC50b90bCF6176Ddb159C4b9333A7AB": true,
      "0xC539cB358a58aC67185BaAD4d5E3f7fCfc903700": true,
      "0xf1e1B2F4796d984CCb8485d43db0c64B83C1FA6d": true,
      "0xdE10336a5C37Ab8FBfd6cd53bdECa5b0974737ba": true,
      "0xeB2a53FF17a747B6000041FB4919B3250f2892E3": true,
      "0x8808c5E5Bc9317Bf8cb5eE62339594b8d95f77df": true,
      "0x8E66ee36F2C7B9461F50aA0b53eF0E4e47F4ABBf": true,
      "0x6A2B3A13be0c723674BCfd722d4e133b3f356e05": true,
      "0xDd5c59B7C4e8faD38732caffbeBd20a61bf9F3FC": true,
      "0xEB2bB25dDd2B1872D5189Ae72fCeC9b160dD3FB2": true,
    },
  };

  const chainlinkKeepers = {
    arbitrum: {
      "0x5051fd154320584c9cc2071aed772656e8fcd855": true,
      "0xe0886d9baaad385f37d460a4ec7b32b79a3731e0": true,
      "0x49d30b3035c647bf57f3845da287bd84d80bda2c": true,

      "0xbD88efB162a4157d5B223Bc99CE1bc80E740152f": true, // market orders
      "0x8e36C6106B053aD32D20a426f3faF2d32b49cFBd": true, // deposits
      "0x0BA63427862eBEc8492d0236EEc065D6f9978ad6": true, // withdrawals
    },
  };

  const gelatoKeepers = {
    arbitrum: {
      "0xcc25DCe071B75196D27aD95906dbfA45218d5eC6": true,
    },
  };

  const testnetAdmins = {
    "0xC84f3398eDf6336E1Ef55b50Ca3F9f9f96B8b504": true,
    "0xFb11f15f206bdA02c224EDC744b0E50E46137046": true,
    "0xb38302e27bAe8932536A84ab362c3d1013420Cb4": true,
  };

  const testnetConfig = {
    CONTROLLER: testnetAdmins,
    ORDER_KEEPER: {
      "0x3053c7edC20aa08d225CdeC9688136c4ab9F9963": true,
      "0x508cbC56Ab57A9b0221cf1810a483f8013c92Ff3": true, // An
      ...testnetAdmins,
    },
    ADL_KEEPER: testnetAdmins,
    LIQUIDATION_KEEPER: {
      "0x3053c7edC20aa08d225CdeC9688136c4ab9F9963": true,
      "0x508cbC56Ab57A9b0221cf1810a483f8013c92Ff3": true, // An
      ...testnetAdmins,
    },
    MARKET_KEEPER: testnetAdmins,
    FROZEN_ORDER_KEEPER: {
      "0x3053c7edC20aa08d225CdeC9688136c4ab9F9963": true,
      "0x508cbC56Ab57A9b0221cf1810a483f8013c92Ff3": true, // An
      ...testnetAdmins,
    },
  };

  const config: {
    [network: string]: RolesConfig;
  } = {
    hardhat: {
      CONTROLLER: { [deployer]: true },
      ORDER_KEEPER: { [deployer]: true },
      ADL_KEEPER: { [deployer]: true },
      LIQUIDATION_KEEPER: { [deployer]: true },
      MARKET_KEEPER: { [deployer]: true },
      FROZEN_ORDER_KEEPER: { [deployer]: true },
      CONFIG_KEEPER: { [deployer]: true },
    },
    arbitrum: {
      ADL_KEEPER: syntheticKeepers.mainnet,
      FROZEN_ORDER_KEEPER: syntheticKeepers.mainnet,
      LIQUIDATION_KEEPER: syntheticKeepers.mainnet,
      ORDER_KEEPER: { ...syntheticKeepers.mainnet, ...chainlinkKeepers.arbitrum, ...gelatoKeepers.arbitrum },
      LIMITED_CONFIG_KEEPER: syntheticKeepers.mainnet,
      CONFIG_KEEPER: {
        "0xF09d66CF7dEBcdEbf965F1Ac6527E1Aa5D47A745": true, // general_keeper_1
        "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2
        "0x4b6ACC5b2db1757bD49408FeE92e32D39608B5d9": true, // multisig_1
      },
      FEE_KEEPER: {
        "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D": true, // fee_keeper_1
      },
      MARKET_KEEPER: {
        "0xF09d66CF7dEBcdEbf965F1Ac6527E1Aa5D47A745": true, // general_keeper_1
        "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2
      },
      ROLE_ADMIN: {
        "0xf32b417A93Acc039B236F1eCC86B56bd3cB8E698": true, // Timelock_3
      },
      ROUTER_PLUGIN: {
        "0x69C527fC77291722b52649E45c838e41be8Bf5d5": true, // ExchangeRouter_3
        "0x9F48160eDc3Ad78F4cA0E3FDF54A75D8FB228452": true, // SubaccountRouter_2
      },
      TIMELOCK_ADMIN: {
        "0x35ea3066F90Db13e737BBd41f1ED7B4bfF8323b3": true, // timelock_admin_1
        "0xE014cbD60A793901546178E1c16ad9132C927483": true, // timelock_admin_2
        "0x4b6ACC5b2db1757bD49408FeE92e32D39608B5d9": true, // multisig_1
      },
      TIMELOCK_MULTISIG: {
        "0x4b6ACC5b2db1757bD49408FeE92e32D39608B5d9": true, // multisig_1
      },
      CONTROLLER: {
        "0xa8af9b86fc47deade1bc66b12673706615e2b011": true, // OracleStore_1
        "0xf5f30b10141e1f63fc11ed772931a8294a591996": true, // MarketFactory_1

        "0x7d36FE0840140Aa2bb45711d8EC228e77F597493": true, // AutoCancelSyncer_3
        "0x8583b878DA0844B7f59974069f00D3A9eaE0F4ae": true, // Config_3
        "0xf32b417A93Acc039B236F1eCC86B56bd3cB8E698": true, // Timelock_3
        "0xb8fc96d7a413C462F611A7aC0C912c2FE26EAbC4": true, // Oracle_3
        "0xb0c681DE9CB4B75eD0A620c04A958Bc05f4087b7": true, // SwapHandler_3
        "0x26BC03c944A4800299B4bdfB5EdCE314dD497511": true, // AdlHandler_3
        "0x321f3739983CC3E911fd67a83d1ee76238894Bd0": true, // DepositHandler_3
        "0xA19fA3F0D8E7b7A8963420De504b624167e709B2": true, // WithdrawalHandler_3
        "0xB0Fc2a48b873da40e7bc25658e5E6137616AC2Ee": true, // OrderHandler_3
        "0x69C527fC77291722b52649E45c838e41be8Bf5d5": true, // ExchangeRouter_3
        "0x55E9A5E1Aed46500F746F7683e87F3D9f3C1E14E": true, // FeeHandler_3
        "0x08A902113F7F41a8658eBB1175f9c847bf4fB9D8": true, // LiquidationHandler_3
        "0x9F48160eDc3Ad78F4cA0E3FDF54A75D8FB228452": true, // SubaccountRouter_3

        "0x4895170e184441da9BD2bF95c120c07ba628eeF0": true, // TimestampInitializer_3
        "0xEa90EC1228F7D1b3D47D84d1c9D46dBDFEfF7709": true, // ShiftHandler_3
      },
      GOV_TOKEN_CONTROLLER: {
        "0x159854e14A862Df9E39E1D128b8e5F70B4A3cE9B": true, // RewardRouterV2_1
      },
    },
    avalanche: {
      ADL_KEEPER: syntheticKeepers.mainnet,
      FROZEN_ORDER_KEEPER: syntheticKeepers.mainnet,
      LIQUIDATION_KEEPER: syntheticKeepers.mainnet,
      ORDER_KEEPER: syntheticKeepers.mainnet,
      LIMITED_CONFIG_KEEPER: syntheticKeepers.mainnet,
      CONFIG_KEEPER: {
        "0xF09d66CF7dEBcdEbf965F1Ac6527E1Aa5D47A745": true, // general_keeper_1
        "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2
        "0x15F9eBC71c539926B8f652a534d29B4Af57CaD55": true, // multisig_1
      },
      FEE_KEEPER: {
        "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D": true, // fee_keeper_1
      },
      MARKET_KEEPER: {
        "0xF09d66CF7dEBcdEbf965F1Ac6527E1Aa5D47A745": true, // general_keeper_1
        "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2
      },
      ROLE_ADMIN: {
        "0x9Dd6EB1069385D85Ae204543BabB7333181ec8A5": true, // Timelock_3
      },
      ROUTER_PLUGIN: {
        "0x3BE24AED1a4CcaDebF2956e02C27a00726D4327d": true, // ExchangeRouter_3
        "0xe5485a4fD6527911e9b82A75A1bFEd6e47BE2241": true, // SubaccountRouter_2
      },
      TIMELOCK_ADMIN: {
        "0x35ea3066F90Db13e737BBd41f1ED7B4bfF8323b3": true, // timelock_admin_1
        "0xE014cbD60A793901546178E1c16ad9132C927483": true, // timelock_admin_2
        "0x15F9eBC71c539926B8f652a534d29B4Af57CaD55": true, // multisig_1
      },
      TIMELOCK_MULTISIG: {
        "0x15F9eBC71c539926B8f652a534d29B4Af57CaD55": true, // multisig_1
      },
      CONTROLLER: {
        "0xa6ac2e08c6d6bbd9b237e0daaecd7577996f4e84": true, // OracleStore_1
        "0xc57c155faccd93f62546f329d1483e0e5b9c1241": true, // MarketFactory_1

        "0x162e3a5B47C9a45ff762E5b4b23D048D6780C14e": true, // AutoCancelSyncer_3
        "0x8EfE46827AADfe498C27E56F0A428B5B4EE654f7": true, // Config_3
        "0x9Dd6EB1069385D85Ae204543BabB7333181ec8A5": true, // Timelock_3
        "0xAd7a7568F500F65AEA3D9417A210CBc5dcD7b273": true, // Oracle_3
        "0xb54C8fB6B2F143dD58f5B00fDE7dA4FA05077B20": true, // SwapHandler_3
        "0x352f684ab9e97a6321a13CF03A61316B681D9fD2": true, // AdlHandler_3
        "0xAe2453Dca7704080052AF3c212E862cab50d65C0": true, // DepositHandler_3
        "0xd1b861B50f8d8F9dd922453d1234A2AbDf4d4ea5": true, // WithdrawalHandler_3
        "0x32A0258007a6ea78265a5AE4DBb28f176be4a8EB": true, // OrderHandler_3
        "0x3BE24AED1a4CcaDebF2956e02C27a00726D4327d": true, // ExchangeRouter_3
        "0xcf2fFD3FC8d2cf78D087681f9acD35c799E0d88d": true, // FeeHandler_3
        "0x0E9A0419e5144fe3C73fF30446a1e4d04E1224F0": true, // LiquidationHandler_3
        "0xe5485a4fD6527911e9b82A75A1bFEd6e47BE2241": true, // SubaccountRouter_3

        "0x28AD6fF2683a3D36C05F1D9ec95b907086431a27": true, // TimestampInitializer_3
        "0x7dA618EE7b32af18B749a3715332DBcD820D0913": true, // ShiftHandler_3
      },
      GOV_TOKEN_CONTROLLER: {
        "0xa192D0681E2b9484d1fA48083D36B8A2D0Da1809": true, // RewardRouterV2_1
      },
    },
    avalancheFuji: {
      CONFIG_KEEPER: {
        "0xFb11f15f206bdA02c224EDC744b0E50E46137046": true,
        "0xc9e1CE91d3f782499cFe787b6F1d2AF0Ca76C049": true,
        "0x03d717E27aF1B566C3efb729F1151E775B411f2B": true,
        [deployer]: true,
      },
      ...testnetConfig,
    },
    arbitrumSepolia: {
      CONFIG_KEEPER: {
        "0xb38302e27bAe8932536A84ab362c3d1013420Cb4": true,
        [deployer]: true,
      },
      ...testnetConfig,
    },
  };

  return config[hre.network.name];
}
