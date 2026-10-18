import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HTTPError } from 'ky';
import {
  abandonStudySet,
  answerStudyItem,
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
    mutationFn: (input: { examId: string; mode: StudyMode; domainId?: string }) => startStudySet(client, input),
    onSuccess: (set: StudyActiveSet) => {
      queryClient.setQueryData(setQueryKey(set.id), set);
    },
  });
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
