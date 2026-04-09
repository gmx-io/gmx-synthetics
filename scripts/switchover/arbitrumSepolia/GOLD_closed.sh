#!/bin/bash

MARKET=0x0Df2BE76F517BCF0000AbfFcB6344B3b2aC4Cc4f \
MARKET_STATE=offHours \
npx hardhat run scripts/updateMarketConfig.ts --network arbitrumSepolia
