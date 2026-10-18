/** 계층 경계 (ADR-0001/0011, 이슈 #1·#10·#12). CI `check:architecture` 게이트.
 *
 * 주의: `to.path`는 **해석된 경로**(예: node_modules/.pnpm/hono@x/node_modules/hono/... )와
 * 매칭된다. npm 패키지 규칙은 패키지명/경로 어디에나 걸리도록 `(^|/)name(/|$)` 형태를 사용한다.
 */
module.exports = {
  forbidden: [
    {
      name: 'domain-purity',
      comment: 'domain은 app/infra/ui/bootstrap에 의존하지 않는다',
      severity: 'error',
      from: { path: '^src/domain' },
      to: { path: '^src/(app|infra|ui|bootstrap)' },
    },
    {
      name: 'app-no-outer-layers',
      comment: 'app은 infra/ui/bootstrap에 의존하지 않는다',
      severity: 'error',
      from: { path: '^src/app' },
      to: { path: '^src/(infra|ui|bootstrap)' },
    },
    {
      name: 'ui-no-infra',
      comment: 'ui는 서버 구현(infra)을 import하지 않는다 (HTTP로만 호출)',
      severity: 'error',
      from: { path: '^src/ui' },
      to: { path: '^src/infra' },
    },
    {
      name: 'infra-no-ui',
      comment: 'infra는 ui에 의존하지 않는다',
      severity: 'error',
      from: { path: '^src/infra' },
      to: { path: '^src/ui' },
    },
    {
      name: 'web-no-server',
      comment: 'bootstrap/web(브라우저 번들)은 infra를 포함하지 않는다 (ADR-0011)',
      severity: 'error',
      from: { path: '^src/bootstrap/web' },
      to: { path: '^src/infra' },
    },
    {
      name: 'domain-no-external',
      comment: 'domain은 외부 패키지(npm)에 의존하지 않는다 (순수 TS — ADR-0001)',
      severity: 'error',
      from: { path: '^src/domain' },
      to: {
        dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-bundled', 'type-only'],
      },
    },
    {
      name: 'domain-no-builtins',
      comment: 'domain은 Node 내장 모듈(node:crypto 등)에 의존하지 않는다',
      severity: 'error',
      from: { path: '^src/domain' },
      to: { path: '^(node:|crypto$|fs$|child_process$|worker_threads$)' },
    },
    {
      name: 'app-foreign-packages',
      comment: 'app은 프레임워크/DB/네트워크 패키지에 의존하지 않는다 (ADR-0001)',
      severity: 'error',
      from: { path: '^src/app' },
      to: {
        path: '(^|/)(react|react-dom|antd|hono|ky|zustand|drizzle-orm|pino|paseto-ts)(/|$)|^@ant-design/|^@tanstack/|^cloudflare:',
      },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    exclude: {
      path: '(^|/)(dist|coverage|playwright-report|test-results)/',
    },
  },
};
