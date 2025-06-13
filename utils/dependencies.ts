import path from "path";
import { DeployFunction } from "hardhat-deploy/types";
import { iterateDirectory } from "./file";
import { DependencyGraph } from "hardhat/types";

export type DependencyMap = Record<string, Set<string>>;

const contractsPathCache = {};

function buildReverseDependencies(dependencies: DependencyMap): DependencyMap {
  const reverseDeps: DependencyMap = {};

  for (const [file, deps] of Object.entries(dependencies)) {
    for (const dep of deps) {
      if (!reverseDeps[dep]) {
        reverseDeps[dep] = new Set();
      }
      reverseDeps[dep].add(file);
    }
  }

  return reverseDeps;
}

export async function parseDeployments(deps: DependencyMap) {
  await iterateDirectory(path.join(__dirname, "../deploy"), async (filename: string) => {
    let deployFunc: DeployFunction;
    delete require.cache[filename];
    deployFunc = require(filename);
    if ((deployFunc as any).default) {
      deployFunc = (deployFunc as any).default as DeployFunction;
    }
    if (deployFunc.contractName && deployFunc.dependencies.length > 0) {
      deployFunc.dependencies.forEach((d) =>
        deps[contractsPathCache[deployFunc.contractName]].add(contractsPathCache[d])
      );
    }
  });
}

export async function normalizeDependencies(graph: DependencyGraph): Promise<DependencyMap> {
  const dependencyMap: DependencyMap = {};
  for (const entry of graph.entries()) {
    dependencyMap[entry[0].sourceName] = new Set();
    contractsPathCache[path.basename(entry[0].sourceName, ".sol")] = entry[0].sourceName;
    for (const resolvedFile of entry[1].values()) {
      dependencyMap[entry[0].sourceName].add(resolvedFile.sourceName);
    }
  }

  await parseDeployments(dependencyMap);
  return dependencyMap;
}

export async function collectDependents(graph: DependencyGraph, startFile: string): Promise<Set<string>> {
  const deps = await normalizeDependencies(graph);

  const result = new Set<string>();
  const stack = [startFile];
  const reverseDeps = buildReverseDependencies(deps);

  while (stack.length > 0) {
    const current = stack.pop()!;
    const dependents = reverseDeps[current];

    if (dependents) {
      for (const dependent of dependents) {
        if (!result.has(dependent)) {
          result.add(dependent);
          stack.push(dependent);
        }
      }
    }
  }

  return result;
}
