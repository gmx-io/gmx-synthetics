-- Dune Query to find GLP holders who interacted with Archi Finance vault contracts
-- This query identifies addresses from the 44,910 GLP holders that have interacted with Archi vaults
-- query here: https://dune.com/queries/5784056

-- 1. Define Archi Finance contract addresses and their names
WITH archi_contracts AS (
  SELECT contract_address, contract_name FROM (VALUES
    (0x9ED9fD8dDd7281Dc3f9FFB2AA497E802b2b7aebA, 'ProxyAdmin'),
    (0x150B4c6bFD6fd6C7dA3b012E597D74d80b9565AC, 'PlatformTreasury'),
    (0xc5891c56c024EC2B82479D7A98582E4d7fE5d5Ff, 'AddressProvider'),
    (0xe2325B9eb309D6888F85A7f43F6c6770BE7B387F, 'CreditCaller'),
    (0xcEd4D9293002964fEA40F984c6d7e20c5eD49D35, 'CreditCallerProxy'),
    (0xc3cc687B96bD189153c411b96e683A08335A7e08, 'CreditUser'),
    (0x8718CaD7DE1B411616145669c1e1242051342fb3, 'CreditUserProxy'),
    (0x3Cf9c18AEC2B0416C288381C4683933329b3a647, 'CreditTokenStaker'),
    (0xC2202A59b806499f101F0712E7eF73C0f74FdF10, 'CreditTokenStakerProxy'),
    (0xa6ca0Da7807818d49F5dEed7DD019b3E83550aaD, 'CreditToken'),
    (0xDFd3b01d3856d6A57c8F6aE4010DEfcE507f1e11, 'CreditRewardTracker'),
    (0x20B9359f8Bc3BE6a29dc3B2859c68d05EB9F1FC0, 'CreditRewardTrackerProxy'),
    (0x264e7cba765E08697CC931eC5b480717EaE4c308, 'GMXDepositor'),
    (0x7093c218188d101f5E121Ab679cA3b5e034F7863, 'GMXDepositorProxy'),
    (0x2226E2e187cF45b6299fee90B0dF5eaf775EeCe5, 'GMXExecutor'),
    (0x65C59eE732BD249224718607Ee0EC0e293309923, 'GMXExecutorProxy'),
    (0x1F290Ce31e704b89fa62CFa5c6F123640D7e0F2E, 'CreditAggregator'),
    (0xeD36E66ad87dE148A908e8a51b78888553D87E16, 'CreditAggregatorProxy'),
    (0x7554887f4e5f9396ED3fF19E2F728668e10C4eF2, 'DepositorRewardDistributor'),
    (0x257db03e29976F900A188378Fc2c9A0C7d5615Be, 'DepositorRewardDistributorProxy'),
    (0xa46504483ec3D1FC058942ce7329b7c1370Dac07, 'CollateralReward'),
    (0xbd198617aD1dc75B0f7A0A67BbE31993919Cd716, 'CollateralRewardProxy'),
    (0x9821fC145052b740273fFae362350b226dfbaB38, 'Allowlist'),
    (0x85b6912bfC3d748D7F64893Fb9Ed354312ECD4a8, 'WETHVault'),
    (0x7674Ccf6cAE51F20d376644C42cd69EC7d4324f4, 'WETHVaultProxy'),
    (0x912AAE02c0535c3135a54bbeb8EB9Bc7465c996C, 'WETHVaultManager'),
    (0xf5eb3768b9b50E6E019E50e62DA8aC0444c6Af98, 'WETHVaultManagerProxy'),
    (0x79cE4037eA258F9b88B4317249Fb96B81D8DE2c5, 'WETHVaultRewardDistributor'),
    (0x682A7FfC1e27b44042b8aFeAeFefca2Cd4835b1D, 'WETHVaultRewardDistributorProxy'),
    (0xC1c738035254A8e9D31FB2221807F549530D5215, 'WETHSupplyBaseReward'),
    (0x9eBC025393d86f211A720b95650dff133b270684, 'WETHSupplyBaseRewardProxy'),
    (0xd3581CDB6D38CC9e934A07d07Cc605ec301F2C06, 'WETHBorrowedBaseReward'),
    (0x484ce444412fDEF5bc8C8fC87e2d1Ae307ee9e7e, 'WETHBorrowedBaseRewardProxy'),
    (0xF7b0EE061A3f154f60Ebf7B1B087DE61d33A82cd, 'USDTVault'),
    (0x179bD8d1d654DB8aa1603f232E284FF8d53a0688, 'USDTVaultProxy'),
    (0xE42911F900fFea3ccE669Ef74fa0565A801402f0, 'USDTVaultManager'),
    (0x14192d4c06E223e54Cf72A03DA6fF21689802794, 'USDTVaultManagerProxy'),
    (0x14A2F6DAaA1eC5693399bfC393d50709a551a32c, 'USDTVaultRewardDistributor'),
    (0xA8Cf4aaC2698379f63BeB296eEDaEff44d2FffD4, 'USDTVaultRewardDistributorProxy'),
    (0x7fe1fc1BC6bdf36f50a6B97219839795E695C593, 'USDTSupplyBaseReward'),
    (0xEca975BeEc3bC90C424FF101605ECBCef22b66eA, 'USDTSupplyBaseRewardProxy'),
    (0x26377F481De52dbABAd9FF1fbffa99E5C7903C3E, 'USDTBorrowedBaseReward'),
    (0x7552BA76d310D0b941fCeCb8957C5b1E18644442, 'USDTBorrowedBaseRewardProxy'),
    (0xD36b8804FA7b5A0482CFeF1ae75d65B843Dc453d, 'USDCVault'),
    (0xa7490e0828Ed39DF886b9032ebBF98851193D79c, 'USDCVaultProxy'),
    (0x01969C1c771460f0AA09A88f1d63E4959b272FF9, 'USDCVaultManager'),
    (0x0EA8C08C3b682A3CD964C416A2966b089B4497BA, 'USDCVaultManagerProxy'),
    (0xe30284A87453B3f7e1696F6b81b098F24Ec3920a, 'USDCVaultRewardDistributor'),
    (0xEc917865d70C4a50aa04e266D81D81B1C71c8Bfc, 'USDCVaultRewardDistributorProxy'),
    (0xD5276444fd311fac80837eB655C2aEc593D259D4, 'USDCSupplyBaseReward'),
    (0x670c4391f6421e4cE64D108F810C56479ADFE4B3, 'USDCSupplyBaseRewardProxy'),
    (0x786b9F4d848EF0B95CBC84C22A0C36026e8DaA9E, 'USDCBorrowedBaseReward'),
    (0x9564707C471DbC6029d7181fDc2D2a72eCC9e435, 'USDCBorrowedBaseRewardProxy'),
    (0xB589F32eE5e4b3666cB72F72EdF301F574cDf3B2, 'SimpleProxy'),
    (0x12e14fdc843fb9c64b84dfa6fb03350d6810d8e5, 'BTCVault')
  ) AS t(contract_address, contract_name)
),

-- 2. Get all GLP holders from the incident (44,910 addresses)
-- https://dune.com/queries/5562749
glp_holders AS (
  SELECT 
    d.account,
    d.balance_before_event as glp_balance,
    d.pool_share,
    d.pool_share * 43022389.4863444584 - COALESCE(mr.usdgAmount, 0) * 0.235 as approximate_distribution_usd,
    d.is_contract,
    d.contract_name
  FROM dune."gmx-io".result_gmx_glp_holders_at_incident d
  LEFT JOIN dune."gmx-io".result_glp_net_minting_redemptions_by_account_after_the_event mr
    ON mr.account = d.account AND mr.usdgAmount < 0
  WHERE d.balance_before_event > 0
),

-- 3. Find all transactions from GLP holders to Archi contracts
archi_interactions AS (
  SELECT
    t."from" as user_address,
    t.to as archi_contract,
    ac.contract_name,
    COUNT(DISTINCT t.tx_hash) as tx_count,
    MIN(t.block_time) as first_interaction,
    MAX(t.block_time) as last_interaction,
    SUM(CAST(t.value AS DOUBLE)) / 1e18 as total_eth_sent
  FROM arbitrum.traces t
  INNER JOIN archi_contracts ac ON t.to = ac.contract_address
  INNER JOIN glp_holders gh ON t."from" = gh.account
  WHERE t.success = true
    AND t.type IN ('call', 'create', 'create2')
    AND t.block_time >= TIMESTAMP '2022-11-11' -- archi deployer funded at Nov-29-2022
  GROUP BY 1, 2, 3
)

-- 4. Combine GLP holders with their Archi interactions
SELECT 
  gh.account as address,
  gh.glp_balance,
  gh.pool_share,
  gh.approximate_distribution_usd,
  gh.is_contract,
  gh.contract_name as user_contract_name,
  COUNT(DISTINCT ai.archi_contract) as unique_archi_contracts_interacted,
  SUM(ai.tx_count) as total_transactions,
  MIN(ai.first_interaction) as earliest_archi_interaction,
  MAX(ai.last_interaction) as latest_archi_interaction,
  SUM(ai.total_eth_sent) as total_eth_sent_to_archi,
  ARRAY_AGG(DISTINCT ai.contract_name ORDER BY ai.contract_name) as archi_contracts_used,


FROM glp_holders gh
INNER JOIN archi_interactions ai ON gh.account = ai.user_address
GROUP BY 1, 2, 3, 4, 5, 6
ORDER BY gh.approximate_distribution_usd DESC, SUM(ai.tx_count) DESC;