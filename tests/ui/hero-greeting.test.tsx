import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/ui/App';
import { copy } from '../../src/ui/copy';
import {
  HERO_GREETINGS,
  HERO_GREETING_FALLBACK_ID,
  HERO_GREETING_KEY,
  HERO_GREETING_TTL_MS,
  getHeroGreeting,
  heroGreetingText,
  resolveHeroGreeting,
  useHeroGreeting,
} from '../../src/ui/greetings';
import type { ApiClient } from '../../src/ui/session';

function memStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k) as string : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    _map: m,
  };
}

function H1() {
  const text = useHeroGreeting();
  return <h1>{text}</h1>;
}

function loggedInClient(): ApiClient {
  const id = '123e4567-e89b-12d3-a456-426614174000';
  return {
    get: vi.fn(() => ({ json: async () => ({ user: { id } }) })),
    post: vi.fn(async () => new Response(null, { status: 204 })),
    patch: vi.fn(async () => ({ json: async () => ({ outcome: 'answered' }) })),
  } as unknown as ApiClient;
}

function renderApp(client: ApiClient) {
  window.history.replaceState(null, '', '/');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <App client={client} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('235 hero-greeting 후보', () => {
  it('32종·ID g01~g32 안정·moi 포함·중복 없음', () => {
    expect(HERO_GREETINGS).toHaveLength(32);
    const ids = HERO_GREETINGS.map((g) => g.id);
    expect(new Set(ids).size).toBe(32);
    expect(ids[0]).toBe('g01');
    expect(ids[31]).toBe('g32');
    for (const g of HERO_GREETINGS) {
      expect(g.text.length).toBeGreaterThan(0);
      expect(g.text).toContain('moi');
    }
    expect(heroGreetingText(HERO_GREETING_FALLBACK_ID)).toBe(HERO_GREETINGS[0].text);
    expect(heroGreetingText('unknown')).toBe(HERO_GREETINGS[0].text);
  });

  it('합격 보장·유행어 과장 문구가 없다', () => {
    const banned = ['100%', '보장', '무조건', '1등'];
    for (const g of HERO_GREETINGS) {
      for (const b of banned) expect(g.text).not.toContain(b);
    }
  });
});

describe('235 선택 알고리즘', () => {
  const NOW = 1_700_000_000_000;

  it('첫 진입: 균등 선택 (결정론적 RNG)', () => {
    expect(resolveHeroGreeting(null, NOW, () => 0).id).toBe('g01');
    expect(resolveHeroGreeting(null, NOW, () => 0.9999).id).toBe('g32');
  });

  it('59:59 유지·60:00+ 다음 진입 교체·직전 제외', () => {
    const stored = { id: 'g05', selectedAt: NOW - (HERO_GREETING_TTL_MS - 1000) };
    expect(resolveHeroGreeting(stored, NOW, () => 0.5)).toEqual(stored);
    const expired = { id: 'g05', selectedAt: NOW - HERO_GREETING_TTL_MS };
    const next = resolveHeroGreeting(expired, NOW, () => 0);
    expect(next.id).toBe('g01');
    expect(next.id).not.toBe('g05');
    expect(next.selectedAt).toBe(NOW);
  });

  it('교체 시 31개 풀에서 직전을 절대 고르지 않는다', () => {
    for (let i = 0; i < 64; i++) {
      const r = i / 64;
      const next = resolveHeroGreeting({ id: 'g17', selectedAt: NOW - HERO_GREETING_TTL_MS - 1 }, NOW, () => r);
      expect(next.id).not.toBe('g17');
    }
  });

  it('손상·미래·unknown ID는 안전 초기화 (균등 fallback)', () => {
    expect(resolveHeroGreeting('broken', NOW, () => 0).id).toBe('g01');
    expect(resolveHeroGreeting({ id: 'g99', selectedAt: NOW }, NOW, () => 0).id).toBe('g01');
    expect(resolveHeroGreeting({ id: 'g03', selectedAt: NOW + 60_000 }, NOW, () => 0).id).toBe('g01');
    expect(resolveHeroGreeting({ id: 'g03', selectedAt: NaN }, NOW, () => 0).id).toBe('g01');
  });

  it('저장값은 id·selectedAt만 (개인정보 없음)', () => {
    const s = memStorage();
    const out = getHeroGreeting(NOW, () => 0, s);
    expect(out.id).toBe('g01');
    const raw = s._map.get(HERO_GREETING_KEY) as string;
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['id', 'selectedAt']);
  });

  it('스토리지 차단 시 첫 후보 fallback·크래시 없음', () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const out = getHeroGreeting(NOW, () => 0.5, blocked);
    expect(out.id).toBe(HERO_GREETING_FALLBACK_ID);
    expect(out.text).toBe(HERO_GREETINGS[0].text);
    // 쓰기 불가 환경에서도 랜덤에 흔들리지 않고 고정.
    expect(getHeroGreeting(NOW, () => 0.9, blocked).id).toBe(HERO_GREETING_FALLBACK_ID);
  });
});

describe('235 렌더 계약 (깜빡임·타이머 없음)', () => {
  it('rerender·재마운트 동일 (60분 미만)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const r = render(<H1 />);
    const first = screen.getByRole('heading').textContent;
    r.rerender(<H1 />);
    expect(screen.getByRole('heading').textContent).toBe(first);
    r.unmount();
    render(<H1 />);
    expect(screen.getByRole('heading').textContent).toBe(first);
  });

  it('fake clock: 59:59 유지·같은 화면 타이머 교체 없음·다음 진입 교체', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    const r = render(<H1 />);
    const first = screen.getByRole('heading').textContent;
    vi.advanceTimersByTime(59 * 60 * 1000 + 59 * 1000);
    r.rerender(<H1 />);
    expect(screen.getByRole('heading').textContent).toBe(first);
    expect(setIntervalSpy).not.toHaveBeenCalled();
    // 같은 화면에 머물면 시간이 지나도 자동 교체 없음.
    vi.advanceTimersByTime(5 * 60 * 1000);
    r.rerender(<H1 />);
    expect(screen.getByRole('heading').textContent).toBe(first);
    // 다음 진입(재마운트)에서 교체되고 직전과 다르다.
    r.unmount();
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    render(<H1 />);
    const second = screen.getByRole('heading').textContent;
    expect(second).not.toBe(first);
  });

  it('h1에 aria-live 없음 (반복 낭독 방지)', () => {
    render(<H1 />);
    expect(screen.getByRole('heading')).not.toHaveAttribute('aria-live');
  });
});

describe('235 storage event 규칙', () => {
  it('신선할 때는 타 탭 값을 무시 (1시간 내 다중 변경 방지)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<H1 />);
    const first = screen.getByRole('heading').textContent;
    const incoming = JSON.stringify({ id: 'g32', selectedAt: Date.now() });
    window.dispatchEvent(new StorageEvent('storage', { key: HERO_GREETING_KEY, newValue: incoming }));
    expect(screen.getByRole('heading').textContent).toBe(first);
  });

  it('손상 이벤트는 무시·크래시 없음', () => {
    render(<H1 />);
    const first = screen.getByRole('heading').textContent;
    window.dispatchEvent(new StorageEvent('storage', { key: HERO_GREETING_KEY, newValue: 'not-json' }));
    expect(screen.getByRole('heading').textContent).toBe(first);
  });
});

describe('235 홈 통합 (h1만 교체·CTA 유지)', () => {
  it('홈 h1이 32종 중 하나·CTA·히스토리 링크 유지·h1 1개', async () => {
    renderApp(loggedInClient());
    // 로그인 홈이 뜰 때까지 대기 (초기 브랜드 h1 'moi'와 구분).
    expect(await screen.findByRole('button', { name: '학습 시작' })).toBeInTheDocument();
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(HERO_GREETINGS.map((g) => g.text)).toContain(h1.textContent);
    expect(h1).not.toHaveAttribute('aria-live');
    expect(screen.getByRole('button', { name: '학습 이력' })).toBeInTheDocument();
    expect(document.querySelectorAll('h1')).toHaveLength(1);
  });

  it('widgets lead는 기존 copy.session.welcome 유지 (회귀)', () => {
    expect(copy.session.welcome).toBe('학습을 시작할 준비가 되었습니다');
  });
});
