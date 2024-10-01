// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../data/DataStore.sol";
import "../role/RoleModule.sol";
import "../fee/FeeUtils.sol";
import "../data/Keys.sol";
import "../v1/IVaultV1.sol";
import "./IFeedAddress.sol";

// @title FeeHandler
contract FeeHandler is ReentrancyGuard, RoleModule {
    using SafeERC20 for IERC20;

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;
    address public immutable vault;
    address public immutable gmx;
    address public immutable wnt;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        address _vault,
        address _gmx,
        address _wnt
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        vault = _vault;
        gmx = _gmx;
        wnt = _wnt;
    }

    // @dev claim fees from the specified markets
    // @param markets the markets to claim fees from
    // @param feeTokens the fee tokens to claim for (GMX/WNT)
    // @param swapTokens the provided swap token (GMX/WNT)
    function claimFees(
        address[] calldata markets,
        address[] calldata feeTokens,
        address[] calldata swapTokens
    ) external nonReentrant onlyFeeKeeper {
        if (markets.length != feeTokens.length) {
            revert Errors.InvalidClaimFeesInput(markets.length, feeTokens.length);
        }

        if (markets.length != swapTokens.length) {
            revert Errors.InvalidClaimFeesInput(markets.length, swapTokens.length);
        }

        address receiver = address(this);

        (uint256 gmxTokenOraclePrice, uint256 gmxTokenOracleDecimals, uint256 gmxTokenDecimals) = _getTokenPricingValues(gmx);
        (uint256 wntTokenOraclePrice, uint256 wntTokenOracleDecimals, uint256 wntTokenDecimals) = _getTokenPricingValues(wnt);

        uint256 gmxBatchSize = _getBatchSize(gmx);
        uint256 wntBatchSize = _getBatchSize(wnt);

        uint256 buybackGmxFactorV1 = dataStore.getUint(Keys.buybackGmxFactorKey(1));
        uint256 buybackGmxFactorV2 = dataStore.getUint(Keys.buybackGmxFactorKey(2));

        for (uint256 i; i < markets.length; i++) {
            address swapToken = swapTokens[i];
            if (swapToken != gmx && swapToken != wnt) {
                revert Errors.InvalidSwapTokenInput(swapToken, i);
            }

            address market = markets[i];
            address feeToken = feeTokens[i];

            uint256 availableFeeAmount = _getAvailableFeeAmount(feeToken, swaptoken);
            uint256 maxSwapPriceImpact = _getMaxSwapPriceImpact(feeToken);

            (uint256 feeTokenOraclePrice, uint256 feeTokenOracleDecimals, uint256 feeTokenDecimals) = _getTokenPricingValues(feeToken);

            uint256 swapTokenOraclePrice;
            uint256 swapTokenOracleDecimals;
            uint256 swapTokenDecimals;
            uint256 batchSize;
            address otherToken;
            if (swapToken == gmx) {
                swapTokenOraclePrice = gmxTokenOraclePrice;
                swapTokenOracleDecimals = gmxTokenOracleDecimals;
                swapTokenDecimals = gmxTokenDecimals;
                batchSize = gmxBatchSize;
                otherToken = wnt;
            } else {
                swapTokenOraclePrice = wntTokenOraclePrice;
                swapTokenOracleDecimals = wntTokenOracleDecimals;
                swapTokenDecimals = wntTokenDecimals;
                batchSize = wntBatchSize;
                otherToken = gmx;
            }

            uint256 feeTokenPriceInSwapToken = _getFeeTokenPriceInSwapToken(
                feeTokenOraclePrice,
                feeTokenOracleDecimals,
                swapTokenOraclePrice,
                swapTokenOracleDecimals
            );
            
            uint256 minFeeTokenAmount = _getMinFeeTokenAmount(
                batchSize,
                feeTokenPriceInSwapToken,
                swapTokenDecimals,
                feeTokenDecimals
            );
            
            uint256 maxFeeTokenAmount = _getMaxFeeTokenAmount(minFeeTokenAmount, maxSwapPriceImpact);
            
            if (availableFeeAmount >= maxFeeTokenAmount) {
                _swapFees(feeToken, swapToken, receiver, batchSize, maxFeeTokenAmount, availableFeeAmount);
                continue;
            } else if (availableFeeAmount >= minFeeTokenAmount) {
                _swapFees(feeToken, swapToken, receiver, batchSize, availableFeeAmount, availableFeeAmount);
                continue;
            }

            uint256 feeAmount;
            uint256 swapTokenFeeAmount;
            uint256 otherTokenFeeAmount;
            if (market == address(0)) {
                feeAmount = IVaultV1(vault).withdrawFees(feeToken, receiver);
                (swapTokenFeeAmount, otherTokenFeeAmount) = _getFeeAmounts(swapToken, feeAmount, buybackGmxFactorV1);
            } else {
                feeAmount = FeeUtils.claimFees(dataStore, eventEmitter, market, feeToken, receiver);
                (swapTokenFeeAmount, otherTokenFeeAmount) = _getFeeAmounts(swapToken, feeAmount, buybackGmxFactorV2);
            }
            
            availableFeeAmount = availableFeeAmount + swapTokenfeeAmount;
            if (availableFeeAmount >= maxFeeTokenAmount) {
                _swapFees(feeToken, swapToken, receiver, batchSize, maxFeeTokenAmount, availableFeeAmount);
            } else if (availableFeeAmount >= minFeeTokenAmount) {
                _swapFees(feeToken, swapToken, receiver, batchSize, availableFeeAmount, availableFeeAmount);
            } else {
                revert Errors.InsufficientClaimAmount(market, feeToken, swapToken, swapTokenFeeAmount);
            }

            uint256 otherTokenAvailableFeeAmount = _getAvailableFeeAmount(feeToken, otherToken) + otherTokenFeeAmount;
            _setAvailableFeeAmount(feeToken, otherToken, otherTokenAvailableFeeAmount)
        }
    }

    function _swapFees(address feeToken, address swapToken, address receiver, uint256 batchSize, uint256 swapAmount, uint256 availableFeeAmount) private {
        IERC20[feeToken].safeTransfer(msg.sender, swapAmount);
        IERC20[swapToken].safeTransferFrom(msg.sender, receiver, batchSize);
        availableFeeAmount = availableFeeAmount - swapAmount;
        _setAvailableFeeAmount(feeToken, swaptoken, availableFeeAmount);
    }

    function _setAvailableFeeAmount(address feeToken, address swapToken, uint256 availableFeeAmount) private {
        dataStore.setUint(Keys.buybackAvailableFeeAmountKey(feeToken, swaptoken), availableFeeAmount);
    }

    function _getMaxSwapPriceImpact(address token) private view returns (uint256) {
        uint256 maxSwapPriceImpact = dataStore.getUint(Keys.buybackMaxSwapPriceImpactKey(token));
        return maxSwapPriceImpact;
    }

    function _getAvailableFeeAmount(address feeToken, address swapToken) private view returns (uint256) {
        uint256 availableFeeAmount = dataStore.getUint(Keys.buybackAvailableFeeAmountKey(feeToken, swaptoken));
        return availableFeeAmount;
    }

    function _getTokenPricingValues(address token) private view returns (uint256, uint256, uint256) {
        address tokenPriceFeedAddress = dataStore.getAddress(Keys.priceFeedKey(token));
        uint256 tokenOraclePrice = IFeedAddress(tokenPriceFeedAddress).latestAnswer();
        uint256 tokenOracleDecimals = IFeedAddress(tokenPriceFeedAddress).decimals();
        uint256 tokenDecimals = IFeedAddress(token).decimals(); // IERC20().decimals() is not included in the openzeppelin IERC20 interface so using IFeedAddress().decimals() instead but can change if necessary
        return (tokenOraclePrice, tokenOracleDecimals, tokenDecimals);
    }

    function _getBatchSize(address token) private view returns (uint256) {
        uint256 batchSize = dataStore.getUint(Keys.buybackBatchAmountKey(token));
        return batchSize;
    }

    function _getFeeTokenPriceInSwapToken(
        uint256 feeTokenPrice,
        uint256 feeTokenDecimals,
        uint256 swapTokenPrice,
        uint256 swapTokenDecimals
    ) private pure returns (uint256) {
        if (feeTokenDecimals > swapTokenDecimals) {
            swapTokenPrice = swapTokenPrice * (10 ** (feeTokenDecimals - swapTokenDecimals));
        } else if (swapTokenDecimals > feeTokenDecimals) {
            feeTokenPrice = feeTokenPrice * (10 ** (swapTokenDecimals - feeTokenDecimals));
        }

        uint256 tokenPrice = (feeTokenPrice * 1e30) / swapTokenPrice;
        return tokenPrice;
    }

    function _getMinFeeTokenAmount(
        uint256 batchSize,
        uint256 tokenPrice,
        uint256 swapTokenDecimals,
        uint256 feeTokenDecimals
    ) private pure returns (uint256) {
        if (swapTokenDecimals > feeTokenDecimals) {
            batchSize = batchSize / (10 ** (swapTokenDecimals - feeTokenDecimals));
        } else if (feeTokenDecimals > swapTokenDecimals) {
            batchSize = batchSize * (10 ** (feeTokenDecimals - swapTokenDecimals));
        }

        uint256 tokenAmount = (batchSize * tokenPrice) / 1e30;
        return tokenAmount;
    }

    function _getMaxFeeTokenAmount(uint256 minFeeTokenAmount, uint256 maxSwapPriceImpact) private pure returns (uint256) {
        (minFeeTokenAmount * (maxSwapPriceImpact + 10000)) / 10000;
    }

    function _getFeeAmounts(address swapToken, uint256 feeAmount, uint256 buybackGmxFactor) private pure returns (uint256, uint256) {
        uint256 gmxFeeAmount = (feeAmount * buybackGmxFactor) / 1e30;
        uint256 wntFeeAmount = feeAmount - gmxFeeAmount;
        
        if (swapToken == gmx) {
            return (gmxFeeAmount, wntFeeAmount);
        } else {
            return (wntFeeAmount, gmxFeeAmount);
        }
    }
}
