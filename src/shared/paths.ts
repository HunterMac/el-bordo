// Path helpers on POSIX-style paths (`Uri.path`). The extension converts to/from file system paths.

export function toPosix(path: string): string {
  return path.replace(/\\/g, '/');
}

function segments(path: string): string[] {
  return toPosix(path)
    .split('/')
    .filter((s) => s !== '' && s !== '.');
}

/** Normalize `.`/`..` segments. Leading `..` are kept (the result may be relative). */
export function normalizePath(path: string): string {
  const absolute = toPosix(path).startsWith('/');
  const out: string[] = [];
  for (const seg of segments(path)) {
    if (seg === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop();
      else if (!absolute) out.push('..');
    } else {
      out.push(seg);
    }
  }
  return (absolute ? '/' : '') + out.join('/');
}

/** Relative path from directory `fromDir` to `toPath`, with `/` separators. Both must be absolute. */
export function relativePath(fromDir: string, toPath: string): string {
  const from = segments(normalizePath(fromDir));
  const to = segments(normalizePath(toPath));
  let common = 0;
  while (common < from.length && common < to.length && from[common] === to[common]) common++;
  const ups = from.length - common;
  const rest = to.slice(common);
  return [...Array<string>(ups).fill('..'), ...rest].join('/');
}

/** Resolve `relative` (a path stored in a file node) against the directory `baseDir`. */
export function resolveRelative(baseDir: string, relative: string): string {
  return normalizePath(`${toPosix(baseDir).replace(/\/+$/, '')}/${relative}`);
}

/** Last path segment. */
export function basename(path: string): string {
  const segs = segments(path);
  return segs.length > 0 ? segs[segs.length - 1] : '';
}

/** Directory part of a path (`''` when there is none). */
export function dirname(path: string): string {
  const norm = normalizePath(path);
  const i = norm.lastIndexOf('/');
  if (i < 0) return '';
  return i === 0 ? '/' : norm.slice(0, i);
}

/** True when the stored relative path leaves the canvas folder. */
export function isOutsideFolder(relative: string): boolean {
  return normalizePath(relative).startsWith('..');
}
