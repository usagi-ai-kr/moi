import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HTTPError } from 'ky';
import { DEFAULT_STUDY_SET_SIZE } from '@/domain/study/thresholds';
import { CONCEPT_CACHE_ROOT } from '../concepts/queries';
import {
  abandonStudySet,
  answerStudyItem,
  getCurrentStudySet,
  getStudyCorrections,
  getStudySet,
  listStudyHistory,
  startStudySet,
  submitStudySet,
  type ApiClient,
  type ItemResponse,
  type StudyActiveSet,
  type StudyMode,
} from '../api/client';

// 진실 원천: ['study','set'] · ['study','history'] (이슈 #50).
export const STUDY_SET_KEY = ['study', 'set'] as const;
export const STUDY_HISTORY_KEY = ['study', 'history'] as const;

export function setQueryKey(id: string): readonly [string, string, string] {
  return ['study', 'set', id];
}

// 진행 중 세트 복원(#148) — userId를 key에 포함해 계정 간 캐시가 섞이지 않게 한다.
export function currentStudySetQueryKey(examId: string, userId: string) {
  return ['study', 'current', examId, userId] as const;
}

export function useCurrentStudySet(client: ApiClient, examId: string, userId: string, enabled = true) {
  return useQuery({
    queryKey: currentStudySetQueryKey(examId, userId),
    queryFn: () => getCurrentStudySet(client, examId),
    enabled,
    retry: false,
    staleTime: 0,
    // 풀이 중 탭 전환·재연결로 /study 화면이 다시 로딩되지 않게 한다.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useStudySet(client: ApiClient, id: string | null) {
  return useQuery({
    queryKey: id ? setQueryKey(id) : STUDY_SET_KEY,
    queryFn: () => getStudySet(client, id as string),
    enabled: id !== null,
    retry: false,
    staleTime: 10_000,
  });
}

export function useStudyHistory(client: ApiClient, page: number, pageSize: number, enabled: boolean) {
  return useQuery({
    queryKey: [...STUDY_HISTORY_KEY, page, pageSize],
    queryFn: () => listStudyHistory(client, { page, pageSize }),
    enabled,
    retry: false,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

// 완료 세트 정정 이력 — 제출 세트 결과 화면에서만 조회한다 (#53).
// 조회 실패는 결과 화면 전체를 막지 않도록 호출자가 data 유무로만 분기한다.
export function useStudyCorrections(client: ApiClient, setId: string | null) {
  return useQuery({
    queryKey: ['study', 'corrections', setId],
    queryFn: () => getStudyCorrections(client, setId as string),
    enabled: setId !== null,
    retry: false,
    staleTime: 10_000,
  });
}

export function isConflict(err: unknown): boolean {
  return err instanceof HTTPError && err.response.status === 409;
}

export function isUnauthorized(err: unknown): boolean {
  return err instanceof HTTPError && err.response.status === 401;
}

export function useStartStudy(client: ApiClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { examId: string; mode: StudyMode; domainId?: string; size?: number }) => startStudySet(client, input),
    onSuccess: (set: StudyActiveSet, variables: { examId: string; mode: StudyMode; domainId?: string; size?: number }) => {
      queryClient.setQueryData(setQueryKey(set.id), set);
      // 시작 성공 시 요청 size를 기록한다 — 라우트 변경(/study/new→/study)으로
      // useStudyFlow가 remount되어 size가 기본값으로 리셋돼도 부족 안내가 동작하게 한다 (#275 F1).
      if (variables.size !== undefined) rememberRequestedSize(variables.examId, variables.size, set.id);
    },
  });
}

// 시작 시 요청한 문제 수 — D1·API 계약 변경 없이 UI-only로 active 화면까지 전달한다 (#275 F1).
// sessionStorage라 새로고침 후에도 유지되고 탭 간에는 격리된다. 시험별로 키를 나눈다.
const REQUESTED_SIZE_KEY = 'moi.study.requestedSize.v1';

export function rememberRequestedSize(examId: string, size: number, setId: string): void {
  try {
    sessionStorage.setItem(REQUESTED_SIZE_KEY, JSON.stringify({ examId, setId, size }));
  } catch {
    // 저장 실패 무시 — 안내는 표시되지 않는다.
  }
}

export function readRequestedSize(examId: string): { setId: string; size: number } | null {
  try {
    const raw = sessionStorage.getItem(REQUESTED_SIZE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { examId?: unknown; setId?: unknown; size?: unknown };
    if (parsed.examId !== examId || typeof parsed.setId !== 'string' || (parsed.size !== 4 && parsed.size !== 8)) {
      return null;
    }
    return { setId: parsed.setId, size: parsed.size };
  } catch {
    return null;
  }
}

// 라우터 active 경로(/study) 판정 — legacy 직접 렌더(단위 테스트·?study=)에서는
// StudyScreen이 remount 없이 정확한 size를 들고 있어 QuestionView가 안내를 중복하지 않는다.
export function isRouterStudyPath(): boolean {
  try {
    const u = new URL(window.location.href);
    return u.pathname === '/study' && !u.searchParams.has('study');
  } catch {
    return false;
  }
}

// 부족 안내 표시 여부 — 요청 size stash가 현재 세트와 일치할 때만 표시한다 (#275 F1·r5 B1).
export function shouldShowShortageNotice(examId: string, setId: string | undefined, count: number): boolean {
  const requested = readRequestedSize(examId);
  return (
    requested !== null &&
    requested.setId === setId &&
    isRouterStudyPath() &&
    count >= DEFAULT_STUDY_SET_SIZE &&
    count < requested.size
  );
}

interface AnswerInput {
  setId: string;
  questionId: string;
  response: ItemResponse;
  previous: ItemResponse;
}

// 낙관적 UI + 실패 시 롤백 — 호출자가 onError에서 이전 값으로 복원한다.
export function useAnswerStudy(client: ApiClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AnswerInput) =>
      answerStudyItem(client, input.setId, { questionId: input.questionId, response: input.response }),
    onMutate: async (input: AnswerInput) => {
      await queryClient.cancelQueries({ queryKey: setQueryKey(input.setId) });
      const prev = queryClient.getQueryData<StudyActiveSet>(setQueryKey(input.setId));
      if (prev) {
        const items = prev.items.map((item) =>
          item.questionId === input.questionId ? { ...item, response: input.response } : item,
        );
        queryClient.setQueryData(setQueryKey(input.setId), { ...prev, items });
      }
      return { prev };
    },
    onError: (e, input, context) => {
      // 네트워크 실패(TypeError 등)는 낙관적 답안을 유지한다 — 오프라인 재전송 대기(이슈 #52). HTTP 오류는 롤백.
      if (!(e instanceof HTTPError)) return;
      const ctx = context as { prev?: StudyActiveSet } | undefined;
      if (ctx?.prev) queryClient.setQueryData(setQueryKey(input.setId), ctx.prev);
    },
    onSettled: (_d, _e, input) => {
      void queryClient.invalidateQueries({ queryKey: setQueryKey(input.setId) });
    },
  });
}

export function useSubmitStudy(client: ApiClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { setId: string; confirmUnanswered: boolean }) =>
      submitStudySet(client, input.setId, { confirmUnanswered: input.confirmUnanswered }),
    onSuccess: (set) => {
      queryClient.setQueryData(setQueryKey(set.id), set);
      void queryClient.invalidateQueries({ queryKey: STUDY_HISTORY_KEY });
      void queryClient.invalidateQueries({ queryKey: CONCEPT_CACHE_ROOT });
    },
  });
}

export function useAbandonStudy(client: ApiClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (setId: string) => abandonStudySet(client, setId),
    onSuccess: (set) => {
      queryClient.setQueryData(setQueryKey(set.id), set);
    },
  });
}
