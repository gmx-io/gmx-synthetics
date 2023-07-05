export function parseLogs(fixture, txReceipt) {
  const { eventEmitter } = fixture.contracts;
  const { logs } = txReceipt;
  for (let i = 0; i < logs.length; i++) {
    try {
      const log = logs[i];
      const parsedLog = eventEmitter.interface.parseLog(log);
      // if the log could not be parsed, an error would have been thrown above
      // and the below lines will be skipped
      log.parsedEventInfo = {
        msgSender: parsedLog.args[0],
        eventName: parsedLog.args[1],
      };
      log.parsedEventData = getEventDataFromLog(parsedLog);
    } catch (e) {
      // ignore error
    }
  }

  return logs;
}

export function getEventData(parsedLogs, eventName) {
  for (let i = 0; i < parsedLogs.length; i++) {
    const log = parsedLogs[i];
    if (log.parsedEventInfo?.eventName === eventName) {
      return log.parsedEventData;
    }
  }
}

export function getEventDataArray(parsedLogs, eventName) {
  const eventDataArray = [];

  for (let i = 0; i < parsedLogs.length; i++) {
    const log = parsedLogs[i];
    if (log.parsedEventInfo?.eventName === eventName) {
      eventDataArray.push(log.parsedEventData);
    }
  }

  return eventDataArray;
}

export function getEventDataValue(parsedLogs, eventName, key) {
  const eventData = getEventData(parsedLogs, eventName);
  if (eventData) {
    return eventData[key];
  }
}

export function getEventDataFromLog(logInfo) {
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

  const data = {};

  applyEventDataFromItems(data, eventLogArg.addressItems);
  applyEventDataFromItems(data, eventLogArg.uintItems);
  applyEventDataFromItems(data, eventLogArg.intItems);
  applyEventDataFromItems(data, eventLogArg.boolItems);
  applyEventDataFromItems(data, eventLogArg.bytes32Items);
  applyEventDataFromItems(data, eventLogArg.bytesItems);
  applyEventDataFromItems(data, eventLogArg.stringItems);

  return data;
}

function applyEventDataFromItems(target, items) {
  applyEventDataFromKeyValueItems(target, items.items);
  applyEventDataFromKeyValueItems(target, items.arrayItems);
}

function applyEventDataFromKeyValueItems(target, items) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    target[item.key] = item.value;
  }
}
