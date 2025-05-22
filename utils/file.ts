import fs from "fs";
import path from "path";

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

// Search recursively through all files in the `dirPath` and test it with `condition`
// Returns filename when condition is true
export function searchDirectory(dirPath: string, condition: (filename: string) => boolean): string {
  let contractFiles = [];
  try {
    contractFiles = fs.readdirSync(dirPath);
  } catch {
    return null;
  }
  for (const file of contractFiles) {
    const name = path.join(dirPath, file);

    if (condition(name)) {
      return name;
    }

    if (fs.lstatSync(name).isDirectory()) {
      const result = searchDirectory(name, condition);
      if (result) {
        return result;
      }
    }
  }
  return null;
}

export const findFile =
  (searchFile: string) =>
  (filename: string): boolean => {
    return filename.endsWith("/" + searchFile);
  };
