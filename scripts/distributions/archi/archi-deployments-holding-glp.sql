-- Find contracts deployed by 0x60A3D336c39e8faC40647142d3068780B4Bc4C93 and check their GLP balances
-- GLP Token (Reward Tracker): 0x1aDDD80E6039594eE970E5872D247bf0414C8903
-- query here: https://dune.com/queries/5786459

WITH deployed_contracts AS (
  -- First, find all contracts deployed by the address
  SELECT DISTINCT
    t.address as contract_address,
    COALESCE(c.namespace, 'Unverified') as contract_name,
    t.block_time as deployment_time
  FROM arbitrum.traces t
  LEFT JOIN arbitrum.contracts c ON c.address = t.address
  WHERE
    t."from" = 0x60A3D336c39e8faC40647142d3068780B4Bc4C93
    AND t.type IN ('create', 'create2')
    AND t.success = true
    AND t.address IS NOT NULL
    AND t.block_time >= TIMESTAMP '2022-11-11'
),

-- Get GLP transfer events for deployed contracts
glp_transfers AS (
  SELECT
    CASE
      WHEN l.topic2 = 0x0000000000000000000000000000000000000000000000000000000000000000 THEN l.topic3 -- Mint (from = 0x0)
      WHEN l.topic3 = 0x0000000000000000000000000000000000000000000000000000000000000000 THEN l.topic2 -- Burn (to = 0x0)
      ELSE COALESCE(l.topic3, l.topic2) -- Regular transfer
    END as account,
    CASE
      WHEN l.topic2 = 0x0000000000000000000000000000000000000000000000000000000000000000 THEN bytearray_to_uint256(l.data) / 1e18 -- Mint
      WHEN l.topic3 = 0x0000000000000000000000000000000000000000000000000000000000000000 THEN -bytearray_to_uint256(l.data) / 1e18 -- Burn
      WHEN l.topic3 IS NOT NULL THEN bytearray_to_uint256(l.data) / 1e18 -- Received
      ELSE -bytearray_to_uint256(l.data) / 1e18 -- Sent
    END as balance_change
  FROM arbitrum.logs l
  WHERE l.contract_address = 0x1aDDD80E6039594eE970E5872D247bf0414C8903
    AND l.topic1 = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
),

-- Calculate net balances
glp_balances AS (
  SELECT
    dc.contract_address,
    dc.contract_name,
    dc.deployment_time,
    COALESCE(SUM(gt.balance_change), 0) as glp_balance
  FROM deployed_contracts dc
  LEFT JOIN glp_transfers gt ON gt.account = dc.contract_address
  GROUP BY dc.contract_address, dc.contract_name, dc.deployment_time
)

SELECT
  ROW_NUMBER() OVER (ORDER BY deployment_time ASC) as "#",
  contract_address,
  contract_name,
  DATE_TRUNC('minute', deployment_time) as deployed_at,
  ROUND(glp_balance, 6) as glp_balance,
  CASE
    WHEN glp_balance > 0 THEN '✅ Has GLP'
    ELSE '❌ No GLP'
  END as glp_status,
  CONCAT('https://arbiscan.io/address/', CAST(contract_address AS VARCHAR)) as arbiscan_link

FROM glp_balances
ORDER BY glp_balance DESC, deployment_time ASC