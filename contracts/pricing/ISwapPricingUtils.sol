// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface ISwapPricingUtils {
    enum SwapPricingType {
        Swap,
        Shift,
        Atomic,
        Deposit,
        Withdrawal
    }
}
