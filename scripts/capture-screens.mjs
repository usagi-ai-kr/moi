#!/usr/bin/env node
/**
 * #132/#148 핵심 화면 viewport 증거 촬영.
 *
 * - 로컬 `vite preview` + Playwright 결정적 route mock. 실계정·배포 검증이 아니다.
 * - 현재 라우트 계약: `/study`(진행 중 세트 복원), `/study/result`(시작→제출 state),
 *   `/review`(오답 후보), `/history`(통계+이력) 를 그대로 사용한다.
 * - 화면 텍스트의 UUID/`opt-`/`saa-c03`/`dom-` 원시값 노출 여부를 기록한다.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { chromium } from 'playwright';

const PORT = 4174;
const PREVIEW_TIMEOUT_MS = 30000;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OUT_DIR = join(process.cwd(), 'docs/evidence/132-screens');
const WIDTHS = [320, 375, 768, 1024, 1280];
mkdirSync(OUT_DIR, { recursive: true });

const COMMIT = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
const COMMIT_SHORT = COMMIT.slice(0, 7);

const STATS_DTO = {
  examId: 'saa-c03',
  totalQuestions: 500,
  uniqueFirstSolved: 20,
  coverage: 0.04,
  overallAccuracy: 0.7,
  domains: [
    {
      domainId: 'dom-security',
      uniqueFirstSolved: 12,
      gradedAttempts: 30,
      cumulativeAccuracy: 0.75,
      recentAccuracy: 0.6,
      status: 'ok',
    },
    {
      domainId: 'dom-cost',
      uniqueFirstSolved: 8,
      gradedAttempts: 15,
      cumulativeAccuracy: 0.5,
      recentAccuracy: 0.4,
      status: 'insufficient-data',
    },
  ],
  weakDomains: [
    {
      domainId: 'dom-cost',
      score: 0.45,
      cumulativeAccuracy: 0.5,
      effectiveRecentAccuracy: 0.4,
      uniqueFirstSolved: 8,
    },
  ],
};

// 내부 식별자(questionId/optionId)는 화면에 노출되지 않아야 한다.
const STUDY_ITEMS = [
  {
    questionId: 'q-mock-1',
    questionVersionId: 'qv-mock-1',
    versionNo: 1,
    optionOrder: ['opt-a', 'opt-b', 'opt-c', 'opt-d'],
    stem: 'Amazon S3 버킷에 대한 직접 인터넷 액세스를 차단하고 VPC 내부에서만 접근하도록 구성하는 가장 적절한 방법은 무엇인가?',
    options: [
      { optionId: 'opt-a', text: 'S3 Gateway VPC 엔드포인트를 생성하고 버킷 정책에서 해당 엔드포인트 조건(aws:sourceVpce)을 제한한다.' },
      { optionId: 'opt-b', text: 'NAT 게이트웨이를 구성하고 S3 버킷 정책에 NAT IP만 허용한다.' },
      { optionId: 'opt-c', text: '인터넷 게이트웨이를 삭제하고 라우팅 테이블을 비운다.' },
      { optionId: 'opt-d', text: 'S3 버킷 ACL을 프라이빗으로 설정한다.' },
    ],
    explanation:
      'S3 Gateway VPC 엔드포인트를 생성하고 버킷 정책의 Condition 절에 aws:sourceVpce를 지정하면 지정된 VPC 엔드포인트를 통한 트래픽만 허용할 수 있습니다.',
    sourceUrls: ['https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html'],
    correctOptionIds: ['opt-a'],
    response: { kind: 'unanswered' },
  },
  {
    questionId: 'q-mock-2',
    questionVersionId: 'qv-mock-2',
    versionNo: 1,
    optionOrder: ['opt-e', 'opt-f', 'opt-g', 'opt-h'],
    stem: 'IAM 정책에서 최소 권한 원칙을 적용하는 가장 적절한 방법은 무엇인가?',
    options: [
      { optionId: 'opt-e', text: '모든 사용자에게 AdministratorAccess를 부여한다.' },
      { optionId: 'opt-f', text: '업무에 필요한 특정 작업과 리소스만 Allow 하는 정책을 연결한다.' },
      { optionId: 'opt-g', text: '액세스 키를 여러 사용자와 공유한다.' },
      { optionId: 'opt-h', text: '루트 계정을 일상 작업에 사용한다.' },
    ],
    explanation: '필요한 작업(Action)과 리소스(Resource)만 명시적으로 Allow 하고, 나머지는 기본 거부로 두는 것이 최소 권한 원칙입니다.',
    sourceUrls: ['https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html'],
    correctOptionIds: ['opt-f'],
    response: { kind: 'unanswered' },
  },
  {
    questionId: 'q-mock-3',
    questionVersionId: 'qv-mock-3',
    versionNo: 1,
    optionOrder: ['opt-i', 'opt-j', 'opt-k', 'opt-l'],
    stem: 'RDS Multi-AZ 배포의 주된 목적은 무엇인가?',
    options: [
      { optionId: 'opt-i', text: '읽기 성능을 선형으로 확장한다.' },
      { optionId: 'opt-j', text: '리전 간 자동 복제를 제공한다.' },
      { optionId: 'opt-k', text: '가용 영역 장애 시 자동 장애 조치로 가용성을 높인다.' },
      { optionId: 'opt-l', text: '데이터베이스 스키마를 자동으로 변경한다.' },
    ],
    explanation: 'Multi-AZ는 동기 복제 대기 인스턴스를 다른 AZ에 두고 장애 시 자동 장애 조치를 수행해 가용성을 높입니다.',
    sourceUrls: ['https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html'],
    correctOptionIds: ['opt-k'],
    response: { kind: 'unanswered' },
  },
];

const REVIEW_WRONG_ITEMS = [
  {
    questionId: 'q-wrong-1',
    validWrongCount: 2,
    stem: 'VPC 피어링 제약 사항으로 올바른 것은?',
    options: [
      { optionId: 'opt-w1-a', text: 'CIDR 블록이 중복되면 피어링 연결을 생성할 수 없다.' },
      { optionId: 'opt-w1-b', text: '동일 리전 간 VPC만 피어링이 가능하다.' },
    ],
  },
  {
    questionId: 'q-wrong-2',
    validWrongCount: 1,
    stem: 'S3 버킷 기본 암호화 설정은 무엇인가?',
    options: [
      { optionId: 'opt-w2-a', text: '모든 새 버킷에 SSE-S3 기본 암호화가 적용된다.' },
      { optionId: 'opt-w2-b', text: '기본 암호화는 비활성화되어 있다.' },
    ],
  },
];

const HISTORY_SETS = [
  {
    id: 'set-history-1',
    examId: 'saa-c03',
    mode: 'all',
    submittedAt: 1700000010000,
    correctCount: 18,
    accuracyPercent: 90,
  },
  {
    id: 'set-history-2',
    examId: 'saa-c03',
    mode: 'domain',
    domainId: 'dom-security',
    submittedAt: 1699900000000,
    correctCount: 14,
    accuracyPercent: 70,
  },
  {
    id: 'set-history-3',
    examId: 'saa-c03',
    mode: 'weak',
    domainId: 'dom-cost',
    submittedAt: 1699800000000,
    correctCount: 10,
    accuracyPercent: 50,
  },
];

function makeActiveSet() {
  return {
    id: 'set-mock-1',
    userId: 'mock-user-1',
    examId: 'saa-c03',
    mode: 'all',
    status: 'active',
    createdAt: 1700000000000,
    items: JSON.parse(JSON.stringify(STUDY_ITEMS)),
  };
}

function toActiveDto(set) {
  return {
    id: set.id,
    userId: set.userId,
    examId: set.examId,
    mode: set.mode,
    status: set.status,
    createdAt: set.createdAt,
    ...(set.submittedAt !== undefined ? { submittedAt: set.submittedAt } : {}),
    items: set.items.map((item) => ({
      questionId: item.questionId,
      questionVersionId: item.questionVersionId,
      versionNo: item.versionNo,
      optionOrder: [...item.optionOrder],
      stem: item.stem,
      options: item.options.map((o) => ({ optionId: o.optionId, text: o.text })),
      response: item.response,
    })),
  };
}

function submittedDto(set) {
  const perItem = set.items.map((item) => {
    const selected = item.response.kind === 'answered' ? item.response.optionIds : [];
    const correct =
      selected.length === item.correctOptionIds.length &&
      item.correctOptionIds.every((id) => selected.includes(id));
    return {
      questionId: item.questionId,
      responseKind: item.response.kind,
      selectedOptionIds: selected,
      correctOptionIds: item.correctOptionIds,
      correct,
    };
  });
  const correctCount = perItem.filter((p) => p.correct).length;
  const passCount = set.items.filter((i) => i.response.kind === 'pass').length;
  const unansweredCount = set.items.filter((i) => i.response.kind === 'unanswered').length;
  return {
    id: set.id,
    userId: set.userId,
    examId: set.examId,
    mode: set.mode,
    status: 'submitted',
    createdAt: set.createdAt,
    submittedAt: 1700000010000,
    items: set.items.map((item) => ({
      questionId: item.questionId,
      questionVersionId: item.questionVersionId,
      versionNo: item.versionNo,
      optionOrder: [...item.optionOrder],
      stem: item.stem,
      options: item.options.map((o) => ({ optionId: o.optionId, text: o.text })),
      response: item.response,
      explanation: item.explanation,
      sourceUrls: [...item.sourceUrls],
    })),
    result: {
      answeredCount: set.items.filter((i) => i.response.kind === 'answered').length,
      correctCount,
      accuracyPercent: Math.round((correctCount / set.items.length) * 100),
      passCount,
      unansweredCount,
      perItem,
    },
  };
}

function fulfillJson(route, status, json) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
}

async function installMocks(page, config = {}) {
  const state = {
    studySet: config.studySet ? JSON.parse(JSON.stringify(config.studySet)) : null,
    history: config.history ? JSON.parse(JSON.stringify(config.history)) : [],
    reviewWrong: Boolean(config.reviewWrong),
  };

  if (config.loggedOut) {
    await page.route('**/api/me', (route) => fulfillJson(route, 401, { error: 'unauthorized' }));
    return state;
  }

  await page.route('**/api/me', (route) => fulfillJson(route, 200, { user: { id: 'mock-user-1' } }));

  await page.route('**/api/study/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const path = url.pathname;

    if (path === '/api/study/stats') {
      return fulfillJson(route, 200, STATS_DTO);
    }

    if (path === '/api/study/sets/current') {
      if (!state.studySet) return fulfillJson(route, 404, { error: 'no_active_set' });
      return fulfillJson(route, 200, state.studySet.status === 'submitted' ? submittedDto(state.studySet) : toActiveDto(state.studySet));
    }

    if (path === '/api/study/sets' && method === 'POST') {
      state.studySet = makeActiveSet();
      return fulfillJson(route, 201, toActiveDto(state.studySet));
    }

    if (path === '/api/study/sets' && method === 'GET') {
      return fulfillJson(route, 200, {
        items: state.history,
        total: state.history.length,
        page: 1,
        pageSize: 20,
      });
    }

    const m = path.match(/^\/api\/study\/sets\/([^/]+)(?:\/(answers|submit|abandon|corrections))?$/);
    if (m) {
      const action = m[2];
      if (!state.studySet) return fulfillJson(route, 404, { error: 'not_found' });

      if (method === 'GET' && action === 'corrections') {
        return fulfillJson(route, 200, { items: [], corrected: null });
      }
      if (method === 'GET' && !action) {
        return fulfillJson(route, 200, state.studySet.status === 'submitted' ? submittedDto(state.studySet) : toActiveDto(state.studySet));
      }
      if (method === 'PATCH' && action === 'answers') {
        const body = req.postDataJSON();
        const item = state.studySet.items.find((i) => i.questionId === body?.questionId);
        if (item && body?.response) item.response = body.response;
        return fulfillJson(route, 200, { outcome: body?.response?.kind ?? 'answered' });
      }
      if (method === 'POST' && action === 'submit') {
        state.studySet.status = 'submitted';
        state.studySet.submittedAt = 1700000010000;
        return fulfillJson(route, 200, submittedDto(state.studySet));
      }
      if (method === 'POST' && action === 'abandon') {
        return fulfillJson(route, 200, toActiveDto(state.studySet));
      }
    }

    return fulfillJson(route, 404, { error: 'not_found' });
  });

  await page.route('**/api/review/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const path = url.pathname;

    if (path === '/api/review/candidates') {
      const mode = url.searchParams.get('mode') || 'wrong';
      return fulfillJson(route, 200, {
        examId: 'saa-c03',
        mode,
        total: mode === 'wrong' ? state.reviewWrong ? REVIEW_WRONG_ITEMS.length : 0 : 0,
        items: mode === 'wrong' ? (state.reviewWrong ? REVIEW_WRONG_ITEMS : []) : [],
      });
    }
    if (path === '/api/review/sessions/current') {
      return fulfillJson(route, 404, { error: 'not_found' });
    }
    if (path === '/api/review/bookmarks') {
      if (method === 'GET') {
        return fulfillJson(route, 200, { examId: 'saa-c03', total: 0, items: [] });
      }
      if (method === 'PATCH') {
        const body = req.postDataJSON();
        return fulfillJson(route, 200, {
          questionId: body?.questionId,
          bookmarked: Boolean(body?.bookmarked),
        });
      }
    }
    return fulfillJson(route, 404, { error: 'not_found' });
  });

  return state;
}

async function submitStudyFlow(page) {
  await page.getByRole('heading', { name: '학습 범위 선택' }).waitFor();
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/study/sets'),
    page.getByRole('button', { name: '학습 시작', exact: true }).click(),
  ]);

  const question = page.locator('section[aria-label^="문제"]').first();
  await question.waitFor();
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/answers')),
    question.locator('input[type="checkbox"]').first().click(),
  ]);

  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.locator('section[aria-label="문제 2/3"]').waitFor();
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/answers')),
    page.getByRole('button', { name: 'Pass', exact: true }).click(),
  ]);

  await page.getByRole('button', { name: /^제출하기/ }).click();
  await page.getByRole('alertdialog', { name: '제출 확인' }).waitFor();
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/submit')),
    page.getByRole('button', { name: '제출 확인', exact: true }).click(),
  ]);
  await page.waitForURL(/\/study\/result$/);
  await page.getByRole('heading', { name: '학습 결과' }).waitFor();
  await page.waitForFunction(() => {
    const buttons = Array.from(document.querySelectorAll('button[aria-label="북마크 추가"]'));
    return buttons.length > 0 && buttons.every((b) => !b.disabled);
  });
}

const SCREENS = [
  {
    id: 'home-logged-out',
    label: '로그아웃 홈',
    path: '/',
    entryPath: '/',
    mock: { loggedOut: true },
    waitFor: (page) => page.locator('.moi-kakao-login').waitFor(),
  },
  {
    id: 'home',
    label: '홈(로그인 후)',
    path: '/',
    entryPath: '/',
    mock: {},
    waitFor: (page) => page.getByRole('button', { name: '20문제 학습', exact: true }).waitFor(),
  },
  {
    id: 'study-new',
    label: '학습 시작',
    path: '/study/new',
    entryPath: '/study/new',
    mock: {},
    waitFor: (page) => page.getByRole('heading', { name: '학습 범위 선택' }).waitFor(),
  },
  {
    id: 'study-active',
    label: '풀이 중',
    path: '/study',
    entryPath: '/study',
    mock: { studySet: makeActiveSet() },
    waitFor: async (page) => {
      await page.locator('section[aria-label^="문제"]').first().waitFor();
      await page.waitForFunction(() => {
        const buttons = Array.from(document.querySelectorAll('button[aria-label="북마크 추가"]'));
        return buttons.length > 0 && buttons.every((b) => !b.disabled);
      });
    },
  },
  {
    id: 'study-result',
    label: '결과(해설 포함)',
    path: '/study/result',
    entryPath: '/study/new',
    mock: {},
    prepare: submitStudyFlow,
    waitFor: (page) => page.getByRole('heading', { name: '학습 결과' }).waitFor(),
  },
  {
    id: 'history-empty',
    label: '이력(0건)',
    path: '/history',
    entryPath: '/history',
    mock: { history: [] },
    waitFor: (page) => page.getByText('아직 완료한 학습이 없습니다.').waitFor(),
  },
  {
    id: 'history-populated',
    label: '이력(다건)',
    path: '/history',
    entryPath: '/history',
    mock: { history: HISTORY_SETS },
    prepare: async (page) => {
      await page.locator('.moi-study-history-item').first().click();
      await page.getByRole('dialog').first().waitFor();
    },
    waitFor: (page) => page.locator('.moi-study-history > li').first().waitFor(),
  },
  {
    id: 'review',
    label: '복습',
    path: '/review',
    entryPath: '/review',
    mock: { reviewWrong: true },
    waitFor: (page) => page.getByRole('heading', { name: /복습 대기 2문제/ }).waitFor(),
  },
  {
    id: 'account',
    label: '계정',
    path: '/account',
    entryPath: '/account',
    mock: {},
    waitFor: (page) => page.getByRole('button', { name: '로그아웃', exact: true }).waitFor(),
  },
];

async function waitForServer(target, timeoutMs, previewState, buildMarker) {
  if (!buildMarker) return { ok: false, reason: 'no-build-marker', foreignResponse: false };
  const started = Date.now();
  let foreignResponse = false;
  while (Date.now() - started < timeoutMs) {
    if (previewState.exited) return { ok: false, reason: 'exited', foreignResponse };
    try {
      const res = await fetch(target);
      if (res.ok) {
        // 4174에 이미 떠 있던 다른 서버에 붙지 않도록, 응답이 현재 빌드 산출물인지 확인한다.
        const html = await res.text();
        if (html.includes(buildMarker)) return { ok: true, foreignResponse };
        foreignResponse = true;
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { ok: false, reason: previewState.exited ? 'exited' : 'timeout', foreignResponse };
}

function readBuildMarker() {
  // vite(Cloudflare 플러그인 포함)의 클라이언트 산출물에서 현재 빌드의 자산 경로를 얻는다.
  for (const candidate of ['dist/client/index.html', 'dist/index.html', 'dist/public/index.html']) {
    try {
      const html = readFileSync(join(process.cwd(), candidate), 'utf8');
      const match = html.match(/(?:src|href)="(\/?assets\/[^"]+\.(?:js|css))"/);
      if (match) return match[1];
    } catch {
      // 다음 후보
    }
  }
  return null;
}

function isPortInUse(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function previewOutput(previewState) {
  if (previewState.error) return previewState.error.message;
  return previewState.output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-6)
    .join('\n');
}

function previewFailure(previewState, wait) {
  const detail = previewOutput(previewState);
  if (wait.reason === 'no-build-marker') {
    return new Error(`빌드 산출물을 찾을 수 없습니다. 먼저 \`pnpm build\`를 실행하세요.${detail ? `\npreview 출력:\n${detail}` : ''}`);
  }
  const portInUse = /already in use|EADDRINUSE|strictPort/i.test(detail);
  const message = portInUse
    ? `포트 ${PORT}가 이미 사용 중입니다. 다른 preview/dev 서버를 종료한 뒤 다시 실행하세요.`
    : wait.foreignResponse
      ? `${PORT} 포트의 응답이 현재 빌드 산출물이 아닙니다. 다른 서버가 ${PORT}를 점유하고 있을 수 있습니다.`
      : wait.reason === 'timeout'
        ? `${PORT} 포트의 preview 서버가 ${PREVIEW_TIMEOUT_MS / 1000}초 안에 준비되지 않았습니다.`
        : `vite preview가 준비되기 전에 종료되었습니다 (code=${previewState.code ?? 'null'}, signal=${previewState.signal ?? 'null'}).`;
  return new Error(`${message}${detail ? `\npreview 출력:\n${detail}` : ''}`);
}

function build() {
  if (process.argv.includes('--no-build')) return;
  console.log('Building current HEAD for deterministic preview...');
  const result = spawnSync('pnpm', ['build'], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error('Build failed');
    process.exit(result.status ?? 1);
  }
}

async function main() {
  build();

  const buildMarker = readBuildMarker();
  if (!buildMarker) {
    console.error('빌드 산출물을 찾을 수 없습니다. 먼저 `pnpm build`를 실행하세요.');
    process.exit(1);
  }
  if (await isPortInUse(PORT)) {
    console.error(`포트 ${PORT}가 이미 사용 중입니다. 다른 preview/dev 서버를 종료한 뒤 다시 실행하세요.`);
    process.exit(1);
  }
  console.log(`Starting vite preview on port ${PORT}...`);
  const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  const previewState = { exited: false, code: null, signal: null, error: null, output: '' };
  const recordPreviewOutput = (chunk) => {
    previewState.output = `${previewState.output}${chunk.toString('utf8')}`.slice(-4000);
  };
  preview.stdout?.on('data', recordPreviewOutput);
  preview.stderr?.on('data', recordPreviewOutput);
  preview.once('error', (error) => {
    previewState.error = error;
    previewState.exited = true;
  });
  preview.once('exit', (code, signal) => {
    previewState.code = code;
    previewState.signal = signal;
    previewState.exited = true;
  });

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp || !preview.pid) return;
    cleanedUp = true;
    try {
      process.kill(-preview.pid, 'SIGTERM');
    } catch {
      try {
        preview.kill('SIGTERM');
      } catch {
        // already exited
      }
    }
  };
  const shutdown = (code) => {
    cleanup();
    process.exit(code);
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => shutdown(130));
  process.on('SIGTERM', () => shutdown(143));
  process.on('SIGHUP', () => shutdown(129));

  const ready = await waitForServer(BASE_URL, PREVIEW_TIMEOUT_MS, previewState, buildMarker);
  if (!ready.ok) {
    cleanup();
    throw previewFailure(previewState, ready);
  }
  console.log(`Preview server ready at ${BASE_URL}${buildMarker ? ' (current build verified)' : ''}`);

  const browser = await chromium.launch({ headless: true });
  const results = {
    commit: COMMIT,
    commitShort: COMMIT_SHORT,
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    mode: 'local vite preview + deterministic Playwright route mock (not real account/deployment)',
    screens: [],
    summary: {
      totalScreens: SCREENS.length,
      widths: WIDTHS,
      overflowCount: 0,
      below44Count: 0,
      rawValueScreenCount: 0,
      screens: [],
    },
  };

  try {
    for (const screen of SCREENS) {
      console.log(`Capturing: ${screen.label} (${screen.id})...`);
      const screenResult = {
        id: screen.id,
        label: screen.label,
        path: screen.path,
        entryPath: screen.entryPath,
        widths: {},
      };
      const screenSummary = {
        id: screen.id,
        minButtonHeight: null,
        overflowWidths: [],
        rawValueWidths: [],
        rawValues: [],
      };

      for (const width of WIDTHS) {
        const context = await browser.newContext({
          viewport: { width, height: 800 },
          reducedMotion: 'reduce',
        });
        const page = await context.newPage();

        const state = await installMocks(page, screen.mock);
        await page.goto(`${BASE_URL}${screen.entryPath}`);
        if (screen.prepare) await screen.prepare(page, state);
        await screen.waitFor(page);
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;}' });
        await page.waitForTimeout(250);

        const imgFilename = `${screen.id}-${width}.png`;
        await page.screenshot({ path: join(OUT_DIR, imgFilename), fullPage: true });

        const overflow = await page.evaluate(() => {
          const de = document.documentElement;
          const overflowing = Array.from(document.querySelectorAll('body *'))
            .map((el) => ({ el, rect: el.getBoundingClientRect() }))
            .filter(({ rect }) => rect.width > 0 && (rect.right > de.clientWidth + 1 || rect.left < -1))
            .slice(0, 5)
            .map(({ el, rect }) => ({
              tag: el.tagName.toLowerCase(),
              className: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
              left: Math.round(rect.left),
              right: Math.round(rect.right),
            }));
          return {
            scrollWidth: de.scrollWidth,
            clientWidth: de.clientWidth,
            delta: de.scrollWidth - de.clientWidth,
            hasOverflow: de.scrollWidth > de.clientWidth,
            overflowing,
          };
        });

        const buttonMetrics = await page.evaluate(() => {
          const selector = 'button, [data-slot="button"], a[role="button"], input[type="button"], input[type="submit"], .moi-kakao-login';
          const elements = Array.from(new Set(document.querySelectorAll(selector)));
          const visible = elements.filter((el) => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
          });
          const buttons = visible.map((el) => {
            const rect = el.getBoundingClientRect();
            const text = (el.innerText || el.getAttribute('aria-label') || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 40);
            return {
              text,
              tag: el.tagName.toLowerCase(),
              height: Math.round(rect.height * 10) / 10,
              width: Math.round(rect.width * 10) / 10,
              disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
            };
          });
          const minHeight = buttons.length ? Math.min(...buttons.map((b) => b.height)) : null;
          return {
            totalButtons: buttons.length,
            minHeight,
            below44: buttons.filter((b) => b.height < 44),
          };
        });

        const textFindings = await page.evaluate(() => {
          const text = document.body.innerText || '';
          const uuid = Array.from(new Set(text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || []));
          // 내부 원시값은 대소문자를 구분한다 — 사용자 라벨 'AWS SAA-C03'은 위반이 아니다.
          const opt = Array.from(new Set(text.match(/\bopt-[A-Za-z0-9_-]+/g) || []));
          const examCode = Array.from(new Set(text.match(/saa-c03/g) || []));
          const domainCode = Array.from(new Set(text.match(/\bdom-[A-Za-z0-9_-]+/g) || []));
          return {
            uuid,
            opt,
            examCode,
            domainCode,
            exposed: uuid.length > 0 || opt.length > 0 || examCode.length > 0 || domainCode.length > 0,
          };
        });

        if (overflow.hasOverflow) {
          results.summary.overflowCount += 1;
          screenSummary.overflowWidths.push(width);
        }
        if (buttonMetrics.below44.length > 0) results.summary.below44Count += buttonMetrics.below44.length;
        if (screenSummary.minButtonHeight === null || (buttonMetrics.minHeight !== null && buttonMetrics.minHeight < screenSummary.minButtonHeight)) {
          screenSummary.minButtonHeight = buttonMetrics.minHeight;
        }
        if (textFindings.exposed) {
          screenSummary.rawValueWidths.push(width);
          screenSummary.rawValues.push({
            width,
            uuid: textFindings.uuid,
            opt: textFindings.opt,
            examCode: textFindings.examCode,
            domainCode: textFindings.domainCode,
          });
        }

        screenResult.widths[width] = {
          image: imgFilename,
          finalPath: new URL(page.url()).pathname,
          overflow,
          buttonMetrics,
          textFindings,
        };

        await context.close();
      }

      if (screenSummary.rawValueWidths.length > 0) results.summary.rawValueScreenCount += 1;
      results.screens.push(screenResult);
      results.summary.screens.push(screenSummary);
    }

    writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2), 'utf8');
    console.log(`Wrote measurements to ${join(OUT_DIR, 'results.json')}`);
    console.log(
      `Summary: screens=${results.summary.totalScreens}, overflow=${results.summary.overflowCount}, below44=${results.summary.below44Count}, rawValueScreens=${results.summary.rawValueScreenCount}`,
    );
  } finally {
    await browser.close();
    cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
