import { use } from "chai";

// https://www.chaijs.com/api/plugins/#method_overwritemethod

function overwriteEq(_super, chaiUtils) {
  return function (this, ...args: any[]) {
    const [expectedValue, message] = args;
    const actualValue = chaiUtils.flag(this, "object");

    if (message !== undefined) {
      chaiUtils.flag(this, "message", message);
    }

    const value0 = expectedValue.toString();
    const value1 = actualValue.toString();
    if (value0 === value1) {
      _super.apply(this, args);
    } else {
      console.error(`Expected: ${value0}, actual: ${value1}`);
    }
  };
}

function overwriteCloseTo(_super, chaiUtils) {
  return function (this, ...args: any[]) {
    const [expectedValue, delta, message] = args;
    const actualValue = chaiUtils.flag(this, "object");

    if (message !== undefined) {
      chaiUtils.flag(this, "message", message);
    }

    if (Math.abs(expectedValue - actualValue) <= delta) {
      _super.apply(this, args);
    } else {
      console.error(`Expected: ${expectedValue}, actual: ${actualValue}`);
    }
  };
}

export function supportDebugEq(Assertion, utils) {
  // method, name, negativeName
  const fn = (_super: (...args: any[]) => any) => overwriteEq(_super, utils);
  Assertion.overwriteMethod("eq", fn);
}

export function supportDebugCloseTo(Assertion, utils) {
  // method, name, negativeName
  const fn = (_super: (...args: any[]) => any) => overwriteCloseTo(_super, utils);
  Assertion.overwriteMethod("closeTo", fn);
}

export function debugMatchers(chai, utils) {
  supportDebugEq(chai.Assertion, utils);
  supportDebugCloseTo(chai.Assertion, utils);
}

if (process.env.DEBUG_TESTS) {
  use(debugMatchers);
}
