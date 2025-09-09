# GMX Synthetics Documentation

This directory contains automatically generated deployment documentation for GMX Synthetics contracts across all supported networks.

## Automatic Updates

The deployment documentation is automatically updated when:
1. **On commit** - When deployment files change, the post-commit hook selectively updates only the affected network documentation and this README
2. **Manual update** - Run `npx hardhat generate-deployment-docs` to regenerate all network documentation files. Use the `--networks <network1,network2>` flag to update specific networks only. Manual runs only update docs for networks with actual deployment changes

The documentation is generated from the deployment artifacts in `/deployments/` and is kept in sync automatically through git hooks.

## Deployments

*Note: The "Last Updated" timestamp shows when deployment artifacts were committed to git, not the actual on-chain deployment timestamps.*

### Mainnet

| Network | Contracts | Documentation | Last Updated |
|---------|-----------|---------------|-------------|
| Arbitrum One | 132 | [View](./arbitrum-deployments.md) | Aug 13, 2025, 07:17 AM UTC |
| Avalanche C-Chain | 131 | [View](./avalanche-deployments.md) | Aug 13, 2025, 07:17 AM UTC |
| Botanix | 127 | [View](./botanix-deployments.md) | Aug 13, 2025, 07:17 AM UTC |

### Testnet

| Network | Contracts | Documentation | Last Updated |
|---------|-----------|---------------|-------------|
| Arbitrum Sepolia | 128 | [View](./arbitrumSepolia-deployments.md) | Aug 21, 2025, 09:01 AM UTC |
| Avalanche Fuji | 142 | [View](./avalancheFuji-deployments.md) | Aug 21, 2025, 11:02 AM UTC |
