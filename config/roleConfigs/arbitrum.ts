export function getRoles({
  syntheticKeepers,
  chainlinkKeepers,
  gelatoKeepers,
  claimAdmins,
  generalConfigKeepers,
  fundDistributors,
}) {
  return {
    ADL_KEEPER: syntheticKeepers.mainnet,
    DONATION_KEEPER: {
      ...syntheticKeepers.mainnet,
      "0x387E9b8B8F17d3F87f3Cf3b4f8b20a1f59b2947C": true, // DonationBatcher (DONATION_KEEPER), donation set of 2026-10-01

      // v2.2.1 2026-10-22
      "0xbAAA3a693191e2e3E0973DE641C879D1aDD84e04": true, // DonationBatcher (DONATION_KEEPER)
    },
    FROZEN_ORDER_KEEPER: syntheticKeepers.mainnet,
    LIQUIDATION_KEEPER: syntheticKeepers.mainnet,
    ORDER_KEEPER: { ...syntheticKeepers.mainnet, ...chainlinkKeepers.arbitrum, ...gelatoKeepers.arbitrum },
    LIMITED_CONFIG_KEEPER: syntheticKeepers.mainnet,
    CLAIM_ADMIN: {
      "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
      ...claimAdmins.mainnet,
      ...generalConfigKeepers.mainnet,
    },
    CONTRIBUTOR_KEEPER: {
      "0x58F582455b54d7c83d03BCeed95FAf72B37fdDD7": true, // protocol_multisig_1
    },
    CONTRIBUTOR_DISTRIBUTOR: {
      ...generalConfigKeepers.mainnet,
      ...fundDistributors.mainnet,
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
      "0x5E4766F932ce00aA4a1A82d3Da85adf15C5694A1": true, // RewardRouterV2

      // v2.2.1 2026-10-22
      "0xF6Ba2B1a33c5bdA5D7Cd5FD971E859430F465719": true, // RewardRouterV3 (GOV_TOKEN_CONTROLLER)
    },
    CONTROLLER: {
      "0xf5F30B10141E1F63FC11eD772931A8294a591996": true, // MarketFactory
      "0xdaFa7Deb67805d7498Aa926002bB2d713D1d9256": true, // GlvFactory
      "0xA8AF9B86fC47deAde1bc66B12673706615E2B011": true, // OracleStore
      "0x7EB417637a3E6d1C19E6d69158c47610b7a5d9B3": true, // FeeHandler
      "0xb8fc96d7a413C462F611A7aC0C912c2FE26EAbC4": true, // FeeHandler Oracle
      "0x4729D9f61c0159F5e02D2C2e5937B3225e55442C": true, // ContributorHandler
      "0x7F01614cA5198Ec979B1aAd1DAF0DE7e0a215BDF": true, // Oracle (bound by RiskOracleConfig 0x5cA4)
      "0x5cA40cBb5321bBe4EF74Ddf01CCd2b4BCC76a9f9": true, // RiskOracleConfig (CONTROLLER)

      // donation set 2026-10-01 (live; kept until the next revoke round)
      "0x2AB2B848F64637b5c69BbE42FE72800f2494DAc4": true, // MarketPoolDonationHandler (CONTROLLER)
      "0x842c1E1e991F79805B1cbdf0EE427e2B44E3ae87": true, // GlvDonationHandler (CONTROLLER)

      // v2.2c 2026-07-15 (live; kept until the next revoke round)
      "0x233720Ccdec5514e2f5b68500C27A3e17571eF86": true, // Config (CONTROLLER)
      "0x2Dd99f39f58445CDDC57AA5E0DB2C367335BBD44": true, // ConfigTimelockController (CONTROLLER)
      "0xE7706986A8cec50a2BB8d42D34f8a0404106d4F5": true, // TimelockConfig (CONTROLLER)
      "0x26C02F221e8dB5A821e12347C7eA8a6b6E10842f": true, // Oracle (CONTROLLER)
      "0x7dE39FF2e232A2203196788d37e234cF8F1b83f1": true, // ExchangeRouter (CONTROLLER)
      "0x9c05880A2AaD7530c69e18e342eDC9E06cc757db": true, // SubaccountRouter (CONTROLLER)
      "0x167540D2DFF14120365CfDDF2F86e3045D4fa712": true, // GlvRouter (CONTROLLER)
      "0x5503b99308dB6923758F9A22d118207D633c4e87": true, // GelatoRelayRouter (CONTROLLER)
      "0xfD0596f708d9D950E0eF7b5d191e5F8e55b8a67f": true, // SubaccountGelatoRelayRouter (CONTROLLER)
      "0xaD3051cB1aE3a86b335f12A9a41BD4d995a137ea": true, // SimulationRouter (CONTROLLER)
      "0xa5D2d45228ee2E3A18AB122B2cE84997d008f4Eb": true, // OrderHandler (CONTROLLER)
      "0xCA9313dBBe56309ADdf56C0aed7113eA7B158615": true, // JitOrderHandler (CONTROLLER)
      "0x8f83A77A8f075466904b7B926Dc3C80052A59Ff8": true, // IncreaseOrderExecutor (CONTROLLER)
      "0x05920F5788105eCf4003386904CE9F9DC296dcb7": true, // DecreaseOrderExecutor (CONTROLLER)
      "0x63170C576C0575852BaA3C90F79468b88eC14209": true, // SwapOrderExecutor (CONTROLLER)
      "0x2c60a1890E24a727ccF504A9dA9912ace58b2EAD": true, // DepositHandler (CONTROLLER)
      "0xB25dDF7dE751e5c8bFa85c815d1b379732cF4925": true, // WithdrawalHandler (CONTROLLER)
      "0xC8470eBBb6960FD00Db7D4C9f71CAda27e8f6Bfa": true, // AdlHandler (CONTROLLER)
      "0x01B85C1e0682418f59C4fe37A2cC56c1213C1fa8": true, // LiquidationHandler (CONTROLLER)
      "0xfC260B96E1f80D446bB75785bdDe065Feb1FcEA9": true, // ShiftHandler (CONTROLLER)
      "0xE092bFd05186546fDEAC888f5bCC2c42406d026d": true, // GlvDepositHandler (CONTROLLER)
      "0x45048c62528a6A66FA5CC8D2b25b918701F0FAAA": true, // GlvWithdrawalHandler (CONTROLLER)
      "0xCFf2Afe6E2C3D4d21aDf0e5A5210B94A09546852": true, // GlvShiftHandler (CONTROLLER)
      "0xfF38607a4E1f5F753a317cEb451F7B068df8257b": true, // SwapHandler (CONTROLLER)
      "0xc31E7aC86Cc20FF8D7f4642b5Ed67a43B2AC8426": true, // ClaimHandler (CONTROLLER)
      "0x0B33EBA531e5a5A331a3Ff9F418B8205F01C2869": true, // LayerZeroProvider (CONTROLLER)
      "0x946CC490DFedd6016645F5ce555E0036D116f50e": true, // MultichainClaimsRouter (CONTROLLER)
      "0xA0Ef0Ace6E437458BB4b5F72A7c7bB43a1CdDa8d": true, // MultichainGlvRouter (CONTROLLER)
      "0xFd26a7E3c4A9b75Bd0dce495290Fa33af2bb4b00": true, // MultichainGmRouter (CONTROLLER)
      "0xABFC734f7CFc9352AED7a97b1F6a236eae831e8A": true, // MultichainOrderRouter (CONTROLLER)
      "0xAb3EDf0f3eed6804BAe1bD9bF90109ccadFD262e": true, // MultichainSubaccountRouter (CONTROLLER)
      "0x3f6772B95423fC03264adf90Efb8A9922B6C8c6e": true, // MultichainTransferRouter (CONTROLLER)

      // v2.2.1 2026-10-22
      "0x58Cd772bc32887B1926acb79f5e996e615126E33": true, // Config (CONTROLLER)
      "0xF68560cA917717639be497BF6283aC08C9Bf0264": true, // ConfigTimelockController (CONTROLLER)
      "0x4Ed34E6cA94B7cF75140Da35057Cc3f8D4887f76": true, // TimelockConfig (CONTROLLER)
      "0x42F3642F3F82CBAdE4CFA32961a57568055Dd10E": true, // Oracle (CONTROLLER)
      "0x977CE3A6aa07496c9D85ea6E236659Ca4CA40FDE": true, // RiskOracleConfig (CONTROLLER)
      "0x6776c2b52179BC737193DE3bc75262681006AA27": true, // ExchangeRouter (CONTROLLER)
      "0x63e3fFcF0bBc43F2ed253134EBA534E31A268509": true, // SubaccountRouter (CONTROLLER)
      "0x321EB66dD95ad33715ee615AAb8dAC6394E7b3F9": true, // GlvRouter (CONTROLLER)
      "0xE6c871230F758F03b39D4Fb5ea3fc7B49E9dAc64": true, // GelatoRelayRouter (CONTROLLER)
      "0xC3969579D6ec54879F078c36F6B364cDbd1B557B": true, // SubaccountGelatoRelayRouter (CONTROLLER)
      "0x3C81eBE9892431B5c9B8Eff7904c2a09397014D1": true, // SimulationRouter (CONTROLLER)
      "0x2dC2315039bf3617e815969c613428F36e9Baf98": true, // OrderHandler (CONTROLLER)
      "0xDB8906520812840b9835E3B84dE62C826249e20B": true, // JitOrderHandler (CONTROLLER)
      "0xAEa9c718998fF5DB73570D80155b5c9434a1cCad": true, // IncreaseOrderExecutor (CONTROLLER)
      "0x871ddE7cf9D8135d1Bc951d09E0FA78dAaee4D37": true, // DecreaseOrderExecutor (CONTROLLER)
      "0x8343A80aA3c98b368d982152491e248e37Ed279e": true, // SwapOrderExecutor (CONTROLLER)
      "0x5CCD0b91Cfe6B0FBA1c98290dc39E71ff806d9bF": true, // DepositHandler (CONTROLLER)
      "0xe93fA5956199d1e395885AB10BBE45b0Bd04F0F2": true, // WithdrawalHandler (CONTROLLER)
      "0x2b69D9b2f8E9b8EfC0A34E854e709b0Dd2aD6da2": true, // AdlHandler (CONTROLLER)
      "0xBc4C6139c477f28BB5a8b7CCd6CE3922283d9Bad": true, // LiquidationHandler (CONTROLLER)
      "0x9cfE0C88C34a43ae2Beb73cEC9130852E3d4aBc1": true, // ShiftHandler (CONTROLLER)
      "0x118510dD4bbB6a18863EfAA1867D4a7Ae3756c8d": true, // GlvDepositHandler (CONTROLLER)
      "0xfa297c078F023401d98236cC4827F660F5197c90": true, // GlvWithdrawalHandler (CONTROLLER)
      "0x9D602b18327Bc40C59dE498DdA38e674a6bf7b38": true, // GlvShiftHandler (CONTROLLER)
      "0xeB09bca16e49a118daf9ae5164F050B7e7235077": true, // SwapHandler (CONTROLLER)
      "0xc581aF9d20b1d95e456e4Bb9E3039aa0d48F9891": true, // ClaimHandler (CONTROLLER)
      "0xCb60d0A8372Cb8f8a074d304F88bA851FC5E8e29": true, // LayerZeroProvider (CONTROLLER)
      "0x7b2b62a4604417d0340Ed3A837BA66ad3a5eeAd7": true, // MultichainClaimsRouter (CONTROLLER)
      "0xf9B01d45B2c5022429c3f745e5A2E700B02cEBeb": true, // MultichainGlvRouter (CONTROLLER)
      "0xa334b4e3f92a91e927f061494A95d84B7F0D134d": true, // MultichainGmRouter (CONTROLLER)
      "0x5cFdc00811d0697D18b080f4E4fEB092a3b18671": true, // MultichainOrderRouter (CONTROLLER)
      "0xa2d9D6B0904929A1CD43c3762931Eb19ca1b4215": true, // MultichainSubaccountRouter (CONTROLLER)
      "0xC993eF170859DAE0241a3c12B8186e456Fa1c1B0": true, // MultichainTransferRouter (CONTROLLER)
      "0x7664Aa3F9609C614bf161B0805375CbDd3Ddb418": true, // MarketPoolDonationHandler (CONTROLLER)
      "0x07d8115676362Cf0d6672Dd71B23A43DB1e69C06": true, // GlvDonationHandler (CONTROLLER)
      "0xF6Ba2B1a33c5bdA5D7Cd5FD971E859430F465719": true, // RewardRouterV3 (CONTROLLER)
      "0x854a176289958DD875b0a256FF0dd47f747e39B0": true, // EsGmxIssuer (CONTROLLER)
      "0x03B59961bF30b973fBd793A6C8ad57dA38D4D0a6": true, // SeasonRatioVester (CONTROLLER)
      "0x1eAa0E46a40CB7D6F656193d053493658548114e": true, // OrphanRatioVester (CONTROLLER)
      "0xa41597C9cbC1b1D2Aa02A26Fe12361C0F476fB3F": true, // GmxVesterCapZeroer (CONTROLLER)
      "0x3156090BeD235135dc50864D04fc4436c35d7902": true, // GlpVesterCapZeroer (CONTROLLER)
      "0xC74b076C07ed9431a34B34eD043e8757504631f1": true, // ReferralVesterCapZeroer (CONTROLLER)
    },
    ROUTER_PLUGIN: {
      // v2.2c 2026-07-15 (live; kept until the next revoke round)
      "0x7dE39FF2e232A2203196788d37e234cF8F1b83f1": true, // ExchangeRouter (ROUTER_PLUGIN)
      "0x9c05880A2AaD7530c69e18e342eDC9E06cc757db": true, // SubaccountRouter (ROUTER_PLUGIN)
      "0x167540D2DFF14120365CfDDF2F86e3045D4fa712": true, // GlvRouter (ROUTER_PLUGIN)
      "0x5503b99308dB6923758F9A22d118207D633c4e87": true, // GelatoRelayRouter (ROUTER_PLUGIN)
      "0xfD0596f708d9D950E0eF7b5d191e5F8e55b8a67f": true, // SubaccountGelatoRelayRouter (ROUTER_PLUGIN)
      "0xaD3051cB1aE3a86b335f12A9a41BD4d995a137ea": true, // SimulationRouter (ROUTER_PLUGIN)
      "0xA0Ef0Ace6E437458BB4b5F72A7c7bB43a1CdDa8d": true, // MultichainGlvRouter (ROUTER_PLUGIN)
      "0xFd26a7E3c4A9b75Bd0dce495290Fa33af2bb4b00": true, // MultichainGmRouter (ROUTER_PLUGIN)
      "0xABFC734f7CFc9352AED7a97b1F6a236eae831e8A": true, // MultichainOrderRouter (ROUTER_PLUGIN)
      "0xAb3EDf0f3eed6804BAe1bD9bF90109ccadFD262e": true, // MultichainSubaccountRouter (ROUTER_PLUGIN)
      "0x3f6772B95423fC03264adf90Efb8A9922B6C8c6e": true, // MultichainTransferRouter (ROUTER_PLUGIN)

      // v2.2.1 2026-10-22
      "0x6776c2b52179BC737193DE3bc75262681006AA27": true, // ExchangeRouter (ROUTER_PLUGIN)
      "0x63e3fFcF0bBc43F2ed253134EBA534E31A268509": true, // SubaccountRouter (ROUTER_PLUGIN)
      "0x321EB66dD95ad33715ee615AAb8dAC6394E7b3F9": true, // GlvRouter (ROUTER_PLUGIN)
      "0xE6c871230F758F03b39D4Fb5ea3fc7B49E9dAc64": true, // GelatoRelayRouter (ROUTER_PLUGIN)
      "0xC3969579D6ec54879F078c36F6B364cDbd1B557B": true, // SubaccountGelatoRelayRouter (ROUTER_PLUGIN)
      "0x3C81eBE9892431B5c9B8Eff7904c2a09397014D1": true, // SimulationRouter (ROUTER_PLUGIN)
      "0xf9B01d45B2c5022429c3f745e5A2E700B02cEBeb": true, // MultichainGlvRouter (ROUTER_PLUGIN)
      "0xa334b4e3f92a91e927f061494A95d84B7F0D134d": true, // MultichainGmRouter (ROUTER_PLUGIN)
      "0x5cFdc00811d0697D18b080f4E4fEB092a3b18671": true, // MultichainOrderRouter (ROUTER_PLUGIN)
      "0xa2d9D6B0904929A1CD43c3762931Eb19ca1b4215": true, // MultichainSubaccountRouter (ROUTER_PLUGIN)
      "0xC993eF170859DAE0241a3c12B8186e456Fa1c1B0": true, // MultichainTransferRouter (ROUTER_PLUGIN)
    },
    ROLE_ADMIN: {
      "0x4bd1cdAab4254fC43ef6424653cA2375b4C94C0E": true, // GMX DAO

      // v2.2c 2026-07-15 (live; kept until the next revoke round)
      "0xE7706986A8cec50a2BB8d42D34f8a0404106d4F5": true, // TimelockConfig (ROLE_ADMIN)
      "0x2Dd99f39f58445CDDC57AA5E0DB2C367335BBD44": true, // ConfigTimelockController (ROLE_ADMIN)

      // v2.2.1 2026-10-22
      "0x4Ed34E6cA94B7cF75140Da35057Cc3f8D4887f76": true, // TimelockConfig (ROLE_ADMIN)
      "0xF68560cA917717639be497BF6283aC08C9Bf0264": true, // ConfigTimelockController (ROLE_ADMIN)
    },
    MULTICHAIN_READER: {},
    RISK_ORACLE: {
      "0x16ffB5a90bE6a0c0c5179d62Ced944fdD8108C72": true, // KMS generated
      "0xB630FDb99b5D50Ef26891E2cf4494027fc4C1289": true,
    },
  };
}
