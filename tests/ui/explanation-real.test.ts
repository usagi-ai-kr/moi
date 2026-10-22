import { describe, expect, it } from 'vitest';
import { renderPeleDiagram } from '../../src/ui/study/diagram-pele';

// 실제 Pele 출력 → sanitize 회귀. pele/lazy를 mock하지 않는다.
// viewBox 혼합대소문자 버그 수정 전에는 실제 출력이 null로 떨어졌다(Red).
describe('renderPeleDiagram real Pele', () => {
  it('flowchart 실제 출력을 통과시킨다', async () => {
    const out = await renderPeleDiagram({
      code: 'flowchart LR\n  A[Hello] --> B[World]',
      idPrefix: 'real-flow',
      maxWidth: 375,
    });
    expect(out).not.toBeNull();
    expect(out?.svg ?? '').toContain('<svg');
    expect(out?.svg ?? '').toContain('viewBox');
    expect(out?.svg.toLowerCase() ?? '').not.toContain('<script');
    expect(out?.svg ?? '').not.toContain('foreignObject');
    expect(out?.svg ?? '').not.toContain('onload=');
  });

  it('sequence 실제 출력을 통과시킨다', async () => {
    const out = await renderPeleDiagram({
      code: 'sequenceDiagram\n  participant A as Alice\n  A->>B: Hi',
      idPrefix: 'real-seq',
      maxWidth: 320,
    });
    expect(out).not.toBeNull();
    expect(out?.diagramType).toBe('sequence');
  });

  it('이슈 #335 한글 presigned URL 시퀀스의 실제 출력을 통과시킨다', async () => {
    const out = await renderPeleDiagram({
      code: [
        'sequenceDiagram',
        '  participant App as 모바일 앱',
        '  participant API as 애플리케이션',
        '  participant S3 as S3',
        '  App->>API: 업로드 URL 요청',
        '  API-->>App: presigned URL 응답',
        '  App->>S3: presigned URL로 파일 업로드',
        '  S3-->>App: 업로드 완료',
      ].join('\n'),
      idPrefix: 'issue-335-seq',
      maxWidth: 320,
    });
    expect(out).not.toBeNull();
    expect(out?.diagramType).toBe('sequence');
    expect(out?.svg ?? '').toContain('<svg');
  });

  it('accTitle·accDescr 실제 출력을 통과시킨다', async () => {
    const out = await renderPeleDiagram({
      code: 'flowchart LR\n  accTitle: My Title\n  accDescr: My desc\n  A-->B',
      idPrefix: 'real-acc',
    });
    expect(out).not.toBeNull();
    expect(out?.svg ?? '').toContain('<title');
    expect(out?.svg ?? '').toContain('My Title');
  });
});
