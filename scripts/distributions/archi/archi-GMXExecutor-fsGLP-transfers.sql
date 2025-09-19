-- Track all token transfers involving the GMXExecutor proxy contract
-- GMXExecutor proxy: 0x65C59eE732BD249224718607Ee0EC0e293309923

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

-- Aggregate transfers by transaction with separate columns for each token
aggregated_transfers AS (
  SELECT
    tx_hash,
    block_time,
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

    COUNT(*) as transfer_count,
    ARRAY_JOIN(ARRAY_DISTINCT(ARRAY_AGG(contract_address)), ', ') as token_contracts
  FROM gmxexecutor_transfers
  GROUP BY tx_hash, block_time
)

SELECT
  ti.tx_initiator as initiator,
  ROW_NUMBER() OVER (ORDER BY at.block_time DESC) as "#",
  DATE_TRUNC('minute', at.block_time) as timestamp,
  ROUND(at.fsglp_in, 6) as fsGLP_in,
  ROUND(at.fsglp_out, 6) as fsGLP_out,
  ROUND(at.fsglp_net, 6) as fsGLP_net,
  ROUND(at.weth_in, 6) as WETH_in,
  ROUND(at.weth_out, 6) as WETH_out,
  ROUND(at.gmx_in, 6) as GMX_in,
  ROUND(at.gmx_out, 6) as GMX_out,
  ROUND(at.usdc_in, 6) as USDC_in,
  ROUND(at.usdc_out, 6) as USDC_out,
  ROUND(at.other_in, 6) as other_in,
  ROUND(at.other_out, 6) as other_out,
  at.transfer_count as transfers,
  at.tx_hash,
  CONCAT('https://arbiscan.io/tx/', CAST(at.tx_hash AS VARCHAR)) as tx_link
FROM aggregated_transfers at
LEFT JOIN tx_initiators ti ON ti.tx_hash = at.tx_hash
WHERE at.fsglp_in > 0 OR at.fsglp_out > 0 -- Only show transactions with fsGLP transfers
ORDER BY at.block_time DESC
