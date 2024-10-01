// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../data/DataStore.sol";
import "../role/RoleModule.sol";
import "../utils/BasicMulticall.sol";
import "../fee/FeeUtils.sol";
import "../data/Keys.sol";
import "../v1/IVaultV1.sol";
import "./IFeedAddress.sol";

// @title FeeHandler
contract FeeHandler is ReentrancyGuard, RoleModule, BasicMulticall {
    using SafeERC20 for IERC20;

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;
    address public immutable vaultV1;
    address public immutable gmx;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        address _vaultV1,
        address _gmx
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        vaultV1 = _vaultV1;
        gmx = _gmx;
    }

    // @dev withdraw fees from this contract
    // @param token the token for which to claim fees
    // @param amount the amount of fees to claim
    function withdrawFees(address token, uint256 amount) external nonReentrant onlyFeeKeeper {
        address receiver = dataStore.getAddress(Keys.FEE_RECEIVER);
        IERC20(token).safeTransfer(receiver, amount);
    }

    // @dev claim fees from the specified markets
    // @param market the markets to claim fees from
    // @param feeToken the fee tokens to claim
    function claimFees(address market, address feeToken) external nonReentrant {
        uint256 version;
        uint256 buybackGmxFactor;
        uint256 feeAmount;
        if (market == address(0)) {
            version = 1;
            buybackGmxFactor = _getBuybackGmxFactor(version);
            feeAmount = IVaultV1(vaultV1).withdrawFees(feeToken, address(this));
            _setAvailableFeeAmounts(version, feeToken, feeAmount);
        } else {
            version = 2;
            buybackGmxFactor = _getBuybackGmxFactor(version);
            feeAmount = FeeUtils.claimFees(dataStore, eventEmitter, market, feeToken, address(this));
            _setAvailableFeeAmounts(version, feeToken, feeAmount);
        }
    }

    // @dev receive an amount in feeToken by depositing the batchSize amount of the buybackToken
    // @param feeToken the token to receive with the fee amount calculated via an oracle price
    // @param buybackToken the token to deposit in the amount of batchSize in return for fees
    function buybackFees(address feeToken, address buybackToken) external nonReentrant {
        uint256 batchSize = dataStore.getUint(Keys.buybackBatchAmountKey(buybackToken));
        if (batchSize == 0) {
            revert Errors.InvalidBuybackTokenInput(buybackToken);
        }

        uint256 minFeeTokenAmount = _getMinFeeTokenAmount(feeToken, buybackToken, batchSize);

        uint256 maxPriceImpactFactor = dataStore.getUint(Keys.buybackMaxPriceImpactFactorKey(feeToken));
        uint256 maxFeeTokenAmount = (minFeeTokenAmount * (maxPriceImpactFactor + 10000)) / 10000;

        uint256 availableFeeAmount = _getAvailableFeeAmount(feeToken, buybackToken);

        if (availableFeeAmount >= maxFeeTokenAmount) {
            _buybackFees(feeToken, buybackToken, batchSize, maxFeeTokenAmount, availableFeeAmount);
        } else if (availableFeeAmount >= minFeeTokenAmount) {
            _buybackFees(feeToken, buybackToken, batchSize, availableFeeAmount, availableFeeAmount);
        } else {
            revert Errors.InsufficientFeeAmount(feeToken, buybackToken, availableFeeAmount);
        }
    }

    function _buybackFees(
        address feeToken,
        address buybackToken,
        uint256 batchSize,
        uint256 buybackAmount,
        uint256 availableFeeAmount
    ) private {
        IERC20(feeToken).safeTransfer(msg.sender, buybackAmount);
        IERC20(buybackToken).safeTransferFrom(msg.sender, address(this), batchSize);
        availableFeeAmount = availableFeeAmount - buybackAmount;
        _setAvailableFeeAmount(feeToken, buybackToken, availableFeeAmount);
    }

    function _setAvailableFeeAmounts(uint256 version, address feeToken, uint256 feeAmount) private {
        address wnt = dataStore.getAddress(Keys.WNT);

        uint256 buybackGmxFactor = _getBuybackGmxFactor(version);
        uint256 feeAmountGmx = (feeAmount * buybackGmxFactor) / 1e30;
        uint256 feeAmountWnt = feeAmount - feeAmountGmx;

        uint256 availableFeeAmountGmx = _getAvailableFeeAmount(feeToken, gmx) + feeAmountGmx;
        uint256 availableFeeAmountWnt = _getAvailableFeeAmount(feeToken, wnt) + feeAmountWnt;

        _setAvailableFeeAmount(feeToken, gmx, availableFeeAmountGmx);
        _setAvailableFeeAmount(feeToken, wnt, availableFeeAmountWnt);
    }

    function _setAvailableFeeAmount(address feeToken, address buybackToken, uint256 availableFeeAmount) private {
        dataStore.setUint(Keys.buybackAvailableFeeAmountKey(feeToken, buybackToken), availableFeeAmount);
    }

    function _getAvailableFeeAmount(address feeToken, address buybackToken) private view returns (uint256) {
        uint256 availableFeeAmount = dataStore.getUint(Keys.buybackAvailableFeeAmountKey(feeToken, buybackToken));
        return availableFeeAmount;
    }

    function _getBuybackGmxFactor(uint256 version) private view returns (uint256) {
        uint256 buybackGmxFactor = dataStore.getUint(Keys.buybackGmxFactorKey(version));
        return buybackGmxFactor;
    }

    function _getMinFeeTokenAmount(
        address feeToken,
        address buybackToken,
        uint256 batchSize
    ) private view returns (uint256) {
        (
            uint256 feeTokenOraclePrice,
            uint256 feeTokenOracleDecimals,
            uint256 feeTokenDecimals
        ) = _getTokenPricingValues(feeToken);

        (
            uint256 buybackTokenOraclePrice,
            uint256 buybackTokenOracleDecimals,
            uint256 buybackTokenDecimals
        ) = _getTokenPricingValues(buybackToken);

        if (feeTokenOracleDecimals > buybackTokenOracleDecimals) {
            buybackTokenOraclePrice =
                buybackTokenOraclePrice *
                (10 ** (feeTokenOracleDecimals - buybackTokenOracleDecimals));
        } else if (buybackTokenOracleDecimals > feeTokenOracleDecimals) {
            feeTokenOraclePrice = feeTokenOraclePrice * (10 ** (buybackTokenOracleDecimals - feeTokenOracleDecimals));
        }

        uint256 feeTokenPriceInBuybackToken = (feeTokenOraclePrice * 1e30) / buybackTokenOraclePrice;

        // this assumes the batchSize amount is stored in buybackTokenDecimals i.e. batchSize of 100 GMX stored as 100 * (10 ^ 18)
        if (buybackTokenDecimals > feeTokenDecimals) {
            batchSize = batchSize / (10 ** (buybackTokenDecimals - feeTokenDecimals));
        } else if (feeTokenDecimals > buybackTokenDecimals) {
            batchSize = batchSize * (10 ** (feeTokenDecimals - buybackTokenDecimals));
        }

        uint256 feeTokenAmount = (batchSize * feeTokenPriceInBuybackToken) / 1e30;
        return feeTokenAmount;
    }

    function _getTokenPricingValues(address token) private view returns (uint256, uint256, uint256) {
        address tokenPriceFeedAddress = dataStore.getAddress(Keys.priceFeedKey(token));
        uint256 tokenOraclePrice = IFeedAddress(tokenPriceFeedAddress).latestAnswer();
        uint256 tokenOracleDecimals = IFeedAddress(tokenPriceFeedAddress).decimals();
        uint256 tokenDecimals = IFeedAddress(token).decimals(); // IERC20().decimals() is not included in the openzeppelin IERC20 interface so using IFeedAddress().decimals() instead but can change if necessary
        return (tokenOraclePrice, tokenOracleDecimals, tokenDecimals);
    }
}
