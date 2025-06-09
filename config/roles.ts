import { HardhatRuntimeEnvironment } from "hardhat/types";

export type RolesConfig = {
  roles: {
    [role: string]: {
      [account: string]: boolean;
    };
  };
  requiredRolesForContracts: {
    [role: string]: string[];
  };
};

const requiredRolesForContracts = {
  CONTROLLER: [
    "Config",
    "MarketFactory",
    "GlvFactory",
    "Timelock",
    "OracleStore",
    "Oracle",
    "ConfigSyncer",

    "ExchangeRouter",
    "SubaccountRouter",
    "GlvRouter",
    "GelatoRelayRouter",
    "SubaccountGelatoRelayRouter",

    "OrderHandler",
    "IncreaseOrderExecutor",
    "DecreaseOrderExecutor",
    "SwapOrderExecutor",

    "DepositHandler",
    "WithdrawalHandler",
    "AdlHandler",
    "LiquidationHandler",
    "ShiftHandler",
    "GlvDepositHandler",
    "GlvWithdrawalHandler",
    "GlvShiftHandler",
    "FeeHandler",
    "SwapHandler",
  ],
  ROUTER_PLUGIN: [
    "ExchangeRouter",
    "SubaccountRouter",
    "GlvRouter",
    "GelatoRelayRouter",
    "SubaccountGelatoRelayRouter",
  ],
  ROLE_ADMIN: ["Timelock"],
  CONFIG_KEEPER: ["ConfigSyncer"],
};

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
    "0xCD9706B6B71fdC4351091B5b1D910cEe7Fde28D0": true, // Max
    "0x508cbC56Ab57A9b0221cf1810a483f8013c92Ff3": true, // An
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

  const roles: {
    [network: string]: {
      [role: string]: {
        [account: string]: boolean;
      };
    };
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
      TIMELOCK_ADMIN: { [deployer]: true },
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
        "0xb6d37DFCdA9c237ca98215f9154Dc414EFe0aC1b": true, // ConfigSyncer_4
      },
      FEE_KEEPER: {
        "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D": true, // fee_keeper_1
      },
      FEE_DISTRIBUTION_KEEPER: {
        "0xF09d66CF7dEBcdEbf965F1Ac6527E1Aa5D47A745": true, // general_keeper_1
        "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2
        "0xD5F8b9ba4255B2F73b06f245fcca73D114D1D460": true, // general_keeper_3
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
        "0x900173A66dbD345006C51fA35fA3aB760FcD843b": true, // ExchangeRouter_4
        "0x5aC4e27341e4cCcb3e5FD62f9E62db2Adf43dd57": true, // ExchangeRouter_4a
        "0xa329221a77BE08485f59310b873b14815c82E10D": true, // SubaccountRouter_4
        "0x105b5aFe50FBCe7759051974fB1710ce331C77B3": true, // GlvRouter_4
        "0x994C598e3b0661bb805d53c6fa6B4504b23b68dD": true, // GlvRouter_4a

        // gasless
        "0x602b805EedddBbD9ddff44A7dcBD46cb07849685": true, // ExchangeRouter
        "0xA145346c17EA8a56c97fAc0bd810225257AB96E1": true, // SubaccountRouter
        "0x63daFB2CA71767129AB8D0a0909383023C4AfF6E": true, // GelatoRelayRouter
        "0x8964c82e1878d35bEd66d377f97e4F518b7A024F": true, // SubaccountGelatoRelayRouter

        // gasless with sponsored calls
        "0x9EB239eDf4c6f4c4fC9d30ea2017F8716d049C8D": true, // GelatoRelayRouter
        "0x5F345B765d5856bC0843cEE8bE234b575eC77DBC": true, // SubaccountGelatoRelayRouter
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

        "0xD1781719eDbED8940534511ac671027989e724b9": true, // Config_4
        "0xb6d37DFCdA9c237ca98215f9154Dc414EFe0aC1b": true, // ConfigSyncer_4
        "0x7A967D114B8676874FA2cFC1C14F3095C88418Eb": true, // Timelock_4
        "0xb8fc96d7a413C462F611A7aC0C912c2FE26EAbC4": true, // Oracle_4
        "0x9CbB37630d65324af064F28CCD9dF6E667Cb16F1": true, // SwapHandler_4
        "0x9242FbED25700e82aE26ae319BCf68E9C508451c": true, // AdlHandler_4
        "0xfe2Df84627950A0fB98EaD49c69a1DE3F66867d6": true, // DepositHandler_4
        "0x64fbD82d9F987baF5A59401c64e823232182E8Ed": true, // WithdrawalHandler_4
        "0xe68CAAACdf6439628DFD2fe624847602991A31eB": true, // OrderHandler_4
        "0x900173A66dbD345006C51fA35fA3aB760FcD843b": true, // ExchangeRouter_4
        "0x5aC4e27341e4cCcb3e5FD62f9E62db2Adf43dd57": true, // ExchangeRouter_4a
        "0x7EB417637a3E6d1C19E6d69158c47610b7a5d9B3": true, // FeeHandler_4
        "0xdAb9bA9e3a301CCb353f18B4C8542BA2149E4010": true, // LiquidationHandler_4
        "0xa329221a77BE08485f59310b873b14815c82E10D": true, // SubaccountRouter_4

        "0x48787F7847068f9Cc1398e5f589BEf9744730C8D": true, // ShiftHandler_4
        "0x3f6dF0c3A7221BA1375E87e7097885a601B41Afc": true, // GlvHandler_4
        "0x105b5aFe50FBCe7759051974fB1710ce331C77B3": true, // GlvRouter_4
        "0x994C598e3b0661bb805d53c6fa6B4504b23b68dD": true, // GlvRouter_4a

        // gasless
        "0x492f2511eC89e425125e494bd8385E055B2f752A": true, // Config
        "0x918b60bA71bAdfaDA72EF3A6C6F71d0C41D4785C": true, // Oracle
        "0x602b805EedddBbD9ddff44A7dcBD46cb07849685": true, // ExchangeRouter
        "0xA145346c17EA8a56c97fAc0bd810225257AB96E1": true, // SubaccountRouter
        "0x63daFB2CA71767129AB8D0a0909383023C4AfF6E": true, // GelatoRelayRouter
        "0x8964c82e1878d35bEd66d377f97e4F518b7A024F": true, // SubaccountGelatoRelayRouter
        "0xfc9Bc118fdDb89FF6fF720840446D73478dE4153": true, // OrderHandler
        "0x089f51AAb35e854D2B65C9396622361a1854Bc3D": true, // DepositHandler
        "0xedB5cD878871F074371e816AC67CbE010c31f00b": true, // WithdrawalHandler
        "0x94889b5d664eaFf4C249d43206705a70A22E37B4": true, // ShiftHandler
        "0x266C6b192952c743De5541D642DC847d064c182C": true, // SwapHandler

        // gasless with sponsored calls
        "0x9EB239eDf4c6f4c4fC9d30ea2017F8716d049C8D": true, // GelatoRelayRouter
        "0x5F345B765d5856bC0843cEE8bE234b575eC77DBC": true, // SubaccountGelatoRelayRouter
        "0x65B46057C1948064a89aA56ba2bd1c411c007346": true, // Config
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
        "0x7dCec0356434d03a6071C96347516df3eF4471bB": true, // ConfigSyncer_4
      },
      FEE_KEEPER: {
        "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D": true, // fee_keeper_1
      },
      FEE_DISTRIBUTION_KEEPER: {
        "0xF09d66CF7dEBcdEbf965F1Ac6527E1Aa5D47A745": true, // general_keeper_1
        "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2
        "0xD5F8b9ba4255B2F73b06f245fcca73D114D1D460": true, // general_keeper_3
      },
      MARKET_KEEPER: {
        "0xF09d66CF7dEBcdEbf965F1Ac6527E1Aa5D47A745": true, // general_keeper_1
        "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2
        "0xD5F8b9ba4255B2F73b06f245fcca73D114D1D460": true, // general_keeper_3
      },
      ROLE_ADMIN: {
        "0xdF23692341538340db0ff04C65017F51b69a29f6": true, // Timelock_4
      },
      ROUTER_PLUGIN: {
        "0x2b76df209E1343da5698AF0f8757f6170162e78b": true, // ExchangeRouter_4
        "0xE37D052e1DeB99901de205E7186E31A36E4Ef70c": true, // ExchangeRouter_4a
        "0x5aEb6AD978f59e220aA9099e09574e1c5E03AafD": true, // SubaccountRouter_4
        "0x6BE75346C0262015E45c6fC0e3268BBa73e87D1a": true, // GlvRouter_4
        "0x16500C1d8fFE2F695D8DCADf753F664993287ae4": true, // GlvRouter_4a

        // gasless
        "0xFa843af557824Be5127eaCB3c4B5D86EADEB73A1": true, // ExchangeRouter_6
        "0x233397357bB4cC6B951aa423D7cEadBC610499e2": true, // SubaccountRouter_6
        "0xb33D87b6Be2a6772eebD38C3222F5872A62Cca2A": true, // GelatoRelayRouter
        "0xE26052e5676E636230A9B05652acD3ACA23fc35f": true, // SubaccountGelatoRelayRouter

        // gasless with sponsored calls
        "0x035A9A047d20a486e14A613B04d5a95d7A617c5D": true, // GelatoRelayRouter
        "0x3B753c0D0aE55530f24532B8Bb9d0bAcD5B675C0": true, // SubaccountGelatoRelayRouter
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
        "0x5d6B84086DA6d4B0b6C0dF7E02f8a6A039226530": true, // GlvFactory_2

        "0xEb376626D44c638Fd0C41170a40fd23a1A0622b7": true, // Config_4
        "0x7dCec0356434d03a6071C96347516df3eF4471bB": true, // ConfigSyncer_4
        "0xdF23692341538340db0ff04C65017F51b69a29f6": true, // Timelock_4
        "0xAd7a7568F500F65AEA3D9417A210CBc5dcD7b273": true, // Oracle_4
        "0x81d8B0F2FD89D31728E8fe36fa3C9aD8BAcF10DC": true, // SwapHandler_4
        "0x129174043B134aD27eaE552D6BEA08f23f771205": true, // AdlHandler_4
        "0x8AE344DEeD1526B1772adDF78718722A169288Dc": true, // DepositHandler_4
        "0x1b0a44dD3bCCC2Ddae33921694EBc34E3ECC1415": true, // WithdrawalHandler_4
        "0x088711C3d2FA992188125e009E65c726bA090AD6": true, // OrderHandler_4
        "0x2b76df209E1343da5698AF0f8757f6170162e78b": true, // ExchangeRouter_4
        "0xE37D052e1DeB99901de205E7186E31A36E4Ef70c": true, // ExchangeRouter_4a
        "0x1A3A103F9F536a0456C9b205152A3ac2b3c54490": true, // FeeHandler_4
        "0x34acBf9Fb2f0dDAB489F6B75FBf394C240b97276": true, // LiquidationHandler_4
        "0x5aEb6AD978f59e220aA9099e09574e1c5E03AafD": true, // SubaccountRouter_4

        "0x418F9CC6cA4870be1088Ce03CC48985B145c79a8": true, // ShiftHandler_4
        "0x48486CaF8851ed0085432789D28A8820bEcbfd45": true, // GlvHandler_4
        "0x6BE75346C0262015E45c6fC0e3268BBa73e87D1a": true, // GlvRouter_4
        "0x16500C1d8fFE2F695D8DCADf753F664993287ae4": true, // GlvRouter_4a

        // gasless
        "0xC2D6cC2B5444b2d3611d812A9EA47648cfFc05c1": true, // Config_5
        "0x13c986424DeD8D78d9313dD90cD847E4DeBA5cb3": true, // Oracle_5
        "0xFa843af557824Be5127eaCB3c4B5D86EADEB73A1": true, // ExchangeRouter_6
        "0x233397357bB4cC6B951aa423D7cEadBC610499e2": true, // SubaccountRouter_6
        "0xb33D87b6Be2a6772eebD38C3222F5872A62Cca2A": true, // GelatoRelayRouter
        "0xE26052e5676E636230A9B05652acD3ACA23fc35f": true, // SubaccountGelatoRelayRouter
        "0x00db21077c63FFf542c017Cc4cDCC84229BFb373": true, // OrderHandler_5
        "0xE78C15c818ebAAd31BaC58167157522B4d01ee2f": true, // DepositHandler_5
        "0x6FA5D5a3377790CF646efDB67Fc53d3cE5b345bc": true, // WithdrawalHandler_5
        "0xE270E904B3b52Fe952F00e797f5daC4a1e058DdA": true, // ShiftHandler_5
        "0x1B31d1774270c46dFc3e1E0d2459A1b94CF9373F": true, // SwapHandler_6

        // gasless with sponsored calls
        "0x9EB239eDf4c6f4c4fC9d30ea2017F8716d049C8D": true, // Config
        "0x035A9A047d20a486e14A613B04d5a95d7A617c5D": true, // GelatoRelayRouter
        "0x3B753c0D0aE55530f24532B8Bb9d0bAcD5B675C0": true, // SubaccountGelatoRelayRouter
      },
      GOV_TOKEN_CONTROLLER: {
        "0x091eD806490Cc58Fd514441499e58984cCce0630": true, // RewardRouterV2_2
      },
    },
    botanix: {
      ADL_KEEPER: syntheticKeepers.mainnet,
      FROZEN_ORDER_KEEPER: syntheticKeepers.mainnet,
      LIQUIDATION_KEEPER: syntheticKeepers.mainnet,
      ORDER_KEEPER: syntheticKeepers.mainnet,
      LIMITED_CONFIG_KEEPER: syntheticKeepers.mainnet,
      CONFIG_KEEPER: {
        "0xF09d66CF7dEBcdEbf965F1Ac6527E1Aa5D47A745": true, // general_keeper_1
        "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2
        "0xD5F8b9ba4255B2F73b06f245fcca73D114D1D460": true, // general_keeper_3
        "0xE7BfFf2aB721264887230037940490351700a068": true, // temp deployer
      },
      FEE_KEEPER: {
        "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D": true, // fee_keeper_1
      },
      MARKET_KEEPER: {
        "0xF09d66CF7dEBcdEbf965F1Ac6527E1Aa5D47A745": true, // general_keeper_1
        "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2
        "0xD5F8b9ba4255B2F73b06f245fcca73D114D1D460": true, // general_keeper_3
      },
      ROLE_ADMIN: {},
      ROUTER_PLUGIN: {},
      TIMELOCK_ADMIN: {
        "0x35ea3066F90Db13e737BBd41f1ED7B4bfF8323b3": true, // timelock_admin_1
        "0xE014cbD60A793901546178E1c16ad9132C927483": true, // timelock_admin_2
      },
      TIMELOCK_MULTISIG: {
        "0x35ea3066F90Db13e737BBd41f1ED7B4bfF8323b3": true, // temp timelock_admin_1
      },
      CONTROLLER: {
        "0xE7BfFf2aB721264887230037940490351700a068": true, // temp deployer
      },
      GOV_TOKEN_CONTROLLER: {},
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
      ROLE_ADMIN: {
        "0x508cbC56Ab57A9b0221cf1810a483f8013c92Ff3": true, // An
      },
      ...testnetConfig,
    },
    arbitrumSepolia: {
      CONFIG_KEEPER: {
        "0xb38302e27bAe8932536A84ab362c3d1013420Cb4": true,
        "0xCD9706B6B71fdC4351091B5b1D910cEe7Fde28D0": true, // Max
        "0x508cbC56Ab57A9b0221cf1810a483f8013c92Ff3": true, // An
        [deployer]: true,
      },
      ROLE_ADMIN: {
        "0xCD9706B6B71fdC4351091B5b1D910cEe7Fde28D0": true, // Max
        "0x508cbC56Ab57A9b0221cf1810a483f8013c92Ff3": true, // An
      },
      ...testnetConfig,
    },
  };

  // normalize addresses
  for (const rolesForNetwork of Object.values(roles)) {
    for (const accounts of Object.values(rolesForNetwork)) {
      for (const account of Object.keys(accounts)) {
        if (account === "undefined") {
          continue;
        }
        const checksumAccount = ethers.utils.getAddress(account);
        if (account !== checksumAccount) {
          accounts[checksumAccount] = accounts[account];
          delete accounts[account];
        }
      }
    }
  }

  return {
    roles: roles[hre.network.name],
    requiredRolesForContracts,
  };
}
