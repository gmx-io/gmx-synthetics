-- Query fsGLP activity by unique users with GMXExecutor
-- fsGLP token: 0x1aDDD80E6039594eE970E5872D247bf0414C8903
-- GMXExecutor: 0x65C59eE732BD249224718607Ee0EC0e293309923
-- GMXExecutor created: April 3, 2023
-- query here: https://dune.com/queries/5811632

-- archi deployer seems to burn remaining fsGLP tokens
-- https://arbiscan.io/tx/0xab2a1df67f1bce9fa215d818b876d9e1884cc85a42eca6954f078db26eea393a

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

tx_initiators AS (
  SELECT DISTINCT
    t.hash as tx_hash,
    t."from" as user
  FROM arbitrum.transactions t
  INNER JOIN fsglp_transfers ft ON ft.evt_tx_hash = t.hash
),

user_activity AS (
  SELECT
    ti.user,
    SUM(CASE WHEN ft."to" = 0x65C59eE732BD249224718607Ee0EC0e293309923 THEN ft.value ELSE 0 END) as sent_to_gmxexecutor,
    SUM(CASE WHEN ft."from" = 0x65C59eE732BD249224718607Ee0EC0e293309923 THEN ft.value ELSE 0 END) as received_from_gmxexecutor,
    SUM(ft.balance_change) as net_balance_impact,
    COUNT(DISTINCT ft.evt_tx_hash) as transaction_count,
    MIN(ft.evt_block_time) as first_interaction,
    MAX(ft.evt_block_time) as last_interaction
  FROM fsglp_transfers ft
  INNER JOIN tx_initiators ti ON ti.tx_hash = ft.evt_tx_hash
  GROUP BY ti.user
)

SELECT
  ROW_NUMBER() OVER (ORDER BY sent_to_gmxexecutor DESC) as "#",
  user,
  ROUND(sent_to_gmxexecutor / 1e18, 6) as sent_fsglp,
  ROUND(received_from_gmxexecutor / 1e18, 6) as received_fsglp,
  ROUND(net_balance_impact / 1e18, 6) as net_impact_fsglp,
  transaction_count as tx_count,
  DATE_TRUNC('day', first_interaction) as first_interaction,
  DATE_TRUNC('day', last_interaction) as last_interaction,
  CASE
    WHEN DATE_DIFF('day', first_interaction, last_interaction) = 0 THEN 1
    ELSE DATE_DIFF('day', first_interaction, last_interaction) + 1
  END as active_days
FROM user_activity
ORDER BY sent_to_gmxexecutor DESC