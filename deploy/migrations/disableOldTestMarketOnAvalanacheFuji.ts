import { setBoolIfDifferent } from "../../utils/dataStore";
import * as keys from "../../utils/keys";

const func = async () => {
  await setBoolIfDifferent(
    keys.isMarketDisabledKey("0x59C8ABb4592e8A317c148D16aFeC3B459131fa09"),
    true,
    "disable TEST market"
  );

  return true;
};

func.tags = ["DisableOldTestMarketOnAvalancheFuji"];
func.id = "DisableOldTestMarketOnAvalancheFuji";
func.dependencies = ["DataStore"];
func.skip = ({ network }) => {
  return network.name !== "avalancheFuji";
};

export default func;
