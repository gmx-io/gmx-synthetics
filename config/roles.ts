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
    "ConfigSyncer",
    "ConfigTimelockController",

    "MarketFactory",
    "GlvFactory",
    "TimelockConfig",
    "OracleStore",
    "Oracle",

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
    "SwapHandler",

    "ClaimHandler",
    "FeeHandler",

    "LayerZeroProvider",
    "MultichainClaimsRouter",
    "MultichainGlvRouter",
    "MultichainGmRouter",
    "MultichainOrderRouter",
    "MultichainSubaccountRouter",
    "MultichainTransferRouter",
  ],
  ROUTER_PLUGIN: [
    "ExchangeRouter",
    "SubaccountRouter",
    "GlvRouter",
    "GelatoRelayRouter",
    "SubaccountGelatoRelayRouter",

    "MultichainGlvRouter",
    "MultichainGmRouter",
    "MultichainOrderRouter",
    "MultichainSubaccountRouter",
    "MultichainTransferRouter",
  ],
  ROLE_ADMIN: ["TimelockConfig", "ConfigTimelockController"],
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

      "0xa17A86388BBcE9fd73a67F66D87FB0222A824c3f": true,
      "0x86fe53a6D47d9a0fDEA4C5Ac3D80E0E6CC3354cc": true,
      "0x8E2e2Dd583e7DB8437164A7F89A7288b999253CB": true,
      "0xC0a53a9Ee8E8ea0f585d8DcF26800EF2841f97fD": true,
      "0xd316a0043056fb787dE34ABA8cd5323f5C6f8c47": true,
      "0xB874e07336Edc0c278C276FfEb08818976099256": true,
      "0xa5E4a14CaB506bA102977648317E0622cA60BB64": true,
      "0xdAD787D5a86f37a5E480e35b3Ca615D46242Ce9B": true,
      "0x56a7CE61D8aB46A27De1837ceddd8522D52D2736": true,
      "0xC9A5775951F0ea25053fEe81D935FBBF4F0Fb273": true,
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

  const generalConfigKeepers = {
    mainnet: {
      "0xF09d66CF7dEBcdEbf965F1Ac6527E1Aa5D47A745": true, // general_keeper_1
      "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2
      "0xD5F8b9ba4255B2F73b06f245fcca73D114D1D460": true, // general_keeper_3
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
    TIMELOCK_ADMIN: testnetAdmins,
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
      CLAIM_ADMIN: {
        "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
        "0x2B5765633b7059a10a25af47B45409ea47AbC689": true, // claim_admin_1
        "0xD2E217d800C41c86De1e01FD72009d4Eafc539a3": true, // claim_admin_2
        ...generalConfigKeepers.mainnet,
      },
      CONFIG_KEEPER: {
        "0x4b6ACC5b2db1757bD49408FeE92e32D39608B5d9": true, // multisig_1
        "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
        "0x9Ff65141a396A3ea2Eb4CdBdc5A8A4c4Cb4BD189": true, // ConfigSyncer
        ...generalConfigKeepers.mainnet,
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
        ...generalConfigKeepers.mainnet,
      },
      ROLE_ADMIN: {
        "0x625D4b5456f065756De8d618dE094bE7618e8A0d": true, // TimelockConfig
        "0x093a1A45b1C67F88f61087b2632e0599F4a7bFd9": true, // ConfigTimelockController
      },
      ROUTER_PLUGIN: {
        "0x96F257288f00a9aD8ba159294D373550fE2b6771": true, // ExchangeRouter
        "0xfB0dd3878440817e1F12cDF023a88E74D4ae82e2": true, // SubaccountRouter
        "0x36194Db64C1881E44E34e14dc3bb8AfA83B65608": true, // GlvRouter
        "0xC0d483eD76ceCd52eB44Eb78d813Cf5Ace5138fD": true, // GelatoRelayRouter
        "0xeb1f997F95D970701B72F4f66DdD8E360c34C762": true, // SubaccountGelatoRelayRouter
        "0x49a10eb59193ff2dC2C95C13979D0C045ccbCE42": true, // MultichainGlvRouter
        "0x6DFEa567810CfbF8B787a504D66C767a8A770eB7": true, // MultichainGmRouter
        "0xba4C3574553BB99bC7D0116CD49DCc757870b68E": true, // MultichainOrderRouter
        "0xDF4fB0eb95f70C3E3EeAdBe5d1074F009d3F0193": true, // MultichainSubaccountRouter
        "0x379b75be4cA9a25C72753f56ad9EA3850e206D35": true, // MultichainTransferRouter
      },
      TIMELOCK_ADMIN: {
        "0x35ea3066F90Db13e737BBd41f1ED7B4bfF8323b3": true, // timelock_admin_1
        "0xE014cbD60A793901546178E1c16ad9132C927483": true, // timelock_admin_2
        "0x4b6ACC5b2db1757bD49408FeE92e32D39608B5d9": true, // multisig_1
        "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
      },
      TIMELOCK_MULTISIG: {
        "0x4b6ACC5b2db1757bD49408FeE92e32D39608B5d9": true, // multisig_1
        "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
      },
      CONTROLLER: {
        "0x3055239CF2aD6f7006C60a6DB509DE7b3b01A0a1": true, // Config
        "0x9Ff65141a396A3ea2Eb4CdBdc5A8A4c4Cb4BD189": true, // ConfigSyncer
        "0x093a1A45b1C67F88f61087b2632e0599F4a7bFd9": true, // ConfigTimelockController
        "0xf5F30B10141E1F63FC11eD772931A8294a591996": true, // MarketFactory
        "0xdaFa7Deb67805d7498Aa926002bB2d713D1d9256": true, // GlvFactory
        "0x625D4b5456f065756De8d618dE094bE7618e8A0d": true, // TimelockConfig
        "0xA8AF9B86fC47deAde1bc66B12673706615E2B011": true, // OracleStore
        "0x6D5F3c723002847B009D07Fe8e17d6958F153E4e": true, // Oracle
        "0x96F257288f00a9aD8ba159294D373550fE2b6771": true, // ExchangeRouter
        "0xfB0dd3878440817e1F12cDF023a88E74D4ae82e2": true, // SubaccountRouter
        "0x36194Db64C1881E44E34e14dc3bb8AfA83B65608": true, // GlvRouter
        "0xC0d483eD76ceCd52eB44Eb78d813Cf5Ace5138fD": true, // GelatoRelayRouter
        "0xeb1f997F95D970701B72F4f66DdD8E360c34C762": true, // SubaccountGelatoRelayRouter
        "0xA5710260a4F16f5c9B6aed36d4EAc0d13Ee35599": true, // OrderHandler
        "0x37D68dB80902De0b06e8fc52a64195392dea8A94": true, // IncreaseOrderExecutor
        "0x26ad38740C4a110BB239ed8C5a6230D0629Ef940": true, // DecreaseOrderExecutor
        "0x7b98a6E2C314c344ae6e7E309eF274E2b4889eFF": true, // SwapOrderExecutor
        "0xE8895c2b9956B0A1F1B3a980aD1B186464dEf58f": true, // DepositHandler
        "0x4f0D2cd44d038a6904BB6D8071cb47Ae09298A32": true, // WithdrawalHandler
        "0x9430a367331aa581d624Eb28a89559553816E051": true, // AdlHandler
        "0xa258F6114b527000cD895bFEAc4fe24857390962": true, // LiquidationHandler
        "0x0BA5201343F7A18740Acc0920AAC16AA27B50bdF": true, // ShiftHandler
        "0xf78c3357B867214909ef96DF001331b5B4Ff5aEf": true, // GlvDepositHandler
        "0x932ac3e4aA3449dd3b672cAEa85f83a8D63FdD70": true, // GlvWithdrawalHandler
        "0x7cd6ec81a9b6712da9CC1052a4ed9e39ae25D012": true, // GlvShiftHandler
        "0x264a0f17f12c23d252FE5e4D74373873bAa50359": true, // SwapHandler
        "0xCF2b097517EEBD6c36756A82844D2ec21Ee4C025": true, // ClaimHandler
        "0x7EB417637a3E6d1C19E6d69158c47610b7a5d9B3": true, // FeeHandler
        "0xf778aa5862d1bD4072b4f9465BE753D42ecbF06C": true, // LayerZeroProvider
        "0xDa3e6AB64699f159C82acF9bA7216eD57806DFc6": true, // MultichainClaimsRouter
        "0x49a10eb59193ff2dC2C95C13979D0C045ccbCE42": true, // MultichainGlvRouter
        "0x6DFEa567810CfbF8B787a504D66C767a8A770eB7": true, // MultichainGmRouter
        "0xba4C3574553BB99bC7D0116CD49DCc757870b68E": true, // MultichainOrderRouter
        "0xDF4fB0eb95f70C3E3EeAdBe5d1074F009d3F0193": true, // MultichainSubaccountRouter
        "0x379b75be4cA9a25C72753f56ad9EA3850e206D35": true, // MultichainTransferRouter
      },
      GOV_TOKEN_CONTROLLER: {
        "0x5E4766F932ce00aA4a1A82d3Da85adf15C5694A1": true, // RewardRouterV2
      },
    },
    avalanche: {
      ADL_KEEPER: syntheticKeepers.mainnet,
      FROZEN_ORDER_KEEPER: syntheticKeepers.mainnet,
      LIQUIDATION_KEEPER: syntheticKeepers.mainnet,
      ORDER_KEEPER: syntheticKeepers.mainnet,
      LIMITED_CONFIG_KEEPER: syntheticKeepers.mainnet,
      CLAIM_ADMIN: {
        "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
        "0x2B5765633b7059a10a25af47B45409ea47AbC689": true, // claim_admin_1
        ...generalConfigKeepers.mainnet,
      },
      CONFIG_KEEPER: {
        "0x15F9eBC71c539926B8f652a534d29B4Af57CaD55": true, // multisig_1
        "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
        "0x7dCec0356434d03a6071C96347516df3eF4471bB": true, // ConfigSyncer_4
        ...generalConfigKeepers.mainnet,
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
        ...generalConfigKeepers.mainnet,
      },
      ROLE_ADMIN: {
        "0x40794bcBCFb347689fa8c4da69f6405Cf0ECf2C5": true, // TimelockConfig
        "0x358562918FD9F729a8a0fBF1912714397ACd982c": true, // ConfigTimelockController
      },
      ROUTER_PLUGIN: {
        "0xCF2b097517EEBD6c36756A82844D2ec21Ee4C025": true, // ExchangeRouter
        "0x5690C9955b0565eB0287F809eC3666D1aafc5faa": true, // SubaccountRouter
        "0x7Eb4F2f7D4e7C919A698eC5e1C0De0c390126362": true, // GlvRouter
        "0xc8b95239aE78ca9F39A3a7a2A19F0c2d537E2057": true, // GelatoRelayRouter
        "0x5306D63f114240C0825B3268635CaB1Df23fa6c3": true, // SubaccountGelatoRelayRouter
        "0xDa3e6AB64699f159C82acF9bA7216eD57806DFc6": true, // MultichainGlvRouter
        "0xC0d483eD76ceCd52eB44Eb78d813Cf5Ace5138fD": true, // MultichainGmRouter
        "0xDF4fB0eb95f70C3E3EeAdBe5d1074F009d3F0193": true, // MultichainOrderRouter
        "0x3055239CF2aD6f7006C60a6DB509DE7b3b01A0a1": true, // MultichainSubaccountRouter
        "0xba4C3574553BB99bC7D0116CD49DCc757870b68E": true, // MultichainTransferRouter
      },
      TIMELOCK_ADMIN: {
        "0x35ea3066F90Db13e737BBd41f1ED7B4bfF8323b3": true, // timelock_admin_1
        "0xE014cbD60A793901546178E1c16ad9132C927483": true, // timelock_admin_2
        "0x15F9eBC71c539926B8f652a534d29B4Af57CaD55": true, // multisig_1
        "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
      },
      TIMELOCK_MULTISIG: {
        "0x15F9eBC71c539926B8f652a534d29B4Af57CaD55": true, // multisig_1
        "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
      },
      CONTROLLER: {
        "0xD8B7C8227512B1D499A95DC0fe8e2161DF8Cd3E2": true, // Config
        "0xaC5aDA4F66253b03d76DA5682DD37d20d17bDdEf": true, // ConfigSyncer
        "0x358562918FD9F729a8a0fBF1912714397ACd982c": true, // ConfigTimelockController
        "0xc57C155FacCd93F62546F329D1483E0E5b9C1241": true, // MarketFactory
        "0x5d6B84086DA6d4B0b6C0dF7E02f8a6A039226530": true, // GlvFactory
        "0x40794bcBCFb347689fa8c4da69f6405Cf0ECf2C5": true, // TimelockConfig
        "0xA6aC2e08C6d6bbD9B237e0DaaEcd7577996f4e84": true, // OracleStore
        "0xa41379a84DccFB7E253F1401DeAc56114d4fe585": true, // Oracle
        "0xCF2b097517EEBD6c36756A82844D2ec21Ee4C025": true, // ExchangeRouter
        "0x5690C9955b0565eB0287F809eC3666D1aafc5faa": true, // SubaccountRouter
        "0x7Eb4F2f7D4e7C919A698eC5e1C0De0c390126362": true, // GlvRouter
        "0xc8b95239aE78ca9F39A3a7a2A19F0c2d537E2057": true, // GelatoRelayRouter
        "0x5306D63f114240C0825B3268635CaB1Df23fa6c3": true, // SubaccountGelatoRelayRouter
        "0x0e0E33f92A6D90A31ff86597812C46112d98f513": true, // OrderHandler
        "0x87A1B1b89E6094Ba53bd4CBEBC8fd3e888F5a4BD": true, // IncreaseOrderExecutor
        "0xFb8c21E3E00670Ba78788CC42747A779eBf62197": true, // DecreaseOrderExecutor
        "0xaE98A4A92eB95E504eba7CAEB5975D6de7E6E7f9": true, // SwapOrderExecutor
        "0xf778aa5862d1bD4072b4f9465BE753D42ecbF06C": true, // DepositHandler
        "0x3b819FeA8cD4dde6F2b1125f8570cFf163634303": true, // WithdrawalHandler
        "0x18999818d398FF2a189743840e90ee69cc3FfE1F": true, // AdlHandler
        "0xBd6FeAd125C926DF001e5Ca2b0B76e84E04e2AE3": true, // LiquidationHandler
        "0x96F257288f00a9aD8ba159294D373550fE2b6771": true, // ShiftHandler
        "0x36194Db64C1881E44E34e14dc3bb8AfA83B65608": true, // GlvDepositHandler
        "0x7cd6ec81a9b6712da9CC1052a4ed9e39ae25D012": true, // GlvWithdrawalHandler
        "0x13E4Ff24BF48bedE5FF8e29f4Fd947A2271524e3": true, // GlvShiftHandler
        "0xe4B2d546cb49057dB219fE6b382F486Ece8f6671": true, // SwapHandler
        "0xF73CE08A22c67f19d75892457817e917cB3f9493": true, // ClaimHandler
        "0x1A3A103F9F536a0456C9b205152A3ac2b3c54490": true, // FeeHandler
        "0xeb1f997F95D970701B72F4f66DdD8E360c34C762": true, // LayerZeroProvider
        "0xB2C800142e4a4Bb235E027EbbE7d78986000DBb5": true, // MultichainClaimsRouter
        "0xDa3e6AB64699f159C82acF9bA7216eD57806DFc6": true, // MultichainGlvRouter
        "0xC0d483eD76ceCd52eB44Eb78d813Cf5Ace5138fD": true, // MultichainGmRouter
        "0xDF4fB0eb95f70C3E3EeAdBe5d1074F009d3F0193": true, // MultichainOrderRouter
        "0x3055239CF2aD6f7006C60a6DB509DE7b3b01A0a1": true, // MultichainSubaccountRouter
        "0xba4C3574553BB99bC7D0116CD49DCc757870b68E": true, // MultichainTransferRouter
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
      CLAIM_ADMIN: {
        "0x656fa39BdB5984b477FA6aB443195D72D1Accc1c": true, // security_multisig_botanix
        "0x2B5765633b7059a10a25af47B45409ea47AbC689": true, // claim_admin_1
        ...generalConfigKeepers.mainnet,
      },
      CONFIG_KEEPER: {
        "0x656fa39BdB5984b477FA6aB443195D72D1Accc1c": true, // security_multisig_botanix
        ...generalConfigKeepers.mainnet,
      },
      FEE_KEEPER: {
        "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D": true, // fee_keeper_1
      },
      MARKET_KEEPER: {
        ...generalConfigKeepers.mainnet,
      },
      ROLE_ADMIN: {
        "0x8fB97fEfF5f7CfbE9c63D51F6CbBC914E425d965": true, // TimelockConfig
        "0x76B422CBAc36b39c146F7316d6983384a112184A": true, // ConfigTimelockController
      },
      ROUTER_PLUGIN: {
        "0x4F56B6e01b04595ab746a5AB60994d60f6721a43": true, // ExchangeRouter
        "0x07D7C9e1df9E92Dfee48947739d26e8E7a1AAB2c": true, // SubaccountRouter
        "0xfca7F9Dba7a062211b7472110c222B0D00c6E473": true, // GlvRouter
        "0xbDD29dE1ebc45A6d145D2A17370C2A2D13342306": true, // GelatoRelayRouter
        "0x8302b92DD4Ed2A9C06C4CE1a93c0C3879C209189": true, // SubaccountGelatoRelayRouter
        "0x00F6D4c797f56137649c833c952c5096960592Fe": true, // MultichainGlvRouter
        "0x65a481d0003624fAba1167923271F6DD6a7fc022": true, // MultichainGmRouter
        "0x5589294AB319817a02b908F9fdaC883bD8Bd464F": true, // MultichainOrderRouter
        "0x96d565D73D3967Cbf55Ee3d2D66148dBa421F084": true, // MultichainSubaccountRouter
        "0x15e6329F6bD25387F575916b0912D308338672D7": true, // MultichainTransferRouter
      },
      TIMELOCK_ADMIN: {
        "0x35ea3066F90Db13e737BBd41f1ED7B4bfF8323b3": true, // timelock_admin_1
        "0xE014cbD60A793901546178E1c16ad9132C927483": true, // timelock_admin_2
        "0x656fa39BdB5984b477FA6aB443195D72D1Accc1c": true, // security_multisig_botanix
      },
      TIMELOCK_MULTISIG: {
        "0x656fa39BdB5984b477FA6aB443195D72D1Accc1c": true, // multisig_1
      },
      CONTROLLER: {
        "0x12CA21bd73b5887f4d2A0054Ca52510523f18c60": true, // Config
        "0x76B422CBAc36b39c146F7316d6983384a112184A": true, // ConfigTimelockController
        "0xcb7656751B0f8aFCBe15D135D7aC58727DE06768": true, // MarketFactory
        "0x3e04e6b37B23969F3Ca1c2aAc8568322bd90BA90": true, // GlvFactory
        "0x8fB97fEfF5f7CfbE9c63D51F6CbBC914E425d965": true, // TimelockConfig
        "0xfFC63573B55B39b75b1e44e54C308e44505E0D28": true, // OracleStore
        "0x59e1E3e4fa1eE1024C872886CA22A54C0Cf5fd0a": true, // Oracle
        "0x4F56B6e01b04595ab746a5AB60994d60f6721a43": true, // ExchangeRouter
        "0x07D7C9e1df9E92Dfee48947739d26e8E7a1AAB2c": true, // SubaccountRouter
        "0xfca7F9Dba7a062211b7472110c222B0D00c6E473": true, // GlvRouter
        "0xbDD29dE1ebc45A6d145D2A17370C2A2D13342306": true, // GelatoRelayRouter
        "0x8302b92DD4Ed2A9C06C4CE1a93c0C3879C209189": true, // SubaccountGelatoRelayRouter
        "0xd30a5fC507A056Be92f60717E6813d3aB218E91a": true, // OrderHandler
        "0x6eD6d7eD1222715BA9e4B9b3fee67dD861b789B0": true, // IncreaseOrderExecutor
        "0x51A6eb58CC3deB81b58d839B3CFdF6cFb15c2Deb": true, // DecreaseOrderExecutor
        "0xd0019538C1eeCCc071443e94451AED0E740F31Ae": true, // SwapOrderExecutor
        "0x128D33cC71622a08E7C5be346Dd72A9f869817A9": true, // DepositHandler
        "0x560197128BB2b4F881882F93aa7440eCaCc647Bc": true, // WithdrawalHandler
        "0x873a5C880bd07A080e555aCF6556E3c983f8760c": true, // AdlHandler
        "0xDfd24fE77c79723c1170C3eb51fb3245574E40A9": true, // LiquidationHandler
        "0x3d0453036F3e39FF9384F0e1c8a59B17e05277d0": true, // ShiftHandler
        "0xEcDF2cE74e19D4921Cc89fEfb963D35E0E5171D3": true, // GlvDepositHandler
        "0xB434d2453DefA14a8f14214082661014B36Ae970": true, // GlvWithdrawalHandler
        "0x783ECc9d0dbf5E362A486Ab96c6a32008548294c": true, // GlvShiftHandler
        "0xb6bb29B8a71bBDba0cD8C9d8a64bCEc0125Cf75e": true, // SwapHandler
        "0xf393034452B837535689a97a6a7ec98Bfb261C76": true, // ClaimHandler
        "0xB244B596E67BB23d3C18753489a4d487f9b1B1cF": true, // LayerZeroProvider
        "0x99FeA262baC7bfE6DD7abE46731240b62c23dDcc": true, // MultichainClaimsRouter
        "0x00F6D4c797f56137649c833c952c5096960592Fe": true, // MultichainGlvRouter
        "0x65a481d0003624fAba1167923271F6DD6a7fc022": true, // MultichainGmRouter
        "0x5589294AB319817a02b908F9fdaC883bD8Bd464F": true, // MultichainOrderRouter
        "0x96d565D73D3967Cbf55Ee3d2D66148dBa421F084": true, // MultichainSubaccountRouter
        "0x15e6329F6bD25387F575916b0912D308338672D7": true, // MultichainTransferRouter
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
