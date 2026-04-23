#!/bin/bash

MARKET=0x2Ce2bc8B0f9d000f359d756a5816C125474Bb39b \
MARKET_STATE=offHours \
npx hardhat run scripts/updateMarketConfig.ts --network arbitrum
