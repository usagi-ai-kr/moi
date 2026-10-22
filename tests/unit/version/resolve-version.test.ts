// 앱 버전 단일 소스(resolve-version) — 네트워크 없이 mock 응답만으로 검증한다.
import { describe, expect, it } from 'vitest';
import {
  buildTimeKst,
  hasOpenIssues,
  parsePullRequestNumber,
  parseVersionTitle,
  resolveVersion,
  selectVersion,
} from '../../../scripts/resolve-version.mjs';

const MILESTONES = [
  { title: '1.0.0 — 이후 minor 버전 통합(추상)', open_issues: 0 },
  { title: '0.2.4 — 학습 실사용·디자인', open_issues: 4 },
  { title: '0.3.0 — 후속 기능·운영·공개 준비', open_issues: 13 },
  { title: '0.3.1 — 학습 이력 관리', open_issues: 1 },
  { title: '버전 표기 없는 마일스톤', open_issues: 5 },
];

describe('버전 마일스톤 파싱', () => {
  it('제목이 semver(X.Y.Z) 로 시작할 때만 버전을 뽑는다', () => {
    expect(parseVersionTitle('0.2.4 — 학습 실사용·디자인')).toMatchObject({ version: '0.2.4' });
    expect(parseVersionTitle('0.3.0')).toMatchObject({ version: '0.3.0' });
    expect(parseVersionTitle('다음 release 준비')).toBeNull();
    expect(parseVersionTitle('')).toBeNull();
  });

  // B1 — semver 는 각 성분의 선행 0 을 허용하지 않는다('01.2.3' 은 version 이 아니다).
  it('선행 0 이 있는 버전은 파싱하지 않는다', () => {
    expect(parseVersionTitle('01.2.3 — 잘못된 표기')).toBeNull();
    expect(parseVersionTitle('0.02.3')).toBeNull();
    expect(parseVersionTitle('0.2.03')).toBeNull();
    expect(parseVersionTitle('00.1.0')).toBeNull();
    // 정상 표기는 그대로 통과한다.
    expect(parseVersionTitle('0.0.1 — 0 패치')).toMatchObject({ version: '0.0.1' });
    expect(parseVersionTitle('10.20.30')).toMatchObject({ version: '10.20.30' });
  });
});

describe('hasOpenIssues (후보 자격 판정)', () => {
  // B2 — 숫자가 아닌 값으로 fail-open 하지 않는다.
  it('정수·유한·1 이상만 후보 자격을 갖는다', () => {
    expect(hasOpenIssues(1)).toBe(true);
    expect(hasOpenIssues(13)).toBe(true);
    expect(hasOpenIssues('4')).toBe(true);
    expect(hasOpenIssues(0)).toBe(false);
    expect(hasOpenIssues('0')).toBe(false);
    expect(hasOpenIssues(-2)).toBe(false);
    expect(hasOpenIssues(1.5)).toBe(false);
    expect(hasOpenIssues(Number.NaN)).toBe(false);
    expect(hasOpenIssues(Number.POSITIVE_INFINITY)).toBe(false);
    expect(hasOpenIssues('many')).toBe(false);
    expect(hasOpenIssues('')).toBe(false);
    expect(hasOpenIssues(undefined)).toBe(false);
    expect(hasOpenIssues(null)).toBe(false);
    expect(hasOpenIssues({})).toBe(false);
  });
});

describe('selectVersion (마일스톤 → 앱 버전)', () => {
  it('후보 중 최소 버전을 고른다', () => {
    expect(selectVersion(MILESTONES)).toBe('0.2.4');
  });

  it('open_issues 가 0인 마일스톤은 후보가 아니다', () => {
    const onlyZero = [
      { title: '0.4.0 — 미사용', open_issues: 0 },
      { title: '0.2.4 — 사용 중', open_issues: 1 },
    ];
    expect(selectVersion(onlyZero)).toBe('0.2.4');
  });

  it('추상 placeholder(1.0.0) 는 open_issues 가 있어도 제외한다', () => {
    const withPlaceholder = [
      { title: '1.0.0 — 이후 minor 버전 통합(추상)', open_issues: 7 },
      { title: '0.3.0 — 후속 기능', open_issues: 2 },
    ];
    expect(selectVersion(withPlaceholder)).toBe('0.3.0');
  });

  it('semver 제목이 아니면 제외한다', () => {
    expect(() => selectVersion([{ title: '버전 표기 없음', open_issues: 3 }])).toThrow();
  });

  it('후보가 없으면 fail-closed 로 예외를 던진다(기본값·null 금지)', () => {
    expect(() => selectVersion([])).toThrow();
    expect(() => selectVersion(undefined)).toThrow();
  });

  // B2 — open_issues 가 숫자가 아니면 그 마일스톤은 후보가 아니다(fail-open 금지).
  it('open_issues 가 숫자가 아니면 후보에서 제외한다', () => {
    const invalid = [
      { title: '0.9.0 — 잘못된 집계', open_issues: 'many' },
      { title: '0.9.1 — NaN 집계', open_issues: Number.NaN },
      { title: '0.9.2 — 무한 집계', open_issues: Number.POSITIVE_INFINITY },
      { title: '0.9.3 — 소수 집계', open_issues: 1.5 },
      { title: '0.9.4 — 집계 누락', open_issues: undefined },
    ];
    expect(() => selectVersion(invalid)).toThrow();
    // 정상 후보가 함께 있으면 정상 후보가 선택된다(잘못된 값이 앞섭니다).
    expect(
      selectVersion([...invalid, { title: '0.2.4 — 학습 실사용·디자인', open_issues: 4 }]),
    ).toBe('0.2.4');
  });
});

describe('buildTimeKst (KST 기준 yyyy-MM-dd HH:mm)', () => {
  it('UTC+KST9 시각을 연도와 분까지 표시한다', () => {
    expect(buildTimeKst(new Date('2026-10-21T14:59:59Z'))).toBe('2026-10-21 23:59');
    expect(buildTimeKst(new Date('2026-10-21T15:00:00Z'))).toBe('2026-10-22 00:00');
    expect(buildTimeKst(new Date('2026-10-22T07:30:00Z'))).toBe('2026-10-22 16:30');
    expect(buildTimeKst(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01 09:00');
  });
});

describe('parsePullRequestNumber (HEAD 제목)', () => {
  it('마지막 병합 PR 번호를 선택한다', () => {
    expect(parsePullRequestNumber('fix: 푸터 날짜 (#336) (#348)')).toBe(348);
  });

  it('병합 PR 패턴이 없으면 null을 반환한다', () => {
    expect(parsePullRequestNumber('fix: 푸터 날짜 정리')).toBeNull();
  });
});

describe('resolveVersion (mock gh 응답)', () => {
  it('조회 성공 시 버전, HEAD PR 번호, KST 빌드 시각을 반환한다', async () => {
    const run = async () => ({ stdout: JSON.stringify(MILESTONES) });
    const runGit = async () => 'fix: 푸터 날짜 (#336) (#348)\n';
    const result = await resolveVersion({
      run,
      runGit,
      now: new Date('2026-10-22T07:30:00Z'),
    });
    expect(result).toEqual({
      version: '0.2.4',
      pullRequest: 348,
      buildTime: '2026-10-22 16:30',
    });
  });

  it('git 로그에서 PR 번호를 읽지 못하면 버전 조회는 유지하고 번호는 null이다', async () => {
    const run = async () => ({ stdout: JSON.stringify(MILESTONES) });
    const runGit = async () => {
      throw new Error('git unavailable');
    };
    const result = await resolveVersion({ run, runGit });
    expect(result.pullRequest).toBeNull();
  });

  it('조회 실패는 그대로 전파한다(fail-closed)', async () => {
    const run = async () => {
      throw new Error('gh api 조회 실패: Not logged in');
    };
    await expect(resolveVersion({ run })).rejects.toThrow(/조회 실패/);
  });

  it('응답이 JSON 배열이 아니면 실패한다', async () => {
    const run = async () => ({ stdout: '{ "message": "not a list" }' });
    await expect(resolveVersion({ run })).rejects.toThrow();
  });
});
