# GMX Synthetics Documentation

This directory contains automatically generated deployment documentation for GMX Synthetics contracts across all supported networks.

## Automatic Updates

The deployment documentation is automatically updated when:
1. **On commit** - When deployment files change, the pre-commit hook selectively updates only the affected network documentation and this README
2. **Manual update** - Run `npx hardhat generate-deployment-docs` to regenerate all network documentation files. Manual runs update all network documentation files regardless of recent changes

The documentation is generated from the deployment artifacts in `/deployments/` and is kept in sync automatically through git hooks.

## Deployments

*Note: The "Last Updated" timestamp reflects when deployment files were committed to the repository, not the on-chain deployment time. This represents when the deployment artifacts were finalized and committed after successful deployment.*

### Mainnet

| Network | Contracts | Documentation | Last Updated |
|---------|-----------|---------------|-------------|
| Arbitrum One | 132 | [View](./arbitrum-deployments.md) | Aug 13, 2025, 07:17 AM UTC |
| Avalanche C-Chain | 131 | [View](./avalanche-deployments.md) | Aug 13, 2025, 07:17 AM UTC |
| Botanix | 127 | [View](./botanix-deployments.md) | Aug 13, 2025, 07:17 AM UTC |

### Testnet

| Network | Contracts | Documentation | Last Updated |
|---------|-----------|---------------|-------------|
| Arbitrum Sepolia | 126 | [View](./arbitrumSepolia-deployments.md) | Jul 22, 2025, 09:07 AM UTC |
| Avalanche Fuji | 142 | [View](./avalancheFuji-deployments.md) | Jul 30, 2025, 02:23 PM UTC |
