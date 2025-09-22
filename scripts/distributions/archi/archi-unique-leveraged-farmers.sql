-- CreditCaller Transaction Analysis
-- Contract: 0xcEd4D9293002964fEA40F984c6d7e20c5eD49D35 (CreditCallerProxy)
-- https://dune.com/queries/5818949
--
-- HOW THIS QUERY WORKS:
-- This query shows ALL individual CreditCaller transactions (unique by tx_hash),
-- with decoded parameters showing tokens used and amounts for each transaction.
-- Each row represents one transaction with full details.
--
-- TRANSACTION TYPES TRACKED:
-- 1. openLendCredit: Create leveraged position (position goes to _recipient)
-- 2. repayCredit: Close own position (only affects msg.sender)
-- 3. liquidate: Liquidate someone else's position (affects both liquidator and victim)
--
-- COLUMNS EXPLAINED:
-- - tx_hash: Unique transaction hash
-- - method_name: Function called (openLendCredit, repayCredit, liquidate)
-- - tx_sender: Who sent the transaction (msg.sender)
-- - recipient: Target user (position owner or liquidation victim)
-- - token_used: Token symbol used as collateral (WETH, WBTC, USDC, USDT)
-- - amount: Decoded token amount from transaction parameters
-- - eth_sent: ETH value sent with transaction
-- - arbiscan_link: Direct link to transaction on Arbiscan

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

        -- Decode token for openLendCredit: _token (2nd parameter, bytes 37-68)
        CASE
            WHEN bytearray_substring(t.data, 1, 4) = 0x1a1bd479 AND LENGTH(t.data) >= 68
            THEN CAST(CONCAT('0x', SUBSTR(CAST(bytearray_substring(t.data, 49, 20) AS VARCHAR), 3)) AS VARCHAR)
            ELSE NULL
        END as token_address,

        -- Decode amount for openLendCredit: _amountIn (3rd parameter, bytes 69-100)
        CASE
            WHEN bytearray_substring(t.data, 1, 4) = 0x1a1bd479 AND LENGTH(t.data) >= 100
            THEN
                CASE
                    -- WBTC has 8 decimals
                    WHEN CAST(CONCAT('0x', SUBSTR(CAST(bytearray_substring(t.data, 49, 20) AS VARCHAR), 3)) AS VARCHAR) = '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f'
                    THEN bytearray_to_uint256(bytearray_substring(t.data, 69, 32)) / 1e8
                    -- USDC and USDT have 6 decimals
                    WHEN CAST(CONCAT('0x', SUBSTR(CAST(bytearray_substring(t.data, 49, 20) AS VARCHAR), 3)) AS VARCHAR) IN ('0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9')
                    THEN bytearray_to_uint256(bytearray_substring(t.data, 69, 32)) / 1e6
                    -- WETH and ETH have 18 decimals (default)
                    ELSE bytearray_to_uint256(bytearray_substring(t.data, 69, 32)) / 1e18
                END
            ELSE NULL
        END as amount,

        t.success,
        t.value / 1e18 as eth_sent

    FROM arbitrum.transactions t
    WHERE t."to" = 0xcEd4D9293002964fEA40F984c6d7e20c5eD49D35 -- CreditCaller
    AND t.block_time >= TIMESTAMP '2023-04-03 00:00:00' -- CreditCaller contract created
    AND t.success = true -- Only successful transactions
)

-- Final result with unique rows by transaction hash
SELECT
    ROW_NUMBER() OVER (ORDER BY block_time DESC) as "#",

    -- User info
    CAST(tx_sender AS VARCHAR) as tx_sender,
    recipient,

    -- Transaction info
    block_time,

    -- Action details
    method_name,

    -- Token and amount details
    CASE
        WHEN token_address = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1' THEN 'WETH'
        WHEN token_address = '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f' THEN 'WBTC'
        WHEN token_address = '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8' THEN 'USDC'
        WHEN token_address = '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9' THEN 'USDT'
        WHEN token_address = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' THEN 'ETH'
        WHEN token_address IS NOT NULL THEN CONCAT('Unknown:', token_address)
        ELSE NULL
    END as token_used,

    ROUND(amount, 6) as amount,
    ROUND(eth_sent, 6) as eth_sent,

    -- Arbiscan link
    CONCAT('https://arbiscan.io/tx/', CAST(tx_hash AS VARCHAR)) as arbiscan_link

FROM credit_transactions
WHERE method_name IN ('openLendCredit', 'repayCredit', 'liquidate')
ORDER BY block_time DESC