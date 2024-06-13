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
      ...testnetAdmins,
    },
    ADL_KEEPER: testnetAdmins,
    LIQUIDATION_KEEPER: {
      "0x3053c7edC20aa08d225CdeC9688136c4ab9F9963": true,
      ...testnetAdmins,
    },
    MARKET_KEEPER: testnetAdmins,
    FROZEN_ORDER_KEEPER: {
      "0x3053c7edC20aa08d225CdeC9688136c4ab9F9963": true,
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
        "0x62aB76Ed722C507f297f2B97920dCA04518fe274": true, // Timelock_2
      },
      ROUTER_PLUGIN: {
        "0x7C68C7866A64FA2160F78EEaE12217FFbf871fa8": true, // ExchangeRouter_2
        "0x78F414436148B8588BDEe4771EA5eB75148668aa": true, // SubaccountRouter_1
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

        "0x226ED647C6eA2C0cE4C08578e2F37b8c2F922849": true, // Config_2
        "0x1847C11d9B11aDDb48e4bB2b55fCE6F9D1606039": true, // Config_2A
        "0x62aB76Ed722C507f297f2B97920dCA04518fe274": true, // Timelock_2
        "0xa11B501c2dd83Acd29F6727570f2502FAaa617F2": true, // Oracle_2
        "0xF6b804F6Cc847a22F2D022C9b0373190850bE34D": true, // SwapHandler_2
        "0x8514fc704317057FA86961Ba9b9490956993A5ed": true, // AdlHandler_2
        "0x9Dc4f12Eb2d8405b499FB5B8AF79a5f64aB8a457": true, // DepositHandler_2
        "0x9E32088F3c1a5EB38D32d1Ec6ba0bCBF499DC9ac": true, // WithdrawalHandler_2
        "0x352f684ab9e97a6321a13CF03A61316B681D9fD2": true, // OrderHandler_2
        "0x7C68C7866A64FA2160F78EEaE12217FFbf871fa8": true, // ExchangeRouter_2
        "0xbF56A2F030C3F920F0E2aD9Cf456B9954c49383a": true, // FeeHandler_2
        "0x9e0521C3dbB18E849F4955087E065E5C9C879917": true, // LiquidationHandler_2

        "0x78F414436148B8588BDEe4771EA5eB75148668aa": true, // SubaccountRouter_1
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
        "0x4Db91a1Fa4ba3c75510B2885d7d7da48E0209F38": true, // Timelock_2
      },
      ROUTER_PLUGIN: {
        "0x11E590f6092D557bF71BaDEd50D81521674F8275": true, // ExchangeRouter_2
        "0xA60862ecc8bd976519e56231bDfAF697C5ce2156": true, // SubaccountRouter_1
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

        "0x7309223E21dc2FFbb660E5Bd5aBF95ae06ba4Da0": true, // Config_2
        "0xb964d8f746fA13024aEEDAeF1d015698bbD0cFCE": true, // Config_2A
        "0x4Db91a1Fa4ba3c75510B2885d7d7da48E0209F38": true, // Timelock_2
        "0x090FA7eb8B4647DaDbEA315E68f8f88e8E62Bd54": true, // Oracle_2
        "0xEE027373517a6D96Fe62f70E9A0A395cB5a39Eee": true, // SwapHandler_2
        "0x5c5DBbcDf420B5d81d4FfDBa5b26Eb24E6E60d52": true, // AdlHandler_2
        "0x72fa3978E2E330C7B2debc23CB676A3ae63333F6": true, // DepositHandler_2
        "0x790Ee987b9B253374d700b07F16347a7d4C4ff2e": true, // WithdrawalHandler_2
        "0xd3B6E962f135634C43415d57A28E688Fb4f15A58": true, // OrderHandler_2
        "0x11E590f6092D557bF71BaDEd50D81521674F8275": true, // ExchangeRouter_2
        "0xc7D8E3561f1247EBDa491bA5f042699C2807C33C": true, // FeeHandler_2
        "0x931C18AF613f56289253F0EeD57F315dE7dbAFcd": true, // LiquidationHandler_2

        "0xA60862ecc8bd976519e56231bDfAF697C5ce2156": true, // SubaccountRouter_1
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
