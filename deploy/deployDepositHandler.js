const func = async ({
  getNamedAccounts,
  deployments,
}) => {
  const { deploy, get } = deployments
  const { deployer } = await getNamedAccounts()

  const { address: roleStoreAddress } = await get("RoleStore");
  const { address: dataStoreAddress } = await get("DataStore");
  const { address: eventEmitterAddress } = await get("EventEmitter");
  const { address: depositStoreAddress } = await get("DepositStore");
  const { address: marketStoreAddress } = await get("MarketStore");
  const { address: oracleAddress } = await get("OracleStore");
  const { address: feeReceiverAddress } = await get("FeeReceiver");
  const { address: gasUtilsAddress } = await get("GasUtils");

  await deploy("DepositHandler", {
    from: deployer,
    log: true,
    args: [
      roleStoreAddress,
      dataStoreAddress,
      eventEmitterAddress,
      depositStoreAddress,
      marketStoreAddress,
      oracleAddress,
      feeReceiverAddress,
    ],
    libraries: {
      GasUtils: gasUtilsAddress,
    }
  })
}
func.tags = ["DepositHandler"]
func.dependencies = [
  "RoleStore",
  "DataStore",
  "EventEmitter",
  "DepositStore",
  "MarketStore",
  "Oracle",
  "FeeReceiver",
  "GasUtils",
]
module.exports = func
