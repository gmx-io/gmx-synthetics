-- Find Archi Finance deployed contracts that are also GLP holders

-- 1. Find all contracts deployed by Archi deployer
WITH archi_contracts AS (
  SELECT DISTINCT
    t.address as contract_address,
    COALESCE(c.name, c.namespace, 'Archi Contract') as contract_name,
    t.block_time as deployment_time
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
    d.contract_name as glp_holder_contract_name
  FROM dune."gmx-io".result_gmx_glp_holders_at_incident d
  LEFT JOIN dune."gmx-io".result_glp_net_minting_redemptions_by_account_after_the_event mr
    ON mr.account = d.account AND mr.usdgAmount < 0
  WHERE d.balance_before_event > 0
)

-- 3. Find Archi deployed contracts that are in the GLP holders list
SELECT
  ac.contract_address as address,
  ac.contract_name,
  DATE_TRUNC('day', ac.deployment_time) as deployed_date,
  gh.glp_balance as fsGLP_balance,
  gh.pool_share,
  gh.approximate_distribution_usd,
  CONCAT('https://arbiscan.io/address/', CAST(ac.contract_address AS VARCHAR)) as arbiscan_link

FROM archi_contracts ac
INNER JOIN glp_holders gh ON ac.contract_address = gh.account
ORDER BY gh.glp_balance DESC, ac.deployment_time ASC;
