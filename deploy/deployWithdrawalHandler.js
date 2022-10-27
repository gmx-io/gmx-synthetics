const func = async ({
  getNamedAccounts,
  deployments,
}) => {
  const { deploy, get } = deployments
  const { deployer } = await getNamedAccounts()

  const { address: roleStoreAddress } = await get("RoleStore");
  const { address: dataStoreAddress } = await get("DataStore");
  const { address: eventEmitterAddress } = await get("EventEmitter");
  const { address: withdrawalStoreAddress } = await get("WithdrawalStore");
  const { address: marketStoreAddress } = await get("MarketStore");
  const { address: oracleAddress } = await get("OracleStore");
  const { address: feeReceiverAddress } = await get("FeeReceiver");
  const { address: gasUtilsAddress } = await get("GasUtils");

  await deploy("WithdrawalHandler", {
    from: deployer,
    log: true,
    args: [
      roleStoreAddress,
      dataStoreAddress,
      eventEmitterAddress,
      withdrawalStoreAddress,
      marketStoreAddress,
      oracleAddress,
      feeReceiverAddress,
    ],
    libraries: {
      GasUtils: gasUtilsAddress,
    }
  })
}
func.tags = ["WithdrawalHandler"]
func.dependencies = [
  "RoleStore",
  "DataStore",
  "EventEmitter",
  "WithdrawalStore",
  "MarketStore",
  "Oracle",
  "FeeReceiver",
  "GasUtils",
]
module.exports = func
