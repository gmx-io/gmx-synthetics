-- All Vaults User Summary Analysis
-- Combines LP activity (addLiquidity, removeLiquidity) across WETH, WBTC, USDT, and USDC vaults
-- Shows each user's positions across all vaults in a single row
-- https://dune.com/queries/5818540

-- Note: Unclaimed rewards are not included in this analysis. Would need to export csv and read `pendingRewards(user)`

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

user_aggregated AS (
    SELECT
        user_address,

        -- Overall activity
        MIN(block_time) as first_interaction,
        MAX(block_time) as last_interaction,
        COUNT(DISTINCT tx_hash) as total_transactions,
        COUNT(DISTINCT vault_type) as vaults_used,

        -- WETH metrics
        SUM(CASE
            WHEN vault_type = 'WETH' AND method_name = 'addLiquidity'
            THEN decoded_amount ELSE 0
        END) as deposited_weth,
        SUM(CASE
            WHEN vault_type = 'WETH' AND method_name = 'removeLiquidity'
            THEN decoded_amount ELSE 0
        END) as withdrawn_weth,

        -- WBTC metrics
        SUM(CASE
            WHEN vault_type = 'WBTC' AND method_name = 'addLiquidity'
            THEN decoded_amount ELSE 0
        END) as deposited_wbtc,
        SUM(CASE
            WHEN vault_type = 'WBTC' AND method_name = 'removeLiquidity'
            THEN decoded_amount ELSE 0
        END) as withdrawn_wbtc,

        -- USDT metrics
        SUM(CASE
            WHEN vault_type = 'USDT' AND method_name = 'addLiquidity'
            THEN decoded_amount ELSE 0
        END) as deposited_usdt,
        SUM(CASE
            WHEN vault_type = 'USDT' AND method_name = 'removeLiquidity'
            THEN decoded_amount ELSE 0
        END) as withdrawn_usdt,

        -- USDC metrics
        SUM(CASE
            WHEN vault_type = 'USDC' AND method_name = 'addLiquidity'
            THEN decoded_amount ELSE 0
        END) as deposited_usdc,
        SUM(CASE
            WHEN vault_type = 'USDC' AND method_name = 'removeLiquidity'
            THEN decoded_amount ELSE 0
        END) as withdrawn_usdc

    FROM all_vault_transactions
    WHERE user_address IS NOT NULL
    AND success = true
    AND method_name IN ('addLiquidity', 'removeLiquidity')
    GROUP BY user_address
)

-- Final result
SELECT
    ROW_NUMBER() OVER (ORDER BY
        -- Order by total USD value (using prices as of Jul 9, 2025, 12:30 UTC)
        (deposited_weth - withdrawn_weth) * 2750 +  -- ETH = $2,750
        (deposited_wbtc - withdrawn_wbtc) * 110000 + -- BTC = $110,000
        (deposited_usdt - withdrawn_usdt) * 1 +      -- USDT = $1
        (deposited_usdc - withdrawn_usdc) * 1        -- USDC = $1
        DESC
    ) as "#",

    -- User
    CAST(user_address AS VARCHAR) as user_address,

    -- Net positions for each vault
    ROUND(deposited_weth - withdrawn_weth, 4) as net_weth,
    ROUND(deposited_wbtc - withdrawn_wbtc, 8) as net_wbtc,
    ROUND(deposited_usdt - withdrawn_usdt, 2) as net_usdt,
    ROUND(deposited_usdc - withdrawn_usdc, 2) as net_usdc,

    -- Estimated total USD value (using prices as of Jul 9, 2025, 12:30 UTC)
    ROUND(
        (deposited_weth - withdrawn_weth) * 2750 +   -- ETH = $2,750
        (deposited_wbtc - withdrawn_wbtc) * 110000 + -- BTC = $110,000
        (deposited_usdt - withdrawn_usdt) * 1 +      -- USDT = $1
        (deposited_usdc - withdrawn_usdc) * 1,       -- USDC = $1
        2
    ) as estimated_usd,

    -- Total deposited/withdrawn per vault
    ROUND(deposited_weth, 4) as total_deposited_weth,
    ROUND(withdrawn_weth, 4) as total_withdrawn_weth,
    ROUND(deposited_wbtc, 8) as total_deposited_wbtc,
    ROUND(withdrawn_wbtc, 8) as total_withdrawn_wbtc,
    ROUND(deposited_usdt, 2) as total_deposited_usdt,
    ROUND(withdrawn_usdt, 2) as total_withdrawn_usdt,
    ROUND(deposited_usdc, 2) as total_deposited_usdc,
    ROUND(withdrawn_usdc, 2) as total_withdrawn_usdc,

    -- Activity summary
    first_interaction,
    last_interaction,
    DATE_DIFF('day', first_interaction, last_interaction) as days_active,
    total_transactions,
    vaults_used,

    -- Vault usage flags
    CASE WHEN deposited_weth > 0 OR withdrawn_weth > 0 THEN '✓' ELSE '' END as used_weth,
    CASE WHEN deposited_wbtc > 0 OR withdrawn_wbtc > 0 THEN '✓' ELSE '' END as used_wbtc,
    CASE WHEN deposited_usdt > 0 OR withdrawn_usdt > 0 THEN '✓' ELSE '' END as used_usdt,
    CASE WHEN deposited_usdc > 0 OR withdrawn_usdc > 0 THEN '✓' ELSE '' END as used_usdc

FROM user_aggregated
WHERE deposited_weth + deposited_wbtc + deposited_usdt + deposited_usdc > 0  -- Had at least one deposit
ORDER BY
    -- Order by total USD value (using prices as of Jul 9, 2025, 12:30 UTC)
    (deposited_weth - withdrawn_weth) * 2750 +  -- ETH = $2,750
    (deposited_wbtc - withdrawn_wbtc) * 110000 + -- BTC = $110,000
    (deposited_usdt - withdrawn_usdt) * 1 +      -- USDT = $1
    (deposited_usdc - withdrawn_usdc) * 1        -- USDC = $1
    DESC