const { hashString } = require("../utils/hash")

const func = async ({
  getNamedAccounts,
  deployments
}) => {
  const { deploy, get, execute } = deployments
  const { deployer } = await getNamedAccounts()

  const { address: roleStoreAddress } = await get("RoleStore");
  const { address: dataStoreAddress } = await get("DataStore");
  const { address: eventEmitterAddress } = await get("EventEmitter");
  const { address: orderStoreAddress } = await get("OrderStore");
  const { address: positionStoreAddress } = await get("PositionStore");
  const { address: marketStoreAddress } = await get("MarketStore");
  const { address: oracleAddress } = await get("OracleStore");
  const { address: feeReceiverAddress } = await get("FeeReceiver");
  const { address: gasUtilsAddress } = await get("GasUtils");
  const { address: increaseOrderUtilsAddress } = await get("IncreaseOrderUtils");
  const { address: decreaseOrderUtilsAddress } = await get("DecreaseOrderUtils");
  const { address: swapOrderUtilsAddress } = await get("SwapOrderUtils");

  const { newlyDeployed, address } = await deploy("OrderHandler", {
    from: deployer,
    log: true,
    args: [
      roleStoreAddress,
      dataStoreAddress,
      eventEmitterAddress,
      marketStoreAddress,
      orderStoreAddress,
      positionStoreAddress,
      oracleAddress,
      feeReceiverAddress,
    ],
    libraries: {
      GasUtils: gasUtilsAddress,
      IncreaseOrderUtils: increaseOrderUtilsAddress,
      DecreaseOrderUtils: decreaseOrderUtilsAddress,
      SwapOrderUtils: swapOrderUtilsAddress,
    }
  })

  if (newlyDeployed) {
    await execute("RoleStore", { from: deployer, log: true }, "grantRole", address, hashString("CONTROLLER"))
    await execute("RoleStore", { from: deployer, log: true }, "grantRole", address, hashString("ORDER_KEEPER"))
  }
}
func.tags = ["OrderHandler"]
func.dependencies = [
  "RoleStore",
  "DataStore",
  "EventEmitter",
  "MarketStore",
  "OrderStore",
  "PositionStore",
  "Oracle",
  "FeeReceiver",
  "GasUtils",
  "IncreaseOrderUtils",
  "DecreaseOrderUtils",
  "SwapOrderUtils",
]
module.exports = func
