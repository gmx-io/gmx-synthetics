-- Find all contracts deployed by Archi Deployer: 0x60A3D336c39e8faC40647142d3068780B4Bc4C93
-- query here: https://dune.com/queries/5791746

SELECT
  ROW_NUMBER() OVER (ORDER BY t.block_time ASC) as "#",
  t.address as contract_address,
  COALESCE(c.name, c.namespace, '-') as contract_name,
  t.block_number,
  DATE_TRUNC('minute', t.block_time) as deployment_time,
  CONCAT('https://arbiscan.io/address/', CAST(t.address AS VARCHAR)) as arbiscan_link,
  CONCAT('https://arbiscan.io/tx/', CAST(t.tx_hash AS VARCHAR)) as tx_link

FROM arbitrum.traces t
LEFT JOIN arbitrum.contracts c ON c.address = t.address
WHERE
  t."from" = 0x60A3D336c39e8faC40647142d3068780B4Bc4C93
  AND t.type IN ('create', 'create2')
  AND t.success = true
  AND t.address IS NOT NULL
  AND t.block_time >= TIMESTAMP '2022-11-11' -- archi deployer funded on Nov-29-2022
ORDER BY t.block_time ASC
