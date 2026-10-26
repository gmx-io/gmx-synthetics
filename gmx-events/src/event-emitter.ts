/* eslint-disable no-undef */
import {
  EventLog as EventLogEvent,
  EventLog1 as EventLog1Event,
  EventLog2 as EventLog2Event,
} from "../generated/EventEmitter/EventEmitter";
import { EventLog, EventLog1, EventLog2 } from "../generated/schema";
import { Bytes } from "@graphprotocol/graph-ts";

export function handleEventLog(event: EventLogEvent): void {
  const entity = new EventLog(event.transaction.hash.concatI32(event.logIndex.toI32()));
  entity.msgSender = event.params.msgSender;
  entity.eventName = event.params.eventName;
  entity.eventNameHash = event.params.eventNameHash;
  entity.eventData_addressItems_items = changetype<Bytes[]>(event.params.eventData.addressItems.items);
  entity.eventData_addressItems_arrayItems = changetype<Bytes[]>(event.params.eventData.addressItems.arrayItems);
  entity.eventData_uintItems_items = changetype<Bytes[]>(event.params.eventData.uintItems.items);
  entity.eventData_uintItems_arrayItems = changetype<Bytes[]>(event.params.eventData.uintItems.arrayItems);
  entity.eventData_intItems_items = changetype<Bytes[]>(event.params.eventData.intItems.items);
  entity.eventData_intItems_arrayItems = changetype<Bytes[]>(event.params.eventData.intItems.arrayItems);
  entity.eventData_boolItems_items = changetype<Bytes[]>(event.params.eventData.boolItems.items);
  entity.eventData_boolItems_arrayItems = changetype<Bytes[]>(event.params.eventData.boolItems.arrayItems);
  entity.eventData_bytes32Items_items = changetype<Bytes[]>(event.params.eventData.bytes32Items.items);
  entity.eventData_bytes32Items_arrayItems = changetype<Bytes[]>(event.params.eventData.bytes32Items.arrayItems);
  entity.eventData_bytesItems_items = changetype<Bytes[]>(event.params.eventData.bytesItems.items);
  entity.eventData_bytesItems_arrayItems = changetype<Bytes[]>(event.params.eventData.bytesItems.arrayItems);
  entity.eventData_stringItems_items = changetype<Bytes[]>(event.params.eventData.stringItems.items);
  entity.eventData_stringItems_arrayItems = changetype<Bytes[]>(event.params.eventData.stringItems.arrayItems);

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleEventLog1(event: EventLog1Event): void {
  const entity = new EventLog1(event.transaction.hash.concatI32(event.logIndex.toI32()));
  entity.msgSender = event.params.msgSender;
  entity.eventName = event.params.eventName;
  entity.eventNameHash = event.params.eventNameHash;
  entity.topic1 = event.params.topic1;
  entity.eventData_addressItems_items = changetype<Bytes[]>(event.params.eventData.addressItems.items);
  entity.eventData_addressItems_arrayItems = changetype<Bytes[]>(event.params.eventData.addressItems.arrayItems);
  entity.eventData_uintItems_items = changetype<Bytes[]>(event.params.eventData.uintItems.items);
  entity.eventData_uintItems_arrayItems = changetype<Bytes[]>(event.params.eventData.uintItems.arrayItems);
  entity.eventData_intItems_items = changetype<Bytes[]>(event.params.eventData.intItems.items);
  entity.eventData_intItems_arrayItems = changetype<Bytes[]>(event.params.eventData.intItems.arrayItems);
  entity.eventData_boolItems_items = changetype<Bytes[]>(event.params.eventData.boolItems.items);
  entity.eventData_boolItems_arrayItems = changetype<Bytes[]>(event.params.eventData.boolItems.arrayItems);
  entity.eventData_bytes32Items_items = changetype<Bytes[]>(event.params.eventData.bytes32Items.items);
  entity.eventData_bytes32Items_arrayItems = changetype<Bytes[]>(event.params.eventData.bytes32Items.arrayItems);
  entity.eventData_bytesItems_items = changetype<Bytes[]>(event.params.eventData.bytesItems.items);
  entity.eventData_bytesItems_arrayItems = changetype<Bytes[]>(event.params.eventData.bytesItems.arrayItems);
  entity.eventData_stringItems_items = changetype<Bytes[]>(event.params.eventData.stringItems.items);
  entity.eventData_stringItems_arrayItems = changetype<Bytes[]>(event.params.eventData.stringItems.arrayItems);

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleEventLog2(event: EventLog2Event): void {
  const entity = new EventLog2(event.transaction.hash.concatI32(event.logIndex.toI32()));
  entity.msgSender = event.params.msgSender;
  entity.eventName = event.params.eventName;
  entity.eventNameHash = event.params.eventNameHash;
  entity.topic1 = event.params.topic1;
  entity.topic2 = event.params.topic2;
  entity.eventData_addressItems_items = changetype<Bytes[]>(event.params.eventData.addressItems.items);
  entity.eventData_addressItems_arrayItems = changetype<Bytes[]>(event.params.eventData.addressItems.arrayItems);
  entity.eventData_uintItems_items = changetype<Bytes[]>(event.params.eventData.uintItems.items);
  entity.eventData_uintItems_arrayItems = changetype<Bytes[]>(event.params.eventData.uintItems.arrayItems);
  entity.eventData_intItems_items = changetype<Bytes[]>(event.params.eventData.intItems.items);
  entity.eventData_intItems_arrayItems = changetype<Bytes[]>(event.params.eventData.intItems.arrayItems);
  entity.eventData_boolItems_items = changetype<Bytes[]>(event.params.eventData.boolItems.items);
  entity.eventData_boolItems_arrayItems = changetype<Bytes[]>(event.params.eventData.boolItems.arrayItems);
  entity.eventData_bytes32Items_items = changetype<Bytes[]>(event.params.eventData.bytes32Items.items);
  entity.eventData_bytes32Items_arrayItems = changetype<Bytes[]>(event.params.eventData.bytes32Items.arrayItems);
  entity.eventData_bytesItems_items = changetype<Bytes[]>(event.params.eventData.bytesItems.items);
  entity.eventData_bytesItems_arrayItems = changetype<Bytes[]>(event.params.eventData.bytesItems.arrayItems);
  entity.eventData_stringItems_items = changetype<Bytes[]>(event.params.eventData.stringItems.items);
  entity.eventData_stringItems_arrayItems = changetype<Bytes[]>(event.params.eventData.stringItems.arrayItems);

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}
