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
| Arbitrum One | 147 | [View](./arbitrum-deployments.md) | Jul 15, 2026, 04:36 PM UTC |
| Avalanche C-Chain | 144 | [View](./avalanche-deployments.md) | Jul 15, 2026, 04:36 PM UTC |
| Botanix | 132 | [View](./botanix-deployments.md) | Dec 19, 2025, 06:06 AM UTC |
| MegaETH | 134 | [View](./megaEth-deployments.md) | May 7, 2026, 03:13 AM UTC |

### Testnet

| Network | Contracts | Documentation | Last Updated |
|---------|-----------|---------------|-------------|
| Arbitrum Sepolia | 142 | [View](./arbitrumSepolia-deployments.md) | Jul 15, 2026, 04:36 PM UTC |
| Avalanche Fuji | 143 | [View](./avalancheFuji-deployments.md) | May 27, 2026, 08:25 AM UTC |
