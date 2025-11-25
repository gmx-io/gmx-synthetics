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
      "0x15F9eBC71c539926B8f652a534d29B4Af57CaD55": true, // multisig_1
      "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
      "0x4BdCaB27bB7e03308Fe20AE166103BF7fdA71A06": true, // ConfigSyncer (CONFIG_KEEPER)
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
      "0xAd7a7568F500F65AEA3D9417A210CBc5dcD7b273": true, // FeeHandler Oracle
      "0xE1d5a068c5b75E0c7Ea1A9Fe8EA056f9356C6fFD": true, // Oracle

      "0x7591b82203C3B33b5cb233C40517f1bC872db774": true, // Config (CONTROLLER)
      "0x4BdCaB27bB7e03308Fe20AE166103BF7fdA71A06": true, // ConfigSyncer (CONTROLLER)
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
    },
    ROLE_ADMIN: {
      "0x37e1AeB6118B0106810D2eF7662875C414e39Ca4": true, // TimelockConfig (ROLE_ADMIN)
      "0x20D56cf90fD3C8f3bEb9BAC03AfdA3241093DE36": true, // ConfigTimelockController (ROLE_ADMIN)
    },
  };
}
