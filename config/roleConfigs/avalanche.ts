export function getRoles({ syntheticKeepers, generalConfigKeepers, claimAdmins }) {
  return {
    ADL_KEEPER: syntheticKeepers.mainnet,
    FROZEN_ORDER_KEEPER: syntheticKeepers.mainnet,
    LIQUIDATION_KEEPER: syntheticKeepers.mainnet,
    ORDER_KEEPER: syntheticKeepers.mainnet,
    LIMITED_CONFIG_KEEPER: syntheticKeepers.mainnet,
    CLAIM_ADMIN: {
      "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
      ...claimAdmins.mainnet,
      ...generalConfigKeepers.mainnet,
    },
    CONFIG_KEEPER: {
      "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
      ...generalConfigKeepers.mainnet,
    },
    FEE_KEEPER: {
      "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D": true, // fee_keeper_1
    },
    // FEE_DISTRIBUTION_KEEPER: generalConfigKeepers.mainnet,
    MARKET_KEEPER: {
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
      "0xE1d5a068c5b75E0c7Ea1A9Fe8EA056f9356C6fFD": true, // Oracle (bound by RiskOracleConfig 0x23Ba)
      "0x23BaFd10C7c15eaff7754D624BC660cbAA7d2Ec9": true, // RiskOracleConfig (CONTROLLER)

      // v2.2c 2026-07-15 (live; kept until the next revoke round)
      "0x3002cA0dC434823272062f055D2999293392878e": true, // Config (CONTROLLER)
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

      // v2.2.1 2026-10-22
      "0xa41597C9cbC1b1D2Aa02A26Fe12361C0F476fB3F": true, // Config (CONTROLLER)
      "0x72037b77c1b8e7Ec0FeD06458a69aD2DE1E4D844": true, // ConfigTimelockController (CONTROLLER)
      "0xA3AB5229cDed21d23e06641537BB7f8989957186": true, // TimelockConfig (CONTROLLER)
      "0x63e3fFcF0bBc43F2ed253134EBA534E31A268509": true, // Oracle (CONTROLLER)
      "0x5efB37718Fa4C248458B04c8510989fAC945334A": true, // RiskOracleConfig (CONTROLLER)
      "0x5b7693839ef8d767168891797B9d2f319e351672": true, // ExchangeRouter (CONTROLLER)
      "0x2A929c97Ec71ced74675C2b5175Afa8927A28404": true, // SubaccountRouter (CONTROLLER)
      "0x5B8c1B498CCDDCAad36B5C81e48D773Ad338145D": true, // GlvRouter (CONTROLLER)
      "0xE9f7E49F7304D36Aae146B5Af7cE6f9421Dac2CF": true, // GelatoRelayRouter (CONTROLLER)
      "0x4fe335118106542DeD0748Eebbf276dD92F386e3": true, // SubaccountGelatoRelayRouter (CONTROLLER)
      "0x25B13cEE3D0d3bB318C64d121b7c9983D0EBD795": true, // SimulationRouter (CONTROLLER)
      "0x7950851B845AD6361672D16f429786E2d2EA87a7": true, // OrderHandler (CONTROLLER)
      "0xAE9c05A36F58BD7aeE05B2D6C19CA1662D6789D1": true, // JitOrderHandler (CONTROLLER)
      "0x2b5aE23eD0C1f8900BfeB7FB18eCD2cBcC9bA25b": true, // IncreaseOrderExecutor (CONTROLLER)
      "0x6Ca1C8C6B8EB14DaB6ca2Ab93e493eE6d1F045D9": true, // DecreaseOrderExecutor (CONTROLLER)
      "0x42d8fef33C228cC08763Fe54E925081909846814": true, // SwapOrderExecutor (CONTROLLER)
      "0x0d3cB5Ce08a3a4B6E936f599bc580d3048e54430": true, // DepositHandler (CONTROLLER)
      "0x08277494e203c43360056CDf07Bb2376dfc5E35a": true, // WithdrawalHandler (CONTROLLER)
      "0xA71a888988052d62BEe4599A43AAf7248b60d394": true, // AdlHandler (CONTROLLER)
      "0xFFA72d61A5A83A5B6C04A353811A88FD2AdeB89b": true, // LiquidationHandler (CONTROLLER)
      "0x4B4d2a5bA970209FFfe46Bec39e13554C0A28d40": true, // ShiftHandler (CONTROLLER)
      "0x7bceD685c4B1F815c377512F6F069403946C0Bc7": true, // GlvDepositHandler (CONTROLLER)
      "0x2aE15fcF26D07a67A8B7b93260247FdC6ab06EdB": true, // GlvWithdrawalHandler (CONTROLLER)
      "0x63AF8f60524628bd980DDF4c79B55FFf8446198F": true, // GlvShiftHandler (CONTROLLER)
      "0x40586298d8a00Fa9434f51070B7dfeb085C29D4a": true, // SwapHandler (CONTROLLER)
      "0xE08885EA7860f19e5fb2AECbA892e8A6BA505C86": true, // ClaimHandler (CONTROLLER)
      "0x1eEd675410879BDd9BF7f595d944F1b732019470": true, // LayerZeroProvider (CONTROLLER)
      "0xd9e34687F82602780a277F891f9a33B9A1F9291e": true, // MultichainClaimsRouter (CONTROLLER)
      "0x13BF6A53C2aBc86b080d3E6f500d7c209F73dc82": true, // MultichainGlvRouter (CONTROLLER)
      "0xC7fC0698774b4C704aCD5521368dA5BeB397289E": true, // MultichainGmRouter (CONTROLLER)
      "0x1c9d9BF1286Ea617a4eFbCf4f0B2b4A160269229": true, // MultichainOrderRouter (CONTROLLER)
      "0x96bE3cbFfbCeb1020ddfE5689807b8C20c3659C0": true, // MultichainSubaccountRouter (CONTROLLER)
      "0xcD11f8277Faca1c906cB13e2447cDC9fed1d3B39": true, // MultichainTransferRouter (CONTROLLER)
    },
    ROUTER_PLUGIN: {
      // v2.2c 2026-07-15 (live; kept until the next revoke round)
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

      // v2.2.1 2026-10-22
      "0x5b7693839ef8d767168891797B9d2f319e351672": true, // ExchangeRouter (ROUTER_PLUGIN)
      "0x2A929c97Ec71ced74675C2b5175Afa8927A28404": true, // SubaccountRouter (ROUTER_PLUGIN)
      "0x5B8c1B498CCDDCAad36B5C81e48D773Ad338145D": true, // GlvRouter (ROUTER_PLUGIN)
      "0xE9f7E49F7304D36Aae146B5Af7cE6f9421Dac2CF": true, // GelatoRelayRouter (ROUTER_PLUGIN)
      "0x4fe335118106542DeD0748Eebbf276dD92F386e3": true, // SubaccountGelatoRelayRouter (ROUTER_PLUGIN)
      "0x25B13cEE3D0d3bB318C64d121b7c9983D0EBD795": true, // SimulationRouter (ROUTER_PLUGIN)
      "0x13BF6A53C2aBc86b080d3E6f500d7c209F73dc82": true, // MultichainGlvRouter (ROUTER_PLUGIN)
      "0xC7fC0698774b4C704aCD5521368dA5BeB397289E": true, // MultichainGmRouter (ROUTER_PLUGIN)
      "0x1c9d9BF1286Ea617a4eFbCf4f0B2b4A160269229": true, // MultichainOrderRouter (ROUTER_PLUGIN)
      "0x96bE3cbFfbCeb1020ddfE5689807b8C20c3659C0": true, // MultichainSubaccountRouter (ROUTER_PLUGIN)
      "0xcD11f8277Faca1c906cB13e2447cDC9fed1d3B39": true, // MultichainTransferRouter (ROUTER_PLUGIN)
    },
    ROLE_ADMIN: {
      // v2.2c 2026-07-15 (live; kept until the next revoke round)
      "0xE8505736A5631e036b84b946e56B56D25F28b68E": true, // TimelockConfig (ROLE_ADMIN)
      "0x854a176289958DD875b0a256FF0dd47f747e39B0": true, // ConfigTimelockController (ROLE_ADMIN)

      // v2.2.1 2026-10-22
      "0xA3AB5229cDed21d23e06641537BB7f8989957186": true, // TimelockConfig (ROLE_ADMIN)
      "0x72037b77c1b8e7Ec0FeD06458a69aD2DE1E4D844": true, // ConfigTimelockController (ROLE_ADMIN)
    },
    MULTICHAIN_READER: {},
    RISK_ORACLE: {
      "0x16ffB5a90bE6a0c0c5179d62Ced944fdD8108C72": true, // KMS generated
      "0xB630FDb99b5D50Ef26891E2cf4494027fc4C1289": true,
    },
  };
}
