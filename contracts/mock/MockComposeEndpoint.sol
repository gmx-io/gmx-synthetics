// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { MessagingComposer } from "@layerzerolabs/lz-evm-protocol-v2/contracts/MessagingComposer.sol";

// the compose queue of LayerZero's EndpointV2, unchanged: sendCompose stores the message hash,
// lzCompose can be called by anyone and marks the message as received before calling the receiver
contract MockComposeEndpoint is MessagingComposer {}
