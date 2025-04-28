import fs from "fs";
import path from "path";

// SETTINGS
const CONTRACTS_DIR = "./contracts";

// Type definitions
type ImportGraph = {
  [filePath: string]: string[];
};

// Build the import graph
function buildImportGraph(dir: string): ImportGraph {
  const graph: ImportGraph = {};

  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      const subGraph = buildImportGraph(filePath);
      Object.assign(graph, subGraph);
    } else if (file.endsWith(".sol")) {
      const content = fs.readFileSync(filePath, "utf8");
      const imports: string[] = [];

      const importRegex = /import\s+["'](.+?)["']/g;
      let match: RegExpExecArray | null;
      while ((match = importRegex.exec(content)) !== null) {
        const importedPath = match[1];
        imports.push(path.basename(importedPath));
      }

      const fileName = path.basename(filePath);
      console.log(fileName, imports);
      graph[fileName] = imports;
    }
  });

  return graph;
}

// Detect cycles
function detectCycles(graph: ImportGraph): string[][] {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const cycles: string[][] = [];

  function visit(node: string, pathStack: string[]): void {
    if (stack.has(node)) {
      const cycleStart = pathStack.indexOf(node);
      if (cycleStart !== -1) {
        cycles.push(pathStack.slice(cycleStart).concat(node));
      }
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    stack.add(node);

    const neighbors = graph[node] || [];
    neighbors.forEach((neighbor) => {
      const neighborPath = path.normalize(neighbor);
      if (Object.prototype.hasOwnProperty.call(graph, neighborPath)) {
        visit(neighborPath, pathStack.concat(neighborPath));
      }
    });

    stack.delete(node);
  }

  for (const node in graph) {
    if (!visited.has(node)) {
      visit(node, [node]);
    }
  }

  return cycles;
}

// Main
function main(): void {
  const graph = buildImportGraph(CONTRACTS_DIR);
  const cycles = detectCycles(graph);

  if (cycles.length === 0) {
    console.log("✅ No cyclic dependencies found.");
  } else {
    console.log("⚠️ Cyclic dependencies detected:");
    cycles.forEach((cycle, idx) => {
      console.log(`${idx + 1}. ${cycle.join(" -> ")}`);
    });
  }
}

main();
