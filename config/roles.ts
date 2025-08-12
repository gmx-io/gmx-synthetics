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
    localhost: {
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
        "0xd41e09434CDFe20ceA9411f55D86dDb314b6Af94": true, // ConfigSyncer
        ...generalConfigKeepers.mainnet,
      },
      FEE_KEEPER: {
        "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D": true, // fee_keeper_1
      },
      MARKET_KEEPER: {
        ...generalConfigKeepers.mainnet,
      },
      ROLE_ADMIN: {
        "0x902826eeBc07eC37B077e28De1068aADd0F10a7F": true, // TimelockConfig
        "0xeF7463039E1116f875AD72fA567e91511D6A8F5E": true, // ConfigTimelockController
      },
      ROUTER_PLUGIN: {
        "0xa1b7693222eB522D847A756F440A7c34937344E0": true, // ExchangeRouter
        "0x1258AB791230412Dc862CE0cA46f2bF307386D03": true, // SubaccountRouter
        "0x0F012e736e63eAb4e326595055a33279633DaA93": true, // GlvRouter
        "0x72d9Ee15220BC28A8b0dfa30Ef3F671b03Df274e": true, // GelatoRelayRouter
        "0x56Bd17a72cDBb15D9eb3600D7E8F22B0e8220C82": true, // SubaccountGelatoRelayRouter
        "0xACfFe89487495C175C7D517105dF5949504fdC03": true, // MultichainGlvRouter
        "0x707E86926cfDb526f023308898d1915a87D23205": true, // MultichainGmRouter
        "0x2bE05D69c59b0F7aaE0c6E955A5F9a52aCA6a4a8": true, // MultichainOrderRouter
        "0x76bf0940cc05AEB968919dB5B0f1759726bFC7dB": true, // MultichainSubaccountRouter
        "0x4B3251Fe0f0502DB4Fe5caa6B7f14eB5D2ae3ab3": true, // MultichainTransferRouter
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
        "0xf5F30B10141E1F63FC11eD772931A8294a591996": true, // MarketFactory
        "0xdaFa7Deb67805d7498Aa926002bB2d713D1d9256": true, // GlvFactory
        "0xA8AF9B86fC47deAde1bc66B12673706615E2B011": true, // OracleStore
        "0x6D5F3c723002847B009D07Fe8e17d6958F153E4e": true, // Oracle
        "0x7EB417637a3E6d1C19E6d69158c47610b7a5d9B3": true, // FeeHandler

        "0x1d3dbe2F913dcA27E943b2837A4Cdad6653B02E2": true, // Config
        "0xd41e09434CDFe20ceA9411f55D86dDb314b6Af94": true, // ConfigSyncer
        "0xeF7463039E1116f875AD72fA567e91511D6A8F5E": true, // ConfigTimelockController
        "0x902826eeBc07eC37B077e28De1068aADd0F10a7F": true, // TimelockConfig
        "0xa1b7693222eB522D847A756F440A7c34937344E0": true, // ExchangeRouter
        "0x1258AB791230412Dc862CE0cA46f2bF307386D03": true, // SubaccountRouter
        "0x0F012e736e63eAb4e326595055a33279633DaA93": true, // GlvRouter
        "0x72d9Ee15220BC28A8b0dfa30Ef3F671b03Df274e": true, // GelatoRelayRouter
        "0x56Bd17a72cDBb15D9eb3600D7E8F22B0e8220C82": true, // SubaccountGelatoRelayRouter
        "0x6CCd77F770E7213C584fF8bfbf47C7A0BdA30665": true, // OrderHandler
        "0x1DAa9A375132a3cDe9133B0a5DA67B57Ef21d102": true, // IncreaseOrderExecutor
        "0x3F4ee93723C2F14eeC5a44a2Cb66edA006A171fd": true, // DecreaseOrderExecutor
        "0x455D555350D5CcCD1E3Eb3D563B411Ef24697050": true, // SwapOrderExecutor
        "0x2571197BbEA0547477eDde419CF910802Dfc583f": true, // DepositHandler
        "0xa82b86EA8db3E60287D674Cc800D961608245089": true, // WithdrawalHandler
        "0x7548914962E776e6DB3464cfEa4732165144163B": true, // AdlHandler
        "0xD4BbE0fc95FEb69400C47F05b86a7d1B63272fAB": true, // LiquidationHandler
        "0x8b28a7a084D809Bbfe6B49aDdB1890aFBbae6E51": true, // ShiftHandler
        "0xFedDB63759f275061Ce088F51caff727Fd782401": true, // GlvDepositHandler
        "0x694714CcDaFf7ff13E1b9E2c68C324ef1B95E965": true, // GlvWithdrawalHandler
        "0x372aaDF1921c6f92346a4D5E9E5186bd00fF0562": true, // GlvShiftHandler
        "0xDb2AB9566732710d02b23325F79A8832118b97c5": true, // SwapHandler
        "0x28f1F4AA95F49FAB62464536A269437B13d48976": true, // ClaimHandler
        "0x70a21A5B6D191DcAA4A1F1964e7D947eDF95ABD3": true, // LayerZeroProvider
        "0x529C80A39f71Ed70A964E700827B529142A1FA8d": true, // MultichainClaimsRouter
        "0xACfFe89487495C175C7D517105dF5949504fdC03": true, // MultichainGlvRouter
        "0x707E86926cfDb526f023308898d1915a87D23205": true, // MultichainGmRouter
        "0x2bE05D69c59b0F7aaE0c6E955A5F9a52aCA6a4a8": true, // MultichainOrderRouter
        "0x76bf0940cc05AEB968919dB5B0f1759726bFC7dB": true, // MultichainSubaccountRouter
        "0x4B3251Fe0f0502DB4Fe5caa6B7f14eB5D2ae3ab3": true, // MultichainTransferRouter
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
        "0x372aaDF1921c6f92346a4D5E9E5186bd00fF0562": true, // ConfigSyncer
        ...generalConfigKeepers.mainnet,
      },
      FEE_KEEPER: {
        "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D": true, // fee_keeper_1
      },
      MARKET_KEEPER: {
        ...generalConfigKeepers.mainnet,
      },
      ROLE_ADMIN: {
        "0xBB4C47CDfb90e281cAAE873c9531A25eBe2eD343": true, // TimelockConfig
        "0xD4BbE0fc95FEb69400C47F05b86a7d1B63272fAB": true, // ConfigTimelockController
      },
      ROUTER_PLUGIN: {
        "0x76bf0940cc05AEB968919dB5B0f1759726bFC7dB": true, // ExchangeRouter
        "0xF53e30CE07f148fdE6e531Be7dC0b6ad670E8C6e": true, // SubaccountRouter
        "0x1e6E449F4052dB43eDbDa8B7b9c82a489a5a1550": true, // GlvRouter
        "0x698ef7eb7A46458e1f9B9181354955809baD5A6F": true, // GelatoRelayRouter
        "0x763fD06BaF6bBcE1A06ab94C6dFd13813E517938": true, // SubaccountGelatoRelayRouter
        "0xcb25512d99F99DCf55D5FFAf300FB9Ab0a70268a": true, // MultichainGlvRouter
        "0x70a21A5B6D191DcAA4A1F1964e7D947eDF95ABD3": true, // MultichainGmRouter
        "0xa1b7693222eB522D847A756F440A7c34937344E0": true, // MultichainOrderRouter
        "0xA35F32e86Ba98a2dF7f04E66EfBB8dbC6F6abd85": true, // MultichainSubaccountRouter
        "0x707E86926cfDb526f023308898d1915a87D23205": true, // MultichainTransferRouter
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
        "0xc57C155FacCd93F62546F329D1483E0E5b9C1241": true, // MarketFactory
        "0x5d6B84086DA6d4B0b6C0dF7E02f8a6A039226530": true, // GlvFactory
        "0xA6aC2e08C6d6bbD9B237e0DaaEcd7577996f4e84": true, // OracleStore
        "0xa41379a84DccFB7E253F1401DeAc56114d4fe585": true, // Oracle
        "0x1A3A103F9F536a0456C9b205152A3ac2b3c54490": true, // FeeHandler

        "0xA421Fa4581b37CAE2E43502D205460a57B7D7a4b": true, // Config
        "0x372aaDF1921c6f92346a4D5E9E5186bd00fF0562": true, // ConfigSyncer
        "0xD4BbE0fc95FEb69400C47F05b86a7d1B63272fAB": true, // ConfigTimelockController
        "0xBB4C47CDfb90e281cAAE873c9531A25eBe2eD343": true, // TimelockConfig
        "0x76bf0940cc05AEB968919dB5B0f1759726bFC7dB": true, // ExchangeRouter
        "0xF53e30CE07f148fdE6e531Be7dC0b6ad670E8C6e": true, // SubaccountRouter
        "0x1e6E449F4052dB43eDbDa8B7b9c82a489a5a1550": true, // GlvRouter
        "0x698ef7eb7A46458e1f9B9181354955809baD5A6F": true, // GelatoRelayRouter
        "0x763fD06BaF6bBcE1A06ab94C6dFd13813E517938": true, // SubaccountGelatoRelayRouter
        "0x41E1D594a9fCF6d2eA17D284C6F44C24b303aeAe": true, // OrderHandler
        "0x24F52966Fc663b3e206f0DCbD40b6FF2df567880": true, // IncreaseOrderExecutor
        "0x74bfc9c1E496D96bbAF87A8231aAD1c79DDbf7bA": true, // DecreaseOrderExecutor
        "0x459058505A7c7252efE93aa69D03F6198601DA9e": true, // SwapOrderExecutor
        "0x834bd4c8e48f32cf9d9EEE1AC6974d5C8F823a5C": true, // DepositHandler
        "0x605129e6aCff81e424313AAff7Fa94F6a91ab1FF": true, // WithdrawalHandler
        "0x0F012e736e63eAb4e326595055a33279633DaA93": true, // AdlHandler
        "0x902826eeBc07eC37B077e28De1068aADd0F10a7F": true, // LiquidationHandler
        "0x2bE05D69c59b0F7aaE0c6E955A5F9a52aCA6a4a8": true, // ShiftHandler
        "0x87a0d100b4F9b2A53353974c3596eEC33de8060f": true, // GlvDepositHandler
        "0xf7f8FbF59d6b7318CB5d3B023AD4196Fa16dc723": true, // GlvWithdrawalHandler
        "0x56Bd17a72cDBb15D9eb3600D7E8F22B0e8220C82": true, // GlvShiftHandler
        "0x0AF4d7c87339d3A4b40233439A4aBE13d97007f9": true, // SwapHandler
        "0x7FfedCAC2eCb2C29dDc027B60D6F8107295Ff2eA": true, // ClaimHandler
        "0x72d9Ee15220BC28A8b0dfa30Ef3F671b03Df274e": true, // LayerZeroProvider
        "0x36d3E27b20f40A6149e04eB2429054C60Acc0016": true, // MultichainClaimsRouter
        "0xcb25512d99F99DCf55D5FFAf300FB9Ab0a70268a": true, // MultichainGlvRouter
        "0x70a21A5B6D191DcAA4A1F1964e7D947eDF95ABD3": true, // MultichainGmRouter
        "0xa1b7693222eB522D847A756F440A7c34937344E0": true, // MultichainOrderRouter
        "0xA35F32e86Ba98a2dF7f04E66EfBB8dbC6F6abd85": true, // MultichainSubaccountRouter
        "0x707E86926cfDb526f023308898d1915a87D23205": true, // MultichainTransferRouter
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
        "0x094eD353aa973Aaa8aC41ac27B57136a6f1de539": true, // TimelockConfig
        "0xe4d8f6200a7EAE50364205dbd042501e97f4f619": true, // ConfigTimelockController
      },
      ROUTER_PLUGIN: {
        "0x9a90654676ec3adE04C40D60e939925400DAD00d": true, // ExchangeRouter
        "0x02391482c3837C92fC51277cf7d78a179ba647C3": true, // SubaccountRouter
        "0x2FfeAedBA234AADE260Ec978d7FB95FcF36A4BeE": true, // GlvRouter
        "0xF633986dC3e7FC7aBAB93735ed699AA3d20FD6af": true, // GelatoRelayRouter
        "0xA42677E4974Ab236B72D71C3102493B484Ef39c6": true, // SubaccountGelatoRelayRouter
        "0xfaA8FeA0d7A43826F34213C9EC26f0ED44F1fA34": true, // MultichainGlvRouter
        "0xFC1A0deDA35Ba1528f669F641FfD313927CfE3de": true, // MultichainGmRouter
        "0xFf0aa22F3d009B65F511813ab12E340fB28Cc02d": true, // MultichainOrderRouter
        "0x1771EeeC42DA492F2294010eC5292E9bCe25f288": true, // MultichainSubaccountRouter
        "0x854AD2894658c5CdBcBf04d6aBb4b5680406BFB5": true, // MultichainTransferRouter
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
        "0xcb7656751B0f8aFCBe15D135D7aC58727DE06768": true, // MarketFactory
        "0x3e04e6b37B23969F3Ca1c2aAc8568322bd90BA90": true, // GlvFactory
        "0xfFC63573B55B39b75b1e44e54C308e44505E0D28": true, // OracleStore
        "0x59e1E3e4fa1eE1024C872886CA22A54C0Cf5fd0a": true, // Oracle

        "0xB65F74fBa4E2A5db9302b33FB4459AbBC593370f": true, // Config
        "0xe4d8f6200a7EAE50364205dbd042501e97f4f619": true, // ConfigTimelockController
        "0x094eD353aa973Aaa8aC41ac27B57136a6f1de539": true, // TimelockConfig
        "0x9a90654676ec3adE04C40D60e939925400DAD00d": true, // ExchangeRouter
        "0x02391482c3837C92fC51277cf7d78a179ba647C3": true, // SubaccountRouter
        "0x2FfeAedBA234AADE260Ec978d7FB95FcF36A4BeE": true, // GlvRouter
        "0xF633986dC3e7FC7aBAB93735ed699AA3d20FD6af": true, // GelatoRelayRouter
        "0xA42677E4974Ab236B72D71C3102493B484Ef39c6": true, // SubaccountGelatoRelayRouter
        "0x0e12Ba843A09E529a8C34aec4AAf46CD6e271801": true, // OrderHandler
        "0x4f97e3589aE036e95F7ec091f0B373576987A01d": true, // IncreaseOrderExecutor
        "0xa3c7575c56DA54b6e04DB4e4a9eE28bD670e2ba9": true, // DecreaseOrderExecutor
        "0x61B6ae0dd5f5F4fC79D94f118fd4ab2864f0eEf9": true, // SwapOrderExecutor
        "0x806751B108A3A0387A1EC21b2375Bc3a0825D751": true, // DepositHandler
        "0x44c16F2A62A4402D24AE18dCa877ef1970AC5d7a": true, // WithdrawalHandler
        "0x74EfBb7eBA014F6C6520dB6ddf82Ff58fF0237F4": true, // AdlHandler
        "0x052269a1abdDd768aa7081ba3A3E23F130252de6": true, // LiquidationHandler
        "0x66252873Afb95d83F6CF588252DC539e6eA829BB": true, // ShiftHandler
        "0xF839A5263F24BDA3b788032EB3C91Ed671571402": true, // GlvDepositHandler
        "0x4724F954De8cCf5bbE1F47ae4Fa9a20159bbCB8D": true, // GlvWithdrawalHandler
        "0x63b8301D9b00FDFc8Ab9D892887032402dc50a72": true, // GlvShiftHandler
        "0xf6BE2059947535c12615FDb642583A3547550eb7": true, // SwapHandler
        "0x3cA0F3AD78A9d0b2a0c060fE86D1141118A285c4": true, // ClaimHandler
        "0x3094A2E3DaAeB0b91985570BDfa318Ed3b0e9480": true, // LayerZeroProvider
        "0x100E1BC2503e1D876B1850470314BC3261772147": true, // MultichainClaimsRouter
        "0xfaA8FeA0d7A43826F34213C9EC26f0ED44F1fA34": true, // MultichainGlvRouter
        "0xFC1A0deDA35Ba1528f669F641FfD313927CfE3de": true, // MultichainGmRouter
        "0xFf0aa22F3d009B65F511813ab12E340fB28Cc02d": true, // MultichainOrderRouter
        "0x1771EeeC42DA492F2294010eC5292E9bCe25f288": true, // MultichainSubaccountRouter
        "0x854AD2894658c5CdBcBf04d6aBb4b5680406BFB5": true, // MultichainTransferRouter
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
