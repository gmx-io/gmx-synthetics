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

      "0x6fd82De6A45eDa17c999B1DF19e1D45AF5390E0b": true, // Config
      "0x9799E846Fa5b8bBBa428ad743eeB95D79566CD6e": true, // ConfigTimelockController
      "0x8514fc704317057FA86961Ba9b9490956993A5ed": true, // TimelockConfig
      "0x805a15bf16582eC8d76841062A47dFfEa7903131": true, // ExchangeRouter
      "0xF6b804F6Cc847a22F2D022C9b0373190850bE34D": true, // SubaccountRouter
      "0xAC3D81b7a9CEaC542c556734799c0f68Ae1CDA4d": true, // GlvRouter
      "0xb34A6e9Dc8E721361a9C620EEF245535d6A5B234": true, // GelatoRelayRouter
      "0xa11B501c2dd83Acd29F6727570f2502FAaa617F2": true, // SubaccountGelatoRelayRouter
      "0x6E41023Dc3c5C41C90B509b0D829fBd5f2eE5E9D": true, // OrderHandler
      "0x87DA97cdb839692154b67a5E5bffFcf828a12fA5": true, // IncreaseOrderExecutor
      "0xaCF0802CA3C991463ED5769Aea0f98Be3939f87B": true, // DecreaseOrderExecutor
      "0xf86aE903B5866bCf8723B9C3642758C87f2F3Ef2": true, // SwapOrderExecutor
      "0xEd861a9Ce09b5452ab50953Db4B4301A833A3615": true, // DepositHandler
      "0xD6C9bBB1B0384AD25594dE7521dbFF3B30E0Bd38": true, // WithdrawalHandler
      "0xdfE1EA56e7200B04ee596737CAee714937824304": true, // AdlHandler
      "0x0F9BB54Ec2cC65344Cde88CFB06C71F68599D2A4": true, // LiquidationHandler
      "0xd5F2FD52eF8850019F6558403DF8fA6521a0B7BE": true, // ShiftHandler
      "0xfAd0f8142eb6C9Bf15960565e3782466B2B51b0f": true, // GlvDepositHandler
      "0xA51d1BF3e015533698b67F12F46b7A848625B5e4": true, // GlvWithdrawalHandler
      "0x7ffF7ef2fc8Db5159B0046ad49d018A5aB40dB11": true, // GlvShiftHandler
      "0x84b288b3348Ba6346FF1972B528eefb3e0F47C87": true, // SwapHandler
      "0x9A23a6e51B886B642D156a248795a9A84dec89Cc": true, // ClaimHandler
      "0xA2F2f7F0766cb06Fff3241Ff7D3469eFC961b907": true, // LayerZeroProvider
      "0x7f397B555f71F711d5331241519825180dc78489": true, // MultichainClaimsRouter
      "0x113d352eD6c40C856536c6826497f6971880e036": true, // MultichainGlvRouter
      "0xc9c45D216Bc4C7c5A28ca926E1087Fa745d7a4fA": true, // MultichainGmRouter
      "0x6Ee83F82757C5B10468855753F5374FFF826BDCB": true, // MultichainOrderRouter
      "0x86e92E21a0773cF542FEcBc791c05E4bae35a92f": true, // MultichainSubaccountRouter
      "0xA3e0c948AaB11ed932A9F89dd010ba79dABE1514": true, // MultichainTransferRouter
    },
    ROUTER_PLUGIN: {
      "0x805a15bf16582eC8d76841062A47dFfEa7903131": true, // ExchangeRouter
      "0xF6b804F6Cc847a22F2D022C9b0373190850bE34D": true, // SubaccountRouter
      "0xAC3D81b7a9CEaC542c556734799c0f68Ae1CDA4d": true, // GlvRouter
      "0xb34A6e9Dc8E721361a9C620EEF245535d6A5B234": true, // GelatoRelayRouter
      "0xa11B501c2dd83Acd29F6727570f2502FAaa617F2": true, // SubaccountGelatoRelayRouter
      "0x113d352eD6c40C856536c6826497f6971880e036": true, // MultichainGlvRouter
      "0xc9c45D216Bc4C7c5A28ca926E1087Fa745d7a4fA": true, // MultichainGmRouter
      "0x6Ee83F82757C5B10468855753F5374FFF826BDCB": true, // MultichainOrderRouter
      "0x86e92E21a0773cF542FEcBc791c05E4bae35a92f": true, // MultichainSubaccountRouter
      "0xA3e0c948AaB11ed932A9F89dd010ba79dABE1514": true, // MultichainTransferRouter
    },
    ROLE_ADMIN: {
      "0x8514fc704317057FA86961Ba9b9490956993A5ed": true, // TimelockConfig
      "0x9799E846Fa5b8bBBa428ad743eeB95D79566CD6e": true, // ConfigTimelockController
    },
  };
}
