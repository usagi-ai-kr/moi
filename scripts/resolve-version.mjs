#!/usr/bin/env node
// 앱 버전 단일 소스 — open 마일스톤 목록에서 최소 semver 를 선택한다.
// - 조회: gh api repos/usagi-ai-kr/moi/milestones?state=open
// - 후보: open_issues >= 1 이고 제목이 semver(X.Y.Z) 로 시작하며 추상 placeholder(1.0.0) 가 아닌 것
// - 선택: 후보 중 최소 버전 (0.2.x 는 0.3.x 보다 앞선다)
// - 실패: 조회·파싱·후보 부재 시 throw (fail-closed) — 기본값·고정값·null 을 두지 않는다.
// - 빌드시각은 KST(UTC+9) 기준 yyyy-MM-dd HH:mm.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** 마일스톤 조회 대상 — usagi-ai-kr/moi. */
export const MILESTONE_API = 'repos/usagi-ai-kr/moi/milestones?state=open';
/**
 * 추상 placeholder 버전 — 0.2.x 이후 확정 전의 1.0.0 은 버전 근거로 쓰지 않는다
 * (AGENTS.md "0.2.x 이후는 추상 1.0.0 placeholder" 규칙).
 */
export const PLACEHOLDER_VERSION = '1.0.0';
/**
 * 제목이 semver(X.Y.Z) 로 시작하는지 — 뒤에 설명이 붙어도 허용한다.
 * - 각 성분은 선행 0 을 허용하지 않는다(semver 규칙: '01.2.3' 은 version 이 아니다).
 */
const SEMVER_TITLE = /^((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))(?=\s|$)/;

/** 마일스톤 제목에서 semver 를 뽑는다 — 없으면 null(선행 0 포함 시 null). */
export function parseVersionTitle(title) {
  const m = SEMVER_TITLE.exec(String(title ?? '').trim());
  if (!m) return null;
  const [major, minor, patch] = m[1].split('.').map(Number);
  return { version: m[1], major, minor, patch };
}

/**
 * open_issues 가 후보 자격을 갖는지 — 정수·유한·1 이상이어야 한다.
 * 숫자가 아니면(문자열/NaN/Infinity/소수/누락) **후보에서 제외**한다(fail-open 금지).
 */
export function hasOpenIssues(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) && Number.isFinite(value) && value >= 1;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isInteger(parsed) && Number.isFinite(parsed) && parsed >= 1;
  }
  return false;
}

/**
 * 마일스톤 목록에서 앱 버전을 고른다(순수 함수 — 네트워크 없음).
 * - 후보 조건: open_issues 가 유효한 정수 1 이상 · semver 제목 · placeholder 제외
 * - 선택: 최소 버전
 * - 후보가 없으면 throw (fail-closed)
 */
export function selectVersion(milestones) {
  const candidates = [];
  for (const milestone of Array.isArray(milestones) ? milestones : []) {
    if (!hasOpenIssues(milestone?.open_issues)) continue;
    const parsed = parseVersionTitle(milestone?.title);
    if (!parsed) continue;
    if (parsed.version === PLACEHOLDER_VERSION) continue;
    candidates.push(parsed);
  }
  if (candidates.length === 0) {
    throw new Error(
      `버전 근거 마일스톤이 없습니다 (조건: open_issues 가 정수 1 이상 · semver 제목 · ${PLACEHOLDER_VERSION} placeholder 제외)`,
    );
  }
  candidates.sort((a, b) => a.major - b.major || a.minor - b.minor || a.patch - b.patch);
  return candidates[0].version;
}

/** 빌드시각 — KST(UTC+9) 기준 yyyy-MM-dd HH:mm. */
export function buildTimeKst(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = String(kst.getUTCFullYear()).padStart(4, '0');
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  const hour = String(kst.getUTCHours()).padStart(2, '0');
  const minute = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

/** 커밋 제목에서 마지막 `(#NNN)` PR 번호를 추출한다. 패턴이 없으면 null. */
export function parsePullRequestNumber(commitSubject) {
  const matches = String(commitSubject ?? '').matchAll(/\(#(\d+)\)/g);
  let pullRequest = null;
  for (const match of matches) {
    const parsed = Number(match[1]);
    if (Number.isSafeInteger(parsed) && parsed > 0) pullRequest = parsed;
  }
  return pullRequest;
}

/** git 제목 조회에 실패해도 빌드는 계속하고 PR 번호를 unknown으로 표시한다. */
async function defaultGitRun() {
  try {
    const { stdout } = await execFileAsync('git', ['log', '-1', '--format=%s']);
    return stdout;
  } catch {
    return '';
  }
}

async function resolvePullRequestNumber(runGit = defaultGitRun) {
  try {
    return parsePullRequestNumber(await runGit());
  } catch {
    return null;
  }
}

/** gh api 실행 — 실패 시 1줄 요약으로 throw(비밀값·전체 출력 금지). */
async function defaultRun(command, args) {
  try {
    return await execFileAsync(command, args, { maxBuffer: 8 * 1024 * 1024 });
  } catch (err) {
    const detail = String(err?.stderr ?? err?.message ?? 'unknown error')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(' / ')
      .slice(0, 200);
    throw new Error(`gh api 조회 실패: ${detail}`);
  }
}

/** 마일스톤 목록 조회 — 응답이 배열이 아니면 throw(fail-closed). */
export async function fetchMilestones({ run = defaultRun } = {}) {
  const { stdout } = await run('gh', ['api', MILESTONE_API]);
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error('마일스톤 응답 JSON 파싱 실패');
  }
  if (!Array.isArray(parsed)) throw new Error('마일스톤 응답이 배열이 아닙니다');
  return parsed;
}

/** 버전은 fail-closed, PR 로그 실패는 null, 빌드시각은 KST로 확정한다. */
export async function resolveVersion({
  run = defaultRun,
  runGit = defaultGitRun,
  now = new Date(),
} = {}) {
  const milestones = await fetchMilestones({ run });
  const version = selectVersion(milestones);
  const pullRequest = await resolvePullRequestNumber(runGit);
  return { version, pullRequest, buildTime: buildTimeKst(now) };
}

// 직접 실행 시 JSON 출력(빌드 스크립트에서 사용).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  resolveVersion()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    })
    .catch((err) => {
      process.stderr.write(`resolve-version: ${err?.message ?? 'unknown error'}\n`);
      process.exit(1);
    });
}
