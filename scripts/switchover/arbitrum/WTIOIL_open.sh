#!/bin/bash

MARKET=0xda81cdd397210C08cFc567f93982E148A3aac8a6 \
MARKET_STATE=onHours \
npx hardhat run scripts/updateMarketConfig.ts --network arbitrum
