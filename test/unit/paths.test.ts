import { describe, expect, it } from 'vitest';
import { basename, dirname, isOutsideFolder, normalizePath, relativePath, resolveRelative, toPosix } from '../../src/shared/paths';

describe('paths', () => {
  it('computes the relative path from the canvas folder', () => {
    expect(relativePath('/ws/boards', '/ws/boards/docs/notes.md')).toBe('docs/notes.md');
    expect(relativePath('/ws/boards', '/ws/boards/a.md')).toBe('a.md');
  });

  it('uses ../ for files outside the canvas folder', () => {
    expect(relativePath('/ws/boards', '/ws/readme.md')).toBe('../readme.md');
    expect(relativePath('/ws/boards/sub', '/ws/other/x.txt')).toBe('../../other/x.txt');
  });

  it('always uses forward slashes', () => {
    expect(toPosix('docs\\sub\\a.md')).toBe('docs/sub/a.md');
    expect(relativePath('/c:/ws', '/c:/ws/docs/a.md')).toBe('docs/a.md');
  });

  it('resolves a stored path against the canvas folder', () => {
    expect(resolveRelative('/ws/boards', 'docs/notes.md')).toBe('/ws/boards/docs/notes.md');
    expect(resolveRelative('/ws/boards', '../readme.md')).toBe('/ws/readme.md');
    expect(resolveRelative('/ws/boards/', './a.md')).toBe('/ws/boards/a.md');
  });

  it('normalizes', () => {
    expect(normalizePath('/a/b/../c/./d')).toBe('/a/c/d');
    expect(normalizePath('../a')).toBe('../a');
  });

  it('splits names', () => {
    expect(basename('/a/b/c.md')).toBe('c.md');
    expect(dirname('/a/b/c.md')).toBe('/a/b');
    expect(dirname('c.md')).toBe('');
  });

  it('detects paths that leave the folder', () => {
    expect(isOutsideFolder('../x.md')).toBe(true);
    expect(isOutsideFolder('docs/../x.md')).toBe(false);
  });
});
