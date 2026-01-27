export function getRoles({ syntheticKeepers, generalConfigKeepers, claimAdmins }) {
  return {
    ADL_KEEPER: syntheticKeepers.mainnet,
    FROZEN_ORDER_KEEPER: syntheticKeepers.mainnet,
    LIQUIDATION_KEEPER: syntheticKeepers.mainnet,
    ORDER_KEEPER: syntheticKeepers.mainnet,
    LIMITED_CONFIG_KEEPER: syntheticKeepers.mainnet,
    CLAIM_ADMIN: {
      ...claimAdmins.mainnet,
      ...generalConfigKeepers.mainnet,
    },
    CONFIG_KEEPER: {
      ...generalConfigKeepers.mainnet,
      "0xE7BfFf2aB721264887230037940490351700a068": true, // TEMP: deployer
    },
    FEE_KEEPER: {
      "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D": true, // fee_keeper_1
    },
    MARKET_KEEPER: {
      ...generalConfigKeepers.mainnet,
      "0xE7BfFf2aB721264887230037940490351700a068": true, // TEMP: deployer
    },
    TIMELOCK_ADMIN: {
      "0x35ea3066F90Db13e737BBd41f1ED7B4bfF8323b3": true, // timelock_admin_1
    },
    TIMELOCK_MULTISIG: {
      "0x35ea3066F90Db13e737BBd41f1ED7B4bfF8323b3": true, // timelock_admin_1
    },
    GOV_TOKEN_CONTROLLER: {},
    CONTROLLER: {
      "0xE7BfFf2aB721264887230037940490351700a068": true, // TEMP: deployer
    },
    ROUTER_PLUGIN: {},
    ROLE_ADMIN: {
      "0x35ea3066F90Db13e737BBd41f1ED7B4bfF8323b3": true, // timelock_admin_1
    },
  };
}
