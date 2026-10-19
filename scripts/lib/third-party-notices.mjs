// #121 Phase 1 — lockfile 고정 prod 의존성의 OSS 고지 데이터 순수 함수.
// 저작권은 설치된 LICENSE*의 Copyright 행에서만 확정한다. author는 저작권이 아니다.
export const NEEDS_REVIEW = '확인 필요';

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

export function normalizeLicense(entryLicense, pkg) {
  const raw = entryLicense || pkg?.license?.type || pkg?.license;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (Array.isArray(raw)) return raw.map((l) => l?.type || l).filter(Boolean).join(' AND ') || NEEDS_REVIEW;
  return NEEDS_REVIEW;
}

export function resolveCopyright(licenseHit) {
  if (typeof licenseHit === 'string' && licenseHit.trim()) return licenseHit.trim();
  return NEEDS_REVIEW;
}

export function extractSourceUrl(pkg, fallbackHomepage) {
  const repo = pkg?.repository;
  const raw = typeof repo === 'string' ? repo : repo?.url;
  if (typeof raw === 'string' && raw.trim()) {
    const url = raw.trim().replace(/^git\+/, '').replace(/^git@([^:]+):/, 'https://$1/');
    if (/^https?:\/\//.test(url)) return url;
    if (/^[\w.-]+\/[\w.-]+/.test(url)) return `https://github.com/${url}`;
    return url;
  }
  if (pkg?.homepage && String(pkg.homepage).trim()) return String(pkg.homepage).trim();
  if (fallbackHomepage && fallbackHomepage.trim()) return fallbackHomepage.trim();
  return NEEDS_REVIEW;
}

export function matchPathForVersion(paths, name, version) {
  const escaped = String(name).replace('/', '+');
  const found = (paths || []).find((p) => String(p).includes(`${escaped}@${version}`));
  if (found) return found;
  return (paths || [])[0] || '';
}

export function expandEntryVersions(entry) {
  const versions = [...new Set(entry.versions || [])].sort();
  return versions.map((version) => ({
    name: entry.name,
    version,
    path: matchPathForVersion(entry.paths, entry.name, version),
  }));
}

export function toNoticeEntry(input, installed = {}, licenseHit = '') {
  return {
    name: input.name,
    version: input.version || NEEDS_REVIEW,
    license: normalizeLicense(input.license, installed),
    copyright: resolveCopyright(licenseHit),
    url: extractSourceUrl(installed, input.homepage),
  };
}

export function sortNotices(entries) {
  return [...entries].sort(
    (a, b) => a.name.localeCompare(b.name, 'en') || a.version.localeCompare(b.version, 'en'),
  );
}

export function renderNotices(entries, meta) {
  const head = [
    '# THIRD_PARTY_NOTICES — 제삼자 라이선스 고지',
    '',
    '> 생성: `node scripts/generate-third-party-notices.mjs` (결정적 출력·타임스탬프 없음)',
    `> 출처: \`pnpm licenses list --prod --json\` + 설치된 package.json/LICENSE* + \`${meta.lockfile}\` 교차 확인`,
    `> 범위: production 직접·전이 의존성 ${meta.count}개(버전별 행). devDependencies만인 패키지 제외.`,
    `> 저작권은 LICENSE*의 Copyright 행에서만 확정하고, author만 있는 경우 '${NEEDS_REVIEW}'로 표시한다(author와 저작권 혼동 금지).`,
    `> '${NEEDS_REVIEW}' 항목은 지어내지 않은 미확인 값이며 완전 검증을 주장하지 않는다(최종 법률 승인 아님).`,
  ];
  const rows = entries.map(
    (e) => `| ${cell(e.name)} | ${cell(e.version)} | ${cell(e.license)} | ${cell(e.copyright)} | ${cell(e.url)} |`,
  );
  const table = ['| 패키지 | 버전 | 라이선스 | 저작권 | 출처 URL |', '| --- | --- | --- | --- | --- |'];
  return `${head.join('\n')}\n\n${table.join('\n')}\n${rows.join('\n')}\n`;
}

export function checkLockfileConsistency({ packageJsonText, lockfileText }) {
  const problems = [];
  let pkg;
  try {
    pkg = JSON.parse(packageJsonText);
  } catch {
    return { ok: false, problems: ['package.json 파싱 실패'] };
  }
  const end = '(?=[ \\t]*(\\r?\\n|$))';
  for (const [name, spec] of Object.entries(pkg.dependencies || {})) {
    const re = new RegExp(`${escapeRegExp(name)}':\\s*\\n\\s*specifier:\\s*${escapeRegExp(spec)}${end}`);
    const plain = new RegExp(`^\\s{6}${escapeRegExp(name)}:\\s*\\n\\s*specifier:\\s*${escapeRegExp(spec)}${end}`, 'm');
    if (!re.test(lockfileText) && !plain.test(lockfileText)) {
      problems.push(`lockfile importers와 불일치: ${name}@${spec}`);
    }
  }
  return { ok: problems.length === 0, problems };
}

export function findMissingInLockfile(entries, lockfileText) {
  return entries
    .filter((e) => e.version !== NEEDS_REVIEW && !lockfileText.includes(`${e.name}@${e.version}`))
    .map((e) => `${e.name}@${e.version}`);
}

export function findPureDevOnly(entryNames, devDeps, deps) {
  const prod = new Set(deps);
  return entryNames.filter((n) => devDeps.includes(n) && !prod.has(n));
}
