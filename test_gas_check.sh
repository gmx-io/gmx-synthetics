#!/bin/bash

# Test gas regression check logic

# Generate current gas report
forge test --match-contract SwapHandlerTests --gas-report > current_gas_report.txt

# Extract swap function gas usage
SWAP_GAS=$(grep -A 20 "Gas Report" current_gas_report.txt | grep "swap" | head -n 1 | awk '{print $2}')

# Check if baseline snapshot exists
if [ -f .gas-snapshot ]; then
  # If baseline exists, extract swap-related test gas usage
  BASELINE_GAS=$(cat .gas-snapshot | grep -E "test_constantProductApproximation|test_nonNegativeReserves|test_quoteValueConservation" | awk '{print $NF}' | head -n 1)
else
  echo "Error: .gas-snapshot file not found"
  exit 1
fi

if [ -z "$SWAP_GAS" ] || [ -z "$BASELINE_GAS" ]; then
  echo "Error: Could not find swap() gas data"
  exit 1
fi

# Calculate 5% threshold
THRESHOLD=$(echo "$BASELINE_GAS * 1.05" | bc | awk -F. '{print $1}')

# Print debug information
cat current_gas_report.txt
cat .gas-snapshot

echo "Current swap() gas: $SWAP_GAS"
echo "Baseline swap() gas: $BASELINE_GAS"
echo "Threshold (5% increase): $THRESHOLD"

if [ "$SWAP_GAS" -gt "$THRESHOLD" ]; then
  echo "ERROR: swap() gas usage exceeds baseline by more than 5%"
  exit 1
else
  echo "OK: swap() gas usage is within acceptable range"
fi