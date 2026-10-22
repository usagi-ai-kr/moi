// notify-completion 회귀 테스트 — node:test + 로컬 mock HTTP (실제 Discord 호출 금지).
// 사용법: node --test .agents/skills/orchestrator-completion-notify/scripts/notify-completion.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'notify-completion.mjs');
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const SECRET = 'super-secret-token-value';
// 테스트는 실제 Discord 로 나가지 않는다 — 로컬(연결 불가) 주소만 쓴다.
const UNREACHABLE = 'http://127.0.0.1:1/webhook/test-token';

/** 스크립트 실행 — stdout/stderr/종료 코드를 그대로 돌려준다. */
function run(args, { env = {}, cwd, stdin } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      cwd: cwd ?? mkdtempSync(join(tmpdir(), 'moi-notify-')),
      env: {
        ...process.env,
        DISCORD_WEBHOOK: '',
        MOI_ENV_FILE: '',
        MOI_NOTIFY_ALLOW_LOCAL: '',
        ...env,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d;
    });
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.on('error', reject);
    // stdin 은 항상 닫아 준다 — 훅 모드가 EOF 를 기다리며 멈추지 않게.
    child.stdin.end(stdin ?? '');
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

/** 로컬 mock 서버 — 요청 본문·횟수를 기록하고 지정 상태 코드를 반환한다. */
function startMock(responder) {
  const requests = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      requests.push({ url: req.url, body: raw });
      const reply = responder(requests.length) ?? { status: 204 };
      res.writeHead(reply.status, reply.headers ?? {});
      res.end(reply.body ?? '');
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        requests,
        url: `http://127.0.0.1:${port}/webhook/${SECRET}`,
        async close() {
          await new Promise((done) => server.close(done));
        },
      });
    });
  });
}

function parsePayload(stdout) {
  const idx = stdout.indexOf('payload:');
  assert.notEqual(idx, -1, 'dry-run 출력에 payload 가 있어야 한다');
  return JSON.parse(stdout.slice(idx + 'payload:'.length));
}

test('dry-run: 네트워크 요청 없이 payload와 마스킹된 대상만 출력한다', async () => {
  const mock = await startMock(() => ({ status: 204 }));
  try {
    const r = await run(['--status', 'complete', '--title', '테스트', '--dry-run'], {
      env: { DISCORD_WEBHOOK: mock.url, MOI_NOTIFY_ALLOW_LOCAL: '1' },
    });
    assert.equal(r.code, 0);
    assert.equal(mock.requests.length, 0, 'dry-run 은 전송하지 않는다');
    assert.match(r.stdout, /target=discord-webhook \(masked\)/);
    assert.ok(!r.stdout.includes(SECRET), 'webhook 원문이 stdout 에 없어야 한다');
    assert.ok(!r.stdout.includes(mock.url), 'webhook URL 원문이 stdout 에 없어야 한다');
    assert.ok(parsePayload(r.stdout).embeds[0].title === '테스트');
  } finally {
    await mock.close();
  }
});

test('progress 이벤트는 상태값 없이 진행 현황 payload를 mock webhook에 한 번 전송한다', async () => {
  const mock = await startMock(() => ({ status: 204 }));
  try {
    const r = await run(['--event', 'progress', '--title', '진행 현황', '--summary', '최근 병합: #42'], {
      env: { DISCORD_WEBHOOK: mock.url, MOI_NOTIFY_ALLOW_LOCAL: '1' },
    });
    assert.equal(r.code, 0);
    assert.equal(mock.requests.length, 1);
    const payload = JSON.parse(mock.requests[0].body);
    assert.equal(payload.embeds[0].title, '진행 현황');
    assert.equal(payload.embeds[0].color, 0x1abc9c);
    assert.equal(payload.embeds[0].footer.text, 'moi · 진행 현황');
    assert.ok(!r.stdout.includes(SECRET));
    assert.ok(!r.stderr.includes(SECRET));
  } finally {
    await mock.close();
  }
});

test('payload: 상태별 색·필드·timestamp·footer 를 채운다', async () => {
  const r = await run(
    [
      '--status',
      'complete',
      '--title',
      '0.2.4 학습 실사용',
      '--summary',
      '요약',
      '--milestone',
      '0.2.4',
      '--version',
      '0.2.4',
      '--url',
      'https://moi.example.workers.dev',
      '--commit',
      'abc1234',
      '--issue',
      '279',
      '--issue',
      '127',
      '--test',
      'lint·typecheck',
      '--dry-run',
    ],
    { env: { DISCORD_WEBHOOK: UNREACHABLE, MOI_NOTIFY_ALLOW_LOCAL: '1' } },
  );
  assert.equal(r.code, 0);
  const embed = parsePayload(r.stdout).embeds[0];
  assert.equal(embed.color, 0x2ecc71);
  assert.equal(embed.title, '0.2.4 학습 실사용');
  assert.equal(embed.description, '요약');
  assert.ok(embed.timestamp);
  assert.match(embed.footer.text, /완료/);
  const names = embed.fields.map((f) => f.name);
  for (const expected of ['마일스톤', '버전', '커밋', '배포 URL', '이슈', '검증']) {
    assert.ok(names.includes(expected), `필드 ${expected} 가 있어야 한다`);
  }
  const issue = embed.fields.find((f) => f.name === '이슈');
  assert.equal(issue.value, '279, 127');
});

test('payload: blocked=노랑·failed=빨강 색을 쓴다', async () => {
  for (const [status, color] of [
    ['blocked', 0xf1c40f],
    ['failed', 0xe74c3c],
  ]) {
    const r = await run(['--status', status, '--title', 't', '--dry-run'], {
      env: { DISCORD_WEBHOOK: UNREACHABLE, MOI_NOTIFY_ALLOW_LOCAL: '1' },
    });
    assert.equal(r.code, 0);
    assert.equal(parsePayload(r.stdout).embeds[0].color, color);
  }
});

test('payload: description 4096자·field 1024자 한도를 넘기면 절단한다', async () => {
  const long = '가'.repeat(5000);
  const r = await run(['--status', 'complete', '--title', 't', '--summary', long, '--test', long, '--dry-run'], {
    env: { DISCORD_WEBHOOK: 'https://discord.com/api/webhooks/1234567890/abcdefgh' },
  });
  assert.equal(r.code, 0);
  const embed = parsePayload(r.stdout).embeds[0];
  assert.ok(embed.description.length <= 4096, `description 길이 ${embed.description.length}`);
  for (const field of embed.fields) {
    assert.ok(field.value.length <= 1024, `field ${field.name} 길이 ${field.value.length}`);
    assert.ok(field.name.length <= 256);
  }
  const total =
    embed.title.length +
    embed.description.length +
    embed.footer.text.length +
    embed.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
  assert.ok(total <= 6000, `embed 총 길이 ${total}`);
});

test('webhook 누락: exit 1 + 비밀 미노출', async () => {
  const r = await run(['--status', 'complete', '--title', 't']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /DISCORD_WEBHOOK/);
});

test('webhook URL 형식 오류: exit 1', async () => {
  const r = await run(['--status', 'complete', '--title', 't', '--dry-run'], {
    env: { DISCORD_WEBHOOK: 'https://example.com/hook' },
  });
  assert.equal(r.code, 1);
  assert.ok(!r.stderr.includes('example.com'));
});

test('로컬 webhook: MOI_NOTIFY_ALLOW_LOCAL 없으면 거부(exit 1)', async () => {
  const r = await run(['--status', 'complete', '--title', 't', '--dry-run'], {
    env: { DISCORD_WEBHOOK: 'http://127.0.0.1:9999/webhook' },
  });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /MOI_NOTIFY_ALLOW_LOCAL/);
});

test('mock 204: exit 0 + 서버가 payload 를 받는다', async () => {
  const mock = await startMock(() => ({ status: 204 }));
  try {
    const r = await run(['--status', 'complete', '--title', '성공', '--summary', '요약'], {
      env: { DISCORD_WEBHOOK: mock.url, MOI_NOTIFY_ALLOW_LOCAL: '1' },
    });
    assert.equal(r.code, 0);
    assert.equal(mock.requests.length, 1);
    const embed = JSON.parse(mock.requests[0].body).embeds[0];
    assert.equal(embed.title, '성공');
    assert.ok(!r.stdout.includes(SECRET));
  } finally {
    await mock.close();
  }
});

test('mock 500: exit 3 + 비밀 비노출', async () => {
  const mock = await startMock(() => ({ status: 500, body: 'Internal Server Error' }));
  try {
    const r = await run(['--status', 'complete', '--title', '실패'], {
      env: { DISCORD_WEBHOOK: mock.url, MOI_NOTIFY_ALLOW_LOCAL: '1' },
    });
    assert.equal(r.code, 3);
    assert.match(r.stderr, /HTTP 500/);
    assert.ok(!r.stderr.includes(SECRET), 'stderr 에 webhook 토큰이 없어야 한다');
    assert.ok(!r.stdout.includes(SECRET));
  } finally {
    await mock.close();
  }
});

test('mock 429: 1회 재시도 후 성공하면 exit 0', async () => {
  const mock = await startMock((n) => (n === 1 ? { status: 429, headers: { 'retry-after': '0' } } : { status: 204 }));
  try {
    const r = await run(['--status', 'blocked', '--title', '재시도'], {
      env: { DISCORD_WEBHOOK: mock.url, MOI_NOTIFY_ALLOW_LOCAL: '1' },
    });
    assert.equal(r.code, 0);
    assert.equal(mock.requests.length, 2);
  } finally {
    await mock.close();
  }
});

test('사용법 오류: 알 수 없는 옵션·잘못된 status 는 exit 2', async () => {
  const env = { DISCORD_WEBHOOK: UNREACHABLE, MOI_NOTIFY_ALLOW_LOCAL: '1' };
  const unknown = await run(['--status', 'complete', '--title', 't', '--nope'], { env });
  assert.equal(unknown.code, 2);
  const badStatus = await run(['--status', 'done', '--title', 't'], { env });
  assert.equal(badStatus.code, 2);
  const missingValue = await run(['--status', 'complete', '--title'], { env });
  assert.equal(missingValue.code, 2);
});

test('env 파일 파싱: 따옴표·공백을 읽고 환경변수가 우선한다', async () => {
  const mock = await startMock(() => ({ status: 204 }));
  const dir = mkdtempSync(join(tmpdir(), 'moi-notify-env-'));
  const envFile = join(dir, '.env.test');
  writeFileSync(envFile, `# 주석\nexport DISCORD_WEBHOOK="${mock.url}"\nOTHER=1\n`);
  try {
    const r = await run(['--status', 'complete', '--title', 'env 파일', '--env-path', envFile], {
      env: { MOI_NOTIFY_ALLOW_LOCAL: '1' },
      cwd: dir,
    });
    assert.equal(r.code, 0);
    assert.equal(mock.requests.length, 1);

    // 환경변수가 env 파일보다 우선 — env 파일은 연결 불가 URL, 환경변수는 mock URL.
    writeFileSync(envFile, `DISCORD_WEBHOOK=${UNREACHABLE}\n`);
    const prev = await run(['--status', 'complete', '--title', '우선순위', '--env-path', envFile], {
      env: { DISCORD_WEBHOOK: mock.url, MOI_NOTIFY_ALLOW_LOCAL: '1' },
      cwd: dir,
    });
    assert.equal(prev.code, 0);
    assert.equal(mock.requests.length, 2, '환경변수 우선이면 env 파일 값(연결 불가) 대신 mock 으로 전송한다');
  } finally {
    await mock.close();
  }
});

test('MOI_ENV_FILE 이 지정됐는데 파일이 없으면 fail-closed(exit 1)', async () => {
  const r = await run(['--status', 'complete', '--title', 't'], {
    env: { MOI_ENV_FILE: '/nonexistent/moi-notify/.env' },
  });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /환경 파일을 찾을 수 없습니다/);
});

test('명시 env 파일(--env-path) 누락: exit 1', async () => {
  const r = await run(['--status', 'complete', '--title', 't', '--env-path', '/nonexistent/moi-notify/.env']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /환경 파일을 찾을 수 없습니다/);
});

test('dry-run: webhook 미설정이어도 payload 검토 가능 (unset)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'moi-notify-unset-'));
  const r = await run(['--status', 'complete', '--title', 't', '--dry-run'], { cwd: dir });
  assert.equal(r.code, 0);
  assert.match(r.stdout, /target=discord-webhook \(unset\)/);
  assert.ok(!r.stdout.includes('super-secret'));
  const payload = parsePayload(r.stdout);
  assert.equal(payload.embeds[0].title, 't');
});

test('빈 issue/test 값은 필드를 만들지 않는다', async () => {
  const r = await run(['--status', 'complete', '--title', 't', '--issue', '', '--test', '  ', '--dry-run'], {
    env: { DISCORD_WEBHOOK: UNREACHABLE, MOI_NOTIFY_ALLOW_LOCAL: '1' },
  });
  assert.equal(r.code, 0);
  const embed = parsePayload(r.stdout).embeds[0];
  assert.ok(!embed.fields.some((f) => f.name === '이슈'), '빈 이슈 필드가 없어야 한다');
  assert.ok(!embed.fields.some((f) => f.name === '검증'), '빈 검증 필드가 없어야 한다');
});

test('trim: issue/test 값의 공백을 제거한다', async () => {
  const r = await run(['--status', 'complete', '--title', 't', '--issue', ' 279 ', '--test', ' lint ', '--dry-run'], {
    env: { DISCORD_WEBHOOK: UNREACHABLE, MOI_NOTIFY_ALLOW_LOCAL: '1' },
  });
  assert.equal(r.code, 0);
  const embed = parsePayload(r.stdout).embeds[0];
  const issue = embed.fields.find((f) => f.name === '이슈');
  const testField = embed.fields.find((f) => f.name === '검증');
  assert.equal(issue.value, '279');
  assert.equal(testField.value, 'lint');
});

test('필수값 누락(--title)은 exit 1 이다', async () => {
  const r = await run(['--status', 'complete'], {
    env: { DISCORD_WEBHOOK: UNREACHABLE, MOI_NOTIFY_ALLOW_LOCAL: '1' },
  });
  assert.equal(r.code, 1);
});

test('훅 요약: tool_input.questions → 질문+선택지', async () => {
  const payload = { tool_input: { questions: [{ question: '어떤 방식으로 진행할까요?', options: [{ label: 'A안' }, { label: 'B안' }] }] } };
  const r = await run(['--event', 'confirmation', '--from-hook', '--dry-run'], {
    env: { DISCORD_WEBHOOK: UNREACHABLE, MOI_NOTIFY_ALLOW_LOCAL: '1' },
    stdin: JSON.stringify(payload),
  });
  assert.equal(r.code, 0);
  const embed = parsePayload(r.stdout).embeds[0];
  assert.match(embed.description, /어떤 방식으로 진행할까요\?/);
  assert.match(embed.description, /선택지: A안, B안/);
  assert.equal(embed.title, '확인 요청');
});

test('훅 요약: questions 없음 → 일반 문구', async () => {
  const r = await run(['--event', 'confirmation', '--from-hook', '--dry-run'], {
    env: { DISCORD_WEBHOOK: UNREACHABLE, MOI_NOTIFY_ALLOW_LOCAL: '1' },
    stdin: JSON.stringify({ tool_input: {} }),
  });
  assert.equal(r.code, 0);
  const embed = parsePayload(r.stdout).embeds[0];
  assert.equal(embed.description, '사용자 확인이 필요합니다.');
});

test('훅 요약: 비JSON/빈 stdin → 일반 문구', async () => {
  const r1 = await run(['--event', 'intervention', '--from-hook', '--dry-run'], {
    env: { DISCORD_WEBHOOK: UNREACHABLE, MOI_NOTIFY_ALLOW_LOCAL: '1' },
    stdin: 'not json',
  });
  assert.equal(r1.code, 0);
  assert.equal(parsePayload(r1.stdout).embeds[0].description, '사용자 개입이 필요합니다.');

  const r2 = await run(['--event', 'intervention', '--from-hook', '--dry-run'], {
    env: { DISCORD_WEBHOOK: UNREACHABLE, MOI_NOTIFY_ALLOW_LOCAL: '1' },
    stdin: '',
  });
  assert.equal(r2.code, 0);
  assert.equal(parsePayload(r2.stdout).embeds[0].description, '사용자 개입이 필요합니다.');
});

test('훅 요약: Notification message 그대로', async () => {
  const r = await run(['--event', 'intervention', '--from-hook', '--dry-run'], {
    env: { DISCORD_WEBHOOK: UNREACHABLE, MOI_NOTIFY_ALLOW_LOCAL: '1' },
    stdin: JSON.stringify({ message: '배포 승인이 필요합니다' }),
  });
  assert.equal(r.code, 0);
  const embed = parsePayload(r.stdout).embeds[0];
  assert.equal(embed.description, '배포 승인이 필요합니다');
  assert.equal(embed.title, '개입 필요');
});

// ── ADR-0085 B1: 훅 모드는 모든 실패 경로에서 exit 0 (PreToolUse exit 2 는 AskUserQuestion 을 막는다) ──

test('훅 모드: webhook 미설정이어도 exit 0 + stderr 한 줄 요약', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'moi-notify-hook-'));
  const r = await run(['--event', 'confirmation', '--from-hook'], {
    cwd: dir,
    stdin: '{"message":"확인 요청"}',
  });
  assert.equal(r.code, 0, '훅 모드는 설정 오류에도 exit 0 이어야 한다');
  assert.match(r.stderr, /DISCORD_WEBHOOK/);
  assert.equal(r.stderr.trim().split('\n').length, 1, 'stderr 는 한 줄 요약이어야 한다');
  assert.ok(!r.stdout.includes('super-secret'));
});

test('훅 모드: 잘못된 --event 값이어도 exit 0 (인자 오류)', async () => {
  const r = await run(['--event', 'bogus', '--from-hook', '--dry-run'], {
    stdin: '{"message":"x"}',
  });
  assert.equal(r.code, 0, '훅 모드는 사용법 오류에도 exit 0 이어야 한다');
  assert.match(r.stderr, /--event 값 오류/);
  assert.equal(r.stderr.trim().split('\n').length, 1, 'stderr 는 한 줄 요약이어야 한다');
});

test('훅 모드: 전송 HTTP 500 이어도 exit 0 + 비밀 비노출', async () => {
  const mock = await startMock(() => ({ status: 500, body: 'Internal Server Error' }));
  try {
    const r = await run(['--event', 'confirmation', '--from-hook'], {
      env: { DISCORD_WEBHOOK: mock.url, MOI_NOTIFY_ALLOW_LOCAL: '1' },
      stdin: '{"message":"x"}',
    });
    assert.equal(r.code, 0, '훅 모드는 전송 실패에도 exit 0 이어야 한다');
    assert.match(r.stderr, /HTTP 500/);
    assert.equal(r.stderr.trim().split('\n').length, 1, 'stderr 는 한 줄 요약이어야 한다');
    assert.ok(!r.stderr.includes(SECRET), 'stderr 에 webhook 토큰이 없어야 한다');
    assert.ok(!r.stdout.includes(SECRET));
    assert.equal(mock.requests.length, 1);
  } finally {
    await mock.close();
  }
});

test('훅 모드 판별: --from-hook=... 형태도 exit 0 (인자가 잘못돼도 차단 금지)', async () => {
  const r = await run(['--event', 'confirmation', '--from-hook=true'], {
    stdin: '{"message":"x"}',
  });
  assert.equal(r.code, 0, '--from-hook= 형태도 훅 모드로 판별해야 한다');
  assert.match(r.stderr, /--from-hook 은 값을 받지 않습니다/);
});

// ── ADR-0085 B2: 훅 스니펫은 $CLAUDE_PROJECT_DIR 기준 경로를 쓴다 ──

test('문서 훅 스니펫: $CLAUDE_PROJECT_DIR 경로 + --env-path 를 쓰고 JSON 이 유효하다', () => {
  const doc = readFileSync(join(REPO_ROOT, 'docs/harness/completion-notify.md'), 'utf8');
  const blocks = [...doc.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1]);
  assert.ok(blocks.length > 0, '문서에 JSON 스니펫이 있어야 한다');
  const parsed = blocks.map((b) => JSON.parse(b)); // JSON 이스케이프 오류면 여기서 예외
  const hook = parsed.find((obj) => obj && obj.hooks);
  assert.ok(hook, '훅 스니펫 JSON 블록이 있어야 한다');
  const commands = Object.values(hook.hooks)
    .flat()
    .map((group) => group.hooks?.[0]?.command ?? '');
  assert.equal(commands.length, 2, 'Notification·PreToolUse 훅이 각각 1개여야 한다');
  for (const command of commands) {
    assert.match(command, /"\$CLAUDE_PROJECT_DIR\/\.agents\/skills\/orchestrator-completion-notify\/scripts\/notify-completion\.mjs"/);
    assert.match(command, /--env-path "\$CLAUDE_PROJECT_DIR\/\.env"/);
    assert.ok(!command.includes('node .agents/'), '상대 경로 스크립트 호출 금지');
  }
});
