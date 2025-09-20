-- Query fsGLP transactions involving GMXExecutor with running balance and user information
-- fsGLP token: 0x1aDDD80E6039594eE970E5872D247bf0414C8903
-- GMXExecutor: 0x65C59eE732BD249224718607Ee0EC0e293309923
-- GMXExecutor created: April 3, 2023
-- query here: https://dune.com/queries/5806754

WITH fsglp_transfers AS (
  SELECT
    evt_block_number,
    evt_block_time,
    evt_tx_hash,
    "from",
    "to",
    value,
    CASE
      WHEN "to" = 0x65C59eE732BD249224718607Ee0EC0e293309923 THEN value
      WHEN "from" = 0x65C59eE732BD249224718607Ee0EC0e293309923 THEN -value
      ELSE 0
    END as balance_change
  FROM erc20_arbitrum.evt_Transfer
  WHERE contract_address = 0x1aDDD80E6039594eE970E5872D247bf0414C8903  -- fsGLP token
    AND (
      "to" = 0x65C59eE732BD249224718607Ee0EC0e293309923 OR
      "from" = 0x65C59eE732BD249224718607Ee0EC0e293309923
    )
    AND evt_block_time >= TIMESTAMP '2023-04-03'  -- GMXExecutor contract creation date
),

tx_aggregated AS (
  SELECT
    evt_tx_hash,
    MIN(evt_block_number) as block_number,
    MIN(evt_block_time) as block_time,
    SUM(value) as total_amount,
    SUM(balance_change) as net_balance_change
  FROM fsglp_transfers
  GROUP BY evt_tx_hash
),

tx_initiators AS (
  SELECT DISTINCT
    t.hash as tx_hash,
    t."from" as user
  FROM arbitrum.transactions t
  INNER JOIN tx_aggregated ta ON ta.evt_tx_hash = t.hash
),

with_running_balance AS (
  SELECT
    ta.evt_tx_hash,
    ta.block_time,
    ta.total_amount,
    ti.user,
    SUM(ta.net_balance_change) OVER (ORDER BY ta.block_number ASC, ta.evt_tx_hash ASC) as running_balance
  FROM tx_aggregated ta
  LEFT JOIN tx_initiators ti ON ti.tx_hash = ta.evt_tx_hash
)

SELECT
  ROW_NUMBER() OVER (ORDER BY block_time ASC) as "#",
  DATE_TRUNC('second', block_time) as timestamp,
  user,
  ROUND(total_amount / 1e18, 6) as amount,
  ROUND(running_balance / 1e18, 6) as running_balance,
  CONCAT('https://arbiscan.io/tx/', CAST(evt_tx_hash AS VARCHAR)) as arbiscan_link
FROM with_running_balance
ORDER BY block_time ASC
