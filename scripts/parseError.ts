import { formatParsedError, parseError } from "../utils/error";

let errorBytes = process.env.ERROR;

async function main() {
  errorBytes = errorBytes.toLocaleLowerCase();
  if (!errorBytes.startsWith("0x")) {
    errorBytes = "0x" + errorBytes;
  }

  const error = parseError(errorBytes);
  if (error) {
    console.log(formatParsedError(error));
  } else {
    console.log("Can't parse error");
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
