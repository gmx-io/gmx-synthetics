#!/bin/bash

MARKET=0x448Fa722717df299ee197E2F6d8EB7911EFF6cEc \
MARKET_STATE=onHours \
npx hardhat run scripts/updateMarketConfig.ts --network arbitrum
