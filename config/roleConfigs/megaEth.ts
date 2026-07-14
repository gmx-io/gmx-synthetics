export function getRoles({ syntheticKeepers, generalConfigKeepers, claimAdmins }) {
  return {
    ADL_KEEPER: syntheticKeepers.mainnet,
    FROZEN_ORDER_KEEPER: syntheticKeepers.mainnet,
    LIQUIDATION_KEEPER: syntheticKeepers.mainnet,
    ORDER_KEEPER: syntheticKeepers.mainnet,
    LIMITED_CONFIG_KEEPER: syntheticKeepers.mainnet,
    CLAIM_ADMIN: {
      "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
      "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2 (retired, still granted on-chain)
      ...claimAdmins.mainnet,
      ...generalConfigKeepers.mainnet,
    },
    CONFIG_KEEPER: {
      "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2 (retired, still granted on-chain)
      ...generalConfigKeepers.mainnet,
    },
    FEE_KEEPER: {
      "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D": true, // fee_keeper_1
    },
    MARKET_KEEPER: {
      "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2 (retired, still granted on-chain)
      ...generalConfigKeepers.mainnet,
    },
    TIMELOCK_ADMIN: {
      // deployConfigTimelockController.ts uses this list as the controller's proposers and executors
      // (each proposer is also a canceller). These roles are set at deployment. Afterwards the role
      // admin of all of them is the controller itself, so no EOA or multisig can grant or revoke them
      // with a direct call. These role assignments (proposer/executor/canceller) can still change,
      // but only in these two ways:
      //   1. the controller acting on itself through its own timelock: a current proposer schedules an
      //      operation that calls grantRole / revokeRole on the controller, an executor runs it after
      //      the 24h delay, and any canceller (including the address being removed) can cancel it first.
      //   2. an address renouncing its own roles: direct and immediate, no delay and cannot be cancelled,
      //      but it only works on the caller's own roles.
      "0xE014cbD60A793901546178E1c16ad9132C927483": true, // timelock_admin_1
      "0x58F582455b54d7c83d03BCeed95FAf72B37fdDD7": true, // protocol_multisig_1
      "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
      // The retired admin must stay commented out; it still holds the role on-chain (SCDEV-307).
      // "0x35ea3066F90Db13e737BBd41f1ED7B4bfF8323b3": true, // former timelock_admin (retired, still granted on-chain)
    },
    TIMELOCK_MULTISIG: {
      "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
    },
    GOV_TOKEN_CONTROLLER: {},
    CONTROLLER: {
      "0x5Fb9121Ca153B93dD70ae53280Dc3b64E1805940": true, // MarketFactory (CONTROLLER)
      "0xA3E4c933D2227cEe0aaa2823a056843c0303a1a5": true, // GlvFactory (CONTROLLER)
      "0xc0E91b6CBd2982e92969c685227d103378Ef3762": true, // OracleStore (CONTROLLER)
      "0x611640B004719e4843552F60996360Ea6B39E75e": true, // Oracle (CONTROLLER)

      "0x0521Ca97c6a31a477040db2C725c4F6374C07637": true, // Config (CONTROLLER)
      "0x133FFD635e0B3A8727525D2Dbe932eaaeFDa3b18": true, // ConfigTimelockController (CONTROLLER)
      "0x6eD6d7eD1222715BA9e4B9b3fee67dD861b789B0": true, // TimelockConfig (CONTROLLER)
      "0xCB3c090650d4203452a7266f9cB547e8630C52DE": true, // ExchangeRouter (CONTROLLER)
      "0x5b7EFeCB2a4fD68CB553f2Cc2d3d6Bb57e349bb9": true, // SubaccountRouter (CONTROLLER)
      "0xdb21Bc8A0D3f2920bD1cFD65F18a3a6dC660385B": true, // GlvRouter (CONTROLLER)
      "0x364C60dC09108DeD72378e7d800F9b7BE034aa59": true, // GelatoRelayRouter (CONTROLLER)
      "0xAcE24EbCB413eD57C2E0655C3D5d8247d17B035E": true, // SubaccountGelatoRelayRouter (CONTROLLER)
      "0x35eC8BB19D43F6aF314138A32Be7f8E0aF1B71c6": true, // OrderHandler (CONTROLLER)
      "0xabC46Df814fcE4Cbe606daD812b9546a6d6310d8": true, // JitOrderHandler (CONTROLLER)
      "0xEC7AfB0122CEFA1E26832578F67f00f71Cd2eD77": true, // IncreaseOrderExecutor (CONTROLLER)
      "0xA1b991B82eC330382301E5BE39bE053944AA52dF": true, // DecreaseOrderExecutor (CONTROLLER)
      "0xFa6B9db4019A525CCDBb3687aD8F980bfbda0052": true, // SwapOrderExecutor (CONTROLLER)
      "0x28Ddc465C6eA50b1ec7E630E7AE5b98d2aEcfD4b": true, // DepositHandler (CONTROLLER)
      "0x370907c421898930202cb407F0364d44816aD28A": true, // WithdrawalHandler (CONTROLLER)
      "0x47b1060b800e7Cf53A364B8535E9041A8dCf4593": true, // AdlHandler (CONTROLLER)
      "0xdf6a91f9C2Ca4243710c22059341bdA72f66859b": true, // LiquidationHandler (CONTROLLER)
      "0x410917e7a8993eC0f168E75512b449026AA68035": true, // ShiftHandler (CONTROLLER)
      "0xf8b6eA197055bDFd59fdB8BE05A25ED71D4BD3EA": true, // GlvDepositHandler (CONTROLLER)
      "0xFcF950d5728ad51E2e0939d5103dBbDaE1474a85": true, // GlvWithdrawalHandler (CONTROLLER)
      "0x242324C66a5BedAFCDB71124b3A6fc4f39d943Cb": true, // GlvShiftHandler (CONTROLLER)
      "0x3AF19f8DFA31f4C45888D28c15F4740019b8F652": true, // SwapHandler (CONTROLLER)
      "0x06D774708a890f520e695322eE1aA5De3897261B": true, // ClaimHandler (CONTROLLER)
      "0x45c4Ad9e0B0DCC2ED2571492C39B8D47Ce55FEE4": true, // LayerZeroProvider (CONTROLLER)
      "0x9a535f9343434D96c4a39fF1d90cC685A4F6Fb20": true, // MultichainClaimsRouter (CONTROLLER)
      "0xFCB212F7032F145cbe0fafd4A14Dd84b31AaE366": true, // MultichainGlvRouter (CONTROLLER)
      "0x36054C847f20d628f16462E3D39790D7d2c0776e": true, // MultichainGmRouter (CONTROLLER)
      "0xFf5fD94a2fF5e647a19b807242D69095c39D6Ce1": true, // MultichainOrderRouter (CONTROLLER)
      "0xa1eD7BF6BBA7864D3d508cfE11764214E4De7e3d": true, // MultichainSubaccountRouter (CONTROLLER)
      "0x14da841aAECC117fc32110a69C090D8e1ACB60b6": true, // MultichainTransferRouter (CONTROLLER)
    },
    ROUTER_PLUGIN: {
      "0xCB3c090650d4203452a7266f9cB547e8630C52DE": true, // ExchangeRouter (ROUTER_PLUGIN)
      "0x5b7EFeCB2a4fD68CB553f2Cc2d3d6Bb57e349bb9": true, // SubaccountRouter (ROUTER_PLUGIN)
      "0xdb21Bc8A0D3f2920bD1cFD65F18a3a6dC660385B": true, // GlvRouter (ROUTER_PLUGIN)
      "0x364C60dC09108DeD72378e7d800F9b7BE034aa59": true, // GelatoRelayRouter (ROUTER_PLUGIN)
      "0xAcE24EbCB413eD57C2E0655C3D5d8247d17B035E": true, // SubaccountGelatoRelayRouter (ROUTER_PLUGIN)
      "0xFCB212F7032F145cbe0fafd4A14Dd84b31AaE366": true, // MultichainGlvRouter (ROUTER_PLUGIN)
      "0x36054C847f20d628f16462E3D39790D7d2c0776e": true, // MultichainGmRouter (ROUTER_PLUGIN)
      "0xFf5fD94a2fF5e647a19b807242D69095c39D6Ce1": true, // MultichainOrderRouter (ROUTER_PLUGIN)
      "0xa1eD7BF6BBA7864D3d508cfE11764214E4De7e3d": true, // MultichainSubaccountRouter (ROUTER_PLUGIN)
      "0x14da841aAECC117fc32110a69C090D8e1ACB60b6": true, // MultichainTransferRouter (ROUTER_PLUGIN)
    },
    ROLE_ADMIN: {
      "0x6eD6d7eD1222715BA9e4B9b3fee67dD861b789B0": true, // TimelockConfig (ROLE_ADMIN)
      "0x133FFD635e0B3A8727525D2Dbe932eaaeFDa3b18": true, // ConfigTimelockController (ROLE_ADMIN)
    },
    MULTICHAIN_READER: {},
  };
}
