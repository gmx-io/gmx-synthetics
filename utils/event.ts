export function getParsedLog(fixture, txReceipt, eventName) {
  const { eventEmitter } = fixture.contracts;
  const { logs } = txReceipt;
  for (let i = 0; i < logs.length; i++) {
    try {
      const log = logs[i];
      const logInfo = eventEmitter.interface.parseLog(log);
      if (logInfo.args[2] === eventName) {
        return logInfo;
      }
    } catch (e) {
      // ignore error
    }
  }

  throw new Error("Could not find matching log");
}

export function getEventLogValue(logInfo, key) {
  let eventLogArg;

  for (let i = 0; i < logInfo.args.length; i++) {
    if (logInfo.args[i].addressItems) {
      eventLogArg = logInfo.args[i];
      break;
    }
  }

  if (eventLogArg === undefined) {
    throw new Error("Could not find EventLog arg");
  }

  let value = getEventLogValueFromItems(eventLogArg.addressItems, key);

  if (value) {
    return value;
  }

  value = getEventLogValueFromItems(eventLogArg.uintItems, key);
  if (value) {
    return value;
  }

  value = getEventLogValueFromItems(eventLogArg.intItems, key);
  if (value) {
    return value;
  }

  value = getEventLogValueFromItems(eventLogArg.boolItems, key);
  if (value) {
    return value;
  }

  value = getEventLogValueFromItems(eventLogArg.bytes32Items, key);
  if (value) {
    return value;
  }

  value = getEventLogValueFromItems(eventLogArg.bytesItems, key);
  if (value) {
    return value;
  }

  value = getEventLogValueFromItems(eventLogArg.stringItems, key);
  if (value) {
    return value;
  }

  throw new Error("Could not find matching event item");
}

function getEventLogValueFromItems(items, key) {
  const value = getEventLogValueFromKeyValueItems(items.items, key);
  if (value) {
    return value;
  }

  return getEventLogValueFromKeyValueItems(items.arrayItems, key);
}

function getEventLogValueFromKeyValueItems(items, key) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.key === key) {
      return item.value;
    }
  }
}
