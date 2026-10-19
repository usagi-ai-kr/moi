// #134 SAA-C03 500문항 전체 품질 게이트 — 콘텐츠가 준비되면 자동 실행, 그 전에는 skip.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runQualityGate } from '@/domain/question-quality/quality-gate';
import type { QuestionDraft, QualityReport, SaaDomain } from '@/domain/question-quality/types';

const CONTENT_DIR = fileURLToPath(new URL('../../../content/questions/saa-c03', import.meta.url));
const SAMPLE_PACK_FILE = 'sample-pack.json';

interface RawOption {
  readonly optionKey: string;
  readonly text: string;
}

interface RawItem {
  readonly questionId: string;
  readonly domainCode: SaaDomain;
  readonly stem: string;
  readonly explanation: string;
  readonly sourceUrls: readonly string[];
  readonly answerOptionKeys: readonly string[];
  readonly options: readonly RawOption[];
}

interface RawPack {
  readonly packId: string;
  readonly examCode: string;
  readonly items: readonly RawItem[];
}

/** 콘텐츠 작성 계약(item) → 품질 게이트 입력(draft) 변환. */
function toDraft(item: RawItem): QuestionDraft {
  return {
    id: item.questionId,
    exam: 'AWS-SAA-C03',
    domain: item.domainCode,
    stem: item.stem,
    options: item.options.map((option) => ({ id: option.optionKey, text: option.text })),
    answerOptionIds: item.answerOptionKeys,
    explanation: item.explanation,
    sourceUrls: item.sourceUrls,
  };
}

function readPack(file: string): RawPack {
  return JSON.parse(readFileSync(join(CONTENT_DIR, file), 'utf8')) as RawPack;
}

/** 500문항 집계 대상 팩. 예시 팩(sample-pack.json)은 수업 사용 금지 예시이므로 제외한다. */
function contentPackFiles(): string[] {
  return readdirSync(CONTENT_DIR)
    .filter((file) => file.endsWith('.json') && file !== SAMPLE_PACK_FILE)
    .sort();
}

/** 실패한 문제·배치 위반을 사람이 읽을 수 있는 형태로 출력한다. */
function failureDetails(report: QualityReport): string {
  const questions = report.results
    .filter((result) => !result.pass)
    .map((result) => `${result.questionId}: ${result.findings.map((f) => `${f.checkId} — ${f.reason}`).join(' / ')}`);
  const batches = report.batchFindings.map((finding) => `batch ${finding.checkId} — ${finding.reason}`);
  const lines = [...questions, ...batches];
  return lines.length === 0 ? '(위반 없음)' : `\n${lines.join('\n')}`;
}

const packFiles = contentPackFiles();
const drafts = packFiles.flatMap((file) => readPack(file).items.map(toDraft));
const contentReady = packFiles.length >= 20 && drafts.length === 500;

if (!contentReady) {
  console.warn(
    `[content-quality] 500문항 품질 게이트 skip — 팩 ${packFiles.length}개(>=20 필요), 문항 ${drafts.length}개(=500 필요)`,
  );
}

const describeFullBatch = contentReady ? describe : describe.skip;

describeFullBatch('Given 500문항 콘텐츠 / When 품질 게이트 실행 / Then 전량 통과', () => {
  it('문제 단위·배치 단위 검사를 모두 통과하고 영역 분포가 150/130/120/100이다', () => {
    const report = runQualityGate(drafts);
    const details = failureDetails(report);
    expect(report.pass, `품질 게이트 실패:${details}`).toBe(true);
    expect(report.passedCount, `통과 문항 수 불일치:${details}`).toBe(500);
    expect(report.failedCount, `실패 문항 수 불일치:${details}`).toBe(0);
    expect(report.domainCounts).toEqual({
      security: 150,
      resilience: 130,
      performance: 120,
      'cost-optimization': 100,
    });
  });
});

describe('toDraft 매핑', () => {
  it('sample-pack 첫 문항을 QuestionDraft 계약 필드로 변환한다', () => {
    const item = readPack(SAMPLE_PACK_FILE).items[0];
    expect(toDraft(item)).toEqual({
      id: 'saa-sample-0001',
      exam: 'AWS-SAA-C03',
      domain: 'resilience',
      stem: '예시 문항(수업 사용 금지): 다중 AZ에 걸친 상태 비저장 웹 계층의 가용성을 높이기 위해 가장 적절한 구성은?',
      options: [
        { id: 'A', text: '단일 AZ에 고정된 단일 EC2 인스턴스로 운영한다.' },
        { id: 'B', text: 'ALB 뒤에 여러 AZ에 걸친 Auto Scaling 그룹을 둔다.' },
        { id: 'C', text: '모든 상태를 웹 서버 로컬 디스크에만 저장한다.' },
        { id: 'D', text: '수동으로 스냅샷을 복사하는 절차에만 의존한다.' },
      ],
      answerOptionIds: ['B'],
      explanation: '구조 예시용 해설이다. ALB 뒤에 여러 AZ의 Auto Scaling 그룹을 두면 AZ 장애에 대응할 수 있다.',
      sourceUrls: ['https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html'],
    });
  });
});
