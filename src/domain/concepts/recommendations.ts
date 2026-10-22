export interface ConceptDefinitionSummary {
  readonly id: string;
  readonly title: string;
}

export interface ConceptSignal {
  readonly questionId: string;
  readonly conceptIds: readonly string[];
  readonly validWrongCount: number;
  readonly lastWrongAt: number | null;
  readonly bookmarked: boolean;
}

export interface ConceptRecommendation {
  readonly conceptId: string;
  readonly title: string;
  readonly score: number;
  readonly relatedQuestionCount: number;
  readonly wrongQuestionCount: number;
  readonly recentWrongQuestionCount: number;
  readonly bookmarkQuestionCount: number;
  readonly reason: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WRONG_COUNT_CAP = 3;

function normalizeSignal(signal: ConceptSignal): ConceptSignal {
  return {
    ...signal,
    conceptIds: [...new Set(signal.conceptIds)],
    validWrongCount: Number.isFinite(signal.validWrongCount) ? Math.max(0, Math.floor(signal.validWrongCount)) : 0,
    lastWrongAt: Number.isFinite(signal.lastWrongAt) ? signal.lastWrongAt : null,
  };
}

function mergeSignals(signals: readonly ConceptSignal[]): Map<string, ConceptSignal> {
  const byQuestion = new Map<string, ConceptSignal>();
  for (const raw of signals) {
    const signal = normalizeSignal(raw);
    const previous = byQuestion.get(signal.questionId);
    if (!previous) {
      byQuestion.set(signal.questionId, signal);
      continue;
    }
    const conceptIds = [...new Set([...previous.conceptIds, ...signal.conceptIds])];
    const wrongTimes = [previous.lastWrongAt, signal.lastWrongAt].filter((value): value is number => value !== null);
    byQuestion.set(signal.questionId, {
      questionId: signal.questionId,
      conceptIds,
      validWrongCount: Math.max(previous.validWrongCount, signal.validWrongCount),
      lastWrongAt: wrongTimes.length ? Math.max(...wrongTimes) : null,
      bookmarked: previous.bookmarked || signal.bookmarked,
    });
  }
  return byQuestion;
}

function recencyPoints(lastWrongAt: number | null, now: number): number {
  if (lastWrongAt === null || lastWrongAt > now) return 0;
  const ageDays = (now - lastWrongAt) / DAY_MS;
  if (ageDays <= 7) return 3;
  if (ageDays <= 30) return 2;
  if (ageDays <= 90) return 1;
  return 0;
}

/** 같은 사용자·시험의 오답/북마크 문항을 한 번씩만 점수화해 재현 가능한 Top 16을 만든다. */
export function rankConceptRecommendations(
  concepts: readonly ConceptDefinitionSummary[],
  signals: readonly ConceptSignal[],
  now: number,
  limit = 16,
): ConceptRecommendation[] {
  const known = new Map(concepts.map((concept) => [concept.id, concept]));
  const totals = new Map<string, {
    score: number;
    relatedQuestionCount: number;
    wrongQuestionCount: number;
    recentWrongQuestionCount: number;
    bookmarkQuestionCount: number;
  }>();

  for (const signal of mergeSignals(signals).values()) {
    if (signal.validWrongCount === 0 && !signal.bookmarked) continue;
    for (const conceptId of signal.conceptIds) {
      if (!known.has(conceptId)) continue;
      const row = totals.get(conceptId) ?? {
        score: 0,
        relatedQuestionCount: 0,
        wrongQuestionCount: 0,
        recentWrongQuestionCount: 0,
        bookmarkQuestionCount: 0,
      };
      const recency = recencyPoints(signal.lastWrongAt, now);
      const recentWrong =
        signal.lastWrongAt !== null && signal.lastWrongAt <= now && now - signal.lastWrongAt <= 30 * DAY_MS;
      row.relatedQuestionCount += 1;
      row.wrongQuestionCount += Number(signal.validWrongCount > 0);
      row.recentWrongQuestionCount += Number(recentWrong && signal.validWrongCount > 0);
      row.bookmarkQuestionCount += Number(signal.bookmarked);
      row.score += Math.min(signal.validWrongCount, WRONG_COUNT_CAP) * 2 + recency + Number(signal.bookmarked) * 2;
      totals.set(conceptId, row);
    }
  }

  const ranked = [...totals.entries()].map(([conceptId, counts]) => {
    const concept = known.get(conceptId)!;
    const reasons = [
      counts.wrongQuestionCount > 0 ? `오답 ${counts.wrongQuestionCount}문항` : '',
      counts.recentWrongQuestionCount > 0 ? `최근 오답 ${counts.recentWrongQuestionCount}문항` : '',
      counts.bookmarkQuestionCount > 0 ? `북마크 ${counts.bookmarkQuestionCount}문항` : '',
    ].filter(Boolean);
    return {
      conceptId,
      title: concept.title,
      ...counts,
      reason: reasons.join(' · '),
    };
  });

  ranked.sort((a, b) =>
    b.score - a.score ||
    b.relatedQuestionCount - a.relatedQuestionCount ||
    (a.conceptId < b.conceptId ? -1 : a.conceptId > b.conceptId ? 1 : 0),
  );
  return ranked.slice(0, Math.max(0, Math.min(16, Math.floor(limit))));
}
