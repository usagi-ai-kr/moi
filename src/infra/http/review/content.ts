import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { questionOptions, questionVersions } from '@/infra/persistence/schema';

/**
 * 복습 문항 내용 로더 (#130).
 * - 회차 스냅샷의 questionVersionId에서 stem·해설·근거·보기를 조회한다.
 * - inArray는 90개 chunk로 나눈다(D1 바인드 상한 회귀 방지).
 */
const CHUNK = 90;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface VersionContent {
  readonly questionId: string;
  readonly stem: string;
  readonly explanation: string;
  readonly sourceUrls: readonly string[];
  readonly options: ReadonlyArray<{ readonly optionId: string; readonly text: string }>;
}

export async function loadVersionContents(
  db: D1Database,
  versionIds: readonly string[],
): Promise<Map<string, VersionContent>> {
  const d1 = drizzle(db);
  const versions: Array<typeof questionVersions.$inferSelect> = [];
  for (const ids of chunk(versionIds, CHUNK)) {
    if (ids.length === 0) continue;
    const rows = await d1.select().from(questionVersions).where(inArray(questionVersions.id, [...ids]));
    versions.push(...rows);
  }
  const options: Array<typeof questionOptions.$inferSelect> = [];
  for (const ids of chunk(versionIds, CHUNK)) {
    if (ids.length === 0) continue;
    const rows = await d1.select().from(questionOptions).where(inArray(questionOptions.questionVersionId, [...ids]));
    options.push(...rows);
  }
  const byVersion = new Map<string, Array<{ optionId: string; text: string; key: string }>>();
  for (const o of options) {
    const list = byVersion.get(o.questionVersionId) ?? [];
    list.push({ optionId: o.id, text: o.text, key: o.optionKey });
    byVersion.set(o.questionVersionId, list);
  }
  const out = new Map<string, VersionContent>();
  for (const v of versions) {
    const opts = (byVersion.get(v.id) ?? []).sort((a, b) => (a.key < b.key ? -1 : 1));
    out.set(v.id, {
      questionId: v.questionId,
      stem: v.stem,
      explanation: v.explanation,
      sourceUrls: [...v.sourceUrls],
      options: opts.map((o) => ({ optionId: o.optionId, text: o.text })),
    });
  }
  return out;
}
