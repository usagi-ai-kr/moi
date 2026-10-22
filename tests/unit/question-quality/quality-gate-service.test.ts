import { describe, expect, it } from 'vitest';
import { generateAndCheck } from '@/app/question-quality/quality-gate-service';
import type { QuestionGenerator } from '@/app/question-quality/ports';
import { domainFor, makeDraft, rotateAnswerIndex } from './fixtures';

// 이슈 #48 — QuestionGenerator Port(초안 생성, AI provider는 fake만)와 QualityGate orchestration.

function fakeGenerator(count: number, defectAt?: number): QuestionGenerator {
  return {
    async generateDrafts({ count: requested }) {
      const n = Math.min(requested, count);
      // makeDraft의 전역 seq 의존 없이 인덱스 기반 결정적 보기 텍스트를 만든다.
      const drafts = Array.from({ length: n }, (_, i) =>
        makeDraft({
          id: `gen-${i}`,
          stem: `생성된 문제 ${i}번: 서로 다른 본문 (변형 ${i})`,
          domain: domainFor(i, count),
          optionTexts: [
            `A안 gen-${i}: 퍼블릭 서브넷에 배치`,
            `B안 gen-${i}: 프라이빗 서브넷에 배치`,
            `C안 gen-${i}: 전용 호스트에 배치`,
            `D안 gen-${i}: 온프레미스에 배치`,
          ],
        }),
      );
      if (defectAt !== undefined && drafts[defectAt] !== undefined) {
        drafts[defectAt] = { ...drafts[defectAt], stem: '   ' };
      }
      return rotateAnswerIndex(drafts);
    },
  };
}

describe('generateAndCheck (QualityGate orchestration)', () => {
  it('fake generator 초안 → 검수 리포트 반환(drafts+report)', async () => {
    const result = await generateAndCheck({ generator: fakeGenerator(100) }, { count: 100 });

    expect(result.drafts).toHaveLength(100);
    expect(result.report.pass).toBe(true);
    expect(result.report.passedCount).toBe(100);
  });

  it('결함 초안은 리포트에서 실패로 기록된다', async () => {
    const result = await generateAndCheck({ generator: fakeGenerator(100, 7) }, { count: 100 });

    expect(result.report.pass).toBe(false);
    expect(result.report.failedCount).toBe(1);
    const failed = result.report.results.find((r) => r.questionId === 'gen-7');
    expect(failed?.pass).toBe(false);
  });

  it(' Port 계약: 같은 호출 결과는 결정적이다', async () => {
    const generator = fakeGenerator(50);
    const first = await generator.generateDrafts({ count: 50 });
    const second = await generator.generateDrafts({ count: 50 });

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
