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

// 10문제 학습 세트 DTO — 제출 전에는 정답·해설·근거가 없다 (#50, #187).
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
  answerCount: number;
  response: ItemResponse;
}
/** 제출 후 문항 — 서버 제출 DTO 그대로(answerOptionIds·해설·근거, answerCount 없음, #176). */
export interface StudySubmittedItem {
  questionId: string;
  questionVersionId: string;
  versionNo: number;
  optionOrder: string[];
  stem: string;
  options: StudyOption[];
  answerOptionIds: string[];
  explanation: string;
  sourceUrls: string[];
  response: ItemResponse;
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

export function isSubmittedSet(s: StudyActiveSet | StudySubmittedSet): s is StudySubmittedSet {
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

// GET /api/study/sets/current?examId=… — 이어풀기 복원(#148). 404는 활성 세트 없음(null).
export async function getCurrentStudySet(client: ApiClient, examId: string): Promise<StudyActiveSet | null> {
  try {
    const search = new URLSearchParams({ examId });
    return await client.get(`api/study/sets/current?${search}`).json<StudyActiveSet>();
  } catch (err) {
    if (err instanceof HTTPError && err.response.status === 404) return null;
    throw err;
  }
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

// 신고 사유(서버 reportBodySchema와 동일한 4종 — #53).
export type ReportReason = 'answer' | 'explanation' | 'ambiguous' | 'typo';

// POST /api/study/reports — 201(recorded) · 200 {outcome:'duplicate'} · 401/422/500.
export async function submitQuestionReport(
  client: ApiClient,
  input: { questionId: string; questionVersionId: string; reason: ReportReason },
): Promise<unknown> {
  return client.post('api/study/reports', { json: input }).json();
}

export async function listStudyHistory(
  client: ApiClient,
  input: { page: number; pageSize: number },
): Promise<StudyHistoryPage> {
  const search = new URLSearchParams({ page: String(input.page), pageSize: String(input.pageSize) });
  return client.get(`api/study/sets?${search}`).json<StudyHistoryPage>();
}

// 학습 현황 — GET /api/study/stats?examId=… (서버 StudyStats와 동일 shape, #54).
export interface DomainStats {
  domainId: string;
  uniqueFirstSolved: number;
  gradedAttempts: number;
  cumulativeAccuracy: number | null;
  recentAccuracy: number | null;
  status: 'ok' | 'insufficient-data';
}
export interface WeakDomain {
  domainId: string;
  score: number;
  cumulativeAccuracy: number;
  effectiveRecentAccuracy: number;
  uniqueFirstSolved: number;
}
export interface StudyStats {
  examId: string;
  totalQuestions: number;
  uniqueFirstSolved: number;
  coverage: number;
  overallAccuracy: number | null;
  domains: DomainStats[];
  weakDomains: WeakDomain[];
}

export async function getStudyStats(client: ApiClient, examId: string): Promise<StudyStats> {
  const search = new URLSearchParams({ examId });
  return client.get(`api/study/stats?${search}`).json<StudyStats>();
}

// 완료 세트 정정 이력 — GET /api/study/sets/:id/corrections (#53).
// 서버·DB·도메인은 수정하지 않고 이 읽기 전용 DTO만 사용한다.
export interface StudyCorrection {
  id: string;
  setId: string;
  questionId: string;
  questionVersionId: string;
  reason: string;
  source: string;
  actor: string;
  createdAt: number;
}
export interface StudyCorrectedPerItem extends StudyPerItem {
  excluded: boolean;
}
export interface StudyCorrectedResult {
  answeredCount: number;
  correctCount: number;
  accuracyPercent: number | null;
  passCount: number;
  unansweredCount: number;
  ungraded: boolean;
  validTotal: number;
  excludedCount: number;
  excludedQuestionVersionIds: string[];
  perItem: StudyCorrectedPerItem[];
}
export interface StudyCorrections {
  items: StudyCorrection[];
  corrected: StudyCorrectedResult;
}

export async function getStudyCorrections(client: ApiClient, setId: string): Promise<StudyCorrections> {
  return client.get(`api/study/sets/${setId}/corrections`).json<StudyCorrections>();
}
