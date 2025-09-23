-- Query: Farmer Position Counts
-- Extracts all leveraged farmers and their total position count
-- Uses all events from CreditUser contract to find unique farmers
-- Contract: CreditUser (0x8718CaD7DE1B411616145669c1e1242051342fb3)
-- https://dune.com/queries/5833113

WITH all_events AS (
    SELECT
        l.block_time,
        l.tx_hash,
        l.topic0,
        l.topic1,
        l.topic2,

        -- Decode farmer address from topic1 (for indexed address parameters)
        CASE
            WHEN l.topic1 IS NOT NULL THEN
                LOWER(CONCAT('0x', SUBSTR(CAST(l.topic1 AS VARCHAR), 27)))
            ELSE NULL
        END as farmer_address

    FROM arbitrum.logs l
    JOIN arbitrum.transactions t ON l.tx_hash = t.hash

    WHERE l.contract_address = 0x8718CaD7DE1B411616145669c1e1242051342fb3 -- CreditUser contract
    AND t.success = true
    AND l.block_time >= TIMESTAMP '2023-04-03 00:00:00'
    AND l.topic1 IS NOT NULL -- Must have an indexed address parameter
),

-- Filter for valid farmer addresses and count unique events per farmer
farmer_stats AS (
    SELECT
        farmer_address,
        COUNT(*) as position_count
    FROM all_events
    WHERE farmer_address IS NOT NULL
    AND farmer_address != '0x0000000000000000000000000000000000000000' -- Exclude zero address
    AND LENGTH(farmer_address) = 42 -- Valid address length
    GROUP BY farmer_address
)

-- Final output: farmer address and position count
SELECT
    CAST(farmer_address AS VARCHAR) as farmer_address,
    position_count
FROM farmer_stats
WHERE position_count > 0
ORDER BY position_count DESC, farmer_address ASC
