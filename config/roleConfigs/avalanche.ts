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
      "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
      "0xFe6bDB87e59484Db1494a467CdbA7C051FB2A604": true, // ConfigSyncer (CONFIG_KEEPER)

      // v2.2c 2026-07-15 (fresh redeploy; live entries above kept until later revoke round)
      "0x804f206a2ec78F505FD5D397450EAB9E7CBD1b21": true, // ConfigSyncer (CONFIG_KEEPER)
      "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2 (retired, still granted on-chain)
      ...generalConfigKeepers.mainnet,
    },
    FEE_KEEPER: {
      "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D": true, // fee_keeper_1
    },
    // FEE_DISTRIBUTION_KEEPER: generalConfigKeepers.mainnet,
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
    GOV_TOKEN_CONTROLLER: {
      "0x091eD806490Cc58Fd514441499e58984cCce0630": true, // RewardRouterV2_2
    },
    CONTROLLER: {
      "0xc57C155FacCd93F62546F329D1483E0E5b9C1241": true, // MarketFactory
      "0x5d6B84086DA6d4B0b6C0dF7E02f8a6A039226530": true, // GlvFactory
      "0xA6aC2e08C6d6bbD9B237e0DaaEcd7577996f4e84": true, // OracleStore
      "0x1A3A103F9F536a0456C9b205152A3ac2b3c54490": true, // FeeHandler
      "0xAd7a7568F500F65AEA3D9417A210CBc5dcD7b273": true, // FeeHandler Oracle
      "0xE1d5a068c5b75E0c7Ea1A9Fe8EA056f9356C6fFD": true, // Oracle

      "0x11e9E7464f3Bc887a7290ec41fCd22f619b177fd": true, // Config (CONTROLLER)
      "0x23BaFd10C7c15eaff7754D624BC660cbAA7d2Ec9": true, // RiskOracleConfig (CONTROLLER)
      "0xFe6bDB87e59484Db1494a467CdbA7C051FB2A604": true, // ConfigSyncer (CONTROLLER)
      "0x20D56cf90fD3C8f3bEb9BAC03AfdA3241093DE36": true, // ConfigTimelockController (CONTROLLER)
      "0x37e1AeB6118B0106810D2eF7662875C414e39Ca4": true, // TimelockConfig (CONTROLLER)
      "0x8f550E53DFe96C055D5Bdb267c21F268fCAF63B2": true, // ExchangeRouter (CONTROLLER)
      "0xf43F559774d2cF7882e6E846fCb87BDe183a6Da7": true, // SubaccountRouter (CONTROLLER)
      "0x7E425c47b2Ff0bE67228c842B9C792D0BCe58ae6": true, // GlvRouter (CONTROLLER)
      "0xEE2d3339CbcE7A42573C96ACc1298A79a5C996Df": true, // GelatoRelayRouter (CONTROLLER)
      "0xfaBEb65bB877600be3A2C2a03aA56a95F9f845B9": true, // SubaccountGelatoRelayRouter (CONTROLLER)
      "0x823b558B4bC0a2C4974a0d8D7885AA1102D15dEC": true, // OrderHandler (CONTROLLER)
      "0xF90fec8bF858D3445938Fb202d962889c37874ae": true, // JitOrderHandler (CONTROLLER)
      "0x63AbC52A2750c7cB65D560B52627EC8f6207D9F9": true, // IncreaseOrderExecutor (CONTROLLER)
      "0x40Fe9EA67c9D29e77661837E986Ef20A78C5E9Ce": true, // DecreaseOrderExecutor (CONTROLLER)
      "0x92a542690F8A347E2eE9e51c2Da0ea38e1186cDB": true, // SwapOrderExecutor (CONTROLLER)
      "0xCC2645E961514A694bca228686ec664933c70647": true, // DepositHandler (CONTROLLER)
      "0x334237f7d75497a22B1443f44DDCcF95e72904A0": true, // WithdrawalHandler (CONTROLLER)
      "0x858559D39fe8B2fDfE452f895db36077859130e1": true, // AdlHandler (CONTROLLER)
      "0xad7F00b4080BACFfAaE7f44d67560C818d8e5468": true, // LiquidationHandler (CONTROLLER)
      "0x6AdF7026D53057CED269DFDa318103db4F0Aa4Ba": true, // ShiftHandler (CONTROLLER)
      "0x2337E7E4B9Ec811C7F99d0D16897e5DB12BD8B39": true, // GlvDepositHandler (CONTROLLER)
      "0xd27BBE7937f39cc5cDe6D9F041e42174eD509B96": true, // GlvWithdrawalHandler (CONTROLLER)
      "0x441541167b041EC507b5308B7005075a13A28aA7": true, // GlvShiftHandler (CONTROLLER)
      "0x0DC24Af5BbBEc90C1deFd8f5F72E47c7D298c0AE": true, // SwapHandler (CONTROLLER)
      "0xefCAdA759241D10B45d9Cb6265B19ADec97ceced": true, // ClaimHandler (CONTROLLER)
      "0xF85Fd576bBe22Bce785B68922C1c9849d62737c0": true, // LayerZeroProvider (CONTROLLER)
      "0xd10B10b816030347ff4E6767d340371B40b9F03D": true, // MultichainClaimsRouter (CONTROLLER)
      "0xEEE61742bC4cf361c60Cd65826864560Bf2D0bB6": true, // MultichainGlvRouter (CONTROLLER)
      "0xA191Bc0B72332e4c2022dB50a9d619079cc6c4fD": true, // MultichainGmRouter (CONTROLLER)
      "0xd099565957046a2d2CF41B0CC9F95e14a8afD13b": true, // MultichainOrderRouter (CONTROLLER)
      "0x5872E84e5ea23292b40183BE86D25fb428621fC1": true, // MultichainSubaccountRouter (CONTROLLER)
      "0x5A44a3b026d50EC039582fDb3aFDD88e2092E211": true, // MultichainTransferRouter (CONTROLLER)

      // v2.2c 2026-07-15 (fresh redeploy; live entries above kept until later revoke round)
      "0x3002cA0dC434823272062f055D2999293392878e": true, // Config (CONTROLLER)
      "0x804f206a2ec78F505FD5D397450EAB9E7CBD1b21": true, // ConfigSyncer (CONTROLLER)
      "0x854a176289958DD875b0a256FF0dd47f747e39B0": true, // ConfigTimelockController (CONTROLLER)
      "0xE8505736A5631e036b84b946e56B56D25F28b68E": true, // TimelockConfig (CONTROLLER)
      "0x29220fA3b24279279C211701DE4a7b035122B911": true, // Oracle (CONTROLLER)
      "0xc002Db96E682FFF6675966F959677285a0C45Efa": true, // ExchangeRouter (CONTROLLER)
      "0xAda708aFf0f1D784D28cd8Ff4d6D977fF9599e5D": true, // SubaccountRouter (CONTROLLER)
      "0x603B3D3aB077CA433b888c05fa59c777d5b6dCAD": true, // GlvRouter (CONTROLLER)
      "0x51fe0b7919e1208a717E9B16a097C1C3D70eFbf6": true, // GelatoRelayRouter (CONTROLLER)
      "0xa62BD1cFE2066c5bF4180b4125BBb5116eEA26c9": true, // SubaccountGelatoRelayRouter (CONTROLLER)
      "0xaB409fCaCc14Dd4234f6f86a2547f04ACC90a55e": true, // SimulationRouter (CONTROLLER)
      "0xC993eF170859DAE0241a3c12B8186e456Fa1c1B0": true, // OrderHandler (CONTROLLER)
      "0x66437ac7Db8dA224C9179AA59B76f1027C87da20": true, // JitOrderHandler (CONTROLLER)
      "0x7e99d14DB15FE16B58B05bEb101BbC69c2203679": true, // IncreaseOrderExecutor (CONTROLLER)
      "0x8D3FeC13225f611ad7F5fA77442625749a29b057": true, // DecreaseOrderExecutor (CONTROLLER)
      "0x7313C9FAc0AD3511Cf30a1dD603C3255b455fDE8": true, // SwapOrderExecutor (CONTROLLER)
      "0xe93fA5956199d1e395885AB10BBE45b0Bd04F0F2": true, // DepositHandler (CONTROLLER)
      "0xa334b4e3f92a91e927f061494A95d84B7F0D134d": true, // WithdrawalHandler (CONTROLLER)
      "0xF68560cA917717639be497BF6283aC08C9Bf0264": true, // AdlHandler (CONTROLLER)
      "0x1eAa0E46a40CB7D6F656193d053493658548114e": true, // LiquidationHandler (CONTROLLER)
      "0x5F65a3B91923840cD5254489A57c873427bA3A91": true, // ShiftHandler (CONTROLLER)
      "0xf9B01d45B2c5022429c3f745e5A2E700B02cEBeb": true, // GlvDepositHandler (CONTROLLER)
      "0xCb60d0A8372Cb8f8a074d304F88bA851FC5E8e29": true, // GlvWithdrawalHandler (CONTROLLER)
      "0xDB8906520812840b9835E3B84dE62C826249e20B": true, // GlvShiftHandler (CONTROLLER)
      "0xe1ed31707677d961eA8056c23e6153701e7414B9": true, // SwapHandler (CONTROLLER)
      "0x07d8115676362Cf0d6672Dd71B23A43DB1e69C06": true, // ClaimHandler (CONTROLLER)
      "0x74eECe8cC29b3d549db97F566a4445F48ed62a0d": true, // LayerZeroProvider (CONTROLLER)
      "0xa664B7E894ad5777f3419C2883911Af3692a4569": true, // MultichainClaimsRouter (CONTROLLER)
      "0x206B582F309724dAd259058Bc3289Ca3519F34B1": true, // MultichainGlvRouter (CONTROLLER)
      "0x00205f26BCc52537D12fA9b0eFA5Fcc58F03ab76": true, // MultichainGmRouter (CONTROLLER)
      "0x204CC947Fddd11c90e302db2A5ac3865021D1618": true, // MultichainOrderRouter (CONTROLLER)
      "0x4A2826cAee8FF70d9392B171eaF398E0a2B55047": true, // MultichainSubaccountRouter (CONTROLLER)
      "0xd4F6C2332b36D1Ccb22C7ac479b270fa0cA26a41": true, // MultichainTransferRouter (CONTROLLER)
    },
    ROUTER_PLUGIN: {
      "0x8f550E53DFe96C055D5Bdb267c21F268fCAF63B2": true, // ExchangeRouter (ROUTER_PLUGIN)
      "0xf43F559774d2cF7882e6E846fCb87BDe183a6Da7": true, // SubaccountRouter (ROUTER_PLUGIN)
      "0x7E425c47b2Ff0bE67228c842B9C792D0BCe58ae6": true, // GlvRouter (ROUTER_PLUGIN)
      "0xEE2d3339CbcE7A42573C96ACc1298A79a5C996Df": true, // GelatoRelayRouter (ROUTER_PLUGIN)
      "0xfaBEb65bB877600be3A2C2a03aA56a95F9f845B9": true, // SubaccountGelatoRelayRouter (ROUTER_PLUGIN)
      "0xEEE61742bC4cf361c60Cd65826864560Bf2D0bB6": true, // MultichainGlvRouter (ROUTER_PLUGIN)
      "0xA191Bc0B72332e4c2022dB50a9d619079cc6c4fD": true, // MultichainGmRouter (ROUTER_PLUGIN)
      "0xd099565957046a2d2CF41B0CC9F95e14a8afD13b": true, // MultichainOrderRouter (ROUTER_PLUGIN)
      "0x5872E84e5ea23292b40183BE86D25fb428621fC1": true, // MultichainSubaccountRouter (ROUTER_PLUGIN)
      "0x5A44a3b026d50EC039582fDb3aFDD88e2092E211": true, // MultichainTransferRouter (ROUTER_PLUGIN)

      // v2.2c 2026-07-15 (fresh redeploy; live entries above kept until later revoke round)
      "0xc002Db96E682FFF6675966F959677285a0C45Efa": true, // ExchangeRouter (ROUTER_PLUGIN)
      "0xAda708aFf0f1D784D28cd8Ff4d6D977fF9599e5D": true, // SubaccountRouter (ROUTER_PLUGIN)
      "0x603B3D3aB077CA433b888c05fa59c777d5b6dCAD": true, // GlvRouter (ROUTER_PLUGIN)
      "0x51fe0b7919e1208a717E9B16a097C1C3D70eFbf6": true, // GelatoRelayRouter (ROUTER_PLUGIN)
      "0xa62BD1cFE2066c5bF4180b4125BBb5116eEA26c9": true, // SubaccountGelatoRelayRouter (ROUTER_PLUGIN)
      "0xaB409fCaCc14Dd4234f6f86a2547f04ACC90a55e": true, // SimulationRouter (ROUTER_PLUGIN)
      "0x206B582F309724dAd259058Bc3289Ca3519F34B1": true, // MultichainGlvRouter (ROUTER_PLUGIN)
      "0x00205f26BCc52537D12fA9b0eFA5Fcc58F03ab76": true, // MultichainGmRouter (ROUTER_PLUGIN)
      "0x204CC947Fddd11c90e302db2A5ac3865021D1618": true, // MultichainOrderRouter (ROUTER_PLUGIN)
      "0x4A2826cAee8FF70d9392B171eaF398E0a2B55047": true, // MultichainSubaccountRouter (ROUTER_PLUGIN)
      "0xd4F6C2332b36D1Ccb22C7ac479b270fa0cA26a41": true, // MultichainTransferRouter (ROUTER_PLUGIN)
    },
    ROLE_ADMIN: {
      "0x37e1AeB6118B0106810D2eF7662875C414e39Ca4": true, // TimelockConfig (ROLE_ADMIN)
      "0x20D56cf90fD3C8f3bEb9BAC03AfdA3241093DE36": true, // ConfigTimelockController (ROLE_ADMIN)

      // v2.2c 2026-07-15 (fresh redeploy; live entries above kept until later revoke round)
      "0xE8505736A5631e036b84b946e56B56D25F28b68E": true, // TimelockConfig (ROLE_ADMIN)
      "0x854a176289958DD875b0a256FF0dd47f747e39B0": true, // ConfigTimelockController (ROLE_ADMIN)
    },
    MULTICHAIN_READER: {},
    RISK_ORACLE: {
      "0x16ffB5a90bE6a0c0c5179d62Ced944fdD8108C72": true, // KMS generated
      "0xB630FDb99b5D50Ef26891E2cf4494027fc4C1289": true,
    },
  };
}
