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
import "../oracle/ChainlinkPriceFeedUtils.sol";
import "../v1/IVaultV1.sol";
import "../v1/IVaultGovV1.sol";

// @title FeeHandler
contract FeeHandler is ReentrancyGuard, RoleModule, BasicMulticall {
    using SafeERC20 for IERC20;

    struct FeeAmounts {
        uint256 gmx;
        uint256 wnt;
    }

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

    // @dev withdraw fees in buybackTokens from this contract
    // @param marketTokens the markets from which to withdraw fees
    // @param buybackToken the token for which to withdraw fees
    function withdrawFees(address[] calldata markets, address buybackToken) external nonReentrant onlyFeeKeeper {
        uint256 batchSize = dataStore.getUint(Keys.buybackBatchAmountKey(buybackToken));
        _validateBuybackToken(batchSize, buybackToken);

        for (uint256 i; i < markets.length; i++) {
            FeeUtils.claimFees(dataStore, eventEmitter, markets[i], buybackToken, address(this));
        }

        address receiver = dataStore.getAddress(Keys.FEE_RECEIVER);
        IERC20(buybackToken).safeTransfer(receiver, IERC20(buybackToken).balanceOf(address(this)));
    }

    // @dev claim fees in feeToken from the specified markets
    // @param market the market from which to claim fees
    // @param feeToken the fee tokens to claim from the market
    function claimFees(address market, address feeToken) external nonReentrant {
        uint256 batchSize = dataStore.getUint(Keys.buybackBatchAmountKey(feeToken));
        if (batchSize != 0) {
            revert Errors.InvalidFeeToken(feeToken);
        }

        uint256 feeAmount;
        if (market == address(0)) {
            address gov = IVaultV1(vaultV1).gov();
            feeAmount = IVaultGovV1(gov).withdrawFees(vaultV1, feeToken, address(this));
            _setAvailableFeeAmounts(1, feeToken, feeAmount);
        } else {
            feeAmount = FeeUtils.claimFees(dataStore, eventEmitter, market, feeToken, address(this));
            _setAvailableFeeAmounts(2, feeToken, feeAmount);
        }
    }

    // @dev receive an amount in feeToken by depositing the batchSize amount of the buybackToken
    // @param feeToken the token to receive with the fee amount calculated via an oracle price
    // @param buybackToken the token to deposit in the amount of batchSize in return for fees
    // @param minOutputAmount the minimum amount of the feeToken that the caller will receive
    function buyback(address feeToken, address buybackToken, uint256 minOutputAmount) external nonReentrant {
        if (feeToken == buybackToken) {
            revert Errors.BuybackAndFeeTokenAreEqual(feeToken, buybackToken);
        }

        uint256 batchSize = dataStore.getUint(Keys.buybackBatchAmountKey(buybackToken));
        _validateBuybackToken(batchSize, buybackToken);

        uint256 availableFeeAmount = _getAvailableFeeAmount(feeToken, buybackToken);
        uint256 maxFeeTokenAmount = _getMaxFeeTokenAmount(feeToken, buybackToken, batchSize);
        if (availableFeeAmount >= maxFeeTokenAmount) {
            _buybackFees(feeToken, buybackToken, batchSize, maxFeeTokenAmount, availableFeeAmount);
        } else if (availableFeeAmount >= minOutputAmount) {
            _buybackFees(feeToken, buybackToken, batchSize, availableFeeAmount, availableFeeAmount);
        } else {
            revert Errors.InsufficientBuybackOutputAmount(feeToken, buybackToken, availableFeeAmount);
        }
    }

    function getOutputAmount(
        address[] calldata markets,
        address feeToken,
        address buybackToken
    ) external view returns (uint256) {
        uint256 batchSize = dataStore.getUint(Keys.buybackBatchAmountKey(buybackToken));
        _validateBuybackToken(batchSize, buybackToken);

        uint256 feeAmount;
        FeeAmounts memory feeAmounts;
        uint256 availableFeeAmount = _getAvailableFeeAmount(feeToken, buybackToken);
        for (uint256 i; i < markets.length; i++) {
            if (markets[i] == address(0)) {
                feeAmount = IVaultV1(vaultV1).feeReserves(feeToken);
                feeAmounts = _getFeeAmounts(1, feeAmount);
            } else {
                feeAmount = dataStore.getUint(Keys.claimableFeeAmountKey(markets[i], feeToken));
                feeAmounts = _getFeeAmounts(2, feeAmount);
            }

            feeAmount = buybackToken == gmx ? feeAmounts.gmx : feeAmounts.wnt;
            availableFeeAmount = availableFeeAmount + feeAmount;
        }

        uint256 maxFeeTokenAmount = _getMaxFeeTokenAmount(feeToken, buybackToken, batchSize);
        if (availableFeeAmount >= maxFeeTokenAmount) {
            return maxFeeTokenAmount;
        } else {
            return availableFeeAmount;
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

        FeeAmounts memory feeAmounts = _getFeeAmounts(version, feeAmount);

        uint256 availableFeeAmountGmx = _getAvailableFeeAmount(feeToken, gmx) + feeAmounts.gmx;
        uint256 availableFeeAmountWnt = _getAvailableFeeAmount(feeToken, wnt) + feeAmounts.wnt;

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

    function _getFeeAmounts(uint256 version, uint256 feeAmount) private view returns (FeeAmounts memory) {
        uint256 buybackGmxFactor = dataStore.getUint(Keys.buybackGmxFactorKey(version));
        FeeAmounts memory feeAmounts;

        feeAmounts.gmx = (feeAmount * buybackGmxFactor) / 1e30;
        feeAmounts.wnt = feeAmount - feeAmounts.gmx;
        return (feeAmounts);
    }

    function _getMaxFeeTokenAmount(
        address feeToken,
        address buybackToken,
        uint256 batchSize
    ) private view returns (uint256) {
        uint256 feeTokenPrice = _getPriceFeedPrice(feeToken);
        uint256 buybackTokenPrice = _getPriceFeedPrice(buybackToken);

        uint256 expectedFeeTokenAmount = (batchSize * feeTokenPrice) / buybackTokenPrice;
        uint256 maxPriceImpactFactor = dataStore.getUint(Keys.buybackMaxPriceImpactFactorKey(feeToken));

        uint256 maxFeeTokenAmount = (expectedFeeTokenAmount * (maxPriceImpactFactor + 10000)) / 10000;
        return maxFeeTokenAmount;
    }

    // @dev There is some risk of front-running due to the potential for a stale oracle price feed
    function _getPriceFeedPrice(address token) private view returns (uint256) {
        (bool hasTokenPriceFeed, uint256 tokenPrice) = ChainlinkPriceFeedUtils.getPriceFeedPrice(dataStore, token);

        if (!hasTokenPriceFeed) {
            revert Errors.EmptyChainlinkPriceFeed(token);
        }

        return tokenPrice;
    }

    function _validateBuybackToken(uint256 batchSize, address buybackToken) private pure {
        if (batchSize == 0) {
            revert Errors.InvalidBuybackToken(buybackToken);
        }
    }
}
