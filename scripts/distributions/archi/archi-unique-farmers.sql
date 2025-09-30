-- 100% ACCURATE: All Farmers Who Ever Opened Positions
-- Uses CreateUserLendCredit events from CreditUser contract
-- CreditUser Contract: 0x8718CaD7DE1B411616145669c1e1242051342fb3
--
-- Event: CreateUserLendCredit(address indexed _recipient, uint256 _borrowedIndex, address _depositor, address _token, uint256 _amountIn, address[] _borrowedTokens, uint256[] _ratios)
--
-- HOW THIS WORKS:
-- 1. Queries logs from CreditUser contract
-- 2. Filters for CreateUserLendCredit events (emitted when position opens)
-- 3. Extracts farmer address from indexed topic1 parameter
-- 4. Counts positions per farmer
-- 5. Outputs CSV-ready format for use with checkFarmersPositions.ts

WITH create_position_events AS (
    SELECT
        l.block_time,
        l.tx_hash,

        -- Decode farmer address from topic1 (_recipient is indexed)
        LOWER(CONCAT('0x', SUBSTR(CAST(l.topic1 AS VARCHAR), 27))) as farmer_address,

        -- Decode position index from data (first 32 bytes = _borrowedIndex uint256)
        bytearray_to_uint256(bytearray_substring(l.data, 1, 32)) as position_index

    FROM arbitrum.logs l
    JOIN arbitrum.transactions t ON l.tx_hash = t.hash

    WHERE l.contract_address = 0x8718CaD7DE1B411616145669c1e1242051342fb3 -- CreditUser
    AND t.success = true
    AND l.block_time >= TIMESTAMP '2023-04-03 00:00:00' -- Contract creation date
    AND l.topic1 IS NOT NULL -- Must have indexed _recipient parameter

    -- CRITICAL: Filter for ONLY CreateUserLendCredit events by event signature
    AND l.topic0 = 0xde92b0f67a20a147d9843f5ea77578f3e2194a26339138913d68867994bfef27

    -- Event signature: CreateUserLendCredit(address,uint256,address,address,uint256,address[],uint256[])
    -- This ensures we only count position opens, not CreateUserBorrowed or Destroy events
)

SELECT
    ROW_NUMBER() OVER (ORDER BY first_position_opened ASC) as "#",
    farmer_address,
    position_count,
    DATE_TRUNC('second', first_position_opened) as first_position_opened,
    DATE_TRUNC('second', last_position_opened) as last_position_opened,
    CONCAT('https://arbiscan.io/address/', farmer_address) as arbiscan_link
FROM (
    SELECT
        farmer_address,
        COUNT(DISTINCT position_index) as position_count,
        MIN(block_time) as first_position_opened,
        MAX(block_time) as last_position_opened
    FROM create_position_events
    WHERE farmer_address IS NOT NULL
    AND farmer_address != '0x0000000000000000000000000000000000000000'
    AND LENGTH(farmer_address) = 42 -- Valid Ethereum address
    GROUP BY farmer_address
) farmer_stats
WHERE position_count > 0
ORDER BY first_position_opened ASC

-- USAGE:
-- 1. Run this query on Dune Analytics
-- 2. Export results as CSV (archi-farmers-positions.csv)
-- 3. Run: npx hardhat run --network arbitrum scripts/distributions/archi/checkFarmersPositions.ts
-- 4. The TypeScript script will validate each position's termination status via RPC

-- NOTE: This query provides farmer addresses and position counts based on CreateUserLendCredit events.
-- For 100% accurate position status (active vs terminated), use checkFarmersPositions.ts
-- which reads directly from the blockchain via RPC calls.
