// #121 Phase 1 — OSS 고지 생성 lib 단위 테스트 (Given/When/Then, Red→Green)
import { describe, expect, it } from 'vitest';
import {
  NEEDS_REVIEW,
  checkLockfileConsistency,
  expandEntryVersions,
  extractSourceUrl,
  findPureDevOnly,
  matchPathForVersion,
  normalizeLicense,
  renderNotices,
  resolveCopyright,
  sortNotices,
  toNoticeEntry,
} from '../../../scripts/lib/third-party-notices.mjs';

describe('Given OSS 고지 생성 규칙 / When lib 함수 호출 / Then AC 충족', () => {
  it('저작권은 LICENSE 행에서만 확정하고 author만으로는 확인 필요를 낸다', () => {
    expect(resolveCopyright('Copyright (c) X')).toBe('Copyright (c) X');
    expect(resolveCopyright('')).toBe(NEEDS_REVIEW);
    const onlyAuthor = toNoticeEntry(
      { name: 'p', version: '1.0.0', license: 'MIT', homepage: 'https://p' },
      { author: 'Some Author' },
      '',
    );
    expect(onlyAuthor.copyright).toBe(NEEDS_REVIEW);
    expect(normalizeLicense('', {})).toBe(NEEDS_REVIEW);
    expect(extractSourceUrl({}, '')).toBe(NEEDS_REVIEW);
  });

  it('여러 버전은 경로 매칭으로 분리하고 위치 순서에 의존하지 않는다', () => {
    const entry = {
      name: '@babel/runtime',
      versions: ['8.0.7', '7.29.10'],
      license: 'MIT',
      homepage: 'https://babel.dev',
      paths: [
        '/r/node_modules/.pnpm/@babel+runtime@8.0.7/node_modules/@babel/runtime',
        '/r/node_modules/.pnpm/@babel+runtime@7.29.10/node_modules/@babel/runtime',
      ],
    };
    expect(matchPathForVersion(entry.paths, entry.name, '7.29.10')).toContain('@babel+runtime@7.29.10');
    const expanded = expandEntryVersions(entry);
    expect(expanded.map((v) => v.version)).toEqual(['7.29.10', '8.0.7']);
    expect(expanded[0]?.path).toContain('7.29.10');
  });

  it('저장소 URL의 git+·scp 접두사를 https로 정규화한다', () => {
    expect(
      extractSourceUrl({ repository: { url: 'git+https://github.com/a/b.git' } }, ''),
    ).toBe('https://github.com/a/b.git');
    expect(extractSourceUrl({ repository: { url: 'git@github.com:a/b.git' } }, '')).toBe(
      'https://github.com/a/b.git',
    );
  });

  it('동일 입력은 동일 출력이다(정렬·타임스탬프 없음)', () => {
    const entries = [
      toNoticeEntry({ name: 'b', version: '1.0.0', license: 'MIT', homepage: 'https://b' }, {}, 'Copyright (c) B'),
      toNoticeEntry({ name: 'a', version: '2.0.0', license: 'Apache-2.0' }, {}, ''),
    ];
    const first = renderNotices(sortNotices(entries), { count: 2 });
    const second = renderNotices(sortNotices([...entries].reverse()), { count: 2 });
    expect(second).toBe(first);
    expect(first).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(first.indexOf('| a |')).toBeLessThan(first.indexOf('| b |'));
    expect(first).toContain(NEEDS_REVIEW);
  });

  it('package.json과 lockfile 불일치를 진단한다', () => {
    const pkg = JSON.stringify({ dependencies: { foo: '^1.0.0' }, devDependencies: {} });
    const good = "  .:\n    dependencies:\n      foo:\n        specifier: ^1.0.0\n        version: 1.0.0\nsnapshots:\n  foo@1.0.0:\n";
    expect(checkLockfileConsistency({ packageJsonText: pkg, lockfileText: good }).ok).toBe(true);
    const badSpec = good.replace('^1.0.0', '^2.0.0');
    expect(checkLockfileConsistency({ packageJsonText: pkg, lockfileText: badSpec }).ok).toBe(false);
  });

  it('specifier 접두사만 맞는 경우는 통과하지 않는다', () => {
    const pkg = JSON.stringify({ dependencies: { foo: '^1' }, devDependencies: {} });
    const lock = "  .:\n    dependencies:\n      foo:\n        specifier: ^1.0.0\n        version: 1.0.0\n";
    const r = checkLockfileConsistency({ packageJsonText: pkg, lockfileText: lock });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/foo/);
  });

  it('devDependencies만인 패키지(탐침: vitest·eslint)가 결과에 없다', () => {
    expect(findPureDevOnly(['react', 'vitest'], ['vitest', 'eslint'])).toEqual(['vitest']);
  });
});
