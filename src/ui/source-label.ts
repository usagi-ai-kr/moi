// 근거 URL → 문서명 라벨 (#188). 전체 URL은 href/title에만 두고 화면에는 사람이 읽는 이름을 노출한다.
// 콘텐츠 JSON·DB는 바꾸지 않고 URL만으로 라벨을 파생한다.

/** path 마지막 세그먼트를 디코드·공백화·확장자 제거 후 첫 글자만 대문자로 만든다. */
export function sourceLabel(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  const segment = url.pathname.split('/').filter(Boolean).at(-1);
  if (!segment) return url.hostname || rawUrl;

  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    decoded = segment;
  }

  const words = decoded
    .replace(/\.(?:html?|pdf)$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  if (!words) return url.hostname || rawUrl;

  return words.charAt(0).toUpperCase() + words.slice(1);
}
