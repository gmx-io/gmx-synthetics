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
    "0xc9e1CE91d3f782499cFe787b6F1d2AF0Ca76C049": true,
    "0x9f7198eb1b9Ccc0Eb7A07eD228d8FbC12963ea33": true,
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
      LIMITED_CONFIG_KEEPER: { [deployer]: true },
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
        "0xD5F8b9ba4255B2F73b06f245fcca73D114D1D460": true, // general_keeper_3
        "0x4b6ACC5b2db1757bD49408FeE92e32D39608B5d9": true, // multisig_1
        "0x31FaBf54278E79069c4E102e9fB79d6a44be53A8": true, // ConfigSyncer_3
      },
      FEE_KEEPER: {
        "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D": true, // fee_keeper_1
      },
      MARKET_KEEPER: {
        "0xF09d66CF7dEBcdEbf965F1Ac6527E1Aa5D47A745": true, // general_keeper_1
        "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2
        "0xD5F8b9ba4255B2F73b06f245fcca73D114D1D460": true, // general_keeper_3
      },
      ROLE_ADMIN: {
        "0x7A967D114B8676874FA2cFC1C14F3095C88418Eb": true, // Timelock_4
      },
      ROUTER_PLUGIN: {
        "0x674Ee2FFe588c4b1Fde6D5481c55Ef6133004cbA": true, // ExchangeRouter_4
        "0xa329221a77BE08485f59310b873b14815c82E10D": true, // SubaccountRouter_4
        "0xd59a808bCA24812C483C1B3bF0A0E8D7D5932E4c": true, // GlvRouter_4
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
        "0xdaFa7Deb67805d7498Aa926002bB2d713D1d9256": true, // GlvFactory_2

        "0xE37D052e1DeB99901de205E7186E31A36E4Ef70c": true, // Config_4
        "0x55E8E153048294c060455e5762d7280FAee86Dc7": true, // ConfigSyncer_4
        "0x7A967D114B8676874FA2cFC1C14F3095C88418Eb": true, // Timelock_4
        "0xb8fc96d7a413C462F611A7aC0C912c2FE26EAbC4": true, // Oracle_4
        "0x9CbB37630d65324af064F28CCD9dF6E667Cb16F1": true, // SwapHandler_4
        "0x9242FbED25700e82aE26ae319BCf68E9C508451c": true, // AdlHandler_4
        "0xfe2Df84627950A0fB98EaD49c69a1DE3F66867d6": true, // DepositHandler_4
        "0x64fbD82d9F987baF5A59401c64e823232182E8Ed": true, // WithdrawalHandler_4
        "0xe68CAAACdf6439628DFD2fe624847602991A31eB": true, // OrderHandler_4
        "0x674Ee2FFe588c4b1Fde6D5481c55Ef6133004cbA": true, // ExchangeRouter_4
        "0x7cC506C8d711C2A17B61A75bd082d2514160baAd": true, // FeeHandler_4
        "0xdAb9bA9e3a301CCb353f18B4C8542BA2149E4010": true, // LiquidationHandler_4
        "0xa329221a77BE08485f59310b873b14815c82E10D": true, // SubaccountRouter_4

        "0x48787F7847068f9Cc1398e5f589BEf9744730C8D": true, // ShiftHandler_4
        "0x2d454740b2C4594fA690fF7FB8dA457D96507a67": true, // GlvHandler_4
        "0xd59a808bCA24812C483C1B3bF0A0E8D7D5932E4c": true, // GlvRouter_4
      },
      GOV_TOKEN_CONTROLLER: {
        "0x5E4766F932ce00aA4a1A82d3Da85adf15C5694A1": true, // RewardRouterV2_2
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
        "0xD5F8b9ba4255B2F73b06f245fcca73D114D1D460": true, // general_keeper_3
        "0x15F9eBC71c539926B8f652a534d29B4Af57CaD55": true, // multisig_1
        "0xe75f1fA4858A99e07ca878388AE9259Ba048C87A": true, // ConfigSyncer_3
      },
      FEE_KEEPER: {
        "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D": true, // fee_keeper_1
      },
      MARKET_KEEPER: {
        "0xF09d66CF7dEBcdEbf965F1Ac6527E1Aa5D47A745": true, // general_keeper_1
        "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2
        "0xD5F8b9ba4255B2F73b06f245fcca73D114D1D460": true, // general_keeper_3
      },
      ROLE_ADMIN: {
        "0x9Dd6EB1069385D85Ae204543BabB7333181ec8A5": true, // Timelock_3
      },
      ROUTER_PLUGIN: {
        "0x3BE24AED1a4CcaDebF2956e02C27a00726D4327d": true, // ExchangeRouter_3
        "0xe5485a4fD6527911e9b82A75A1bFEd6e47BE2241": true, // SubaccountRouter_2
        "0xEa90EC1228F7D1b3D47D84d1c9D46dBDFEfF7709": true, // GlvRouter_1
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
        "0x989618BE5450B40F7a2675549643E2e2Dab9978A": true, // Config_3
        "0xe75f1fA4858A99e07ca878388AE9259Ba048C87A": true, // ConfigSyncer_3
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

        "0x9ab8b533B817C41506999D6ff05d25079B0A38cc": true, // GlvHandler_1
        "0xEa90EC1228F7D1b3D47D84d1c9D46dBDFEfF7709": true, // GlvRouter_1
        "0x5d6B84086DA6d4B0b6C0dF7E02f8a6A039226530": true, // GlvFactory_2
      },
      GOV_TOKEN_CONTROLLER: {
        "0x091eD806490Cc58Fd514441499e58984cCce0630": true, // RewardRouterV2_2
      },
    },
    avalancheFuji: {
      CONFIG_KEEPER: {
        "0xFb11f15f206bdA02c224EDC744b0E50E46137046": true,
        "0xc9e1CE91d3f782499cFe787b6F1d2AF0Ca76C049": true,
        "0x03d717E27aF1B566C3efb729F1151E775B411f2B": true,
        "0x9f7198eb1b9Ccc0Eb7A07eD228d8FbC12963ea33": true,
        [deployer]: true,
      },
      LIMITED_CONFIG_KEEPER: {
        "0xFb11f15f206bdA02c224EDC744b0E50E46137046": true,
        "0x508cbC56Ab57A9b0221cf1810a483f8013c92Ff3": true,
        "0xc9e1CE91d3f782499cFe787b6F1d2AF0Ca76C049": true,
        "0x03d717E27aF1B566C3efb729F1151E775B411f2B": true,
        "0xC84f3398eDf6336E1Ef55b50Ca3F9f9f96B8b504": true,
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
