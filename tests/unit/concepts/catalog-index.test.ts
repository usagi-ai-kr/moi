import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONCEPT_QUESTION_INDEX } from '@/infra/persistence/concept-question-index';

const ROOT = process.cwd();

function fingerprint(stem: string): string {
  const normalized = stem.trim().replace(/\s+/g, ' ').toLowerCase();
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

describe('검수 개념 카탈로그 연결 (#329)', () => {
  it('정적 인덱스는 모든 실사용 문제 팩과 일치하며 개념 문서에 매핑한다', () => {
    const catalog = JSON.parse(readFileSync(join(ROOT, 'content/concepts/saa-c03/catalog.json'), 'utf8')) as {
      concepts: Array<{ id: string; packId: string; reviewStatus: string; reviewedAt: string | null; sourceUrls: string[] }>;
    };
    const byPack = new Map(catalog.concepts.map((concept) => [concept.packId, concept]));
    let questions = 0;

    for (const file of globSync('content/questions/saa-c03/*.json', { cwd: ROOT, exclude: ['content/questions/saa-c03/sample-pack.json'] })) {
      const pack = JSON.parse(readFileSync(join(ROOT, file), 'utf8')) as {
        packId: string;
        items: Array<{ questionId: string; stem: string; domainCode: string }>;
      };
      const concept = byPack.get(pack.packId);
      expect(concept, `${pack.packId} 개념 문서`).toBeDefined();
      for (const item of pack.items) {
        const mapped = CONCEPT_QUESTION_INDEX[fingerprint(item.stem)];
        expect(mapped).toMatchObject({
          sourceQuestionId: item.questionId,
          examCode: 'saa-c03',
          domainCode: item.domainCode,
          conceptId: concept?.id,
        });
        questions += 1;
      }
    }

    expect(catalog.concepts.length).toBeGreaterThanOrEqual(20);
    expect(catalog.concepts.every((concept) => concept.reviewStatus === 'reviewed' && concept.reviewedAt === '2026-10-22')).toBe(true);
    expect(Object.keys(CONCEPT_QUESTION_INDEX)).toHaveLength(questions);
    expect(catalog.concepts.every((concept) => concept.sourceUrls.length > 0 && concept.sourceUrls.every((url) => url.startsWith('https://docs.aws.amazon.com/')))).toBe(true);
  });

  it('인덱스 생성물이 문제 팩에서 재현된다', () => {
    expect(execFileSync(process.execPath, ['scripts/generate-concept-question-index.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' })).toContain('fingerprint 일치');
  });
});
