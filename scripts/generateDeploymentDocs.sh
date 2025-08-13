#!/bin/bash

# Check if any deployment files have been modified in the last commit
DEPLOYMENT_CHANGED=$(git diff --name-only HEAD~1 HEAD | grep -E "deployments/(arbitrum|avalanche|botanix|arbitrumSepolia|avalancheFuji)/.*\.json$")

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
  
  git commit -m "Auto-commit deployment docs for ${CHANGED_NETWORKS}"
  echo "Deployment docs auto-updated and committed successfully!"
fi