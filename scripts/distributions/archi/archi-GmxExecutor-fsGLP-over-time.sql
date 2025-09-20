-- Query fsGLP balance of GMXExecutor over time
-- fsGLP token: 0x1aDDD80E6039594eE970E5872D247bf0414C8903
-- GMXExecutor: 0x65C59eE732BD249224718607Ee0EC0e293309923
-- Note: Raw logs for fsGLP are not available in arbitrum.logs, must use decoded events
-- query here: https://dune.com/queries/5811334

SELECT
    block_number,
    block_time,
    balance / 1e18 as fsglp_balance
FROM (
    SELECT
        evt_block_number as block_number,
        evt_block_time as block_time,
        SUM(CASE
            WHEN "to" = 0x65C59eE732BD249224718607Ee0EC0e293309923
            THEN value
            WHEN "from" = 0x65C59eE732BD249224718607Ee0EC0e293309923
            THEN -value
            ELSE 0
        END) OVER (ORDER BY evt_block_number) as balance
    FROM erc20_arbitrum.evt_Transfer
    WHERE contract_address = 0x1aDDD80E6039594eE970E5872D247bf0414C8903  -- fsGLP token
        AND (
            "to" = 0x65C59eE732BD249224718607Ee0EC0e293309923 OR
            "from" = 0x65C59eE732BD249224718607Ee0EC0e293309923
        )
    ORDER BY evt_block_number
)
WHERE block_time >= TIMESTAMP '2022-11-11'  -- Start from November 11, 2022
ORDER BY block_number DESC
