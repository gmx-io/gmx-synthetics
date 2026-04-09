#!/bin/bash

MARKET=0x0000000000000000000000000000000000000002 \
MARKET_STATE=regular \
npx hardhat run scripts/updateMarketConfig.ts --network arbitrumSepolia
