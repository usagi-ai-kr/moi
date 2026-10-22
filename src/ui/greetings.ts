// 학습 시작 히어로 인삿말 32종 — 단일 소스 (ADR-0067, 이슈 #235).
// copy.session.welcome(widgets lead)과 분리 — 홈 h1에만 사용한다.
import { useEffect, useState } from 'react';

export const HERO_GREETING_KEY = 'moi:hero-greeting:v1';
export const HERO_GREETING_TTL_MS = 60 * 60 * 1000;
export const HERO_GREETING_FALLBACK_ID = 'g01';

export type HeroGreeting = { id: string; text: string };

export const HERO_GREETINGS: readonly HeroGreeting[] = [
  { id: 'g01', text: '합격을 향해 moi자!' },
  { id: 'g02', text: '오늘도 공부하러 moi자!' },
  { id: 'g03', text: '한 문제 풀러 moi자!' },
  { id: 'g04', text: '복습할 사람, moi자!' },
  { id: 'g05', text: '모르는 문제 앞에 moi자!' },
  { id: 'g06', text: '오늘도 여기 moi자!' },
  { id: 'g07', text: '열 문제 풀러 moi자!' },
  { id: 'g08', text: '함께 준비하러 moi자!' },
  { id: 'g09', text: '다시 도전하러 moi자!' },
  { id: 'g10', text: '잠깐 집중하러 moi자!' },
  { id: 'g11', text: '오늘의 목표 앞에 moi자!' },
  { id: 'g12', text: '틀린 문제 다시 보러 moi자!' },
  { id: 'g13', text: '실력을 확인하러 moi자!' },
  { id: 'g14', text: '한 걸음 더 가려고 moi자!' },
  { id: 'g15', text: '시험 준비할 사람, moi자!' },
  { id: 'g16', text: '함께 풀어 볼 사람, moi자!' },
  { id: 'g17', text: '작은 노력이 moi면 실력이 됩니다.' },
  { id: 'g18', text: '오늘의 공부가 moi면 내일이 달라져요.' },
  { id: 'g19', text: '복습한 시간이 moi면 자신감이 생겨요.' },
  { id: 'g20', text: '작은 성취가 moi면 큰 변화가 됩니다.' },
  { id: 'g21', text: '배운 내용이 moi면 전체가 보여요.' },
  { id: 'g22', text: '경험이 moi면 판단이 빨라져요.' },
  { id: 'g23', text: '꾸준한 연습이 moi면 실력이 자라요.' },
  { id: 'g24', text: '좋은 습관이 moi면 공부가 편해져요.' },
  { id: 'g25', text: '하루의 집중이 moi면 차이가 생겨요.' },
  { id: 'g26', text: '알아낸 답이 moi면 자신감도 커져요.' },
  { id: 'g27', text: '공부하는 사람들이 moi는 곳.' },
  { id: 'g28', text: '배운 내용이 하나둘 moi는 곳.' },
  { id: 'g29', text: '오늘의 성취가 moi는 곳.' },
  { id: 'g30', text: '작은 노력이 차곡차곡 moi는 곳.' },
  { id: 'g31', text: '다시 풀어 본 문제가 moi는 곳.' },
  { id: 'g32', text: '합격을 준비하는 마음이 moi는 곳.' },
] as const;

export type HeroGreetingStored = { id: string; selectedAt: number };

const byId = new Map(HERO_GREETINGS.map((g) => [g.id, g.text]));

export function isHeroGreetingId(id: unknown): id is string {
  return typeof id === 'string' && byId.has(id);
}

function pickUniform(random: () => number): HeroGreetingStored['id'] {
  const i = Math.min(HERO_GREETINGS.length - 1, Math.floor(random() * HERO_GREETINGS.length));
  return HERO_GREETINGS[i].id;
}

function pickExcluding(excludeId: string, random: () => number): string {
  const pool = HERO_GREETINGS.filter((g) => g.id !== excludeId);
  const i = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[i].id;
}

// 순수 결정 함수 — 저장값·시각·RNG만으로 다음 값을 결정한다.
export function resolveHeroGreeting(
  stored: unknown,
  now: number,
  random: () => number = Math.random,
): HeroGreetingStored {
  const s = stored as Partial<HeroGreetingStored> | null;
  const validShape =
    !!s && typeof s === 'object' && isHeroGreetingId(s.id) && Number.isFinite(s.selectedAt);
  if (validShape) {
    const selectedAt = s.selectedAt as number;
    if (selectedAt <= now && now - selectedAt < HERO_GREETING_TTL_MS) {
      return { id: s.id as string, selectedAt };
    }
    if (selectedAt <= now) {
      return { id: pickExcluding(s.id as string, random), selectedAt: now };
    }
  }
  return { id: pickUniform(random), selectedAt: now };
}

export function heroGreetingText(id: string): string {
  return byId.get(id) ?? byId.get(HERO_GREETING_FALLBACK_ID) as string;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function readStored(storage: StorageLike | null): { ok: boolean; value: unknown } {
  if (!storage) return { ok: false, value: null };
  try {
    const raw = storage.getItem(HERO_GREETING_KEY);
    if (!raw) return { ok: true, value: null };
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, value: null };
  }
}

function writeStored(storage: StorageLike | null, value: HeroGreetingStored): void {
  if (!storage) return;
  try {
    storage.setItem(HERO_GREETING_KEY, JSON.stringify(value));
  } catch {
    // 프라이빗/차단 — 메모리 fallback, UI 오류 아님.
  }
}

function browserStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

// 동기 초기화 — 첫 렌더 전에 값을 확정해 깜빡임을 없앤다. 타이머 없음.
export function getHeroGreeting(
  now: number = Date.now(),
  random: () => number = Math.random,
  storage: StorageLike | null = browserStorage(),
): { id: string; text: string; selectedAt: number } {
  const read = readStored(storage);
  // 스토리지 차단/없음 — 첫 후보로 안전 표시, 쓰기 시도 없음.
  if (!read.ok) {
    return { id: HERO_GREETING_FALLBACK_ID, text: heroGreetingText(HERO_GREETING_FALLBACK_ID), selectedAt: now };
  }
  const next = resolveHeroGreeting(read.value, now, random);
  const s = read.value as Partial<HeroGreetingStored> | null;
  const unchanged =
    !!s && s.id === next.id && s.selectedAt === next.selectedAt && isHeroGreetingId(s.id);
  if (!unchanged) writeStored(storage, next);
  return { ...next, text: heroGreetingText(next.id) };
}

// 홈 h1 전용 훅 — 마운트 시 1회 확정 + storage 최신값 반영(신선할 때만 유지).
export function useHeroGreeting(): string {
  const [state, setState] = useState(() => getHeroGreeting());
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== HERO_GREETING_KEY) return;
      if (!e.newValue) return;
      let incoming: Partial<HeroGreetingStored>;
      try {
        incoming = JSON.parse(e.newValue) as Partial<HeroGreetingStored>;
      } catch {
        return; // 손상 이벤트 무시.
      }
      if (!isHeroGreetingId(incoming.id) || !Number.isFinite(incoming.selectedAt)) return;
      const at = incoming.selectedAt as number;
      setState((prev) => {
        const now = Date.now();
        // 현재 표시가 신선하면 탭 간 충돌로 자주 바뀌지 않게 무시한다.
        if (prev.selectedAt <= now && now - prev.selectedAt < HERO_GREETING_TTL_MS) return prev;
        const age = now - at;
        if (at > now || age >= HERO_GREETING_TTL_MS) return prev;
        const text = heroGreetingText(incoming.id as string);
        return prev.id === incoming.id ? prev : { id: incoming.id as string, text, selectedAt: at };
      });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  return state.text;
}
