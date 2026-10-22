import { copy } from '../copy';
import type { ApiClient, StudyPerItem, StudySubmittedItem } from '../api/client';
import { BookmarkButton } from '../review/BookmarkButton';
import { SourceLinks } from '../SourceLinks';
import { Explanation } from './Explanation';
import { ReportButton } from './ReportButton';

interface Props {
  client: ApiClient;
  examId: string;
  index: number;
  perItem: StudyPerItem;
  content: StudySubmittedItem | undefined;
}

// 응답 원시 kind → 화면 라벨 (#148).
const RESPONSE_KIND_LABEL: Record<string, string> = { answered: '응답', pass: 'Pass', unanswered: '미응답' };

// optionId → 해당 문항 optionOrder 기준 보기 번호. 매칭 실패 시 id 대신 '?' (#148).
function optionNumbers(item: StudySubmittedItem | undefined, ids: string[]): string {
  return ids.map((id) => {
    const index = item?.optionOrder.indexOf(id) ?? -1;
    return index >= 0 ? String(index + 1) : '?';
  }).join(', ');
}

// 결과 문항 상세 한 건 — 정보(dl)·액션(북마크/신고)·해설/근거를 의미 단위 그룹으로 분리한다(#232).
// 상태 문구와 액션 버튼을 같은 줄에 끼우지 않고 그룹 사이 vertical spacing을 둔다.
export function ResultItemDetail({ client, examId, index, perItem, content }: Props) {
  return (
    <li key={perItem.questionId} data-testid={`peritem-${perItem.questionId}`}>
      <dl className="moi-study-meta" aria-label={copy.study.itemInfo}>
        <div>
          <dt>문항</dt>
          <dd>{index + 1}</dd>
        </div>
        <div>
          <dt>채점</dt>
          <dd>{perItem.correct ? '정답' : '오답'}</dd>
        </div>
        <div>
          <dt>응답</dt>
          <dd>{RESPONSE_KIND_LABEL[perItem.responseKind] ?? '—'}</dd>
        </div>
        <div>
          <dt>선택</dt>
          <dd>{perItem.selectedOptionIds.length ? optionNumbers(content, perItem.selectedOptionIds) : '없음'}</dd>
        </div>
        <div>
          <dt>정답</dt>
          <dd>{perItem.correctOptionIds ? optionNumbers(content, perItem.correctOptionIds) : '비공개'}</dd>
        </div>
      </dl>
      {content && (
        <div className="moi-study-item-actions" role="group" aria-label={copy.study.itemActions}>
          <BookmarkButton client={client} examId={examId} questionId={perItem.questionId} />
          <ReportButton
            client={client}
            questionId={content.questionId}
            questionVersionId={content.questionVersionId}
          />
        </div>
      )}
      {content && (
        <>
          <div className="moi-note">
            <span>{copy.study.explanation}: </span>
            <Explanation markdown={content.explanation || '—'} />
          </div>
          {content.sourceUrls && content.sourceUrls.length > 0 && (
            <div className="moi-study-sources">
              <span className="moi-study-sources-label">{copy.study.sources}</span>
              <SourceLinks urls={content.sourceUrls} />
            </div>
          )}
        </>
      )}
    </li>
  );
}
