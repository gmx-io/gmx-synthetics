-- Dune Query to find GLP holders who interacted with Archi Finance vault contracts
-- query here: https://dune.com/queries/5792212

-- 1. Dynamically find all Archi Finance contracts deployed by the Archi deployer
WITH archi_contracts AS (
  SELECT DISTINCT
    t.address as contract_address,
    COALESCE(c.name, c.namespace, 'Archi Contract') as contract_name
  FROM arbitrum.traces t
  LEFT JOIN arbitrum.contracts c ON c.address = t.address
  WHERE
    t."from" = 0x60A3D336c39e8faC40647142d3068780B4Bc4C93  -- Archi deployer
    AND t.type IN ('create', 'create2')
    AND t.success = true
    AND t.address IS NOT NULL
    AND t.block_time >= TIMESTAMP '2022-11-11'  -- archi deployer funded at Nov-29-2022
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
    AND t.type IN ('call', 'delegatecall')
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
  COUNT(DISTINCT ai.archi_contract) as unique_archi_contracts_interacted,
  SUM(ai.tx_count) as total_transactions,
  MIN(ai.first_interaction) as earliest_archi_interaction,
  MAX(ai.last_interaction) as latest_archi_interaction,
  SUM(ai.total_eth_sent) as total_eth_sent_to_archi,
  ARRAY_AGG(DISTINCT ai.contract_name ORDER BY ai.contract_name) as archi_contracts_used

FROM glp_holders gh
INNER JOIN archi_interactions ai ON gh.account = ai.user_address
GROUP BY 1, 2, 3, 4, 5
ORDER BY gh.approximate_distribution_usd DESC, SUM(ai.tx_count) DESC;
