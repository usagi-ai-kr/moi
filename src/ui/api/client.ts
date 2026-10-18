import ky, { HTTPError, type KyInstance } from 'ky';

// same-origin 단일 Ky 클라이언트 (ADR-0011, architecture-boundaries 스킬).
// 컴포넌트에서 fetch 직접 호출 금지 — 이 모듈의 getMe/logout만 사용한다.
export function createApiClient(): KyInstance {
  return ky.create({
    prefix: '/',
    credentials: 'same-origin',
    timeout: 10_000,
    retry: 0,
  });
}

// 테스트 주입용 최소 인터페이스 — RTL 테스트에서 가짜 클라이언트로 교체한다.
export type ApiClient = Pick<KyInstance, 'get' | 'post' | 'patch'>;

export interface MeResponse {
  user: { id: string };
}

export interface ApiError {
  error: string;
}

// GET /api/me — 200 {user:{id}} / 401 {error:"unauthorized"}.
// 401은 오류가 아니라 비로그인 상태(null)로 매핑한다 (ADR-0018).
export async function getMe(client: ApiClient): Promise<string | null> {
  try {
    const data = await client.get('api/me').json<MeResponse>();
    return data.user.id;
  } catch (err) {
    if (err instanceof HTTPError && err.response.status === 401) return null;
    throw err;
  }
}

// POST /auth/logout — 성공 204(+쿠키 삭제) · CSRF 실패 403 · 미인증 401.
export async function logout(client: ApiClient): Promise<void> {
  await client.post('auth/logout');
}

// 20문제 학습 세트 DTO — 제출 전에는 정답·해설·근거가 없다 (#50).
export type StudyMode = 'all' | 'domain' | 'weak';
export type ItemResponse =
  | { kind: 'answered'; optionIds: string[] }
  | { kind: 'pass' }
  | { kind: 'unanswered' };
export type StudyOption = { optionId: string; text: string };
export interface StudyActiveItem {
  questionId: string;
  questionVersionId: string;
  versionNo: number;
  optionOrder: string[];
  stem: string;
  options: StudyOption[];
  response: ItemResponse;
}
/** 제출 후 문항 — 해설·근거가 추가된다(#50). */
export interface StudySubmittedItem extends StudyActiveItem {
  explanation: string;
  sourceUrls: string[];
}
export interface StudyActiveSet {
  id: string;
  userId: string;
  examId: string;
  mode: StudyMode;
  domainId?: string;
  status: 'active' | 'abandoned' | 'submitted';
  createdAt: number;
  submittedAt?: number;
  items: StudyActiveItem[];
}
export interface StudyPerItem {
  questionId: string;
  responseKind: string;
  selectedOptionIds: string[];
  correctOptionIds: string[] | null;
  correct: boolean;
}
export interface StudyResult {
  answeredCount: number;
  correctCount: number;
  accuracyPercent: number;
  passCount: number;
  unansweredCount: number;
  perItem: StudyPerItem[];
}
export type StudySubmittedSet = Omit<StudyActiveSet, 'items'> & {
  status: 'submitted';
  submittedAt: number;
  items: StudySubmittedItem[];
  result: StudyResult;
};
export interface StudySummary {
  id: string;
  examId: string;
  mode: StudyMode;
  domainId?: string;
  submittedAt: number;
  correctCount: number;
  accuracyPercent: number;
}
export interface StudyHistoryPage {
  items: StudySummary[];
  total: number;
}

export function isSubmittedSet(s: StudyActiveSet): s is StudySubmittedSet {
  return s.status === 'submitted' && 'result' in s;
}

export async function startStudySet(
  client: ApiClient,
  input: { examId: string; mode: StudyMode; domainId?: string },
): Promise<StudyActiveSet> {
  return client.post('api/study/sets', { json: input }).json<StudyActiveSet>();
}

export async function getStudySet(client: ApiClient, id: string): Promise<StudyActiveSet> {
  return client.get(`api/study/sets/${id}`).json<StudyActiveSet>();
}

export async function answerStudyItem(
  client: ApiClient,
  setId: string,
  input: { questionId: string; response: ItemResponse },
): Promise<{ outcome: string }> {
  return client.patch(`api/study/sets/${setId}/answers`, { json: input }).json<{ outcome: string }>();
}

export async function submitStudySet(
  client: ApiClient,
  setId: string,
  input: { confirmUnanswered: boolean },
): Promise<StudySubmittedSet> {
  return client.post(`api/study/sets/${setId}/submit`, { json: input }).json<StudySubmittedSet>();
}

export async function abandonStudySet(client: ApiClient, setId: string): Promise<StudyActiveSet> {
  return client.post(`api/study/sets/${setId}/abandon`, { json: { confirm: true } }).json<StudyActiveSet>();
}

export async function listStudyHistory(
  client: ApiClient,
  input: { page: number; pageSize: number },
): Promise<StudyHistoryPage> {
  const search = new URLSearchParams({ page: String(input.page), pageSize: String(input.pageSize) });
  return client.get(`api/study/sets?${search}`).json<StudyHistoryPage>();
}
