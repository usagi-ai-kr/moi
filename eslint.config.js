import tseslint from 'typescript-eslint';

// 계층·금지 패키지 이중 강제: dependency-cruiser(그래프·순환) + ESLint no-restricted-imports(런타임).
// dependency-cruiser의 `to.path`는 해석된 경로와 매칭되어 일부 exports-map 패키지(hono 등)를
// 놓칠 수 있어(도구 한계), ESLint 규칙이 그 갭을 커버한다 (ADR-0001/0011, 이슈 #1·#10·#12).

const PKG = {
  domain: [
    'react',
    'react-dom',
    'react/*',
    'react-dom/*',
    'antd',
    '@ant-design/*',
    'hono',
    'hono/*',
    'ky',
    'zustand',
    'zustand/*',
    'drizzle-orm',
    'drizzle-orm/*',
    'pino',
    'pino/*',
    'paseto-ts',
    'paseto-ts/*',
    '@tanstack/*',
    'cloudflare:*',
    'node:*',
  ],
  app: [
    'react',
    'react-dom',
    'react/*',
    'react-dom/*',
    'antd',
    '@ant-design/*',
    'hono',
    'hono/*',
    'ky',
    'zustand',
    'zustand/*',
    'drizzle-orm',
    'drizzle-orm/*',
    'pino',
    'pino/*',
    'paseto-ts',
    'paseto-ts/*',
    '@tanstack/*',
    'cloudflare:*',
  ],
  ui: ['drizzle-orm', 'drizzle-orm/*', 'pino', 'pino/*', 'paseto-ts', 'paseto-ts/*', 'cloudflare:*', 'hono', 'hono/*'],
};

const LAYER = {
  domain: ['@/app', '@/app/*', '@/infra', '@/infra/*', '@/ui', '@/ui/*', '@/bootstrap', '@/bootstrap/*', '../app/*', '../infra/*', '../ui/*', '../bootstrap/*'],
  app: ['@/infra', '@/infra/*', '@/ui', '@/ui/*', '@/bootstrap', '@/bootstrap/*', '../infra/*', '../ui/*', '../bootstrap/*'],
  ui: ['@/infra', '@/infra/*', '../infra/*'],
  infra: ['@/ui', '@/ui/*', '../ui/*'],
  web: ['@/infra', '@/infra/*', '../infra/*'],
};

const restricted = (group, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ group, message }] }],
});

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.wrangler/**',
      'playwright-report/**',
      'test-results/**',
      'e2e/.features-gen/**',
      'worker-configuration.d.ts',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: restricted(
      [...LAYER.domain, ...PKG.domain],
      'domain은 app/infra/ui/bootstrap·외부 패키지·내장 모듈에 의존할 수 없습니다 (ADR-0001)',
    ),
  },
  {
    files: ['src/app/**/*.{ts,tsx}'],
    rules: restricted(
      [...LAYER.app, ...PKG.app],
      'app은 infra/ui/bootstrap·프레임워크/DB/네트워크 패키지에 의존할 수 없습니다 (ADR-0001)',
    ),
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: restricted(
      [...LAYER.ui, ...PKG.ui],
      'ui는 서버 구현(infra)·서버 전용 패키지에 의존할 수 없습니다 (ADR-0001/0011)',
    ),
  },
  {
    files: ['src/infra/**/*.{ts,tsx}'],
    rules: restricted(LAYER.infra, 'infra는 ui에 의존할 수 없습니다 (ADR-0001)'),
  },
  {
    files: ['src/bootstrap/web/**/*.{ts,tsx}'],
    rules: restricted(LAYER.web, 'bootstrap/web(브라우저 번들)은 infra를 포함할 수 없습니다 (ADR-0011)'),
  },
);
