export function getRoles({ syntheticKeepers, generalConfigKeepers, claimAdmins }) {
  return {
    ADL_KEEPER: syntheticKeepers.mainnet,
    FROZEN_ORDER_KEEPER: syntheticKeepers.mainnet,
    LIQUIDATION_KEEPER: syntheticKeepers.mainnet,
    ORDER_KEEPER: syntheticKeepers.mainnet,
    LIMITED_CONFIG_KEEPER: syntheticKeepers.mainnet,
    CLAIM_ADMIN: {
      "0x656fa39BdB5984b477FA6aB443195D72D1Accc1c": true, // security_multisig_botanix
      ...claimAdmins.mainnet,
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
      "0x40d680E41FC4Bf973F0EA664981f6359195a6383": true, // Oracle

      "0xAd7a7568F500F65AEA3D9417A210CBc5dcD7b273": true, // Config (CONTROLLER)
      "0x3d6BA4a91Ffde7C519379F8dCA5FE58b7125c294": true, // ConfigTimelockController (CONTROLLER)
      "0x72a30e76827Ce83cEf0b1BEd7e9aAF9F4a576990": true, // TimelockConfig (CONTROLLER)
      "0xBCB5eA3a84886Ce45FBBf09eBF0e883071cB2Dc8": true, // ExchangeRouter (CONTROLLER)
      "0xa1793126B6Dc2f7F254a6c0E2F8013D2180C0D10": true, // SubaccountRouter (CONTROLLER)
      "0xC92741F0a0D20A95529873cBB3480b1f8c228d9F": true, // GlvRouter (CONTROLLER)
      "0x98e86155abf8bCbA566b4a909be8cF4e3F227FAf": true, // GelatoRelayRouter (CONTROLLER)
      "0xd6b16f5ceE328310B1cf6d8C0401C23dCd3c40d4": true, // SubaccountGelatoRelayRouter (CONTROLLER)
      "0xBAD04dDcc5CC284A86493aFA75D2BEb970C72216": true, // OrderHandler (CONTROLLER)
      "0x00EfaE2C4a62f48C4F4e6381a231002508C86953": true, // JitOrderHandler (CONTROLLER)
      "0xAe2453Dca7704080052AF3c212E862cab50d65C0": true, // IncreaseOrderExecutor (CONTROLLER)
      "0x08f5144D078E119dF361443CAD413f4738d391f9": true, // DecreaseOrderExecutor (CONTROLLER)
      "0x78cE5527A7D4725BB72c4FdB5a163aa512cc4C35": true, // SwapOrderExecutor (CONTROLLER)
      "0x839B6e19E54A5862da61974A01675a5f6CC5c8b4": true, // DepositHandler (CONTROLLER)
      "0x5bB6DCb09010069228B2aA766FAE513EF7923472": true, // WithdrawalHandler (CONTROLLER)
      "0xec0e4A27a9fbfc64e4915c254B961260df28054c": true, // AdlHandler (CONTROLLER)
      "0x1bC32eeCAa8F504D2225096649A0347153A37f10": true, // LiquidationHandler (CONTROLLER)
      "0xAD712E1667bC8AAa6C4EA5f47dcD487ddd96BC35": true, // ShiftHandler (CONTROLLER)
      "0xF5DB5dfAa43a5F069e27041BD062229724482Bf5": true, // GlvDepositHandler (CONTROLLER)
      "0x7499376D158194ce811f98DC6225cf8788632A35": true, // GlvWithdrawalHandler (CONTROLLER)
      "0x4C9211a59A8C678444c1044ec1736eF64dceF662": true, // GlvShiftHandler (CONTROLLER)
      "0x352f684ab9e97a6321a13CF03A61316B681D9fD2": true, // SwapHandler (CONTROLLER)
      "0x162e3a5B47C9a45ff762E5b4b23D048D6780C14e": true, // ClaimHandler (CONTROLLER)
      "0x9E721ef9b908B4814Aa18502692E4c5666d1942e": true, // LayerZeroProvider (CONTROLLER)
      "0x421eB756B8f887f036e7332801288BC2bbA600aC": true, // MultichainClaimsRouter (CONTROLLER)
      "0x9C11DFa4DAFA9227Ef172cc1d87D4D5008804C47": true, // MultichainGlvRouter (CONTROLLER)
      "0x6a960F397eB8F2300F9FfA746F11375A613C5027": true, // MultichainGmRouter (CONTROLLER)
      "0xbC074fF8b85f9b66884E1EdDcE3410fde96bd798": true, // MultichainOrderRouter (CONTROLLER)
      "0x8138Ce254Bc0AfE40369FDC2D1e46cE90944406d": true, // MultichainSubaccountRouter (CONTROLLER)
      "0x844D38f2c3875b8351feB4764718E1c64bD55c46": true, // MultichainTransferRouter (CONTROLLER)
    },
    ROUTER_PLUGIN: {
      "0xBCB5eA3a84886Ce45FBBf09eBF0e883071cB2Dc8": true, // ExchangeRouter (ROUTER_PLUGIN)
      "0xa1793126B6Dc2f7F254a6c0E2F8013D2180C0D10": true, // SubaccountRouter (ROUTER_PLUGIN)
      "0xC92741F0a0D20A95529873cBB3480b1f8c228d9F": true, // GlvRouter (ROUTER_PLUGIN)
      "0x98e86155abf8bCbA566b4a909be8cF4e3F227FAf": true, // GelatoRelayRouter (ROUTER_PLUGIN)
      "0xd6b16f5ceE328310B1cf6d8C0401C23dCd3c40d4": true, // SubaccountGelatoRelayRouter (ROUTER_PLUGIN)
      "0x9C11DFa4DAFA9227Ef172cc1d87D4D5008804C47": true, // MultichainGlvRouter (ROUTER_PLUGIN)
      "0x6a960F397eB8F2300F9FfA746F11375A613C5027": true, // MultichainGmRouter (ROUTER_PLUGIN)
      "0xbC074fF8b85f9b66884E1EdDcE3410fde96bd798": true, // MultichainOrderRouter (ROUTER_PLUGIN)
      "0x8138Ce254Bc0AfE40369FDC2D1e46cE90944406d": true, // MultichainSubaccountRouter (ROUTER_PLUGIN)
      "0x844D38f2c3875b8351feB4764718E1c64bD55c46": true, // MultichainTransferRouter (ROUTER_PLUGIN)
    },
    ROLE_ADMIN: {
      "0x72a30e76827Ce83cEf0b1BEd7e9aAF9F4a576990": true, // TimelockConfig (ROLE_ADMIN)
      "0x3d6BA4a91Ffde7C519379F8dCA5FE58b7125c294": true, // ConfigTimelockController (ROLE_ADMIN)
    },
  };
}
