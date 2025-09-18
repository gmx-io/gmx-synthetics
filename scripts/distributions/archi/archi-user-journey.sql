-- Track ALL passive liquidity provider interactions for user 0x69cE8721790Edbdcd2b4155D853d99d2680477B0
-- Covers: Vault contracts (addLiquidity, removeLiquidity) + BaseReward contracts (claim, withdraw)
-- Starting from 11-11-2022
-- query here: https://dune.com/queries/5799034

WITH archi_contracts AS (
    SELECT contract_address, contract_name, contract_type, token_symbol, decimals FROM (VALUES
        -- Vault Contracts (Passive Liquidity Provider entry points)
        (0xee54A31e9759B0F7FDbF48221b72CD9F3aEA00AB, 'WBTC Vault', 'Vault', 'WBTC', 8),
        -- Add other vault addresses when known:
        -- (0x..., 'WETH Vault', 'Vault', 'WETH', 18),
        -- (0x..., 'USDT Vault', 'Vault', 'USDT', 6),
        -- (0x..., 'USDC Vault', 'Vault', 'USDC', 6),

        -- BaseReward Contracts (Reward management for passive users)
        (0x12e14fDc843Fb9c64B84Dfa6fB03350D6810d8e5, 'WBTC BaseReward Pool', 'BaseReward', 'WETH', 18),

        -- Advanced Users (Leveraged Farming) entry points
        (0xcEd4D9293002964fEA40F984c6d7e20c5eD49D35, 'CreditCaller', 'Credit', 'Other', 18),

        -- GMX Integration Contracts (used by leveraged farming)
        (0x65C59eE732BD249224718607Ee0EC0e293309923, 'GMXExecutor', 'Depositor', 'GLP', 18),
        (0x7093c218188d101f5E121Ab679cA3b5e034F7863, 'GMXDepositor', 'Depositor', 'Other', 18),

        -- Credit Management Contracts
        (0x20B9359f8Bc3BE6a29dc3B2859c68d05EB9F1FC0, 'CreditRewardTracker', 'Credit', 'Other', 18)
        -- Add other credit-related addresses when known
    ) AS t(contract_address, contract_name, contract_type, token_symbol, decimals)
)

SELECT
    c.contract_name,
    CASE
        -- Vault Contract Methods
        WHEN bytearray_substring(t.data, 1, 4) = 0x51c6590a THEN 'addLiquidity'
        WHEN bytearray_substring(t.data, 1, 4) = 0x9c8f9f23 THEN 'removeLiquidity'
        WHEN bytearray_substring(t.data, 1, 4) = 0x2e1a7d4d THEN 'withdraw'
        WHEN bytearray_substring(t.data, 1, 4) = 0xb6b55f25 THEN 'deposit'

        -- BaseReward Contract Methods
        WHEN bytearray_substring(t.data, 1, 4) = 0x4e71d92d THEN 'claim'
        WHEN bytearray_substring(t.data, 1, 4) = 0xb4ba9e11 THEN 'claimFor'
        WHEN bytearray_substring(t.data, 1, 4) = 0x441a3e70 THEN 'withdraw'
        WHEN bytearray_substring(t.data, 1, 4) = 0x9dc29fac THEN 'burn'
        WHEN bytearray_substring(t.data, 1, 4) = 0xa9059cbb THEN 'transfer'

        ELSE 'unknown'
    END as action_type,

    -- Decode amount from transaction data (first parameter after method selector)
    CASE
        WHEN c.contract_type = 'Vault' THEN
            bytearray_to_uint256(bytearray_substring(t.data, 5, 32)) / POWER(10, c.decimals)
        WHEN c.contract_type = 'BaseReward' THEN
            bytearray_to_uint256(bytearray_substring(t.data, 5, 32)) / 1e18  -- WETH rewards
        ELSE
            bytearray_to_uint256(bytearray_substring(t.data, 5, 32)) / 1e18
    END as decoded_amount,

    c.contract_type,
    c.token_symbol,

    t.block_number,
    t.block_time,
    t.hash as transaction_hash,

    CASE
        WHEN t.block_number = 137094219 THEN '🎯 Known WBTC Deposit (7.3451 WBTC)'
        WHEN t.block_number = 105150071 THEN '🎯 Known WBTC Deposit (8.8 WBTC)'
        WHEN t.block_number = 103769302 THEN '🎯 Known WBTC Deposit (5.95 WBTC)'
        ELSE ''
    END as timeline_notes

FROM arbitrum.transactions t
JOIN archi_contracts c ON c.contract_address = t."to"
WHERE t."from" = 0x69cE8721790Edbdcd2b4155D853d99d2680477B0
AND t.block_time >= TIMESTAMP '2022-11-11 00:00:00' -- date before any archi vaults were deployed
ORDER BY t.block_number ASC;