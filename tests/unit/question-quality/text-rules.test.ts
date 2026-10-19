import { describe, expect, it } from 'vitest';
import { checkExplanationFormat, checkOptionBias, checkOptionDuplication, checkSourceUrls } from '@/domain/question-quality/rules/text';
import { makeDraft, makeOptions } from './fixtures';

// 이슈 #48 규칙 3·4·6·7 — 문제 내 중복, 선택지 길이/정보량 편향, 해설 형식, 근거 URL.
// 임계치 상수 근거는 thresholds.ts 주석과 보고서에 기록한다.

describe('checkOptionDuplication (규칙 3: 문제 내 option 텍스트 중복)', () => {
  it('양성: 서로 다른 텍스트', () => {
    expect(checkOptionDuplication(makeDraft())).toEqual([]);
  });

  it('음성: 정규화 후 동일한 텍스트(대소문자·공백 무시)', () => {
    const broken = makeOptions(['NAT Gateway', '  nat gateway  ', 'S3 버킷 정책', '보안 그룹']);
    const findings = checkOptionDuplication(makeDraft({ options: broken }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe('duplication');
  });
});

describe('checkOptionBias (규칙 4: 길이·문장 구성·정보량 편향)', () => {
  it('양성: 비슷한 길이의 선택지', () => {
    expect(checkOptionBias(makeDraft())).toEqual([]);
  });

  it('음성: 정답만 유독 긴 단서(길이 비율 임계치 초과)', () => {
    const biased = makeOptions([
      'A안: 서브넷',
      'B안: 프라이빗 서브넷에 EC2를 두고 다중 AZ로 구성한 뒤 NAT 게이트웨이를 통해 아웃바운드 트래픽을 처리한다',
      'C안: 서브넷 2',
      'D안: 서브넷 3',
    ]);
    const findings = checkOptionBias(makeDraft({ options: biased }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe('option-bias');
  });

  it('음성: 정답만 쉼표·구분점으로 상세 나열(정보량 편향)', () => {
    const biased = makeOptions([
      'A안: IAM 정책',
      'B안: S3 수명 주기 정책, 퍼블릭 액세스 차단, 암호화 설정, 버전 관리 활성화',
      'C안: IAM 그룹',
      'D안: IAM 역할',
    ]);
    const findings = checkOptionBias(makeDraft({ options: biased }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe('option-bias');
  });

  it('경계: 길이 비율이 임계치 이내(1.6 이하)면 통과', () => {
    const ok = makeOptions([
      'A안: 다중 AZ에 인스턴스를 배치해 가용성을 확보한다',
      'B안: 단일 AZ에 인스턴스를 배치해 비용을 줄인다',
      'C안: 온프레미스에 인스턴스를 배치해 직접 운영한다',
      'D안: 단일 리전에만 인스턴스를 배치해 운영한다',
    ]);
    expect(checkOptionBias(makeDraft({ options: ok }))).toEqual([]);
  });

  it('복수 정답 문제는 길이 편향 판정을 하지 않는다(단서 기준 모호)', () => {
    const biased = makeOptions([
      'A안: 서브넷',
      'B안: 프라이빗 서브넷에 EC2를 두고 다중 AZ로 구성한 뒤 NAT 게이트웨이를 통해 아웃바운드 트래픽을 처리한다',
      'C안: 서브넷 2',
      'D안: 서브넷 3',
    ]);
    expect(checkOptionBias(makeDraft({ options: biased, answerOptionIds: ['opt-1', 'opt-2'] }))).toEqual([]);
  });
});

describe('checkExplanationFormat (규칙 6: 해설 길이·형식)', () => {
  it('양성: 1~2문장 권장 범위', () => {
    expect(checkExplanationFormat(makeDraft())).toEqual([]);
    expect(
      checkExplanationFormat(
        makeDraft({ explanation: '첫째 이유다. 둘째 이유다.' }),
      ),
    ).toEqual([]);
  });

  it('양성: 3문장까지 허용(경계)', () => {
    expect(
      checkExplanationFormat(makeDraft({ explanation: '첫째다. 둘째다. 셋째다.' })),
    ).toEqual([]);
  });

  it('양성: Mermaid 펜스·인라인 코드 내부의 마침표는 문장 수에 포함하지 않는다', () => {
    const explanation = [
      '프라이빗 서브넷은 VPC 엔드포인트로 S3에 접근한다.',
      '',
      '```mermaid',
      'flowchart LR',
      '  A[EC2. 요청.] --> B[엔드포인트. 응답.]',
      '  B --> C[S3. 버킷.]',
      '```',
      '',
      '`A. B. C.` 같은 인라인 코드도 문장으로 세지 않는다.',
    ].join('\n');
    expect(checkExplanationFormat(makeDraft({ explanation }))).toEqual([]);
  });

  it('음성: 4문장 이상 과길이', () => {
    const findings = checkExplanationFormat(
      makeDraft({ explanation: '첫째다. 둘째다. 셋째다. 넷째다. 다섯째다.' }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe('explanation-format');
  });
});

describe('checkSourceUrls (규칙 7: 근거 URL 존재·형식)', () => {
  it('양성: https AWS 공식 문서 URL', () => {
    expect(checkSourceUrls(makeDraft({ sourceUrls: ['https://docs.aws.amazon.com/vpc/'] }))).toEqual([]);
  });

  it('음성: 형식 오류 URL', () => {
    const findings = checkSourceUrls(makeDraft({ sourceUrls: ['not-a-url'] }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe('source-url');
  });

  it('음성: http://(비 TLS) 근거 URL', () => {
    expect(checkSourceUrls(makeDraft({ sourceUrls: ['http://docs.aws.amazon.com/'] }))).toHaveLength(1);
  });

  it('규칙 주석: URL 유효성만으로 정답 타당성을 보장하지 않는다(리포트에 기록됨)', () => {
    const report = checkSourceUrls(makeDraft({ sourceUrls: ['https://example.com/unrelated'] }));
    expect(report).toEqual([]); // 형식은 유효 — 타당성 판단은 자동 검수 범위 밖(ADR-0019)
  });
});
