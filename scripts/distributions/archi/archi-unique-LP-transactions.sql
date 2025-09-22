-- All unique LP transactions across Archi vaults, unique by tx hash
-- Combines addLiquidity and removeLiquidity transactions across WETH, WBTC, USDT, and USDC vaults
-- https://dune.com/queries/5786459

WITH all_vault_transactions AS (
    -- WETH Vault transactions
    SELECT
        t."from" as user_address,
        'WETH' as vault_type,
        CASE
            WHEN bytearray_substring(t.data, 1, 4) = 0x51c6590a THEN 'addLiquidity'
            WHEN bytearray_substring(t.data, 1, 4) = 0x9c8f9f23 THEN 'removeLiquidity'
            ELSE 'other'
        END as method_name,
        CASE
            WHEN LENGTH(t.data) >= 36 AND bytearray_substring(t.data, 1, 4) IN (
                0x51c6590a, 0x9c8f9f23
            ) THEN bytearray_to_uint256(bytearray_substring(t.data, 5, 32)) / 1e18
            ELSE 0
        END as decoded_amount,
        t.block_time,
        t.hash as tx_hash,
        t.success
    FROM arbitrum.transactions t
    WHERE t."to" = 0x7674Ccf6cAE51F20d376644C42cd69EC7d4324f4 -- WETH Vault
    AND t.block_time >= TIMESTAMP '2023-04-03 00:00:00'

    UNION ALL

    -- WBTC Vault transactions
    SELECT
        t."from" as user_address,
        'WBTC' as vault_type,
        CASE
            WHEN bytearray_substring(t.data, 1, 4) = 0x51c6590a THEN 'addLiquidity'
            WHEN bytearray_substring(t.data, 1, 4) = 0x9c8f9f23 THEN 'removeLiquidity'
            ELSE 'other'
        END as method_name,
        CASE
            WHEN LENGTH(t.data) >= 36 AND bytearray_substring(t.data, 1, 4) IN (
                0x51c6590a, 0x9c8f9f23
            ) THEN bytearray_to_uint256(bytearray_substring(t.data, 5, 32)) / 1e8  -- 8 decimals for WBTC
            ELSE 0
        END as decoded_amount,
        t.block_time,
        t.hash as tx_hash,
        t.success
    FROM arbitrum.transactions t
    WHERE t."to" = 0xee54A31e9759B0F7FDbF48221b72CD9F3aEA00AB -- WBTC Vault
    AND t.block_time >= TIMESTAMP '2023-04-03 00:00:00'

    UNION ALL

    -- USDT Vault transactions
    SELECT
        t."from" as user_address,
        'USDT' as vault_type,
        CASE
            WHEN bytearray_substring(t.data, 1, 4) = 0x51c6590a THEN 'addLiquidity'
            WHEN bytearray_substring(t.data, 1, 4) = 0x9c8f9f23 THEN 'removeLiquidity'
            ELSE 'other'
        END as method_name,
        CASE
            WHEN LENGTH(t.data) >= 36 AND bytearray_substring(t.data, 1, 4) IN (
                0x51c6590a, 0x9c8f9f23
            ) THEN bytearray_to_uint256(bytearray_substring(t.data, 5, 32)) / 1e6  -- 6 decimals for USDT
            ELSE 0
        END as decoded_amount,
        t.block_time,
        t.hash as tx_hash,
        t.success
    FROM arbitrum.transactions t
    WHERE t."to" = 0x179bD8d1d654DB8aa1603f232E284FF8d53a0688 -- USDT Vault
    AND t.block_time >= TIMESTAMP '2023-04-03 00:00:00'

    UNION ALL

    -- USDC Vault transactions
    SELECT
        t."from" as user_address,
        'USDC' as vault_type,
        CASE
            WHEN bytearray_substring(t.data, 1, 4) = 0x51c6590a THEN 'addLiquidity'
            WHEN bytearray_substring(t.data, 1, 4) = 0x9c8f9f23 THEN 'removeLiquidity'
            ELSE 'other'
        END as method_name,
        CASE
            WHEN LENGTH(t.data) >= 36 AND bytearray_substring(t.data, 1, 4) IN (
                0x51c6590a, 0x9c8f9f23
            ) THEN bytearray_to_uint256(bytearray_substring(t.data, 5, 32)) / 1e6  -- 6 decimals for USDC
            ELSE 0
        END as decoded_amount,
        t.block_time,
        t.hash as tx_hash,
        t.success
    FROM arbitrum.transactions t
    WHERE t."to" = 0xa7490e0828Ed39DF886b9032ebBF98851193D79c -- USDC Vault
    AND t.block_time >= TIMESTAMP '2023-04-03 00:00:00'
),

unique_transactions AS (
    SELECT
        tx_hash,
        MIN(block_time) as block_time,
        MIN(user_address) as user_address,
        ARRAY_JOIN(ARRAY_AGG(DISTINCT vault_type), ', ') as vaults_involved,
        ARRAY_JOIN(ARRAY_AGG(DISTINCT method_name), ', ') as methods,
        SUM(decoded_amount) as total_amount,
        COUNT(*) as operation_count
    FROM all_vault_transactions
    WHERE success = true
    GROUP BY tx_hash
    HAVING SUM(decoded_amount) > 0  -- only keep transactions with amount > 0 (automatically excludes approve and other non-LP operations)
)

-- Final result with unique transaction hashes
SELECT
    ROW_NUMBER() OVER (ORDER BY block_time ASC) as "#",
    CAST(user_address AS VARCHAR) as user_address,
    vaults_involved,
    methods,
    ROUND(total_amount, 4) as amount,
    block_time,
    CONCAT('https://arbiscan.io/tx/', CAST(tx_hash AS VARCHAR)) as arbiscan_link
FROM unique_transactions
ORDER BY block_time ASC
