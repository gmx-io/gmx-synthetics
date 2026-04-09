#!/bin/bash

MARKET=0x860F6B4B2F218885935C306B1c782a864ed2d67f \
MARKET_STATE=closed \
npx hardhat run scripts/updateMarketConfig.ts --network arbitrumSepolia
