import { ethers } from "hardhat";
import { calculateCreate2 } from "eth-create2-calculator";

import GlvArtifact from "../../artifacts/contracts/glv/Glv.sol/Glv.json";

import { contractAt } from "../deploy";
import { hashData } from "../hash";
import { bigNumberify, expandDecimals } from "../math";
import { logGasUsage } from "../gas";
import * as keys from "../keys";
import { executeWithOracleParams } from "../exchange";
import { parseLogs } from "../event";
import { getCancellationReason, getErrorString } from "../error";
import { expect } from "chai";

export function getGlvShiftKeys(dataStore, start, end) {
  return dataStore.getBytes32ValuesAt(keys.GLV_SHIFT_LIST, start, end);
}

export function getGlvShiftCount(dataStore) {
  return dataStore.getBytes32Count(keys.GLV_SHIFT_LIST);
}
