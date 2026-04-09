#!/bin/bash

MARKET=0x0000000000000000000000000000000000000001 \
MARKET_STATE=closed \
npx hardhat run scripts/updateMarketConfig.ts --network arbitrumSepolia
