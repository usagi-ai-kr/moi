// #353 시험 전체 진척도 문구 — copy.ts에서 중앙 copy 객체로 노출한다.
const percentage = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)}%`;

export const examProgressCopy = {
  loading: (label: string) => `${label} 학습 진척도 불러오는 중`,
  unavailable: (label: string) => `${label} 학습 진척도를 표시할 수 없습니다`,
  value: percentage,
  ariaLabel: (label: string, percent: number) => `${label} 학습 진척도 ${percentage(percent).replace('%', '퍼센트')}`,
} as const;
