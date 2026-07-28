// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../data/DataStore.sol";
import "../../data/Keys.sol";
import "../../event/EventEmitter.sol";
import "../../order/OrderVault.sol";
import "../../oracle/IOracle.sol";
import "../../oracle/OracleUtils.sol";
import "../../market/MarketUtils.sol";
import "../../swap/ISwapUtils.sol";
import { SubaccountApproval } from "../../subaccount/SubaccountUtils.sol";

import "../../swap/ISwapHandler.sol";

import "./IRelayUtils.sol";

struct Contracts {
    DataStore dataStore;
    OrderVault orderVault;
    ISwapHandler swapHandler;
    address wnt;
}

string constant UPDATE_ORDER_PARAMS = "UpdateOrderParams(bytes32 key,uint256 sizeDeltaUsd,uint256 acceptablePrice,uint256 triggerPrice,uint256 minOutputAmount,uint256 validFromTime,uint256 decreasePositionSwapType,bool autoCancel,uint256 executionFeeIncrease)";

string constant CREATE_ORDER_ADDRESSES = "CreateOrderAddresses(address receiver,address cancellationReceiver,address callbackContract,address uiFeeReceiver,address market,address initialCollateralToken,address[] swapPath)";
string constant CREATE_ORDER_NUMBERS = "CreateOrderNumbers(uint256 sizeDeltaUsd,uint256 initialCollateralDeltaAmount,uint256 triggerPrice,uint256 acceptablePrice,uint256 executionFee,uint256 callbackGasLimit,uint256 minOutputAmount,uint256 validFromTime)";

string constant CREATE_ORDER_PARAMS_ROOT = "CreateOrderParams(CreateOrderAddresses addresses,CreateOrderNumbers numbers,uint256 orderType,uint256 decreasePositionSwapType,bool isLong,bool shouldUnwrapNativeToken,bool autoCancel,bytes32 referralCode,bytes32[] dataList)";
string constant CREATE_ORDER_PARAMS = string(
    abi.encodePacked(
        "CreateOrderParams(CreateOrderAddresses addresses,CreateOrderNumbers numbers,uint256 orderType,uint256 decreasePositionSwapType,bool isLong,bool shouldUnwrapNativeToken,bool autoCancel,bytes32 referralCode,bytes32[] dataList)",
        CREATE_ORDER_ADDRESSES,
        CREATE_ORDER_NUMBERS
    )
);
string constant CREATE_TWAP_ORDER_PARAMS = string(
    abi.encodePacked(
        "CreateTwapOrder(address account,CreateOrderParams params,uint256 twapCount,uint256 interval,bytes32 relayParams,bytes32 subaccountApproval)",
        CREATE_ORDER_ADDRESSES,
        CREATE_ORDER_NUMBERS,
        CREATE_ORDER_PARAMS_ROOT
    )
);

library RelayUtils {
    bytes32 public constant UPDATE_ORDER_PARAMS_TYPEHASH = keccak256(bytes(UPDATE_ORDER_PARAMS));
    bytes32 public constant UPDATE_ORDER_TYPEHASH =
        keccak256(
            abi.encodePacked(
                "UpdateOrder(address account,UpdateOrderParams params,bytes32 relayParams,bytes32 subaccountApproval)",
                UPDATE_ORDER_PARAMS
            )
        );

    bytes32 public constant CANCEL_ORDER_TYPEHASH =
        keccak256(bytes("CancelOrder(address account,bytes32 key,bytes32 relayParams,bytes32 subaccountApproval)"));

    bytes32 public constant CREATE_ORDER_NUMBERS_TYPEHASH = keccak256(bytes(CREATE_ORDER_NUMBERS));
    bytes32 public constant CREATE_ORDER_ADDRESSES_TYPEHASH = keccak256(bytes(CREATE_ORDER_ADDRESSES));
    bytes32 public constant CREATE_ORDER_PARAMS_TYPEHASH = keccak256(bytes(CREATE_ORDER_PARAMS));
    bytes32 public constant CREATE_ORDER_TYPEHASH =
        keccak256(
            abi.encodePacked(
                "CreateOrder(address account,CreateOrderAddresses addresses,CreateOrderNumbers numbers,uint256 orderType,uint256 decreasePositionSwapType,bool isLong,bool shouldUnwrapNativeToken,bool autoCancel,bytes32 referralCode,bytes32[] dataList,bytes32 relayParams,bytes32 subaccountApproval)",
                CREATE_ORDER_ADDRESSES,
                CREATE_ORDER_NUMBERS
            )
        );
    bytes32 public constant CREATE_TWAP_ORDER_TYPEHASH = keccak256(bytes(CREATE_TWAP_ORDER_PARAMS));

    bytes32 public constant SUBACCOUNT_APPROVAL_TYPEHASH =
        keccak256(
            bytes(
                "SubaccountApproval(address subaccount,bool shouldAdd,uint256 expiresAt,uint256 maxAllowedCount,bytes32 actionType,uint256 nonce,uint256 desChainId,uint256 deadline,bytes32 integrationId,uint256 revocationCounter,bytes32 eip6492SignatureWrapperHash)"
            )
        );

    bytes32 public constant REMOVE_SUBACCOUNT_TYPEHASH =
        keccak256(bytes("RemoveSubaccount(address account,address subaccount,bytes32 relayParams)"));

    bytes32 public constant BATCH_TYPEHASH =
        keccak256(
            abi.encodePacked(
                "Batch(address account,CreateOrderParams[] createOrderParamsList,UpdateOrderParams[] updateOrderParamsList,bytes32[] cancelOrderKeys,bytes32 relayParams,bytes32 subaccountApproval)",
                // according to EIP-712 all types following the root type should be in alphabetical order
                // can't use CREATE_ORDER_PARAMS because the resulting order would be incorrect: CreateOrderParams, CreateOrderAddresses, CreateOrderNumbers
                // it should be CreateOrderAddresses, CreateOrderNumbers, CreateOrderParams
                CREATE_ORDER_ADDRESSES,
                CREATE_ORDER_NUMBERS,
                CREATE_ORDER_PARAMS_ROOT,
                UPDATE_ORDER_PARAMS
            )
        );

    bytes32 public constant DOMAIN_SEPARATOR_TYPEHASH =
        keccak256(bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"));
    bytes32 public constant DOMAIN_SEPARATOR_NAME_HASH = keccak256(bytes("GmxBaseGelatoRelayRouter"));
    bytes32 public constant DOMAIN_SEPARATOR_VERSION_HASH = keccak256(bytes("1"));

    function getDomainSeparator(uint256 sourceChainId) external view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    DOMAIN_SEPARATOR_TYPEHASH,
                    DOMAIN_SEPARATOR_NAME_HASH,
                    DOMAIN_SEPARATOR_VERSION_HASH,
                    sourceChainId,
                    address(this)
                )
            );
    }

    // @dev general cap on fee swap size to limit oracle mispricing extraction
    // used for both relay fee swaps and bridge fee swaps
    function validateMaxFeeSwapUsd(
        DataStore dataStore,
        IOracle oracle,
        address feeToken,
        uint256 feeAmount,
        bool isSubaccount
    ) internal view {
        uint256 feeUsd = feeAmount * oracle.getPrimaryPrice(feeToken).max;

        uint256 maxRelayFeeSwapUsd = dataStore.getUint(Keys.MAX_RELAY_FEE_SWAP_USD);
        if (feeUsd > maxRelayFeeSwapUsd) {
            revert Errors.MaxRelayFeeSwapExceeded(feeUsd, maxRelayFeeSwapUsd);
        }

        if (isSubaccount) {
            // a malicious subaccount could create a large swap with a negative price impact
            // and then execute a personal swap with a positive price impact
            // to mitigate this, we limit the max relay fee swap size for subaccounts
            uint256 maxRelayFeeSwapUsdForSubaccount = dataStore.getUint(Keys.MAX_RELAY_FEE_SWAP_USD_FOR_SUBACCOUNT);
            if (feeUsd > maxRelayFeeSwapUsdForSubaccount) {
                revert Errors.MaxRelayFeeSwapForSubaccountExceeded(feeUsd, maxRelayFeeSwapUsdForSubaccount);
            }
        }
    }

    function swapFeeTokens(
        Contracts memory contracts,
        EventEmitter eventEmitter,
        IOracle oracle,
        IRelayUtils.FeeParams calldata fee
    ) external {
        // swap fee tokens to WNT
        MarketUtils.validateSwapPath(contracts.dataStore, fee.feeSwapPath);
        Market.Props[] memory swapPathMarkets = MarketUtils.getSwapPathMarkets(contracts.dataStore, fee.feeSwapPath);

        (address outputToken, ) = contracts.swapHandler.swap(
            ISwapUtils.SwapParams({
                dataStore: contracts.dataStore,
                eventEmitter: eventEmitter,
                oracle: oracle,
                bank: contracts.orderVault,
                key: bytes32(0),
                tokenIn: fee.feeToken,
                amountIn: fee.feeAmount,
                swapPathMarkets: swapPathMarkets,
                minOutputAmount: 0,
                receiver: address(this),
                uiFeeReceiver: address(0),
                uiFeeFactor: type(uint256).max,
                tokenInPoolAmountBeforeAction: 0,
                shouldUnwrapNativeToken: false,
                swapPricingType: ISwapPricingUtils.SwapPricingType.AtomicSwap
            })
        );

        if (outputToken != contracts.wnt) {
            revert Errors.UnexpectedRelayFeeTokenAfterSwap(outputToken, contracts.wnt);
        }
    }

    function _getRelayParamsHash(IRelayUtils.RelayParams calldata relayParams) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    relayParams.oracleParams,
                    relayParams.externalCalls,
                    relayParams.tokenPermits,
                    relayParams.fee,
                    relayParams.userNonce,
                    relayParams.deadline,
                    relayParams.desChainId,
                    relayParams.eip6492SignatureWrapperHash
                )
            );
    }

    function getRemoveSubaccountStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        address subaccount
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(REMOVE_SUBACCOUNT_TYPEHASH, account, subaccount, _getRelayParamsHash(relayParams)));
    }

    function getSubaccountApprovalStructHash(
        SubaccountApproval calldata subaccountApproval
    ) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    SUBACCOUNT_APPROVAL_TYPEHASH,
                    subaccountApproval.subaccount,
                    subaccountApproval.shouldAdd,
                    subaccountApproval.expiresAt,
                    subaccountApproval.maxAllowedCount,
                    subaccountApproval.actionType,
                    subaccountApproval.nonce,
                    subaccountApproval.desChainId,
                    subaccountApproval.deadline,
                    subaccountApproval.integrationId,
                    subaccountApproval.revocationCounter,
                    subaccountApproval.eip6492SignatureWrapperHash
                )
            );
    }

    function getCreateOrderStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        IBaseOrderUtils.CreateOrderParams memory params
    ) external pure returns (bytes32) {
        bytes32 relayParamsHash = _getRelayParamsHash(relayParams);
        bytes32 subaccountApprovalHash = keccak256(abi.encode(subaccountApproval));

        return
            keccak256(
                abi.encode(
                    CREATE_ORDER_TYPEHASH,
                    account,
                    _getCreateOrderAddressesStructHash(params.addresses),
                    _getCreateOrderNumbersStructHash(params.numbers),
                    uint256(params.orderType),
                    uint256(params.decreasePositionSwapType),
                    params.isLong,
                    params.shouldUnwrapNativeToken,
                    params.autoCancel,
                    params.referralCode,
                    keccak256(abi.encodePacked(params.dataList)),
                    relayParamsHash,
                    subaccountApprovalHash
                )
            );
    }

    function getCreateOrderStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        IBaseOrderUtils.CreateOrderParams memory params
    ) external pure returns (bytes32) {
        bytes32 relayParamsHash = _getRelayParamsHash(relayParams);

        return
            keccak256(
                abi.encode(
                    CREATE_ORDER_TYPEHASH,
                    account,
                    _getCreateOrderAddressesStructHash(params.addresses),
                    _getCreateOrderNumbersStructHash(params.numbers),
                    uint256(params.orderType),
                    uint256(params.decreasePositionSwapType),
                    params.isLong,
                    params.shouldUnwrapNativeToken,
                    params.autoCancel,
                    params.referralCode,
                    keccak256(abi.encodePacked(params.dataList)),
                    relayParamsHash,
                    bytes32(0)
                )
            );
    }

    function getCreateTwapOrderStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        IBaseOrderUtils.CreateOrderParams memory params,
        uint256 twapCount,
        uint256 interval
    ) external pure returns (bytes32) {
        return
            _getCreateTwapOrderStructHash(
                relayParams,
                keccak256(abi.encode(subaccountApproval)),
                account,
                params,
                twapCount,
                interval
            );
    }

    function getCreateTwapOrderStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        IBaseOrderUtils.CreateOrderParams memory params,
        uint256 twapCount,
        uint256 interval
    ) external pure returns (bytes32) {
        return _getCreateTwapOrderStructHash(relayParams, bytes32(0), account, params, twapCount, interval);
    }

    function _getCreateTwapOrderStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        bytes32 subaccountApprovalHash,
        address account,
        IBaseOrderUtils.CreateOrderParams memory params,
        uint256 twapCount,
        uint256 interval
    ) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_TWAP_ORDER_TYPEHASH,
                    account,
                    _getCreateOrderParamsStructHash(params),
                    twapCount,
                    interval,
                    _getRelayParamsHash(relayParams),
                    subaccountApprovalHash
                )
            );
    }

    function _getCreateOrderAddressesStructHash(
        IBaseOrderUtils.CreateOrderParamsAddresses memory addresses
    ) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_ORDER_ADDRESSES_TYPEHASH,
                    addresses.receiver,
                    addresses.cancellationReceiver,
                    addresses.callbackContract,
                    addresses.uiFeeReceiver,
                    addresses.market,
                    addresses.initialCollateralToken,
                    keccak256(abi.encodePacked(addresses.swapPath))
                )
            );
    }

    function _getCreateOrderNumbersStructHash(
        IBaseOrderUtils.CreateOrderParamsNumbers memory numbers
    ) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_ORDER_NUMBERS_TYPEHASH,
                    numbers.sizeDeltaUsd,
                    numbers.initialCollateralDeltaAmount,
                    numbers.triggerPrice,
                    numbers.acceptablePrice,
                    numbers.executionFee,
                    numbers.callbackGasLimit,
                    numbers.minOutputAmount,
                    numbers.validFromTime
                )
            );
    }

    function getUpdateOrderStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        IRelayUtils.UpdateOrderParams calldata params
    ) external pure returns (bytes32) {
        return _getUpdateOrderStructHash(relayParams, bytes32(0), account, params);
    }

    function getUpdateOrderStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        IRelayUtils.UpdateOrderParams calldata params
    ) external pure returns (bytes32) {
        return _getUpdateOrderStructHash(relayParams, keccak256(abi.encode(subaccountApproval)), account, params);
    }

    function _getUpdateOrderStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        bytes32 subaccountApprovalHash,
        address account,
        IRelayUtils.UpdateOrderParams calldata params
    ) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    UPDATE_ORDER_TYPEHASH,
                    account,
                    _getUpdateOrderParamsStructHash(params),
                    _getRelayParamsHash(relayParams),
                    subaccountApprovalHash
                )
            );
    }

    function _getUpdateOrderParamsStructHash(IRelayUtils.UpdateOrderParams calldata params) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    UPDATE_ORDER_PARAMS_TYPEHASH,
                    params.key,
                    params.sizeDeltaUsd,
                    params.acceptablePrice,
                    params.triggerPrice,
                    params.minOutputAmount,
                    params.validFromTime,
                    uint256(params.decreasePositionSwapType),
                    params.autoCancel,
                    params.executionFeeIncrease
                )
            );
    }

    function getCancelOrderStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        bytes32 key
    ) external pure returns (bytes32) {
        return _getCancelOrderStructHash(relayParams, keccak256(abi.encode(subaccountApproval)), account, key);
    }

    function getCancelOrderStructHash(IRelayUtils.RelayParams calldata relayParams, address account, bytes32 key) external pure returns (bytes32) {
        return _getCancelOrderStructHash(relayParams, bytes32(0), account, key);
    }

    function _getCancelOrderStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        bytes32 subaccountApprovalHash,
        address account,
        bytes32 key
    ) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CANCEL_ORDER_TYPEHASH,
                    account,
                    key,
                    _getRelayParamsHash(relayParams),
                    subaccountApprovalHash
                )
            );
    }

    function _getCreateOrderParamsStructHash(
        IBaseOrderUtils.CreateOrderParams memory params
    ) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_ORDER_PARAMS_TYPEHASH,
                    _getCreateOrderAddressesStructHash(params.addresses),
                    _getCreateOrderNumbersStructHash(params.numbers),
                    uint256(params.orderType),
                    uint256(params.decreasePositionSwapType),
                    params.isLong,
                    params.shouldUnwrapNativeToken,
                    params.autoCancel,
                    params.referralCode,
                    keccak256(abi.encodePacked(params.dataList))
                )
            );
    }

    function getBatchStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        SubaccountApproval calldata subaccountApproval,
        address account,
        IRelayUtils.BatchParams calldata params
    ) external pure returns (bytes32) {
        return
            _getBatchStructHash(
                relayParams,
                keccak256(abi.encode(subaccountApproval)),
                account,
                params.createOrderParamsList,
                params.updateOrderParamsList,
                params.cancelOrderKeys
            );
    }

    function getBatchStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        IRelayUtils.BatchParams calldata params
    ) external pure returns (bytes32) {
        return
            _getBatchStructHash(
                relayParams,
                bytes32(0),
                account,
                params.createOrderParamsList,
                params.updateOrderParamsList,
                params.cancelOrderKeys
            );
    }

    function _getBatchStructHash(
        IRelayUtils.RelayParams calldata relayParams,
        bytes32 subaccountApprovalHash,
        address account,
        IBaseOrderUtils.CreateOrderParams[] calldata createOrderParamsList,
        IRelayUtils.UpdateOrderParams[] calldata updateOrderParamsList,
        bytes32[] calldata cancelOrderKeys
    ) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    BATCH_TYPEHASH,
                    account,
                    _getCreateOrderParamsListStructHash(createOrderParamsList),
                    _getUpdateOrderParamsListStructHash(updateOrderParamsList),
                    keccak256(abi.encodePacked(cancelOrderKeys)),
                    _getRelayParamsHash(relayParams),
                    subaccountApprovalHash
                )
            );
    }

    function _getCreateOrderParamsListStructHash(
        IBaseOrderUtils.CreateOrderParams[] calldata createOrderParamsList
    ) private pure returns (bytes32) {
        bytes32[] memory createOrderParamsStructHashes = new bytes32[](createOrderParamsList.length);
        for (uint256 i = 0; i < createOrderParamsList.length; i++) {
            createOrderParamsStructHashes[i] = _getCreateOrderParamsStructHash(createOrderParamsList[i]);
        }
        return keccak256(abi.encodePacked(createOrderParamsStructHashes));
    }

    function _getUpdateOrderParamsListStructHash(
        IRelayUtils.UpdateOrderParams[] calldata updateOrderParamsList
    ) private pure returns (bytes32) {
        bytes32[] memory updateOrderParamsStructHashes = new bytes32[](updateOrderParamsList.length);
        for (uint256 i = 0; i < updateOrderParamsList.length; i++) {
            updateOrderParamsStructHashes[i] = _getUpdateOrderParamsStructHash(updateOrderParamsList[i]);
        }
        return keccak256(abi.encodePacked(updateOrderParamsStructHashes));
    }

}
