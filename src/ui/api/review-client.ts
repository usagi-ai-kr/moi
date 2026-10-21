import { HTTPError } from 'ky';
import type { ApiClient } from './client';

export type ReviewMode = 'wrong' | 'bookmark';

export interface ReviewOption {
  readonly optionId: string;
  readonly text: string;
}

export interface ReviewCandidateItem {
  readonly questionId: string;
  readonly validWrongCount: number;
  readonly stem: string;
  readonly options: readonly ReviewOption[];
}

export interface ReviewCandidatesResponse {
  readonly examId: string;
  readonly mode: ReviewMode;
  readonly total: number;
  readonly items: readonly ReviewCandidateItem[];
}

export interface ReviewPendingItem {
  readonly questionId: string;
  readonly stem: string;
  readonly options: readonly ReviewOption[];
  readonly answerCount: number;
  readonly response: null;
}

export interface ReviewSessionStartResponse {
  readonly examId: string;
  readonly mode: ReviewMode;
  readonly status: 'active';
  readonly cursor: number;
  readonly total: number;
  readonly current: ReviewPendingItem | null;
  readonly items: readonly (ReviewPendingItem | null)[];
}

export type ReviewAnswerInputKind =
  | { readonly kind: 'answered'; readonly optionIds: readonly string[] }
  | { readonly kind: 'pass' };

export interface ReviewResumeItem {
  readonly questionId: string;
  readonly response: unknown;
  readonly correct?: boolean;
}

export interface ReviewSessionCurrentResponse {
  readonly examId: string;
  readonly mode: ReviewMode;
  readonly status: 'active' | 'ended';
  readonly cursor: number;
  readonly total: number;
  readonly current: ReviewPendingItem | null;
  readonly exhausted: boolean;
  readonly items: readonly ReviewResumeItem[];
}

export interface ReviewAnswerResultGraded {
  readonly questionId?: string;
  readonly response: unknown;
  readonly correct: boolean;
  readonly explanation: string;
  readonly sourceUrls: readonly string[];
  readonly correctOptionIds: readonly string[];
}

export interface ReviewAnswerResponse {
  readonly correct: boolean;
  readonly graded: ReviewAnswerResultGraded;
  readonly session: {
    readonly examId: string;
    readonly mode: ReviewMode;
    readonly status: 'active' | 'ended';
    readonly cursor: number;
    readonly total: number;
  };
  readonly next: {
    readonly questionId: string;
    readonly stem: string;
    readonly options: readonly ReviewOption[];
    readonly answerCount: number;
  } | null;
}

export interface ReviewEndResponse {
  readonly examId: string;
  readonly mode: ReviewMode;
  readonly status: 'ended';
  readonly summary: {
    readonly total: number;
    readonly graded: number;
    readonly pending: number;
    readonly correct: number;
  };
}

export interface BookmarkListResponse {
  readonly examId: string;
  readonly total: number;
  readonly items: ReadonlyArray<{
    readonly questionId: string;
    readonly stem: string;
    readonly options: readonly ReviewOption[];
  }>;
}

export interface BookmarkSetResponse {
  readonly questionId: string;
  readonly bookmarked: boolean;
}

// GET /api/review/candidates?examId=...&mode=...
export async function getReviewCandidates(
  client: ApiClient,
  examId: string,
  mode: ReviewMode,
): Promise<ReviewCandidatesResponse> {
  const q = new URLSearchParams({ examId, mode });
  return client.get(`api/review/candidates?${q}`).json<ReviewCandidatesResponse>();
}

// POST /api/review/sessions { examId, mode }
export async function startReviewSession(
  client: ApiClient,
  examId: string,
  mode: ReviewMode,
  size?: number,
): Promise<ReviewSessionStartResponse> {
  return client.post('api/review/sessions', { json: { examId, mode, size } }).json<ReviewSessionStartResponse>();
}

// GET /api/review/sessions/current?examId=...&mode=... (404는 활성 회차 없음으로 null 매핑)
export async function getCurrentReviewSession(
  client: ApiClient,
  examId: string,
  mode: ReviewMode,
): Promise<ReviewSessionCurrentResponse | null> {
  try {
    const q = new URLSearchParams({ examId, mode });
    return await client.get(`api/review/sessions/current?${q}`).json<ReviewSessionCurrentResponse>();
  } catch (err) {
    if (err instanceof HTTPError && err.response.status === 404) return null;
    throw err;
  }
}

// POST /api/review/sessions/current/answers
export async function submitReviewAnswer(
  client: ApiClient,
  input: { examId: string; mode: ReviewMode; questionId: string; response: ReviewAnswerInputKind },
): Promise<ReviewAnswerResponse> {
  return client.post('api/review/sessions/current/answers', { json: input }).json<ReviewAnswerResponse>();
}

// POST /api/review/sessions/current/end
export async function endReviewSession(
  client: ApiClient,
  examId: string,
  mode: ReviewMode,
): Promise<ReviewEndResponse> {
  return client.post('api/review/sessions/current/end', { json: { examId, mode } }).json<ReviewEndResponse>();
}

// GET /api/review/bookmarks?examId=...
export async function listBookmarks(client: ApiClient, examId: string): Promise<BookmarkListResponse> {
  const q = new URLSearchParams({ examId });
  return client.get(`api/review/bookmarks?${q}`).json<BookmarkListResponse>();
}

// PATCH /api/review/bookmarks
export async function setBookmark(
  client: ApiClient,
  input: { examId: string; questionId: string; bookmarked: boolean },
): Promise<BookmarkSetResponse> {
  return client.patch('api/review/bookmarks', { json: input }).json<BookmarkSetResponse>();
}
