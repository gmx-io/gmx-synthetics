-- CreditCaller Unique Users Analysis
-- Contract: 0xcEd4D9293002964fEA40F984c6d7e20c5eD49D35 (CreditCallerProxy)
-- https://dune.com/queries/5818949
--
-- HOW THIS QUERY WORKS:
-- This query aggregates ALL CreditCaller transactions by unique tx_sender,
-- showing each user's total activity across the 3 core leveraged farming actions.
-- Each row represents one unique user with their aggregated statistics.
--
-- TRANSACTION TYPES TRACKED:
-- 1. openLendCredit: Create leveraged position (position goes to _recipient)
-- 2. repayCredit: Close own position (only affects msg.sender)
-- 3. liquidate: Liquidate someone else's position (affects both liquidator and victim)
--
-- COLUMNS EXPLAINED:
-- - tx_sender: The unique user address (msg.sender)
-- - open/repay/liquidate_transactions: Count by transaction type
-- - total_eth_sent: Sum of all ETH collateral provided
-- - recipients: Recipients with action labels (opened_for:address, liquidated:address)
-- - methods_used: Which function types this user has called
-- - sample_tx_hashes: Up to 3 transaction hashes for reference

WITH credit_transactions AS (
    -- All CreditCaller transactions with parameter decoding
    SELECT
        t.block_number,
        t.block_time,
        t.hash as tx_hash,
        t."from" as tx_sender,

        -- Decode CreditCaller method calls
        CASE
            WHEN bytearray_substring(t.data, 1, 4) = 0x1a1bd479 THEN 'openLendCredit'
            WHEN bytearray_substring(t.data, 1, 4) = 0x05713ae5 THEN 'repayCredit'
            WHEN bytearray_substring(t.data, 1, 4) = 0x2f745c59 THEN 'liquidate'
            ELSE CONCAT('0x', SUBSTR(CAST(bytearray_substring(t.data, 1, 4) AS VARCHAR), 3))
        END as method_name,

        -- Unified recipient column
        CASE
            -- openLendCredit: _recipient (6th parameter, bytes 177-196)
            WHEN bytearray_substring(t.data, 1, 4) = 0x1a1bd479 AND LENGTH(t.data) >= 196
            THEN CAST(CONCAT('0x', SUBSTR(CAST(bytearray_substring(t.data, 177, 20) AS VARCHAR), 3)) AS VARCHAR)
            -- liquidate: _recipient (1st parameter, bytes 17-36)
            WHEN bytearray_substring(t.data, 1, 4) = 0x2f745c59 AND LENGTH(t.data) >= 36
            THEN CAST(CONCAT('0x', SUBSTR(CAST(bytearray_substring(t.data, 17, 20) AS VARCHAR), 3)) AS VARCHAR)
            ELSE NULL
        END as recipient,

        -- Decode amount for openLendCredit: _amountIn (3rd parameter, bytes 69-100)
        CASE
            WHEN bytearray_substring(t.data, 1, 4) = 0x1a1bd479 AND LENGTH(t.data) >= 100
            THEN bytearray_to_uint256(bytearray_substring(t.data, 69, 32)) / 1e18
            ELSE NULL
        END as amount,

        t.success,
        t.value / 1e18 as eth_sent

    FROM arbitrum.transactions t
    WHERE t."to" = 0xcEd4D9293002964fEA40F984c6d7e20c5eD49D35 -- CreditCaller
    AND t.block_time >= TIMESTAMP '2023-04-03 00:00:00' -- CreditCaller contract created
    AND t.success = true -- Only successful transactions
)

-- Final result with unique users aggregated
SELECT
    ROW_NUMBER() OVER (ORDER BY COUNT(DISTINCT tx_hash) DESC, tx_sender) as "#",

    -- User info
    CAST(tx_sender AS VARCHAR) as tx_sender,

    -- Transaction counts
    COUNT(DISTINCT CASE WHEN method_name = 'openLendCredit' THEN tx_hash END) as open_transactions,
    COUNT(DISTINCT CASE WHEN method_name = 'repayCredit' THEN tx_hash END) as repay_transactions,
    COUNT(DISTINCT CASE WHEN method_name = 'liquidate' THEN tx_hash END) as liquidate_transactions,

    -- Activity summary
    MIN(block_time) as first_transaction,
    MAX(block_time) as last_transaction,
    DATE_DIFF('day', MIN(block_time), MAX(block_time)) as days_active,

    -- Financial summary
    SUM(ROUND(eth_sent, 6)) as total_eth_sent,

    -- Recipients interacted with (enumerated by action type)
    ARRAY_JOIN(ARRAY_AGG(DISTINCT
        CASE
            WHEN method_name = 'openLendCredit' AND recipient IS NOT NULL
            THEN CONCAT('opened_for:', recipient)
            WHEN method_name = 'liquidate' AND recipient IS NOT NULL
            THEN CONCAT('liquidated:', recipient)
            ELSE NULL
        END
    ), ', ') as recipients,

    -- Methods used
    ARRAY_JOIN(ARRAY_AGG(DISTINCT method_name), ', ') as methods_used,

    -- Sample transaction hashes for reference (first 3)
    SLICE(ARRAY_AGG(DISTINCT tx_hash), 1, 3) as sample_tx_hashes

FROM credit_transactions
WHERE method_name IN ('openLendCredit', 'repayCredit', 'liquidate')
GROUP BY tx_sender
ORDER BY COUNT(DISTINCT tx_hash) DESC, tx_sender