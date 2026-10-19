import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { copy } from '../copy';

interface ReviewSummaryProps {
  readonly summary: {
    readonly total: number;
    readonly graded: number;
    readonly pending: number;
    readonly correct: number;
  };
  readonly onBackToCandidates: () => void;
}

export function ReviewSummary({ summary, onBackToCandidates }: ReviewSummaryProps) {
  return (
    <section aria-label="복습 종료 요약" className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold">{copy.review.endedTitle}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-base text-foreground">
            {copy.review.endedSummary(summary.total, summary.graded)}
          </p>
          <dl className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-4 sm:grid-cols-4">
            <div className="flex flex-col">
              <dt className="text-xs text-muted-foreground">전체 문항</dt>
              <dd className="text-lg font-bold">{summary.total}개</dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-xs text-muted-foreground">풀이 완료</dt>
              <dd className="text-lg font-bold text-primary">{summary.graded}개</dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-xs text-muted-foreground">정답</dt>
              <dd className="text-lg font-bold text-success">{summary.correct}개</dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-xs text-muted-foreground">미풀이</dt>
              <dd className="text-lg font-bold text-muted-foreground">{summary.pending}개</dd>
            </div>
          </dl>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              variant="primary"
              onClick={onBackToCandidates}
              className="min-h-[44px] px-6 text-base"
            >
              목록으로 돌아가기
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
