export function getRoles({ syntheticKeepers, chainlinkKeepers, gelatoKeepers, generalConfigKeepers }) {
  return {
    ADL_KEEPER: syntheticKeepers.mainnet,
    FROZEN_ORDER_KEEPER: syntheticKeepers.mainnet,
    LIQUIDATION_KEEPER: syntheticKeepers.mainnet,
    ORDER_KEEPER: { ...syntheticKeepers.mainnet, ...chainlinkKeepers.arbitrum, ...gelatoKeepers.arbitrum },
    LIMITED_CONFIG_KEEPER: syntheticKeepers.mainnet,
    CLAIM_ADMIN: {
      "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
      "0x2B5765633b7059a10a25af47B45409ea47AbC689": true, // claim_admin_1
      "0xD2E217d800C41c86De1e01FD72009d4Eafc539a3": true, // claim_admin_2
      ...generalConfigKeepers.mainnet,
    },
    CONFIG_KEEPER: {
      "0x4b6ACC5b2db1757bD49408FeE92e32D39608B5d9": true, // multisig_1
      "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
      "0xd41e09434CDFe20ceA9411f55D86dDb314b6Af94": true, // ConfigSyncer
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
      "0x4b6ACC5b2db1757bD49408FeE92e32D39608B5d9": true, // multisig_1
      "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
    },
    TIMELOCK_MULTISIG: {
      "0x4b6ACC5b2db1757bD49408FeE92e32D39608B5d9": true, // multisig_1
      "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
    },
    GOV_TOKEN_CONTROLLER: {
      "0x5E4766F932ce00aA4a1A82d3Da85adf15C5694A1": true, // RewardRouterV2
    },
    CONTROLLER: {
      "0xf5F30B10141E1F63FC11eD772931A8294a591996": true, // MarketFactory
      "0xdaFa7Deb67805d7498Aa926002bB2d713D1d9256": true, // GlvFactory
      "0xA8AF9B86fC47deAde1bc66B12673706615E2B011": true, // OracleStore
      "0x7EB417637a3E6d1C19E6d69158c47610b7a5d9B3": true, // FeeHandler

      "0x1d3dbe2F913dcA27E943b2837A4Cdad6653B02E2": true, // Config
      "0xd41e09434CDFe20ceA9411f55D86dDb314b6Af94": true, // ConfigSyncer
      "0xdD67459D3e98EdDAA9770EbB7C38fF8F643f229f": true, // ConfigTimelockController
      "0x4729D9f61c0159F5e02D2C2e5937B3225e55442C": true, // ContributorHandler
      "0xaF3A3B4685008ebDD1fF98fc47A14D3ab5ffCfc1": true, // TimelockConfig
      "0x7F01614cA5198Ec979B1aAd1DAF0DE7e0a215BDF": true, // Oracle
      "0xb8fc96d7a413C462F611A7aC0C912c2FE26EAbC4": true, // FeeHandler Oracle
      "0x87d66368cD08a7Ca42252f5ab44B2fb6d1Fb8d15": true, // ExchangeRouter
      "0x5b9A353F18d543B9F8a57B2AE50a4FBc80033EC1": true, // SubaccountRouter
      "0x10Fa5Bd343373101654E896B43Ca38Fd8f3789F9": true, // GlvRouter
      "0x0C08518C41755C6907135266dCCf09d51aE53CC4": true, // GelatoRelayRouter
      "0xA1D94802EcD642051B677dBF37c8E78ce6dd3784": true, // SubaccountGelatoRelayRouter
      "0x04315E233C1c6FfA61080B76E29d5e8a1f7B4A35": true, // OrderHandler
      "0x1DAa9A375132a3cDe9133B0a5DA67B57Ef21d102": true, // IncreaseOrderExecutor
      "0x3F4ee93723C2F14eeC5a44a2Cb66edA006A171fd": true, // DecreaseOrderExecutor
      "0x455D555350D5CcCD1E3Eb3D563B411Ef24697050": true, // SwapOrderExecutor
      "0x563E8cDB5Ba929039c2Bb693B78CE12dC0AAfaDa": true, // DepositHandler
      "0x1EC018d2b6ACCA20a0bEDb86450b7E27D1D8355B": true, // WithdrawalHandler
      "0xDd20D75f92bF27e17d86D74424ce7435843E8df0": true, // AdlHandler
      "0xdFc557EdF817bCd69F3b82d54f6338ecad2667CA": true, // LiquidationHandler
      "0x763fD06BaF6bBcE1A06ab94C6dFd13813E517938": true, // ShiftHandler
      "0xBB4C47CDfb90e281cAAE873c9531A25eBe2eD343": true, // GlvDepositHandler
      "0x7A74946892569Fd488012D015436a5a9cBf37BEf": true, // GlvWithdrawalHandler
      "0x632b763B31f9A1cB28c4f93925A591Cd34073AD6": true, // GlvShiftHandler
      "0xDb2AB9566732710d02b23325F79A8832118b97c5": true, // SwapHandler
      "0x28f1F4AA95F49FAB62464536A269437B13d48976": true, // ClaimHandler
      "0x7129Ea01F0826c705d6F7ab01Cf3C06bb83E9397": true, // LayerZeroProvider
      "0x2A7244EE5373D2F161cE99F0D144c12860D651Af": true, // MultichainClaimsRouter
      "0xFdaFa6fbd4B480017FD37205Cb3A24AE93823956": true, // MultichainGlvRouter
      "0xF53e30CE07f148fdE6e531Be7dC0b6ad670E8C6e": true, // MultichainGmRouter
      "0x3c796504d47013Ea0552CCa57373B59DF03D34a0": true, // MultichainOrderRouter
      "0x99CD306B777C5aAb842bA65e4f7FF0554ECDe808": true, // MultichainSubaccountRouter
      "0xC1D1354A948bf717d6d873e5c0bE614359AF954D": true, // MultichainTransferRouter
    },
    ROUTER_PLUGIN: {
      "0x87d66368cD08a7Ca42252f5ab44B2fb6d1Fb8d15": true, // ExchangeRouter
      "0x5b9A353F18d543B9F8a57B2AE50a4FBc80033EC1": true, // SubaccountRouter
      "0x10Fa5Bd343373101654E896B43Ca38Fd8f3789F9": true, // GlvRouter
      "0x0C08518C41755C6907135266dCCf09d51aE53CC4": true, // GelatoRelayRouter
      "0xA1D94802EcD642051B677dBF37c8E78ce6dd3784": true, // SubaccountGelatoRelayRouter
      "0xFdaFa6fbd4B480017FD37205Cb3A24AE93823956": true, // MultichainGlvRouter
      "0xF53e30CE07f148fdE6e531Be7dC0b6ad670E8C6e": true, // MultichainGmRouter
      "0x3c796504d47013Ea0552CCa57373B59DF03D34a0": true, // MultichainOrderRouter
      "0x99CD306B777C5aAb842bA65e4f7FF0554ECDe808": true, // MultichainSubaccountRouter
      "0xC1D1354A948bf717d6d873e5c0bE614359AF954D": true, // MultichainTransferRouter
    },
    ROLE_ADMIN: {
      "0x4bd1cdAab4254fC43ef6424653cA2375b4C94C0E": true, // GMX DAO
      "0xaF3A3B4685008ebDD1fF98fc47A14D3ab5ffCfc1": true, // TimelockConfig
      "0xdD67459D3e98EdDAA9770EbB7C38fF8F643f229f": true, // ConfigTimelockController
    },
  };
}
