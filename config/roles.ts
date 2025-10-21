import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as roleConfigs from "./roleConfigs";

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
    "ContributorHandler",

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
      "0xF86EF7f0BB90a05A932781C5Cb6eEFe55e486107": true, // general_keeper_4
    },
  };

  const claimAdmins = {
    mainnet: {
      "0x2B5765633b7059a10a25af47B45409ea47AbC689": true, // claim_admin_1
      "0xD2E217d800C41c86De1e01FD72009d4Eafc539a3": true, // claim_admin_2
      "0xc5e038d696d9cB757fFdf53AA34e515D0e42f7cd": true, // claim_admin_3
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

  const roleInfo = { syntheticKeepers, chainlinkKeepers, gelatoKeepers, generalConfigKeepers, claimAdmins };

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
    arbitrum: roleConfigs.arbitrum(roleInfo),
    avalanche: roleConfigs.avalanche(roleInfo),
    botanix: roleConfigs.botanix(roleInfo),
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
