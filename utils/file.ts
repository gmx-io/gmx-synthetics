import fs from "fs";

export function readJsonFile(path) {
  try {
    const content = fs.readFileSync(path);
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

export function writeJsonFile(path, content) {
  return fs.writeFileSync(path, JSON.stringify(content));
}
