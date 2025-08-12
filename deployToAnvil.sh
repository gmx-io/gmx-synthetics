#\!/bin/bash

echo "Full GMX Deployment to Anvil"

# Kill any existing Anvil instance
echo "Stopping existing Anvil instances..."
pkill -f anvil || true
sleep 2

# Start Anvil with specific configuration for Hardhat compatibility
echo "Starting Anvil with Hardhat-compatible settings..."
anvil \
    --chain-id 31337 \
    --port 8545 \
    --accounts 10 \
    --balance 10000 \
    --gas-limit 30000000 \
    --code-size-limit 30000 \
    --base-fee 0 \
    --gas-price 0 \
    --auto-impersonate \
    --steps-tracing \
    --silent &

ANVIL_PID=$!
echo "Anvil started (PID: $ANVIL_PID)"

# Wait for Anvil to be ready
sleep 3

# Verify Anvil is running
if \! curl -s -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    http://localhost:8545 > /dev/null; then
    echo "❌ Anvil failed to start"
    exit 1
fi

echo "✅ Anvil is running"

# Clean previous deployment
echo "Cleaning previous deployments..."
rm -rf deployments/localhost

# Deploy contracts
echo "Deploying contracts..."
export NODE_OPTIONS="--max_old_space_size=8192"
export SKIP_AUTO_HANDLER_REDEPLOYMENT=false

npx hardhat deploy --network localhost --reset

echo ""
echo "Markets deployed and configured (based on markets.ts, tokens.ts):"
npx hardhat run scripts/printMarkets.ts --network localhost

echo ""
echo "Deployment complete\!"
echo "Anvil PID: $ANVIL_PID"
echo ""
echo "To verify deployment:"
echo "  forge test --match-contract ConnectionTest -vv"
echo ""
echo "To stop Anvil:"
echo "  kill $ANVIL_PID"
