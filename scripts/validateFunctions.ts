import fs from "fs";
import path from "path";

const ROOT = process.argv.find((a) => a.startsWith("--root="))?.split("=")[1] || "./contracts";
const IGNORE_DIRS = new Set([
  "node_modules",
  "lib",
  "out",
  "artifacts",
  "cache",
  ".git",
  "mock",
  "mocks",
  "test",
  "tests", // exclude mock/test folders
]);

type FuncInfo = { contractName: string; header: string; loc: string };
const buckets: Record<"globalNonReentrant" | "nonReentrant" | "neither", FuncInfo[]> = {
  globalNonReentrant: [],
  nonReentrant: [],
  neither: [],
};

function* walk(dir: string): Generator<string> {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!IGNORE_DIRS.has(e.name)) yield* walk(path.join(dir, e.name));
    } else if (e.isFile() && e.name.endsWith(".sol")) {
      // also guard against absolute path segments like /contracts/mock/...
      const rel = path.relative(process.cwd(), path.join(dir, e.name)).replace(/\\/g, "/");
      if (rel.includes("/contracts/mock/") || rel.includes("/contracts/test/")) continue;
      yield path.join(dir, e.name);
    }
  }
}

// Mask a range with spaces but preserve newlines to keep indices & line numbers stable
function maskRange(src: string, start: number, end: number): string {
  const before = src.slice(0, start);
  const mid = src.slice(start, end).replace(/[^\n]/g, " ");
  const after = src.slice(end);
  return before + mid + after;
}

// Strip comments and string literals (preserving newlines)
function stripNoise(src: string): string {
  let out = src;

  // Block comments /* ... */
  const block = /\/\*[\s\S]*?\*\//g;
  let m: RegExpExecArray | null;
  while ((m = block.exec(out))) out = maskRange(out, m.index, m.index + m[0].length);

  // Line comments //...
  const line = /\/\/[^\n\r]*/g;
  while ((m = line.exec(out))) out = maskRange(out, m.index, m.index + m[0].length);

  // String literals (optional 'unicode' prefix)
  const str = /\bunicode\s*("([^"\\]|\\.|\\\n)*"|'([^'\\]|\\.|\\\n)*')|("([^"\\]|\\.|\\\n)*"|'([^'\\]|\\.|\\\n)*')/g;
  while ((m = str.exec(out))) out = maskRange(out, m.index, m.index + m[0].length);

  return out;
}

function buildLineIndex(src: string): number[] {
  const lines: number[] = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) lines.push(i + 1);
  return lines;
}
function lineFromPos(lines: number[], pos: number): number {
  // binary search → 1-based line number
  let lo = 0,
    hi = lines.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid] <= pos) lo = mid + 1;
    else hi = mid - 1;
  }
  return hi + 1;
}

type Block = { kind: "contract" | "library" | "interface"; name: string; start: number; end: number };
function findBlocks(clean: string): Block[] {
  const blocks: Block[] = [];
  const re = /\b(contract|library|interface)\s+([A-Za-z_$][A-Za-z0-9_$]*)[\s\S]*?\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const kind = m[1] as Block["kind"];
    const name = m[2];
    const braceStart = m.index + m[0].lastIndexOf("{");
    // match closing brace for this top-level block
    let depth = 1,
      i = braceStart + 1;
    while (i < clean.length && depth > 0) {
      const ch = clean[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    if (depth === 0) {
      blocks.push({ kind, name, start: braceStart + 1, end: i - 1 });
      re.lastIndex = i; // continue after this block
    } else {
      break; // unmatched brace — abort to avoid runaway
    }
  }
  return blocks;
}

function scanFunctions(clean: string, subWithPadding: string, contractName: string, file: string, lines: number[]) {
  const re = /\bfunction\b/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(subWithPadding))) {
    const fnStart = m.index;

    // find end at first '{' or ';' after fnStart
    let j = fnStart;
    let end = -1;
    while (j < subWithPadding.length) {
      const ch = subWithPadding[j];
      if (ch === "{" || ch === ";") {
        end = j;
        break;
      }
      j++;
    }
    if (end === -1) break;

    const headerRaw = subWithPadding.slice(fnStart, end); // includes 'function'
    const header = headerRaw.replace(/\s+/g, " ").trim();

    // visibility: always include public or external
    const isPublic = /\bpublic\b/.test(header);
    const isExternal = /\bexternal\b/.test(header);
    if (!(isPublic || isExternal)) {
      re.lastIndex = end + 1;
      continue;
    }

    // exclude view/pure
    if (/\bview\b/.test(header) || /\bpure\b/.test(header)) {
      re.lastIndex = end + 1;
      continue;
    }

    // modifiers
    const hasGlobalNR = /\bglobalNonReentrant\b/.test(header);
    const hasNR = /\bnonReentrant\b/.test(header);

    const line = lineFromPos(lines, fnStart);
    const loc = `${file}:${line}`;

    const item: FuncInfo = { contractName, header, loc };
    if (hasGlobalNR) buckets.globalNonReentrant.push(item);
    else if (hasNR) buckets.nonReentrant.push(item);
    else buckets.neither.push(item);

    re.lastIndex = end + 1;
  }
}

function analyzeFile(file: string) {
  const raw = fs.readFileSync(file, "utf8");
  const clean = stripNoise(raw);
  const lines = buildLineIndex(clean);

  const blocks = findBlocks(clean);
  for (const b of blocks) {
    if (b.kind === "library" || b.kind === "interface") continue; // exclude
    const sub = clean.slice(b.start, b.end);

    // pad with same number of newlines before the block so positions map to file coords
    const prePad = clean.slice(0, b.start).replace(/[^\n]/g, "");
    const subWithPadding = prePad + sub;

    scanFunctions(clean, subWithPadding, b.name, path.relative(process.cwd(), file), lines);
  }
}

function printBucket(title: string, arr: FuncInfo[]) {
  console.log(`\n=== ${title} (${arr.length}) ===`);
  for (const it of arr.sort(
    (a, b) => a.contractName.localeCompare(b.contractName) || a.header.localeCompare(b.header)
  )) {
    console.log(`- [${it.contractName}] ${it.header}  (${it.loc})`);
  }
}

// ---- main
for (const file of walk(path.resolve(ROOT))) {
  try {
    analyzeFile(file);
  } catch (e: any) {
    console.error(`✗ Failed on ${file}: ${e.message}`);
  }
}

const scope = "public+external (excluding view/pure)";
printBucket(`${scope} with globalNonReentrant`, buckets.globalNonReentrant);
printBucket(`${scope} with nonReentrant`, buckets.nonReentrant);
printBucket(`${scope} with neither`, buckets.neither);
