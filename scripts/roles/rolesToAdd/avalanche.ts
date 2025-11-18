export const ROLES_TO_ADD = [
  {
    role: "CLAIM_ADMIN",
    member: "0xd2e217d800c41c86de1e01fd72009d4eafc539a3",
  },
  {
    role: "CLAIM_ADMIN",
    member: "0xc5e038d696d9cb757ffdf53aa34e515d0e42f7cd",
  },
  {
    role: "CLAIM_ADMIN",
    member: "0xb10e24b211d2321b12b21c52eac38ac6e00799cc",
  },
  {
    role: "CONFIG_KEEPER",
    member: "0x4bdcab27bb7e03308fe20ae166103bf7fda71a06",
    contractName: "ConfigSyncer",
  },
  {
    role: "CONFIG_KEEPER",
    member: "0xb10e24b211d2321b12b21c52eac38ac6e00799cc",
  },
  {
    role: "CONTROLLER",
    member: "0x7591b82203c3b33b5cb233c40517f1bc872db774",
    contractName: "Config",
  },
  {
    role: "CONTROLLER",
    member: "0x4bdcab27bb7e03308fe20ae166103bf7fda71a06",
    contractName: "ConfigSyncer",
  },
  {
    role: "CONTROLLER",
    member: "0x20d56cf90fd3c8f3beb9bac03afda3241093de36",
    contractName: "ConfigTimelockController",
  },
  {
    role: "CONTROLLER",
    member: "0x37e1aeb6118b0106810d2ef7662875c414e39ca4",
    contractName: "TimelockConfig",
  },
  {
    role: "CONTROLLER",
    member: "0x8f550e53dfe96c055d5bdb267c21f268fcaf63b2",
    contractName: "ExchangeRouter",
  },
  {
    role: "CONTROLLER",
    member: "0xf43f559774d2cf7882e6e846fcb87bde183a6da7",
    contractName: "SubaccountRouter",
  },
  {
    role: "CONTROLLER",
    member: "0x7e425c47b2ff0be67228c842b9c792d0bce58ae6",
    contractName: "GlvRouter",
  },
  {
    role: "CONTROLLER",
    member: "0xee2d3339cbce7a42573c96acc1298a79a5c996df",
    contractName: "GelatoRelayRouter",
  },
  {
    role: "CONTROLLER",
    member: "0xfabeb65bb877600be3a2c2a03aa56a95f9f845b9",
    contractName: "SubaccountGelatoRelayRouter",
  },
  {
    role: "CONTROLLER",
    member: "0x823b558b4bc0a2c4974a0d8d7885aa1102d15dec",
    contractName: "OrderHandler",
  },
  {
    role: "CONTROLLER",
    member: "0xf90fec8bf858d3445938fb202d962889c37874ae",
    contractName: "JitOrderHandler",
  },
  {
    role: "CONTROLLER",
    member: "0x63abc52a2750c7cb65d560b52627ec8f6207d9f9",
    contractName: "IncreaseOrderExecutor",
  },
  {
    role: "CONTROLLER",
    member: "0x40fe9ea67c9d29e77661837e986ef20a78c5e9ce",
    contractName: "DecreaseOrderExecutor",
  },
  {
    role: "CONTROLLER",
    member: "0x92a542690f8a347e2ee9e51c2da0ea38e1186cdb",
    contractName: "SwapOrderExecutor",
  },
  {
    role: "CONTROLLER",
    member: "0xcc2645e961514a694bca228686ec664933c70647",
    contractName: "DepositHandler",
  },
  {
    role: "CONTROLLER",
    member: "0x334237f7d75497a22b1443f44ddccf95e72904a0",
    contractName: "WithdrawalHandler",
  },
  {
    role: "CONTROLLER",
    member: "0x858559d39fe8b2fdfe452f895db36077859130e1",
    contractName: "AdlHandler",
  },
  {
    role: "CONTROLLER",
    member: "0xad7f00b4080bacffaae7f44d67560c818d8e5468",
    contractName: "LiquidationHandler",
  },
  {
    role: "CONTROLLER",
    member: "0x6adf7026d53057ced269dfda318103db4f0aa4ba",
    contractName: "ShiftHandler",
  },
  {
    role: "CONTROLLER",
    member: "0x2337e7e4b9ec811c7f99d0d16897e5db12bd8b39",
    contractName: "GlvDepositHandler",
  },
  {
    role: "CONTROLLER",
    member: "0xd27bbe7937f39cc5cde6d9f041e42174ed509b96",
    contractName: "GlvWithdrawalHandler",
  },
  {
    role: "CONTROLLER",
    member: "0x441541167b041ec507b5308b7005075a13a28aa7",
    contractName: "GlvShiftHandler",
  },
  {
    role: "CONTROLLER",
    member: "0x0dc24af5bbbec90c1defd8f5f72e47c7d298c0ae",
    contractName: "SwapHandler",
  },
  {
    role: "CONTROLLER",
    member: "0xefcada759241d10b45d9cb6265b19adec97ceced",
    contractName: "ClaimHandler",
  },
  {
    role: "CONTROLLER",
    member: "0xf85fd576bbe22bce785b68922c1c9849d62737c0",
    contractName: "LayerZeroProvider",
  },
  {
    role: "CONTROLLER",
    member: "0xd10b10b816030347ff4e6767d340371b40b9f03d",
    contractName: "MultichainClaimsRouter",
  },
  {
    role: "CONTROLLER",
    member: "0xeee61742bc4cf361c60cd65826864560bf2d0bb6",
    contractName: "MultichainGlvRouter",
  },
  {
    role: "CONTROLLER",
    member: "0xa191bc0b72332e4c2022db50a9d619079cc6c4fd",
    contractName: "MultichainGmRouter",
  },
  {
    role: "CONTROLLER",
    member: "0xd099565957046a2d2cf41b0cc9f95e14a8afd13b",
    contractName: "MultichainOrderRouter",
  },
  {
    role: "CONTROLLER",
    member: "0x5872e84e5ea23292b40183be86d25fb428621fc1",
    contractName: "MultichainSubaccountRouter",
  },
  {
    role: "CONTROLLER",
    member: "0x5a44a3b026d50ec039582fdb3afdd88e2092e211",
    contractName: "MultichainTransferRouter",
  },
  {
    role: "MARKET_KEEPER",
    member: "0xb10e24b211d2321b12b21c52eac38ac6e00799cc",
  },
  {
    role: "ROLE_ADMIN",
    member: "0x37e1aeb6118b0106810d2ef7662875c414e39ca4",
    contractName: "TimelockConfig",
  },
  {
    role: "ROLE_ADMIN",
    member: "0x20d56cf90fd3c8f3beb9bac03afda3241093de36",
    contractName: "ConfigTimelockController",
  },
  {
    role: "ROUTER_PLUGIN",
    member: "0x8f550e53dfe96c055d5bdb267c21f268fcaf63b2",
    contractName: "ExchangeRouter",
  },
  {
    role: "ROUTER_PLUGIN",
    member: "0xf43f559774d2cf7882e6e846fcb87bde183a6da7",
    contractName: "SubaccountRouter",
  },
  {
    role: "ROUTER_PLUGIN",
    member: "0x7e425c47b2ff0be67228c842b9c792d0bce58ae6",
    contractName: "GlvRouter",
  },
  {
    role: "ROUTER_PLUGIN",
    member: "0xee2d3339cbce7a42573c96acc1298a79a5c996df",
    contractName: "GelatoRelayRouter",
  },
  {
    role: "ROUTER_PLUGIN",
    member: "0xfabeb65bb877600be3a2c2a03aa56a95f9f845b9",
    contractName: "SubaccountGelatoRelayRouter",
  },
  {
    role: "ROUTER_PLUGIN",
    member: "0xeee61742bc4cf361c60cd65826864560bf2d0bb6",
    contractName: "MultichainGlvRouter",
  },
  {
    role: "ROUTER_PLUGIN",
    member: "0xa191bc0b72332e4c2022db50a9d619079cc6c4fd",
    contractName: "MultichainGmRouter",
  },
  {
    role: "ROUTER_PLUGIN",
    member: "0xd099565957046a2d2cf41b0cc9f95e14a8afd13b",
    contractName: "MultichainOrderRouter",
  },
  {
    role: "ROUTER_PLUGIN",
    member: "0x5872e84e5ea23292b40183be86d25fb428621fc1",
    contractName: "MultichainSubaccountRouter",
  },
  {
    role: "ROUTER_PLUGIN",
    member: "0x5a44a3b026d50ec039582fdb3afdd88e2092e211",
    contractName: "MultichainTransferRouter",
  },
];
