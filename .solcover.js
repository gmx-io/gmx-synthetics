module.exports = {
  configureYulOptimizer: true,
  skipFiles: [
    "mock",
    "reader",
    "test",
    "event",
    "deposit/DepositEventUtils.sol",
    "market/MarketEventUtils.sol",
    "order/OrderEventUtils.sol",
    "position/PositionEventUtils.sol",
    "referral/ReferralEventUtils.sol",
    "withdrawal/WithdrawalEventUtils.sol",
  ],
};
