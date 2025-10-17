export function getRoles({ syntheticKeepers, generalConfigKeepers }) {
  return {
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
    FEE_DISTRIBUTION_KEEPER: generalConfigKeepers.mainnet,
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
      "0xAd7a7568F500F65AEA3D9417A210CBc5dcD7b273": true, // FeeHandler Oracle
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
  };
}
