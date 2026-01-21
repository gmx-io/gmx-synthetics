import { BigNumber } from "ethers";
import { encodeData } from "../utils/hash";
import * as keys from "../utils/keys";
import { ChangeResult, ConfigChangeItem, handleConfigChanges } from "./updateConfigUtils";
import { expandDecimals } from "../utils/math";

export async function read() {
  const tokens = await hre.gmx.getTokens();
  const addressToSymbol: { [address: string]: string } = {};
  for (const [tokenSymbol, tokenConfig] of Object.entries(tokens)) {
    let address = (tokenConfig as any).address;
    if (!address) {
      address = (await hre.ethers.getContract(tokenSymbol)).address;
    }
    addressToSymbol[address] = tokenSymbol;
  }

  const reader = await hre.ethers.getContract("Reader");
  const dataStore = await hre.ethers.getContract("DataStore");
  const markets: {
    marketToken: string;
    indexToken: string;
    longToken: string;
    shortToken: string;
  }[] = await reader.getMarkets(dataStore.address, 0, 1000);

  const marketsToUpdate = new Set(Object.keys(updates));

  for (const market of markets) {
    const indexSymbol = addressToSymbol[market.indexToken];

    if (!(indexSymbol in updates)) {
      continue;
    }

    marketsToUpdate.delete(indexSymbol);

    const maxNegativeImpactFactor = await dataStore.getUint(keys.maxPositionImpactFactorKey(market.marketToken, false));
    console.log(
      `${market.marketToken} (${indexSymbol} [${addressToSymbol[market.longToken]}-${
        addressToSymbol[market.shortToken]
      }]): ${maxNegativeImpactFactor / 1e26}`
    );
  }

  if (marketsToUpdate.size > 0) {
    console.error("marketsToUpdate is not empty: %s", Array.from(marketsToUpdate).join(", "));
    process.exit(1);
  }
}

async function write() {
  const configItems: ConfigChangeItem[] = [];
  const tokens = await hre.gmx.getTokens();
  const addressToSymbol: { [address: string]: string } = {};
  for (const [tokenSymbol, tokenConfig] of Object.entries(tokens)) {
    let address = (tokenConfig as any).address;
    if (!address) {
      address = (await hre.ethers.getContract(tokenSymbol)).address;
    }
    addressToSymbol[address] = tokenSymbol;
  }

  const reader = await hre.ethers.getContract("Reader");
  const dataStore = await hre.ethers.getContract("DataStore");
  const markets: {
    marketToken: string;
    indexToken: string;
    longToken: string;
    shortToken: string;
  }[] = await reader.getMarkets(dataStore.address, 0, 1000);

  const marketsToUpdate = new Set(Object.keys(updates));

  for (const market of markets) {
    const indexSymbol = addressToSymbol[market.indexToken];

    if (!(indexSymbol in updates)) {
      continue;
    }

    marketsToUpdate.delete(indexSymbol);

    configItems.push({
      type: "uint",
      baseKey: keys.MAX_POSITION_IMPACT_FACTOR,
      keyData: encodeData(["address", "bool"], [market.marketToken, false]),
      value: BigNumber.from(updates[indexSymbol]).mul(expandDecimals(1, 26)),
      label: `maxPositionImpactFactor for negative ${indexSymbol} [${addressToSymbol[market.longToken]}-${
        addressToSymbol[market.shortToken]
      }]`,
    });
  }

  const changeResult = await handleConfigChanges(configItems, false, 100);

  if (changeResult == ChangeResult.NO_CHANGES) {
    console.log("no changes");
  } else if (changeResult == ChangeResult.SIMULATE) {
    console.log("simulation done");
  } else if (changeResult == ChangeResult.WRITE) {
    console.log("write done");
  }
}

write();

const updates = {
  ZEC: 50,
  ZORA: 50,
  ZRO: 50,
  XPL: 50,
  XRP: 50,
  XMR: 50,
  XLM: 50,
  WLFI: 50,
  WIF: 50,
  WLD: 50,
  VVV: 50,
  UNI: 50,
  VIRTUAL: 50,
  TON: 50,
  TRX: 50,
  TRUMP: 50,
  TAO: 50,
  TIA: 50,
  SYRUP: 50,
  SUI: 50,
  STX: 50,
  SKY: 50,
  SHIB: 50,
  S: 50,
  SATS: 50,
  SEI: 50,
  RENDER: 50,
  PUMP: 50,
  PENGU: 50,
  POL: 50,
  ORDI: 50,
  PENDLE: 50,
  OP: 50,
  OM: 50,
  ONDO: 50,
  NEAR: 50,
  OKB: 50,
  MORPHO: 50,
  MOODENG: 50,
  MEW: 50,
  MNT: 50,
  MON: 50,
  MELANIA: 50,
  MEME: 50,
  LINK: 50,
  LINEA: 50,
  LDO: 50,
  KAS: 50,
  JUP: 50,
  ICP: 50,
  INJ: 50,
  JTO: 50,
  HYPE: 50,
  HBAR: 50,
  FIL: 50,
  GMX: 50,
  FET: 50,
  ENA: 50,
  FARTCOIN: 50,
  DOT: 50,
  DYDX: 50,
  EIGEN: 50,
  DOLO: 50,
  DASH: 50,
  DOGE: 50,
  CVX: 50,
  CRV: 50,
  CRO: 50,
  CAKE: 50,
  CHZ: 50,
  BOME: 50,
  BRETT: 50,
  AVAX: 50,
  BERA: 50,
  AVNT: 50,
  ATOM: 50,
  ASTER: 50,
  ARB: 50,
  APT: 50,
  APE: 50,
  ANIME: 50,
  AIXBT: 50,
  ALGO: 50,
  AERO: 50,
  ADA: 50,
  AAVE: 50,
  "0G": 50,
};
