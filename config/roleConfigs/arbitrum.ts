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
      "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b": true, // contributor_keeper_1
    },
    CONTRIBUTOR_DISTRIBUTOR: {
      ...generalConfigKeepers.mainnet,
      ...fundDistributors.mainnet,
    },
    CONFIG_KEEPER: {
      "0x4b6ACC5b2db1757bD49408FeE92e32D39608B5d9": true, // multisig_1
      "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
      "0xEEdC3b6866a017C27236c2928BDb9040A3408A76": true, // ConfigSyncer
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
      "0xb8fc96d7a413C462F611A7aC0C912c2FE26EAbC4": true, // FeeHandler Oracle
      "0x4729D9f61c0159F5e02D2C2e5937B3225e55442C": true, // ContributorHandler
      "0x7F01614cA5198Ec979B1aAd1DAF0DE7e0a215BDF": true, // Oracle

      "0x7BDab864100Cb55B1770A8F8871FB25f2458cE89": true, // Config
      "0xEEdC3b6866a017C27236c2928BDb9040A3408A76": true, // ConfigSyncer
      "0xBa110F140e26edE9fd8B5A5c44D832Cba0B184c6": true, // ConfigTimelockController
      "0xbF27A84405Aa94B476478e5A95a2fC222bDe908a": true, // TimelockConfig
      "0x78458CFD7b5371ADD2e5Be72492620CD4e16c149": true, // ExchangeRouter
      "0x8198C09FdA188F1e8A4e5ecE4cF7e82D8298A1Ea": true, // SubaccountRouter
      "0x40336d25F5c0218efab8c3d43Db1b45C81Fe419e": true, // GlvRouter
      "0x484AC353CBcA537E9f0543D1cC4323f643974128": true, // GelatoRelayRouter
      "0xdd78aA661e4e3BD1eCAb7E0D5E25AbBbcb71464F": true, // SubaccountGelatoRelayRouter
      "0x1b9F88Ac01D5571D6795fCF91c672ce141679030": true, // OrderHandler
      "0xD191344CAa5017D3Ef9AAaed72d15D9e668081bC": true, // IncreaseOrderExecutor
      "0x0560bba77567D62584814DB9Cf1DBE38DD5AAF7D": true, // DecreaseOrderExecutor
      "0x9B3775560F0Bc60f1228Ca246970fA55cb556441": true, // SwapOrderExecutor
      "0xa811589EA8eFb0BCd0AbA1c3C610f582cD80C1c9": true, // DepositHandler
      "0x384575078fFAb77A8deEa21ec38e522d27ECF9bB": true, // WithdrawalHandler
      "0x445B3B1ff222e60BbEB8db7AFD5796495f8B4686": true, // AdlHandler
      "0xCC2645E961514A694bca228686ec664933c70647": true, // LiquidationHandler
      "0xF967Ddb18Dc039d4f1D81672430500a08ed98E13": true, // ShiftHandler
      "0xAf6D1B6420984DF6918E45c8731789589c963b34": true, // GlvDepositHandler
      "0xB7e682690e8D8714B81B48B7AacE60f66d57DBAd": true, // GlvWithdrawalHandler
      "0xD4435dd410F9fb4F12ed583F6E6ba282B0a8B344": true, // GlvShiftHandler
      "0x294a967D1750ba6b4E8A765B363bCf693D0C5b63": true, // SwapHandler
      "0x92a542690F8A347E2eE9e51c2Da0ea38e1186cDB": true, // ClaimHandler
      "0x62A7d76300D3edaB3d5B74C890b33ebD413fD214": true, // LayerZeroProvider
      "0x710816E1B4B63C9393159bBe9f7Eb5CCC5032684": true, // MultichainClaimsRouter
      "0x63AbC52A2750c7cB65D560B52627EC8f6207D9F9": true, // MultichainGlvRouter
      "0x7591b82203C3B33b5cb233C40517f1bC872db774": true, // MultichainGmRouter
      "0x379522c6c0Fc4cD8B25ae1252578eCcE295535d6": true, // MultichainOrderRouter
      "0x334237f7d75497a22B1443f44DDCcF95e72904A0": true, // MultichainSubaccountRouter
      "0x26641575Ad64FBd1B20ada59935c3471a294fB2F": true, // MultichainTransferRouter
    },
    ROUTER_PLUGIN: {
      "0x78458CFD7b5371ADD2e5Be72492620CD4e16c149": true, // ExchangeRouter
      "0x8198C09FdA188F1e8A4e5ecE4cF7e82D8298A1Ea": true, // SubaccountRouter
      "0x40336d25F5c0218efab8c3d43Db1b45C81Fe419e": true, // GlvRouter
      "0x484AC353CBcA537E9f0543D1cC4323f643974128": true, // GelatoRelayRouter
      "0xdd78aA661e4e3BD1eCAb7E0D5E25AbBbcb71464F": true, // SubaccountGelatoRelayRouter
      "0x63AbC52A2750c7cB65D560B52627EC8f6207D9F9": true, // MultichainGlvRouter
      "0x7591b82203C3B33b5cb233C40517f1bC872db774": true, // MultichainGmRouter
      "0x379522c6c0Fc4cD8B25ae1252578eCcE295535d6": true, // MultichainOrderRouter
      "0x334237f7d75497a22B1443f44DDCcF95e72904A0": true, // MultichainSubaccountRouter
      "0x26641575Ad64FBd1B20ada59935c3471a294fB2F": true, // MultichainTransferRouter
    },
    ROLE_ADMIN: {
      "0x4bd1cdAab4254fC43ef6424653cA2375b4C94C0E": true, // GMX DAO
      "0xbF27A84405Aa94B476478e5A95a2fC222bDe908a": true, // TimelockConfig
      "0xBa110F140e26edE9fd8B5A5c44D832Cba0B184c6": true, // ConfigTimelockController
    },
  };
}
