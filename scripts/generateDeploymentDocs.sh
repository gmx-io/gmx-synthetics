#!/bin/bash

# Check if any deployment files have been modified
DEPLOYMENT_CHANGED=$(git diff --cached --name-only | grep -E "deployments/(arbitrum|avalanche|botanix|arbitrumSepolia|avalancheFuji)/.*\.json$")

if [ ! -z "$DEPLOYMENT_CHANGED" ]; then
  echo "Deployment files changed, updating documentation..."
  
  # Extract unique network names from changed files
  CHANGED_NETWORKS=$(echo "$DEPLOYMENT_CHANGED" | sed -n 's|deployments/\([^/]*\)/.*|\1|p' | sort -u | tr '\n' ',' | sed 's/,$//')
  
  echo "Changed networks: $CHANGED_NETWORKS"
  
  # Run the documentation generator for only the changed networks
  npx hardhat generate-deployment-docs --networks "$CHANGED_NETWORKS"
  
  # Add the README and specific network documentation files to git
  git add docs/README.md
  for network in $(echo "$CHANGED_NETWORKS" | tr ',' ' '); do
    git add "docs/${network}-deployments.md"
  done
  
  echo "Deployment documentation updated successfully!"
fi