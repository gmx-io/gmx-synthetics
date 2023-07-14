import { use } from "chai";

function overwriteEq(functionName, readableName, readableNegativeName, _super, chaiUtils) {
  return function (this, ...args: any[]) {
    const [actualArg, message] = args;
    const expectedFlag = chaiUtils.flag(this, "object");

    if (message !== undefined) {
      chaiUtils.flag(this, "message", message);
    }

    const value0 = actualArg.toString();
    const value1 = expectedFlag.toString();
    if (value0 === value1) {
      _super.apply(this, args);
    } else {
      console.error(`Expected: ${value0}, actual: ${value1}`);
    }
  };
}

function override(method, name, negativeName, utils) {
  return (_super: (...args: any[]) => any) => overwriteEq(method, name, negativeName, _super, utils);
}

export function supportDebugEq(Assertion, utils) {
  const equalsFunction = override("eq", "equal", "not equal", utils);
  Assertion.overwriteMethod("eq", equalsFunction);
}

export function debugMatchers(chai, utils) {
  supportDebugEq(chai.Assertion, utils);
}

if (process.env.DEBUG_TESTS) {
  use(debugMatchers);
}
