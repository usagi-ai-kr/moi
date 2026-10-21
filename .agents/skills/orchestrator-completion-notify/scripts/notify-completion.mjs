#!/usr/bin/env node
// 단위 묶음 완성 알림 — Discord webhook 전송 (ADR-0075 · 이슈 #279).
// 사용법(CWD = repo root):
//   node .agents/skills/orchestrator-completion-notify/scripts/notify-completion.mjs \
//     --status complete --title "0.2.4 수업 실사용" --summary "..." --milestone 0.2.4 \
//     --version 0.2.4 --url https://moi.example.workers.dev --commit abc1234 \
//     --issue 279 --issue 127 --test "lint·typecheck" --dry-run
// 종료 코드: 0 성공, 1 설정/URL/필수값 누락, 2 사용법 오류, 3 HTTP/네트워크 오류.
// 보안: webhook 원문은 어떤 출력에도 남기지 않는다. 환경변수 > --env-path > MOI_ENV_FILE > .env 순으로
//       **실행 없이 파싱**해 읽는다(셸 평가·command substitution 없음).
import { existsSync, readFileSync } from 'node:fs';

const EXIT = { ok: 0, config: 1, usage: 2, http: 3 };

const STATUS_COLOR = { complete: 0x2ecc71, blocked: 0xf1c40f, failed: 0xe74c3c };
const STATUS_LABEL = { complete: '완료', blocked: '차단', failed: '실패' };
const LIMIT = { title: 256, description: 4096, fieldName: 256, fieldValue: 1024, embed: 6000, fields: 25 };
const VALUE_FLAGS = new Set(['status', 'title', 'summary', 'milestone', 'version', 'url', 'commit', 'issue', 'test', 'env-path']);
const REPEATABLE = new Set(['issue', 'test']);
const DISCORD_WEBHOOK_RE = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/;
const LOCAL_WEBHOOK_RE = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/[^\s]*)?$/;
const REQUEST_TIMEOUT_MS = 15_000;

class CliError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const usageError = (m) => new CliError(EXIT.usage, m);
const configError = (m) => new CliError(EXIT.config, m);
const httpError = (m) => new CliError(EXIT.http, m);

/** 문자열 절단 — Discord 필드/설명 한도 준수. */
function truncate(text, max) {
  const s = String(text ?? '');
  if (max <= 0) return '';
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

/** 비밀값 마스킹 — 출력에 webhook 원문·토큰이 남지 않게 한다. */
function makeRedactor(webhook) {
  const secrets = new Set();
  if (webhook) {
    secrets.add(webhook);
    const token = /\/webhooks\/\d+\/([A-Za-z0-9_-]+)/.exec(webhook);
    if (token) secrets.add(token[1]);
  }
  return (text) => {
    let out = String(text ?? '');
    for (const secret of secrets) {
      if (secret) out = out.split(secret).join('[redacted]');
    }
    return out;
  };
}

/** .env 파싱 — 평가 없이 KEY=VALUE만 읽는다(실행 금지). */
function parseEnvFile(text) {
  const out = {};
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    const quoted =
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));
    if (quoted) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    out[m[1]] = value;
  }
  return out;
}

/** CLI 파싱 — `--flag value` / `--flag=value` 지원, --issue/--test는 반복 가능. */
function parseArgs(argv) {
  const opts = { dryRun: false, issues: [], tests: [] };
  const seen = new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw usageError(`알 수 없는 인자: ${arg}`);
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    let value = eq === -1 ? undefined : arg.slice(eq + 1);
    if (name === 'dry-run') {
      if (value !== undefined) throw usageError('--dry-run 은 값을 받지 않습니다');
      opts.dryRun = true;
      continue;
    }
    if (!VALUE_FLAGS.has(name)) throw usageError(`알 수 없는 옵션: --${name}`);
    if (value === undefined) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) throw usageError(`--${name} 값이 필요합니다`);
      value = next;
      i += 1;
    }
    if (!REPEATABLE.has(name) && seen.has(name)) throw usageError(`--${name} 는 한 번만 지정할 수 있습니다`);
    seen.add(name);
    if (name === 'issue') {
      const v = String(value ?? '').trim();
      if (v) opts.issues.push(v);
    } else if (name === 'test') {
      const v = String(value ?? '').trim();
      if (v) opts.tests.push(v);
    } else opts[name === 'env-path' ? 'envPath' : name] = value;
  }
  return opts;
}

/** webhook 해석 — 환경변수 우선, 그다음 env 파일(실행 없이 파싱). */
function resolveWebhook(opts, { allowUnset = false } = {}) {
  const fromEnv = (process.env.DISCORD_WEBHOOK ?? '').trim();
  if (fromEnv) return { value: fromEnv, source: 'env:DISCORD_WEBHOOK' };

  // 명시 지정된 env 파일은 fail-closed — 없으면 조용히 다른 파일로 fallback 하지 않는다.
  const explicit = Boolean(opts.envPath) || Boolean((process.env.MOI_ENV_FILE ?? '').trim());
  const candidates = [];
  if (opts.envPath) candidates.push(opts.envPath);
  else {
    const moiEnvFile = (process.env.MOI_ENV_FILE ?? '').trim();
    if (moiEnvFile) candidates.push(moiEnvFile);
    candidates.push('.env');
  }

  for (const path of candidates) {
    if (!existsSync(path)) {
      if (explicit) throw configError(`환경 파일을 찾을 수 없습니다: ${path}`);
      continue;
    }
    const parsed = parseEnvFile(readFileSync(path, 'utf8'));
    const value = (parsed.DISCORD_WEBHOOK ?? '').trim();
    if (value) return { value, source: path };
    if (opts.envPath || path === (process.env.MOI_ENV_FILE ?? '').trim()) {
      throw configError(`환경 파일에 DISCORD_WEBHOOK 이 없습니다: ${path}`);
    }
  }
  if (allowUnset) return { value: null, source: null };
  throw configError('DISCORD_WEBHOOK 설정이 없습니다 (환경변수 또는 .env/MOI_ENV_FILE)');
}

/** webhook URL 검증 — 실제 전송은 discord.com webhook만, 테스트는 루프백만(플래그 필요). */
function validateWebhookUrl(url) {
  if (DISCORD_WEBHOOK_RE.test(url)) return;
  if (LOCAL_WEBHOOK_RE.test(url)) {
    if (process.env.MOI_NOTIFY_ALLOW_LOCAL === '1') return;
    throw configError('로컬 webhook은 MOI_NOTIFY_ALLOW_LOCAL=1 일 때만 허용됩니다 (테스트 전용)');
  }
  throw configError('webhook URL 형식 오류 — https://discord.com/api/webhooks/{id}/{token} 형식이어야 합니다');
}

/** Discord embed payload 구성 — 색·필드·timestamp·footer, 한도 자동 절단. */
function buildPayload(opts) {
  const embed = {
    title: truncate(opts.title, LIMIT.title),
    description: truncate(opts.summary, LIMIT.description),
    color: STATUS_COLOR[opts.status],
    fields: [],
    timestamp: new Date().toISOString(),
    footer: { text: `moi · ${STATUS_LABEL[opts.status]}` },
  };

  const fields = [];
  if (opts.milestone) fields.push({ name: '마일스톤', value: truncate(opts.milestone, LIMIT.fieldValue), inline: true });
  if (opts.version) fields.push({ name: '버전', value: truncate(opts.version, LIMIT.fieldValue), inline: true });
  if (opts.commit) fields.push({ name: '커밋', value: truncate(opts.commit, LIMIT.fieldValue), inline: true });
  if (opts.url) fields.push({ name: '배포 URL', value: truncate(opts.url, LIMIT.fieldValue), inline: false });
  const issues = (opts.issues ?? []).map((v) => String(v ?? '').trim()).filter(Boolean);
  const tests = (opts.tests ?? []).map((v) => String(v ?? '').trim()).filter(Boolean);
  if (issues.length) fields.push({ name: '이슈', value: truncate(issues.join(', '), LIMIT.fieldValue), inline: false });
  if (tests.length) fields.push({ name: '검증', value: truncate(tests.join('\n'), LIMIT.fieldValue), inline: false });
  embed.fields = fields.slice(0, LIMIT.fields).map((f) => ({
    name: truncate(f.name, LIMIT.fieldName),
    value: f.value,
    inline: f.inline,
  }));

  // embed 전체 6000자 한도: 설명 → 뒤쪽 필드 순으로 줄인다.
  const total = () =>
    embed.title.length +
    embed.description.length +
    embed.footer.text.length +
    embed.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
  if (total() > LIMIT.embed) {
    const minDesc = 300;
    const cut = Math.min(Math.max(0, embed.description.length - minDesc), total() - LIMIT.embed);
    if (cut > 0) embed.description = truncate(embed.description, embed.description.length - cut);
    for (let i = embed.fields.length - 1; i >= 0 && total() > LIMIT.embed; i -= 1) {
      const field = embed.fields[i];
      field.value = truncate(field.value, Math.max(0, field.value.length - (total() - LIMIT.embed)));
    }
    while (total() > LIMIT.embed && embed.fields.length > 1) embed.fields.pop();
  }
  return { embeds: [embed] };
}

/** 전송 — 429는 1회만 재시도, 응답 본문·에러 메시지에서 비밀값 제거 후 요약만 stderr. */
async function sendWebhook(url, payload, redact) {
  const attempts = 2; // 1회 + 429 재시도 1회
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw httpError(`전송 실패 — 네트워크 오류: ${redact(err?.message ?? 'unknown error')}`);
    }
    if (res.ok) return { status: res.status };
    if (res.status === 429 && attempt < attempts) {
      const retryAfter = Number.parseFloat(res.headers.get('retry-after') ?? '1') || 0;
      await new Promise((r) => setTimeout(r, Math.min(Math.max(retryAfter, 0), 10) * 1000));
      continue;
    }
    const body = await res.text().catch(() => '');
    const reason = redact(body).slice(0, 200);
    throw httpError(`전송 실패 — HTTP ${res.status}${reason ? ` · ${reason}` : ''}`);
  }
  throw httpError('전송 실패 — HTTP 오류');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.status) throw configError('--status 가 필요합니다 (complete|blocked|failed)');
  if (!STATUS_COLOR[opts.status]) throw usageError(`--status 값 오류: ${opts.status} (complete|blocked|failed)`);
  if (!opts.title) throw configError('--title 이 필요합니다');
  if (opts.summary === undefined) opts.summary = '';

  const resolved = resolveWebhook(opts, { allowUnset: Boolean(opts.dryRun) });
  const webhook = resolved.value;
  const source = resolved.source;
  if (webhook) validateWebhookUrl(webhook);
  const redact = makeRedactor(webhook);

  const payload = buildPayload(opts);

  if (opts.dryRun) {
    const target = webhook ? 'discord-webhook (masked)' : 'discord-webhook (unset)';
    console.log(`target=${target}`);
    console.log(`mode=dry-run status=${opts.status} source=${source ?? 'unset'}`);
    console.log('payload:');
    console.log(JSON.stringify(payload, null, 2));
    return EXIT.ok;
  }

  if (!webhook) throw configError('DISCORD_WEBHOOK 설정이 없습니다 (환경변수 또는 .env/MOI_ENV_FILE)');
  await sendWebhook(webhook, payload, redact);
  console.log(`sent: status=${opts.status} title=${opts.title} target=discord-webhook (masked)`);
  return EXIT.ok;
}

try {
  process.exitCode = await main();
} catch (err) {
  const code = err instanceof CliError ? err.code : EXIT.http;
  const message = err instanceof CliError ? err.message : `알 수 없는 오류: ${err?.message ?? ''}`;
  console.error(`notify-completion: ${message}`);
  process.exitCode = code;
}
