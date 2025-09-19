-- Track all token transfers involving the GMXExecutor proxy contract, aggregated by user
-- GMXExecutor proxy: 0x65C59eE732BD249224718607Ee0EC0e293309923
-- query here: https://dune.com/queries/5806866

WITH gmxexecutor_transfers AS (
  SELECT
    evt_block_time as block_time,
    evt_tx_hash as tx_hash,
    contract_address,
    "from" as from_address,
    "to" as to_address,
    value / 1e18 as amount,
    CASE
      WHEN "from" = 0x65C59eE732BD249224718607Ee0EC0e293309923 THEN 'OUT'
      WHEN "to" = 0x65C59eE732BD249224718607Ee0EC0e293309923 THEN 'IN'
    END as direction,
    CASE
      WHEN "from" = 0x65C59eE732BD249224718607Ee0EC0e293309923 THEN "to"
      WHEN "to" = 0x65C59eE732BD249224718607Ee0EC0e293309923 THEN "from"
    END as counterparty
  FROM erc20_arbitrum.evt_transfer
  WHERE ("from" = 0x65C59eE732BD249224718607Ee0EC0e293309923
         OR "to" = 0x65C59eE732BD249224718607Ee0EC0e293309923)
    AND evt_block_time >= TIMESTAMP '2022-11-11'
),

-- Get transaction initiators
tx_initiators AS (
  SELECT DISTINCT
    t.hash as tx_hash,
    t."from" as tx_initiator
  FROM arbitrum.transactions t
  INNER JOIN gmxexecutor_transfers gt ON gt.tx_hash = t.hash
),

-- Combine transfers with initiators
transfers_with_initiators AS (
  SELECT
    ti.tx_initiator,
    gt.contract_address,
    gt.direction,
    gt.amount,
    gt.block_time
  FROM gmxexecutor_transfers gt
  LEFT JOIN tx_initiators ti ON ti.tx_hash = gt.tx_hash
),

-- Aggregate transfers by user with separate columns for each token
user_aggregated AS (
  SELECT
    tx_initiator,
    -- fsGLP transfers (0x1addd80e6039594ee970e5872d247bf0414c8903)
    SUM(CASE WHEN contract_address = 0x1addd80e6039594ee970e5872d247bf0414c8903 AND direction = 'IN' THEN amount ELSE 0 END) as fsglp_in,
    SUM(CASE WHEN contract_address = 0x1addd80e6039594ee970e5872d247bf0414c8903 AND direction = 'OUT' THEN amount ELSE 0 END) as fsglp_out,
    SUM(CASE WHEN contract_address = 0x1addd80e6039594ee970e5872d247bf0414c8903 AND direction = 'IN' THEN amount ELSE
             CASE WHEN contract_address = 0x1addd80e6039594ee970e5872d247bf0414c8903 AND direction = 'OUT' THEN -amount ELSE 0 END END) as fsglp_net,

    -- WETH transfers (0x82af49447d8a07e3bd95bd0d56f35241523fbab1)
    SUM(CASE WHEN contract_address = 0x82af49447d8a07e3bd95bd0d56f35241523fbab1 AND direction = 'IN' THEN amount ELSE 0 END) as weth_in,
    SUM(CASE WHEN contract_address = 0x82af49447d8a07e3bd95bd0d56f35241523fbab1 AND direction = 'OUT' THEN amount ELSE 0 END) as weth_out,

    -- GMX transfers (0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a)
    SUM(CASE WHEN contract_address = 0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a AND direction = 'IN' THEN amount ELSE 0 END) as gmx_in,
    SUM(CASE WHEN contract_address = 0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a AND direction = 'OUT' THEN amount ELSE 0 END) as gmx_out,

    -- USDC transfers (0x4277f8f2c384827b5273592ff7cebd9f2c1ac258)
    SUM(CASE WHEN contract_address = 0x4277f8f2c384827b5273592ff7cebd9f2c1ac258 AND direction = 'IN' THEN amount ELSE 0 END) as usdc_in,
    SUM(CASE WHEN contract_address = 0x4277f8f2c384827b5273592ff7cebd9f2c1ac258 AND direction = 'OUT' THEN amount ELSE 0 END) as usdc_out,

    -- Other tokens combined
    SUM(CASE WHEN contract_address NOT IN (0x1addd80e6039594ee970e5872d247bf0414c8903, 0x82af49447d8a07e3bd95bd0d56f35241523fbab1, 0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a, 0x4277f8f2c384827b5273592ff7cebd9f2c1ac258) AND direction = 'IN' THEN amount ELSE 0 END) as other_in,
    SUM(CASE WHEN contract_address NOT IN (0x1addd80e6039594ee970e5872d247bf0414c8903, 0x82af49447d8a07e3bd95bd0d56f35241523fbab1, 0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a, 0x4277f8f2c384827b5273592ff7cebd9f2c1ac258) AND direction = 'OUT' THEN amount ELSE 0 END) as other_out,

    -- Additional stats
    COUNT(*) as total_transfers,
    COUNT(DISTINCT contract_address) as token_types,
    MIN(block_time) as first_transaction,
    MAX(block_time) as last_transaction
  FROM transfers_with_initiators
  GROUP BY tx_initiator
)

SELECT
  ROW_NUMBER() OVER (ORDER BY fsglp_net DESC) as "#",
  tx_initiator as user,
  ROUND(fsglp_in, 6) as fsGLP_in,
  ROUND(fsglp_out, 6) as fsGLP_out,
  ROUND(fsglp_net, 6) as fsGLP_net,
  ROUND(weth_in, 6) as WETH_in,
  ROUND(weth_out, 6) as WETH_out,
  ROUND(gmx_in, 6) as GMX_in,
  ROUND(gmx_out, 6) as GMX_out,
  ROUND(usdc_in, 6) as USDC_in,
  ROUND(usdc_out, 6) as USDC_out,
  ROUND(other_in, 6) as other_in,
  ROUND(other_out, 6) as other_out,
  total_transfers as transfers,
  token_types,
  DATE_TRUNC('day', first_transaction) as first_tx,
  DATE_TRUNC('day', last_transaction) as last_tx
FROM user_aggregated
WHERE fsglp_in > 0 OR fsglp_out > 0 -- Only show users with fsGLP transfers
ORDER BY fsglp_net DESC
LIMIT 100