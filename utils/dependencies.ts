export type DependencyMap = Record<string, Set<string>>;

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

export function collectDependents(deps: DependencyMap, startFile: string): Set<string> {
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
