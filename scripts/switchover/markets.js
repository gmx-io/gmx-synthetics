// Which markets this cron switches, and how they are addressed on-chain. Membership
// only — the instants live in the schedule file. Calendar names must match the ones the
// risk oracle writes there.
//
// switchoverOnly limits the run to positionFeeFactor, for markets whose other parameters
// the oracle publishes itself; without it the whole config block is written.

module.exports = {
  arbitrum: {
    CME_Commodity: [
      { symbol: "GOLD", market: "0x0Df2BE76F517BCF0000AbfFcB6344B3b2aC4Cc4f", switchoverOnly: true },
      { symbol: "SILVER", market: "0x448Fa722717df299ee197E2F6d8EB7911EFF6cEc", switchoverOnly: true },
      { symbol: "WTIOIL", market: "0xda81cdd397210C08cFc567f93982E148A3aac8a6", switchoverOnly: true },
      { symbol: "BRENTOIL", market: "0x6F287D071800BfA847B4a7a7104BE33F87Ce9E74", switchoverOnly: true },
      { symbol: "NATGAS", market: "0x2Ce2bc8B0f9d000f359d756a5816C125474Bb39b", switchoverOnly: true },
    ],
    NYSE: [
      { symbol: "SPCX", market: "0x470128853D74dab7423904a20eA5AA230e9e561B", switchoverOnly: true },
      { symbol: "QQQ", market: "0x1C132E43029efCd57435eE79ceA98006C6227A6f", switchoverOnly: true },
      { symbol: "SPY", market: "0xcBd4c1b0c89D50793c5A3e8d96d98FcB4f1B1c47", switchoverOnly: true },
    ],
  },
  arbitrumSepolia: {
    CME_Commodity: [{ symbol: "XAU", market: "0x860F6B4B2F218885935C306B1c782a864ed2d67f", switchoverOnly: false }],
  },
};
