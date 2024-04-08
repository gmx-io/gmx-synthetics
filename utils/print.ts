import { BigNumber } from "ethers";

export function toLoggableObject(obj: any): any {
  if (obj === undefined) {
    return "undefined";
  }
  if (obj === null) {
    return "null";
  }

  if (obj instanceof BigNumber) {
    return obj.toString();
  }

  if (Array.isArray(obj)) {
    let isPureArray = true;

    // check if any key is not a number
    for (const key of Object.keys(obj)) {
      if (isNaN(Number(key))) {
        isPureArray = false;
        break;
      }
    }

    if (isPureArray) {
      return obj.map(toLoggableObject);
    }
  }

  if (typeof obj === "object") {
    const newObj: any = {};
    for (const key of Object.keys(obj)) {
      if (isNaN(Number(key))) {
        newObj[key] = toLoggableObject(obj[key]);
      }
    }
    return newObj;
  }

  return obj;
}
