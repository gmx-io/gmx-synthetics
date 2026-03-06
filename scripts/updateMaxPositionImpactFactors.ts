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
  ZEC: 100,
  ZORA: 300,
  ZRO: 500,
  XPL: 100,
  XRP: 200,
  XMR: 200,
  XLM: 150,
  WLFI: 400,
  WIF: 300,
  WLD: 150,
  VVV: 1000,
  UNI: 150,
  VIRTUAL: 200,
  TON: 150,
  TRX: 100,
  TRUMP: 150,
  TAO: 250,
  TIA: 250,
  SYRUP: 300,
  SUI: 200,
  STX: 500,
  SKY: 500,
  SHIB: 100,
  S: 250,
  SATS: 700,
  SEI: 250,
  RENDER: 500,
  PUMP: 150,
  PENGU: 150,
  POL: 300,
  ORDI: 250,
  PENDLE: 300,
  OP: 150,
  OM: 300,
  ONDO: 200,
  NEAR: 100,
  OKB: 500,
  MORPHO: 1000,
  MOODENG: 250,
  MEW: 500,
  MNT: 500,
  MON: 500,
  MELANIA: 1000,
  MEME: 500,
  LINK: 100,
  LINEA: 300,
  LDO: 250,
  KAS: 300,
  JUP: 300,
  ICP: 200,
  INJ: 150,
  JTO: 500,
  HYPE: 100,
  HBAR: 250,
  FIL: 200,
  GMX: 500,
  FET: 300,
  ENA: 100,
  FARTCOIN: 150,
  DOT: 250,
  DYDX: 200,
  EIGEN: 200,
  DOLO: 500,
  DASH: 200,
  DOGE: 100,
  CVX: 500,
  CRV: 100,
  CRO: 100,
  CAKE: 300,
  CHZ: 500,
  BOME: 300,
  BRETT: 500,
  AVAX: 100,
  BERA: 300,
  AVNT: 300,
  ATOM: 150,
  ASTER: 100,
  ARB: 150,
  APT: 150,
  APE: 150,
  ANIME: 300,
  AIXBT: 300,
  ALGO: 500,
  AERO: 300,
  ADA: 150,
  AAVE: 150,
  "0G": 150,
};
