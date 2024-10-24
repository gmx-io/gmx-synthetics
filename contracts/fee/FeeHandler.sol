// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../role/RoleModule.sol";
import "../oracle/OracleModule.sol";
import "../utils/BasicMulticall.sol";
import "../fee/FeeUtils.sol";
import "../v1/IVaultV1.sol";
import "../v1/IVaultGovV1.sol";

// @title FeeHandler
contract FeeHandler is ReentrancyGuard, RoleModule, OracleModule, BasicMulticall {
    using SafeERC20 for IERC20;
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;

    struct FeeAmounts {
        uint256 gmx;
        uint256 wnt;
    }

    uint256 public constant v1 = 1;
    uint256 public constant v2 = 2;

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;
    IVaultV1 public immutable vaultV1;
    address public immutable gmx;

    constructor(
        RoleStore _roleStore,
        Oracle _oracle,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        IVaultV1 _vaultV1,
        address _gmx
    ) RoleModule(_roleStore) OracleModule(_oracle) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        vaultV1 = _vaultV1;
        gmx = _gmx;
    }

    // @dev withdraw fees in buybackTokens from this contract
    // note that claimFees should be called to claim pending fees if needed
    // before calling this function
    // @param marketTokens the markets from which to withdraw fees
    // @param buybackToken the token for which to withdraw fees
    function withdrawFees(address buybackToken) external nonReentrant onlyFeeKeeper {
        _validateBuybackToken(_getBatchSize(buybackToken), buybackToken);

        address receiver = dataStore.getAddress(Keys.FEE_RECEIVER);

        uint256 amount = dataStore.getUint(Keys.withdrawableBuybackTokenAmountKey(buybackToken));
        dataStore.setUint(Keys.withdrawableBuybackTokenAmountKey(buybackToken), 0);

        IERC20(buybackToken).safeTransfer(receiver, amount);
    }

    // @dev claim fees in feeToken from the specified markets
    // @param market the market from which to claim fees
    // @param feeToken the fee tokens to claim from the market
    function claimFees(address market, address feeToken, uint256 version) external nonReentrant {
        uint256 feeAmount;
        if (version == v1) {
            uint256 balanceBefore = IERC20(feeToken).balanceOf(address(this));
            IVaultGovV1(vaultV1.gov()).withdrawFees(address(vaultV1), feeToken, address(this));
            uint256 balanceAfter = IERC20(feeToken).balanceOf(address(this));
            feeAmount = balanceAfter - balanceBefore;
        } else if (version == v2) {
            _validateMarket(market);
            feeAmount = FeeUtils.claimFees(dataStore, eventEmitter, market, feeToken, address(this));
        } else {
            revert Errors.InvalidVersion(version);
        }

        _incrementAvailableFeeAmounts(version, feeToken, feeAmount);
    }

    // @dev receive an amount in feeToken by depositing the batchSize amount of the buybackToken
    // @param feeToken the token to receive with the fee amount calculated via an oracle price
    // @param buybackToken the token to deposit in the amount of batchSize in return for fees
    // @param minOutputAmount the minimum amount of the feeToken that the caller will receive
    function buyback(
        address feeToken,
        address buybackToken,
        uint256 minOutputAmount,
        OracleUtils.SetPricesParams memory params
    ) external nonReentrant withOraclePrices(params) {
        if (feeToken == buybackToken) {
            revert Errors.BuybackAndFeeTokenAreEqual(feeToken, buybackToken);
        }

        uint256 batchSize = _getBatchSize(buybackToken);
        _validateBuybackToken(batchSize, buybackToken);

        uint256 availableFeeAmount = _getAvailableFeeAmount(feeToken, buybackToken);
        if (availableFeeAmount == 0) {
            revert Errors.AvailableFeeAmountIsZero(feeToken, buybackToken, availableFeeAmount);
        }

        uint256 maxFeeTokenAmount = _getMaxFeeTokenAmount(feeToken, buybackToken, batchSize);
        uint256 outputAmount = availableFeeAmount < maxFeeTokenAmount ? availableFeeAmount : maxFeeTokenAmount;

        if (outputAmount < minOutputAmount) {
            revert Errors.InsufficientBuybackOutputAmount(feeToken, buybackToken, outputAmount, minOutputAmount);
        }

        _buybackFees(feeToken, buybackToken, batchSize, outputAmount, availableFeeAmount);
    }

    // note that there should not be any duplicates in the markets array
    // otherwise the returned output amount would not be accurate
    function getOutputAmount(
        address[] calldata markets,
        address feeToken,
        address buybackToken,
        uint256 version,
        uint256 feeTokenPrice,
        uint256 buybackTokenPrice
    ) external view returns (uint256) {
        uint256 batchSize = _getBatchSize(buybackToken);
        _validateBuybackToken(batchSize, buybackToken);

        uint256 feeAmount;
        uint256 availableFeeAmount = _getAvailableFeeAmount(feeToken, buybackToken);
        FeeAmounts memory feeAmounts;

        for (uint256 i; i < markets.length; i++) {
            if (version == v1) {
                feeAmount = vaultV1.feeReserves(feeToken);
            } else if (version == v2) {
                address market = markets[i];
                _validateMarket(market);
                feeAmount = _getUint(Keys.claimableFeeAmountKey(market, feeToken));
            } else {
                revert Errors.InvalidVersion(version);
            }

            feeAmounts = _getFeeAmounts(version, feeAmount);
            feeAmount = buybackToken == gmx ? feeAmounts.gmx : feeAmounts.wnt;
            availableFeeAmount = availableFeeAmount + feeAmount;
        }

        uint256 maxFeeTokenAmount = _getMaxFeeTokenAmount(
            feeToken,
            buybackToken,
            batchSize,
            feeTokenPrice,
            buybackTokenPrice
        );

        if (availableFeeAmount > maxFeeTokenAmount) {
            return maxFeeTokenAmount;
        }

        return availableFeeAmount;
    }

    function _buybackFees(
        address feeToken,
        address buybackToken,
        uint256 batchSize,
        uint256 buybackAmount,
        uint256 availableFeeAmount
    ) internal {
        _incrementWithdrawableBuybackTokenAmount(buybackToken, batchSize);
        _setAvailableFeeAmount(feeToken, buybackToken, availableFeeAmount - buybackAmount);

        IERC20(buybackToken).safeTransferFrom(msg.sender, address(this), batchSize);
        IERC20(feeToken).safeTransfer(msg.sender, buybackAmount);

        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "feeToken", feeToken);
        eventData.addressItems.setItem(1, "buybackToken", buybackToken);

        eventData.uintItems.initItems(3);
        eventData.uintItems.setItem(0, "batchSize", batchSize);
        eventData.uintItems.setItem(1, "buybackAmount", buybackAmount);
        eventData.uintItems.setItem(2, "availableFeeAmount", availableFeeAmount);

        eventEmitter.emitEventLog("BuybackFees", eventData);
    }

    function _incrementWithdrawableBuybackTokenAmount(address buybackToken, uint256 amount) internal {
        uint256 withdrawableAmount = dataStore.getUint(Keys.withdrawableBuybackTokenAmountKey(buybackToken));
        dataStore.setUint(Keys.withdrawableBuybackTokenAmountKey(buybackToken), withdrawableAmount + amount);
    }

    function _incrementAvailableFeeAmounts(uint256 version, address feeToken, uint256 feeAmount) internal {
        address wnt = dataStore.getAddress(Keys.WNT);

        FeeAmounts memory feeAmounts = _getFeeAmounts(version, feeAmount);

        _incrementAvailableFeeAmount(feeToken, gmx, feeAmounts.gmx);
        _incrementAvailableFeeAmount(feeToken, wnt, feeAmounts.wnt);
    }

    function _incrementAvailableFeeAmount(address feeToken, address buybackToken, uint256 amount) internal {
        // if the feeToken is the same as the buybackToken then no buyback swap is needed
        // increase the withdrawable buyback token amount directly in this case
        if (feeToken == buybackToken) {
            _incrementWithdrawableBuybackTokenAmount(buybackToken, amount);
        } else {
            uint256 availableFeeAmount = _getAvailableFeeAmount(feeToken, buybackToken);
            _setAvailableFeeAmount(feeToken, buybackToken, availableFeeAmount + amount);
        }
    }

    function _setAvailableFeeAmount(address feeToken, address buybackToken, uint256 availableFeeAmount) internal {
        dataStore.setUint(Keys.buybackAvailableFeeAmountKey(feeToken, buybackToken), availableFeeAmount);

        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "feeToken", feeToken);
        eventData.addressItems.setItem(1, "buybackToken", buybackToken);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "availableFeeAmount", availableFeeAmount);

        eventEmitter.emitEventLog("SetAvailableFeeAmount", eventData);
    }

    function _getAvailableFeeAmount(address feeToken, address buybackToken) internal view returns (uint256) {
        return _getUint(Keys.buybackAvailableFeeAmountKey(feeToken, buybackToken));
    }

    function _getFeeAmounts(uint256 version, uint256 feeAmount) internal view returns (FeeAmounts memory) {
        uint256 gmxFactor = _getUint(Keys.buybackGmxFactorKey(version));
        FeeAmounts memory feeAmounts;

        feeAmounts.gmx = Precision.applyFactor(feeAmount, gmxFactor);
        feeAmounts.wnt = feeAmount - feeAmounts.gmx;
        return feeAmounts;
    }

    function _getMaxFeeTokenAmount(
        address feeToken,
        address buybackToken,
        uint256 batchSize
    ) internal view returns (uint256) {
        uint256 priceTimestamp = oracle.minTimestamp();
        uint256 maxPriceAge = _getUint(Keys.BUYBACK_MAX_PRICE_AGE);
        uint256 currentTimestamp = Chain.currentTimestamp();
        if ((priceTimestamp + maxPriceAge) < currentTimestamp) {
            revert Errors.MaxBuybackPriceAgeExceeded(priceTimestamp, maxPriceAge, currentTimestamp);
        }

        uint256 feeTokenPrice = oracle.getPrimaryPrice(feeToken).max;
        uint256 buybackTokenPrice = oracle.getPrimaryPrice(buybackToken).min;

        return _getMaxFeeTokenAmount(
            feeToken,
            buybackToken,
            batchSize,
            feeTokenPrice,
            buybackTokenPrice
        );
    }

    function _getMaxFeeTokenAmount(
        address feeToken,
        address buybackToken,
        uint256 batchSize,
        uint256 feeTokenPrice,
        uint256 buybackTokenPrice
    ) internal view returns (uint256) {
        uint256 expectedFeeTokenAmount = Precision.mulDiv(batchSize, buybackTokenPrice, feeTokenPrice);
        uint256 maxPriceImpactFactor = _getUint(Keys.buybackMaxPriceImpactFactorKey(feeToken)) +
            _getUint(Keys.buybackMaxPriceImpactFactorKey(buybackToken));

        return Precision.applyFactor(expectedFeeTokenAmount, maxPriceImpactFactor + Precision.FLOAT_PRECISION);
    }

    function _getBatchSize(address buybackToken) internal view returns (uint256) {
        return _getUint(Keys.buybackBatchAmountKey(buybackToken));
    }

    function _getUint(bytes32 fullKey) internal view returns (uint256) {
        return dataStore.getUint(fullKey);
    }

    function _validateBuybackToken(uint256 batchSize, address buybackToken) internal pure {
        if (batchSize == 0) {
            revert Errors.InvalidBuybackToken(buybackToken);
        }
    }

    function _validateMarket(address market) internal pure {
        if (market == address(0)) {
            revert Errors.EmptyClaimFeesMarket();
        }
    }
}
