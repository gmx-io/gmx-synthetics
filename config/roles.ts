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
        "0xd41e09434CDFe20ceA9411f55D86dDb314b6Af94": true, // ConfigSyncer
        ...generalConfigKeepers.mainnet,
      },
      FEE_KEEPER: {
        "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D": true, // fee_keeper_1
      },
      MARKET_KEEPER: {
        ...generalConfigKeepers.mainnet,
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
      GOV_TOKEN_CONTROLLER: {
        "0x5E4766F932ce00aA4a1A82d3Da85adf15C5694A1": true, // RewardRouterV2
      },
      CONTROLLER: {
        "0xf5F30B10141E1F63FC11eD772931A8294a591996": true, // MarketFactory
        "0xdaFa7Deb67805d7498Aa926002bB2d713D1d9256": true, // GlvFactory
        "0xA8AF9B86fC47deAde1bc66B12673706615E2B011": true, // OracleStore
        "0x7EB417637a3E6d1C19E6d69158c47610b7a5d9B3": true, // FeeHandler

        "0x1d3dbe2F913dcA27E943b2837A4Cdad6653B02E2": true, // Config
        "0xd41e09434CDFe20ceA9411f55D86dDb314b6Af94": true, // ConfigSyncer
        "0x8c6e20A2211D1b70cD7c0789EcE44fDB19567621": true, // ConfigTimelockController
        "0xC181eB022F33b8ba808AD96348B03e8A753A859b": true, // TimelockConfig
        "0x7F01614cA5198Ec979B1aAd1DAF0DE7e0a215BDF": true, // Oracle
        "0x87d66368cD08a7Ca42252f5ab44B2fb6d1Fb8d15": true, // ExchangeRouter
        "0x5b9A353F18d543B9F8a57B2AE50a4FBc80033EC1": true, // SubaccountRouter
        "0x10Fa5Bd343373101654E896B43Ca38Fd8f3789F9": true, // GlvRouter
        "0x0C08518C41755C6907135266dCCf09d51aE53CC4": true, // GelatoRelayRouter
        "0xA1D94802EcD642051B677dBF37c8E78ce6dd3784": true, // SubaccountGelatoRelayRouter
        "0x04315E233C1c6FfA61080B76E29d5e8a1f7B4A35": true, // OrderHandler
        "0x1DAa9A375132a3cDe9133B0a5DA67B57Ef21d102": true, // IncreaseOrderExecutor
        "0x3F4ee93723C2F14eeC5a44a2Cb66edA006A171fd": true, // DecreaseOrderExecutor
        "0x455D555350D5CcCD1E3Eb3D563B411Ef24697050": true, // SwapOrderExecutor
        "0x563E8cDB5Ba929039c2Bb693B78CE12dC0AAfaDa": true, // DepositHandler
        "0x1EC018d2b6ACCA20a0bEDb86450b7E27D1D8355B": true, // WithdrawalHandler
        "0xDd20D75f92bF27e17d86D74424ce7435843E8df0": true, // AdlHandler
        "0xdFc557EdF817bCd69F3b82d54f6338ecad2667CA": true, // LiquidationHandler
        "0x763fD06BaF6bBcE1A06ab94C6dFd13813E517938": true, // ShiftHandler
        "0xBB4C47CDfb90e281cAAE873c9531A25eBe2eD343": true, // GlvDepositHandler
        "0x7A74946892569Fd488012D015436a5a9cBf37BEf": true, // GlvWithdrawalHandler
        "0x632b763B31f9A1cB28c4f93925A591Cd34073AD6": true, // GlvShiftHandler
        "0xDb2AB9566732710d02b23325F79A8832118b97c5": true, // SwapHandler
        "0x28f1F4AA95F49FAB62464536A269437B13d48976": true, // ClaimHandler
        "0x7129Ea01F0826c705d6F7ab01Cf3C06bb83E9397": true, // LayerZeroProvider
        "0x2A7244EE5373D2F161cE99F0D144c12860D651Af": true, // MultichainClaimsRouter
        "0xFdaFa6fbd4B480017FD37205Cb3A24AE93823956": true, // MultichainGlvRouter
        "0xF53e30CE07f148fdE6e531Be7dC0b6ad670E8C6e": true, // MultichainGmRouter
        "0x3c796504d47013Ea0552CCa57373B59DF03D34a0": true, // MultichainOrderRouter
        "0x99CD306B777C5aAb842bA65e4f7FF0554ECDe808": true, // MultichainSubaccountRouter
        "0xC1D1354A948bf717d6d873e5c0bE614359AF954D": true, // MultichainTransferRouter
      },
      ROUTER_PLUGIN: {
        "0x87d66368cD08a7Ca42252f5ab44B2fb6d1Fb8d15": true, // ExchangeRouter
        "0x5b9A353F18d543B9F8a57B2AE50a4FBc80033EC1": true, // SubaccountRouter
        "0x10Fa5Bd343373101654E896B43Ca38Fd8f3789F9": true, // GlvRouter
        "0x0C08518C41755C6907135266dCCf09d51aE53CC4": true, // GelatoRelayRouter
        "0xA1D94802EcD642051B677dBF37c8E78ce6dd3784": true, // SubaccountGelatoRelayRouter
        "0xFdaFa6fbd4B480017FD37205Cb3A24AE93823956": true, // MultichainGlvRouter
        "0xF53e30CE07f148fdE6e531Be7dC0b6ad670E8C6e": true, // MultichainGmRouter
        "0x3c796504d47013Ea0552CCa57373B59DF03D34a0": true, // MultichainOrderRouter
        "0x99CD306B777C5aAb842bA65e4f7FF0554ECDe808": true, // MultichainSubaccountRouter
        "0xC1D1354A948bf717d6d873e5c0bE614359AF954D": true, // MultichainTransferRouter
      },
      ROLE_ADMIN: {
        "0xC181eB022F33b8ba808AD96348B03e8A753A859b": true, // TimelockConfig
        "0x8c6e20A2211D1b70cD7c0789EcE44fDB19567621": true, // ConfigTimelockController
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
      GOV_TOKEN_CONTROLLER: {
        "0x091eD806490Cc58Fd514441499e58984cCce0630": true, // RewardRouterV2_2
      },
      CONTROLLER: {
        "0xc57C155FacCd93F62546F329D1483E0E5b9C1241": true, // MarketFactory
        "0x5d6B84086DA6d4B0b6C0dF7E02f8a6A039226530": true, // GlvFactory
        "0xA6aC2e08C6d6bbD9B237e0DaaEcd7577996f4e84": true, // OracleStore
        "0x1A3A103F9F536a0456C9b205152A3ac2b3c54490": true, // FeeHandler

        "0xA421Fa4581b37CAE2E43502D205460a57B7D7a4b": true, // Config
        "0x372aaDF1921c6f92346a4D5E9E5186bd00fF0562": true, // ConfigSyncer
        "0xB8cAEF9245cbd9064a50830f8330B0D3a5d0D206": true, // ConfigTimelockController
        "0xdD67459D3e98EdDAA9770EbB7C38fF8F643f229f": true, // TimelockConfig
        "0xE1d5a068c5b75E0c7Ea1A9Fe8EA056f9356C6fFD": true, // Oracle
        "0xF0864BE1C39C0AB28a8f1918BC8321beF8F7C317": true, // ExchangeRouter
        "0x88a5c6D94634Abd7745f5348e5D8C42868ed4AC3": true, // SubaccountRouter
        "0x4729D9f61c0159F5e02D2C2e5937B3225e55442C": true, // GlvRouter
        "0xa61f92ab63cc5C3d60574d40A6e73861c37aaC95": true, // GelatoRelayRouter
        "0x58b09FD12863218F2ca156808C2Ae48aaCD0c072": true, // SubaccountGelatoRelayRouter
        "0xDd20D75f92bF27e17d86D74424ce7435843E8df0": true, // OrderHandler
        "0x24F52966Fc663b3e206f0DCbD40b6FF2df567880": true, // IncreaseOrderExecutor
        "0x74bfc9c1E496D96bbAF87A8231aAD1c79DDbf7bA": true, // DecreaseOrderExecutor
        "0x459058505A7c7252efE93aa69D03F6198601DA9e": true, // SwapOrderExecutor
        "0x640dFe87059fEe3Ad59132ABb858191D7Fa5B219": true, // DepositHandler
        "0x87d66368cD08a7Ca42252f5ab44B2fb6d1Fb8d15": true, // WithdrawalHandler
        "0x2954C692cc26EF139f3B01435cd901A39a8cA830": true, // AdlHandler
        "0x2e5D10A48C00cFcc6A31af873118d739323Ff71B": true, // LiquidationHandler
        "0x0C08518C41755C6907135266dCCf09d51aE53CC4": true, // ShiftHandler
        "0x632b763B31f9A1cB28c4f93925A591Cd34073AD6": true, // GlvDepositHandler
        "0xdFc557EdF817bCd69F3b82d54f6338ecad2667CA": true, // GlvWithdrawalHandler
        "0xF6e667bD3C914A336aFB57C38ABbF6ef41e2e7c8": true, // GlvShiftHandler
        "0x0AF4d7c87339d3A4b40233439A4aBE13d97007f9": true, // SwapHandler
        "0x7FfedCAC2eCb2C29dDc027B60D6F8107295Ff2eA": true, // ClaimHandler
        "0xA1D94802EcD642051B677dBF37c8E78ce6dd3784": true, // LayerZeroProvider
        "0x9080f8A35Da53F4200a68533FB1dC1cA05357bDB": true, // MultichainClaimsRouter
        "0x2A7244EE5373D2F161cE99F0D144c12860D651Af": true, // MultichainGlvRouter
        "0x10Fa5Bd343373101654E896B43Ca38Fd8f3789F9": true, // MultichainGmRouter
        "0x99CD306B777C5aAb842bA65e4f7FF0554ECDe808": true, // MultichainOrderRouter
        "0xB36a4c6cDeDea3f31b3d16F33553F93b96b178F4": true, // MultichainSubaccountRouter
        "0x8c6e20A2211D1b70cD7c0789EcE44fDB19567621": true, // MultichainTransferRouter
      },
      ROUTER_PLUGIN: {
        "0xF0864BE1C39C0AB28a8f1918BC8321beF8F7C317": true, // ExchangeRouter
        "0x88a5c6D94634Abd7745f5348e5D8C42868ed4AC3": true, // SubaccountRouter
        "0x4729D9f61c0159F5e02D2C2e5937B3225e55442C": true, // GlvRouter
        "0xa61f92ab63cc5C3d60574d40A6e73861c37aaC95": true, // GelatoRelayRouter
        "0x58b09FD12863218F2ca156808C2Ae48aaCD0c072": true, // SubaccountGelatoRelayRouter
        "0x2A7244EE5373D2F161cE99F0D144c12860D651Af": true, // MultichainGlvRouter
        "0x10Fa5Bd343373101654E896B43Ca38Fd8f3789F9": true, // MultichainGmRouter
        "0x99CD306B777C5aAb842bA65e4f7FF0554ECDe808": true, // MultichainOrderRouter
        "0xB36a4c6cDeDea3f31b3d16F33553F93b96b178F4": true, // MultichainSubaccountRouter
        "0x8c6e20A2211D1b70cD7c0789EcE44fDB19567621": true, // MultichainTransferRouter
      },
      ROLE_ADMIN: {
        "0xdD67459D3e98EdDAA9770EbB7C38fF8F643f229f": true, // TimelockConfig
        "0xB8cAEF9245cbd9064a50830f8330B0D3a5d0D206": true, // ConfigTimelockController
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
      TIMELOCK_ADMIN: {
        "0x35ea3066F90Db13e737BBd41f1ED7B4bfF8323b3": true, // timelock_admin_1
        "0xE014cbD60A793901546178E1c16ad9132C927483": true, // timelock_admin_2
        "0x656fa39BdB5984b477FA6aB443195D72D1Accc1c": true, // security_multisig_botanix
      },
      TIMELOCK_MULTISIG: {
        "0x656fa39BdB5984b477FA6aB443195D72D1Accc1c": true, // multisig_1
      },
      GOV_TOKEN_CONTROLLER: {},
      CONTROLLER: {
        "0xcb7656751B0f8aFCBe15D135D7aC58727DE06768": true, // MarketFactory
        "0x3e04e6b37B23969F3Ca1c2aAc8568322bd90BA90": true, // GlvFactory
        "0xfFC63573B55B39b75b1e44e54C308e44505E0D28": true, // OracleStore

        "0xB65F74fBa4E2A5db9302b33FB4459AbBC593370f": true, // Config
        "0xB4085c68765bEAf991D3e4EEbC48427EDECBA778": true, // ConfigTimelockController
        "0xc7D8E3561f1247EBDa491bA5f042699C2807C33C": true, // TimelockConfig
        "0x40d680E41FC4Bf973F0EA664981f6359195a6383": true, // Oracle
        "0x72fa3978E2E330C7B2debc23CB676A3ae63333F6": true, // ExchangeRouter
        "0x11E590f6092D557bF71BaDEd50D81521674F8275": true, // SubaccountRouter
        "0x348Eca94e7c6F35430aF1cAccE27C29E9Bef9ae3": true, // GlvRouter
        "0x7f8eF83C92B48a4B5B954A24D98a6cD0Ed4D160a": true, // GelatoRelayRouter
        "0xfbb9C41046E27405224a911f44602C3667f9D8f6": true, // SubaccountGelatoRelayRouter
        "0xb92b643950f57d0aCCf79950d6436557c869c5F8": true, // OrderHandler
        "0x4f97e3589aE036e95F7ec091f0B373576987A01d": true, // IncreaseOrderExecutor
        "0xa3c7575c56DA54b6e04DB4e4a9eE28bD670e2ba9": true, // DecreaseOrderExecutor
        "0x61B6ae0dd5f5F4fC79D94f118fd4ab2864f0eEf9": true, // SwapOrderExecutor
        "0x17b80086D9b00f1eE4C245409b03383e9cee2A7E": true, // DepositHandler
        "0x5104257d85df1aF13b267e161E289847dd8950C6": true, // WithdrawalHandler
        "0xb5fbb36853a136DD5DFf9314c48dF6AC0278dc72": true, // AdlHandler
        "0x6EBfF697250ae729AD0752f5Ca6CE98Bc62D4213": true, // LiquidationHandler
        "0x0eaAbf9234333FF67CB8FDBc3Dafe13F7E7c2B71": true, // ShiftHandler
        "0x80EDF3eA04D30FEc027C4B397ab034D7FA98b894": true, // GlvDepositHandler
        "0x090FA7eb8B4647DaDbEA315E68f8f88e8E62Bd54": true, // GlvWithdrawalHandler
        "0x8622db0e78671e3C5696AF763D6679dE5c18890c": true, // GlvShiftHandler
        "0xf6BE2059947535c12615FDb642583A3547550eb7": true, // SwapHandler
        "0x3cA0F3AD78A9d0b2a0c060fE86D1141118A285c4": true, // ClaimHandler
        "0x61af99b07995cb7Ee8c2FACF6D8fb6042FeAA0d9": true, // LayerZeroProvider
        "0x790Ee987b9B253374d700b07F16347a7d4C4ff2e": true, // MultichainClaimsRouter
        "0xEE027373517a6D96Fe62f70E9A0A395cB5a39Eee": true, // MultichainGlvRouter
        "0x4ef8394CD5DD7E3EE6D30824689eF461783a3360": true, // MultichainGmRouter
        "0x5c5DBbcDf420B5d81d4FfDBa5b26Eb24E6E60d52": true, // MultichainOrderRouter
        "0xd3B6E962f135634C43415d57A28E688Fb4f15A58": true, // MultichainSubaccountRouter
        "0x901f26a57edCe65Ef3FBcCD260433De9B2279852": true, // MultichainTransferRouter
      },
      ROUTER_PLUGIN: {
        "0x72fa3978E2E330C7B2debc23CB676A3ae63333F6": true, // ExchangeRouter
        "0x11E590f6092D557bF71BaDEd50D81521674F8275": true, // SubaccountRouter
        "0x348Eca94e7c6F35430aF1cAccE27C29E9Bef9ae3": true, // GlvRouter
        "0x7f8eF83C92B48a4B5B954A24D98a6cD0Ed4D160a": true, // GelatoRelayRouter
        "0xfbb9C41046E27405224a911f44602C3667f9D8f6": true, // SubaccountGelatoRelayRouter
        "0xEE027373517a6D96Fe62f70E9A0A395cB5a39Eee": true, // MultichainGlvRouter
        "0x4ef8394CD5DD7E3EE6D30824689eF461783a3360": true, // MultichainGmRouter
        "0x5c5DBbcDf420B5d81d4FfDBa5b26Eb24E6E60d52": true, // MultichainOrderRouter
        "0xd3B6E962f135634C43415d57A28E688Fb4f15A58": true, // MultichainSubaccountRouter
        "0x901f26a57edCe65Ef3FBcCD260433De9B2279852": true, // MultichainTransferRouter
      },
      ROLE_ADMIN: {
        "0xc7D8E3561f1247EBDa491bA5f042699C2807C33C": true, // TimelockConfig
        "0xB4085c68765bEAf991D3e4EEbC48427EDECBA778": true, // ConfigTimelockController
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
