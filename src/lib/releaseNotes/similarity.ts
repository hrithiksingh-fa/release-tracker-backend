// A TS port of Python's difflib.SequenceMatcher.ratio() (Ratcliff/Obershelp), used
// to detect when an "objective" just restates the "problem statement" so we can
// drop the redundant one. Doesn't need to be exact -- just consistent with the
// 0.55 threshold the original toolkit tuned.

function longestMatch(a: string, b: string, aLo: number, aHi: number, bLo: number, bHi: number) {
  let bestI = aLo;
  let bestJ = bLo;
  let bestSize = 0;
  const j2len = new Map<number, number>();

  for (let i = aLo; i < aHi; i++) {
    const newJ2len = new Map<number, number>();
    for (let j = bLo; j < bHi; j++) {
      if (a[i] === b[j]) {
        const k = (j2len.get(j - 1) ?? 0) + 1;
        newJ2len.set(j, k);
        if (k > bestSize) {
          bestI = i - k + 1;
          bestJ = j - k + 1;
          bestSize = k;
        }
      }
    }
    j2len.clear();
    for (const [k, v] of newJ2len) j2len.set(k, v);
  }
  return { i: bestI, j: bestJ, size: bestSize };
}

function matchingBlocks(a: string, b: string): number {
  let total = 0;
  const queue: [number, number, number, number][] = [[0, a.length, 0, b.length]];
  while (queue.length) {
    const [aLo, aHi, bLo, bHi] = queue.pop()!;
    const { i, j, size } = longestMatch(a, b, aLo, aHi, bLo, bHi);
    if (size === 0) continue;
    total += size;
    if (aLo < i && bLo < j) queue.push([aLo, i, bLo, j]);
    if (i + size < aHi && j + size < bHi) queue.push([i + size, aHi, j + size, bHi]);
  }
  return total;
}

export function similarityRatio(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const matches = matchingBlocks(a, b);
  return (2.0 * matches) / (a.length + b.length);
}

export function isDuplicate(a: string | null | undefined, b: string | null | undefined, threshold = 0.55): boolean {
  if (!a || !b) return false;
  return similarityRatio(a.trim().toLowerCase(), b.trim().toLowerCase()) > threshold;
}
