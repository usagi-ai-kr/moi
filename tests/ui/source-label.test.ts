import { describe, expect, it } from 'vitest';
import { sourceLabel } from '../../src/ui/source-label';

describe('sourceLabel', () => {
  it('AWS 문서 URL의 마지막 path를 문서명으로 만든다 (#188)', () => {
    expect(
      sourceLabel('https://docs.aws.amazon.com/global-accelerator/latest/dg/what-is-global-accelerator.html'),
    ).toBe('What is global accelerator');
  });

  it('루트 URL은 hostname으로 대체한다', () => {
    expect(sourceLabel('https://docs.aws.amazon.com/')).toBe('docs.aws.amazon.com');
    expect(sourceLabel('https://docs.aws.amazon.com')).toBe('docs.aws.amazon.com');
  });

  it('query·hash는 라벨에 넣지 않는다', () => {
    expect(sourceLabel('https://docs.aws.amazon.com/ec2/index.html?ref=nav#concepts')).toBe('Index');
  });

  it('인코딩된 path를 디코드하고 -/_를 공백으로 바꾼다', () => {
    expect(
      sourceLabel('https://docs.aws.amazon.com/%ED%95%9C%EA%B8%80-%EB%AC%B8%EC%84%9C.html'),
    ).toBe('한글 문서');
    expect(sourceLabel('https://docs.aws.amazon.com/vpc/what_is_a_vpc.pdf')).toBe('What is a vpc');
  });

  it('확장자가 없거나 trailing slash여도 마지막 문서 세그먼트를 쓴다', () => {
    expect(sourceLabel('https://docs.aws.amazon.com/s3/pricing')).toBe('Pricing');
    expect(sourceLabel('https://docs.aws.amazon.com/vpc/')).toBe('Vpc');
    expect(sourceLabel('https://docs.aws.amazon.com/ec2/index.htm')).toBe('Index');
  });

  it('파싱할 수 없는 URL은 원문을 그대로 돌려준다', () => {
    expect(sourceLabel('not-a-url')).toBe('not-a-url');
    expect(sourceLabel('')).toBe('');
  });
});
