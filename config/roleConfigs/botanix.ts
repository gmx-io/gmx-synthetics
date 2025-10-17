export function getRoles({ syntheticKeepers, generalConfigKeepers }) {
  return {
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
  };
}
