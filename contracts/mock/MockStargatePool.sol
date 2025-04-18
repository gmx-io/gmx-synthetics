// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { MessagingFee, OFTReceipt, SendParam, MessagingReceipt, OFTLimit, OFTFeeDetail } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol";
import { OFTComposeMsgCodec } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/libs/OFTComposeMsgCodec.sol";

contract MockStargatePool {
    using SafeERC20 for IERC20;

    address public immutable token;
    uint256 public constant BRIDGE_OUT_FEE = 0.001 ether;

    constructor(address _token) {
        token = _token;
    }

    /**
     * @dev Mock function to simulate receiving tokens from source chain and delivering to target chain (bridgeIn flow)
     * @param _to The recipient contract (LayerZeroProvider)
     * @param _amount The amount of tokens to send
     * @param _message The encoded message containing account, token, srcChainId
     */
    function sendToken(address _to, uint256 _amount, bytes calldata _message) external {
        // prepend composeFrom (msg.sender) to the user payload
        bytes memory encodedMsg = abi.encodePacked(
            OFTComposeMsgCodec.addressToBytes32(msg.sender),
            _message
        );

        bytes memory composedMsg = OFTComposeMsgCodec.encode(
            uint64(block.timestamp), // mock nonce
            1, // mock srcEid
            _amount,
            encodedMsg
        );

        IERC20(token).transferFrom(msg.sender, _to, _amount);

        // Simulate cross-chain message delivery by directly calling lzCompose on the LayerZeroProvider contract
        (bool success, ) = _to.call(
            abi.encodeWithSignature(
                "lzCompose(address,bytes32,bytes,address,bytes)",
                address(this),
                bytes32(uint256(1)), // guid
                composedMsg,
                address(this),
                "" // extraData
            )
        );
        require(success, "Mock Stargate: lzCompose failed");
    }

    /**
     * @dev Mock send function that handles the cross-chain transfer (bridgeOut flow)
     */
    function send(
        SendParam memory _sendParam,
        MessagingFee memory,
        address _receiver
    ) external payable returns (MessagingReceipt memory, OFTReceipt memory) {
        IERC20(token).transferFrom(msg.sender, _receiver, _sendParam.amountLD);

        MessagingReceipt memory msgReceipt = MessagingReceipt({
            guid: bytes32(uint256(block.timestamp)),
            nonce: uint64(1),
            fee: MessagingFee({ nativeFee: msg.value, lzTokenFee: 0 })
        });

        OFTReceipt memory oftReceipt = OFTReceipt({
            amountSentLD: _sendParam.amountLD,
            amountReceivedLD: _sendParam.amountLD
        });

        return (msgReceipt, oftReceipt);
    }

    function quoteOFT(
        SendParam calldata _sendParam
    )
        external
        pure
        returns (OFTLimit memory oftLimit, OFTFeeDetail[] memory oftFeeDetails, OFTReceipt memory oftReceipt)
    {
        oftLimit = OFTLimit({ minAmountLD: 0, maxAmountLD: type(uint256).max });

        oftFeeDetails = new OFTFeeDetail[](1);
        oftFeeDetails[0] = OFTFeeDetail({ feeAmountLD: 0, description: "No fees" });

        oftReceipt = OFTReceipt({
            amountSentLD: _sendParam.amountLD,
            amountReceivedLD: _sendParam.amountLD // Assume no fees on receiving side
        });

        return (oftLimit, oftFeeDetails, oftReceipt);
    }

    function quoteSend(SendParam memory, bool) external pure returns (MessagingFee memory msgFee) {
        return MessagingFee({ nativeFee: BRIDGE_OUT_FEE, lzTokenFee: 0 });
    }
}
