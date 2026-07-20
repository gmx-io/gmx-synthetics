#!/bin/bash

MARKET=0x470128853D74dab7423904a20eA5AA230e9e561B \
MARKET_STATE=onHours \
npx hardhat run scripts/updateMarketConfig.ts --network arbitrum
