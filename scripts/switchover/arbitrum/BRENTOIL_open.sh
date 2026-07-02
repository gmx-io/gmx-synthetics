#!/bin/bash

MARKET=0x6F287D071800BfA847B4a7a7104BE33F87Ce9E74 \
MARKET_STATE=onHours \
npx hardhat run scripts/updateMarketConfig.ts --network arbitrum
