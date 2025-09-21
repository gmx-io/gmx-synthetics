-- USDT Vault User Summary Analysis
-- Contract: 0x179bD8d1d654DB8aa1603f232E284FF8d53a0688 (USDTVaultProxy)
-- Aggregates all activity per unique user
-- https://dune.com/queries/5818487

WITH usdt_vault_transactions AS (
    -- Direct function calls to USDT Vault
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
        -- Note: USDT has 6 decimals
        CASE
            WHEN LENGTH(t.data) >= 36 AND bytearray_substring(t.data, 1, 4) IN (
                0x51c6590a, -- addLiquidity
                0x9c8f9f23, -- removeLiquidity
                0x2e1a7d4d, -- withdraw
                0xb6b55f25  -- deposit
            ) THEN bytearray_to_uint256(bytearray_substring(t.data, 5, 32)) / 1e6  -- USDT has 6 decimals
            ELSE NULL
        END as decoded_amount,

        t.success,
        'TRANSACTION' as event_type

    FROM arbitrum.transactions t
    WHERE t."to" = 0x179bD8d1d654DB8aa1603f232E284FF8d53a0688 -- USDT Vault
    AND t.block_time >= TIMESTAMP '2023-04-03 00:00:00' -- Vault creation
),

user_activity AS (
    -- Aggregate all transactions per user
    SELECT
        user_address,
        MIN(block_time) as first_interaction,
        MAX(block_time) as last_interaction,
        COUNT(DISTINCT tx_hash) as total_transactions,

        -- Count transaction types
        COUNT(DISTINCT CASE WHEN method_name IN ('addLiquidity', 'deposit') THEN tx_hash END) as deposit_count,
        COUNT(DISTINCT CASE WHEN method_name IN ('removeLiquidity', 'withdraw') THEN tx_hash END) as withdrawal_count,

        -- Sum amounts
        SUM(CASE WHEN method_name IN ('addLiquidity', 'deposit') THEN decoded_amount ELSE 0 END) as total_deposited,
        SUM(CASE WHEN method_name IN ('removeLiquidity', 'withdraw') THEN decoded_amount ELSE 0 END) as total_withdrawn,

        -- Calculate net position
        SUM(CASE
            WHEN method_name IN ('addLiquidity', 'deposit') THEN decoded_amount
            WHEN method_name IN ('removeLiquidity', 'withdraw') THEN -decoded_amount
            ELSE 0
        END) as net_position,

        -- Collect unique transaction hashes for reference
        ARRAY_AGG(DISTINCT tx_hash) as transaction_hashes

    FROM usdt_vault_transactions
    WHERE user_address IS NOT NULL
    AND success = true
    GROUP BY user_address
)

-- Final result with user summary
SELECT
    ROW_NUMBER() OVER (ORDER BY net_position DESC, total_deposited DESC) as "#",

    -- User info
    CAST(user_address AS VARCHAR) as user_address,

    -- Assets summary
    ROUND(total_deposited, 2) as total_deposited_usdt,  -- 2 decimals for USD display
    ROUND(total_withdrawn, 2) as total_withdrawn_usdt,
    ROUND(net_position, 2) as net_position_usdt,

    -- Activity summary
    first_interaction,
    last_interaction,
    DATE_DIFF('day', first_interaction, last_interaction) as days_active,

    -- Transaction counts
    total_transactions,
    deposit_count,
    withdrawal_count

FROM user_activity
WHERE total_deposited > 0 OR total_withdrawn > 0  -- Filter out users with no value transfers
ORDER BY net_position DESC, total_deposited DESC