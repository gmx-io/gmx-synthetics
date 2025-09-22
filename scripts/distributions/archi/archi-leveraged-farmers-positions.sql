-- Find Archi users with outstanding leveraged positions
-- Contract: 0xcEd4D9293002964fEA40F984c6d7e20c5eD49D35 (CreditCallerProxy)
-- This query identifies users who have opened positions but not yet closed them
-- Tracks openLendCredit, repayCredit, and liquidate events to calculate net positions
-- https://dune.com/queries/5792212

WITH credit_events AS (
    -- Get all CreditCaller events
    SELECT
        t.block_time,
        t.hash as tx_hash,
        t."from" as tx_sender,

        -- Decode method
        CASE
            WHEN bytearray_substring(t.data, 1, 4) = 0x1a1bd479 THEN 'openLendCredit'
            WHEN bytearray_substring(t.data, 1, 4) = 0x05713ae5 THEN 'repayCredit'
            WHEN bytearray_substring(t.data, 1, 4) = 0x2f745c59 THEN 'liquidate'
        END as method_name,

        -- Get recipient/affected user
        CASE
            -- openLendCredit: _recipient (6th parameter)
            WHEN bytearray_substring(t.data, 1, 4) = 0x1a1bd479 AND LENGTH(t.data) >= 196
            THEN CAST(CONCAT('0x', SUBSTR(CAST(bytearray_substring(t.data, 177, 20) AS VARCHAR), 3)) AS VARCHAR)
            -- repayCredit: affects msg.sender
            WHEN bytearray_substring(t.data, 1, 4) = 0x05713ae5
            THEN CAST(t."from" AS VARCHAR)
            -- liquidate: _recipient (1st parameter) is the victim
            WHEN bytearray_substring(t.data, 1, 4) = 0x2f745c59 AND LENGTH(t.data) >= 36
            THEN CAST(CONCAT('0x', SUBSTR(CAST(bytearray_substring(t.data, 17, 20) AS VARCHAR), 3)) AS VARCHAR)
        END as affected_user,

        -- Decode token and amount for openLendCredit
        CASE
            WHEN bytearray_substring(t.data, 1, 4) = 0x1a1bd479 AND LENGTH(t.data) >= 68
            THEN CAST(CONCAT('0x', SUBSTR(CAST(bytearray_substring(t.data, 49, 20) AS VARCHAR), 3)) AS VARCHAR)
        END as token_address,

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
                    -- WETH and ETH have 18 decimals
                    ELSE bytearray_to_uint256(bytearray_substring(t.data, 69, 32)) / 1e18
                END
        END as amount

    FROM arbitrum.transactions t
    WHERE t."to" = 0xcEd4D9293002964fEA40F984c6d7e20c5eD49D35 -- CreditCaller
    AND t.block_time >= TIMESTAMP '2023-04-03 00:00:00'
    AND t.success = true
    AND bytearray_substring(t.data, 1, 4) IN (
        0x1a1bd479, -- openLendCredit
        0x05713ae5, -- repayCredit
        0x2f745c59  -- liquidate
    )
),

user_position_summary AS (
    SELECT
        affected_user,

        -- Count different event types
        SUM(CASE WHEN method_name = 'openLendCredit' THEN 1 ELSE 0 END) as positions_opened,
        SUM(CASE WHEN method_name = 'repayCredit' THEN 1 ELSE 0 END) as positions_repaid,
        SUM(CASE WHEN method_name = 'liquidate' THEN 1 ELSE 0 END) as positions_liquidated,

        -- Calculate net open positions
        SUM(CASE WHEN method_name = 'openLendCredit' THEN 1
                 WHEN method_name IN ('repayCredit', 'liquidate') THEN -1
                 ELSE 0 END) as net_open_positions,

        -- Last activity
        MAX(CASE WHEN method_name = 'openLendCredit' THEN block_time END) as last_open_time,
        MAX(CASE WHEN method_name = 'repayCredit' THEN block_time END) as last_repay_time,
        MAX(CASE WHEN method_name = 'liquidate' THEN block_time END) as last_liquidation_time,
        MAX(block_time) as last_activity,

        -- Total value opened (estimated USD using Jul 9, 2025 prices)
        SUM(CASE
            WHEN method_name = 'openLendCredit' THEN
                CASE
                    WHEN token_address = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1' THEN amount * 2750  -- WETH
                    WHEN token_address = '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f' THEN amount * 110000 -- WBTC
                    WHEN token_address = '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8' THEN amount * 1      -- USDC
                    WHEN token_address = '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9' THEN amount * 1      -- USDT
                    ELSE 0
                END
            ELSE 0
        END) as total_opened_usd

    FROM credit_events
    WHERE affected_user IS NOT NULL
    GROUP BY affected_user
)

-- Final result: Users with likely outstanding positions
SELECT
    ROW_NUMBER() OVER (ORDER BY net_open_positions DESC, total_opened_usd DESC) as "#",
    CAST(affected_user AS VARCHAR) as user_address,
    positions_opened,
    positions_repaid,
    positions_liquidated,
    net_open_positions,
    ROUND(total_opened_usd, 2) as total_opened_usd,
    last_open_time,
    last_repay_time,
    last_liquidation_time,
    DATE_DIFF('day', last_activity, CURRENT_TIMESTAMP) as days_since_activity,

    -- Status indicator
    CASE
        WHEN net_open_positions > 0 THEN '🟢 LIKELY ACTIVE'
        WHEN net_open_positions = 0 THEN '⚪ LIKELY CLOSED'
        ELSE '🔴 DATA ERROR'
    END as position_status,

    -- Risk indicator based on last activity
    CASE
        WHEN net_open_positions > 0 AND last_liquidation_time IS NOT NULL
             AND last_liquidation_time > COALESCE(last_repay_time, TIMESTAMP '2000-01-01')
        THEN '⚠️ LAST ACTION WAS LIQUIDATION'
        WHEN net_open_positions > 0 AND DATE_DIFF('day', last_activity, CURRENT_TIMESTAMP) > 90
        THEN '⏰ INACTIVE 90+ DAYS'
        WHEN net_open_positions > 0 AND DATE_DIFF('day', last_activity, CURRENT_TIMESTAMP) > 30
        THEN '📅 INACTIVE 30+ DAYS'
        ELSE ''
    END as risk_flag,

    CONCAT('https://arbiscan.io/address/', CAST(affected_user AS VARCHAR)) as arbiscan_link

FROM user_position_summary
WHERE net_open_positions > 0  -- Only show users with outstanding positions
ORDER BY net_open_positions DESC, total_opened_usd DESC

-- Note: This query calculates NET positions based on events.
-- A user with net_open_positions > 0 likely has active positions.
-- However, this should be verified on-chain by calling:
-- CreditUser.getUserCounts(address) and checking each position's isTerminated status