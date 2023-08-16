import { BigNumber } from "ethers";

export function toLoggableObject(obj: any): any {
  if (obj instanceof BigNumber) {
    return obj.toString();
  } else if (typeof obj === "object") {
    const newObj: any = {};
    for (const key of Object.keys(obj)) {
      if (isNaN(Number(key))) {
        newObj[key] = toLoggableObject(obj[key]);
      } else {
        delete newObj[key];
      }
    }
    return newObj;
  } else if (Array.isArray(obj)) {
    return obj.map(toLoggableObject);
  } else {
    return obj;
  }
}
