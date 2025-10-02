-- Export all positions from CreditUser #2 (the one used by farmers to mint the 1.6M fsGLP in GMXExecutor)
-- CreditUser #2: 0xe854358Bc324Cd5a73DEb5552a698e462A9CC38E
-- GMXExecutor: 0x49EE14e37Cb47bff8c512B3A0d672302A3446eb1 (holds 1.6M fsGLP)
-- https://dune.com/queries/5890537

WITH create_events AS (
    SELECT
        LOWER(CONCAT('0x', SUBSTR(CAST(l.topic1 AS VARCHAR), 27))) as farmer_address,
        bytearray_to_uint256(bytearray_substring(l.data, 1, 32)) as position_index,
        l.tx_hash,
        l.block_time,
        l.block_number
    FROM arbitrum.logs l
    JOIN arbitrum.transactions t ON l.tx_hash = t.hash
    WHERE l.contract_address = 0xe854358Bc324Cd5a73DEb5552a698e462A9CC38E -- CreditUser #2
    AND t.success = true
    AND l.topic0 = 0xde92b0f67a20a147d9843f5ea77578f3e2194a26339138913d68867994bfef27 -- CreateUserLendCredit
    AND l.block_time >= TIMESTAMP '2023-04-01'
),

farmer_counts AS (
    SELECT
        farmer_address,
        COUNT(*) as total_positions
    FROM create_events
    GROUP BY farmer_address
)

SELECT
    ce.farmer_address,
    ce.position_index,
    fc.total_positions as farmer_position_count,
    ce.block_time as position_opened_at,
    ce.block_number,
    ce.tx_hash as open_tx_hash
FROM create_events ce
JOIN farmer_counts fc ON ce.farmer_address = fc.farmer_address
ORDER BY ce.farmer_address, ce.position_index
