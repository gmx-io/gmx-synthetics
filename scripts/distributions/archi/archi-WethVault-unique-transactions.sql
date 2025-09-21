-- Direct WETH Vault Transaction Analysis
-- Contract: 0x7674Ccf6cAE51F20d376644C42cd69EC7d4324f4 (WETHVaultProxy)
-- Shows individual transactions: each row is a unique transaction hash

WITH weth_vault_transactions AS (
    -- Direct function calls to WETH Vault
    SELECT
        t.block_number,
        t.block_time,
        t.hash as tx_hash,
        t."from" as user_address,

        -- Decode method calls (only value-transferring methods)
        CASE
            WHEN bytearray_substring(t.data, 1, 4) = 0x51c6590a THEN 'addLiquidity'
            WHEN bytearray_substring(t.data, 1, 4) = 0x9c8f9f23 THEN 'removeLiquidity'
            WHEN bytearray_substring(t.data, 1, 4) = 0x2e1a7d4d THEN 'withdraw'
            WHEN bytearray_substring(t.data, 1, 4) = 0xb6b55f25 THEN 'deposit'
            WHEN bytearray_substring(t.data, 1, 4) = 0xa9059cbb THEN 'transfer'
            WHEN bytearray_substring(t.data, 1, 4) = 0x23b872dd THEN 'transferFrom'
            ELSE CONCAT('0x', SUBSTR(CAST(bytearray_substring(t.data, 1, 4) AS VARCHAR), 3))
        END as method_name,

        -- Decode amount parameter (first 32 bytes after method selector)
        CASE
            WHEN LENGTH(t.data) >= 36 AND bytearray_substring(t.data, 1, 4) IN (
                0x51c6590a, -- addLiquidity
                0x9c8f9f23, -- removeLiquidity
                0x2e1a7d4d, -- withdraw
                0xb6b55f25  -- deposit
            ) THEN bytearray_to_uint256(bytearray_substring(t.data, 5, 32)) / 1e18
            ELSE NULL
        END as decoded_amount,

        t.success,
        'TRANSACTION' as event_type

    FROM arbitrum.transactions t
    WHERE t."to" = 0x7674Ccf6cAE51F20d376644C42cd69EC7d4324f4 -- WETH Vault
    AND t.block_time >= TIMESTAMP '2023-04-03 00:00:00' -- Vault creation
),

weth_vault_events AS (
    -- ERC20 Transfer events for vsWETH tokens from direct vault transactions only
    SELECT
        l.block_number,
        l.block_time,
        l.tx_hash,

        -- Extract addresses from topics (convert to address type)
        CASE
            WHEN l.topic1 = 0x0000000000000000000000000000000000000000000000000000000000000000 THEN CAST(0x0000000000000000000000000000000000000000 AS VARBINARY)
            ELSE CAST(CONCAT('0x', SUBSTR(CAST(l.topic1 AS VARCHAR), 27)) AS VARBINARY)
        END as from_address,

        CASE
            WHEN l.topic2 = 0x0000000000000000000000000000000000000000000000000000000000000000 THEN CAST(0x0000000000000000000000000000000000000000 AS VARBINARY)
            ELSE CAST(CONCAT('0x', SUBSTR(CAST(l.topic2 AS VARCHAR), 27)) AS VARBINARY)
        END as to_address,

        -- Decode amount
        bytearray_to_uint256(l.data) / 1e18 as decoded_amount,

        -- Classify event type
        CASE
            WHEN l.topic1 = 0x0000000000000000000000000000000000000000000000000000000000000000 THEN 'vsWETH_MINT'
            WHEN l.topic2 = 0x0000000000000000000000000000000000000000000000000000000000000000 THEN 'vsWETH_BURN'
            ELSE 'vsWETH_TRANSFER'
        END as method_name,

        true as success,
        'TOKEN_EVENT' as event_type

    FROM arbitrum.logs l
    WHERE l.contract_address = 0x7674Ccf6cAE51F20d376644C42cd69EC7d4324f4 -- WETH Vault (also vsWETH token)
    AND l.topic0 = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef -- Transfer event
    AND l.block_time >= TIMESTAMP '2022-01-01 00:00:00'
    -- Only include events from transactions that directly called the WETH Vault
    AND EXISTS (
        SELECT 1 FROM arbitrum.transactions t
        WHERE t.hash = l.tx_hash
        AND t."to" = 0x7674Ccf6cAE51F20d376644C42cd69EC7d4324f4
    )
),

combined_activity AS (
    -- Combine direct vault transactions and their corresponding events
    SELECT
        block_number,
        block_time,
        tx_hash,
        user_address,
        NULL as from_address,
        NULL as to_address,
        method_name,
        decoded_amount,
        success,
        event_type
    FROM weth_vault_transactions

    UNION ALL

    SELECT
        block_number,
        block_time,
        tx_hash,
        CASE
            WHEN from_address != CAST(0x0000000000000000000000000000000000000000 AS VARBINARY) THEN from_address
            WHEN to_address != CAST(0x0000000000000000000000000000000000000000 AS VARBINARY) THEN to_address
            ELSE NULL
        END as user_address,
        from_address,
        to_address,
        method_name,
        decoded_amount,
        success,
        event_type
    FROM weth_vault_events
)

-- Final result with analysis (unique by transaction hash)
SELECT
    ROW_NUMBER() OVER (ORDER BY block_number ASC, tx_hash ASC) as "#",

    -- Get the main user (transaction initiator, not zero address)
    CAST(MAX(CASE WHEN event_type = 'TRANSACTION' THEN user_address END) AS VARCHAR) as user_address,

    -- Aggregate all methods in this transaction
    ARRAY_JOIN(ARRAY_AGG(method_name), ', ') as methods,

    block_number,
    block_time,
    CONCAT('https://arbiscan.io/tx/', CAST(tx_hash AS VARCHAR)) as arbiscan_link,

    -- Sum amounts prioritizing transaction data over event data to avoid double counting
    -- For deposits: use transaction amount when available, otherwise use mint amount
    MAX(CASE
        WHEN method_name IN ('addLiquidity', 'deposit') AND event_type = 'TRANSACTION' THEN decoded_amount
        ELSE 0
    END) as total_amount_in,

    -- For withdrawals: use transaction amount when available, otherwise use burn amount
    MAX(CASE
        WHEN method_name IN ('removeLiquidity', 'withdraw') AND event_type = 'TRANSACTION' THEN decoded_amount
        ELSE 0
    END) as total_amount_out,

    -- Pure transfers (excluding mints and burns which are part of deposits/withdrawals)
    -- A pure transfer is when both from and to addresses are non-zero
    MAX(CASE
        WHEN method_name = 'vsWETH_TRANSFER'
        AND event_type = 'TOKEN_EVENT'
        AND from_address != CAST(0x0000000000000000000000000000000000000000 AS VARBINARY)
        AND to_address != CAST(0x0000000000000000000000000000000000000000 AS VARBINARY)
        THEN decoded_amount
        ELSE 0
    END) as total_transfer_amount,

    -- Net flow calculation (deposits minus withdrawals)
    MAX(CASE
        WHEN method_name IN ('addLiquidity', 'deposit') AND event_type = 'TRANSACTION' THEN decoded_amount
        ELSE 0
    END) -
    MAX(CASE
        WHEN method_name IN ('removeLiquidity', 'withdraw') AND event_type = 'TRANSACTION' THEN decoded_amount
        ELSE 0
    END) as net_flow

FROM combined_activity
WHERE user_address IS NOT NULL
GROUP BY block_number, block_time, tx_hash
HAVING
    MAX(CASE
        WHEN method_name IN ('addLiquidity', 'deposit') AND event_type = 'TRANSACTION' THEN decoded_amount
        ELSE 0
    END) > 0
    OR
    MAX(CASE
        WHEN method_name IN ('removeLiquidity', 'withdraw') AND event_type = 'TRANSACTION' THEN decoded_amount
        ELSE 0
    END) > 0
ORDER BY block_number ASC, tx_hash ASC
