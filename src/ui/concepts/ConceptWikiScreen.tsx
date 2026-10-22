import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { ApiClient } from '../api/client';
import { useExamScope } from '../exam/ExamScopeProvider';
import { useConceptDetail, useConceptRecommendations } from './queries';
import { conceptCopy } from './concept-copy';
import './concepts.css';
import './concept-details.css';

function reviewHref(searchParams: URLSearchParams, mode: 'wrong' | 'bookmark'): string {
  const params = new URLSearchParams(searchParams);
  params.set('mode', mode);
  return `/review?${params.toString()}`;
}

export function ConceptWikiScreen({ client, userId }: { client: ApiClient; userId: string }) {
  const { examId } = useExamScope();
  const [searchParams] = useSearchParams();
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const recommendationsQuery = useConceptRecommendations(client, examId, userId);
  const detailQuery = useConceptDetail(client, examId, userId, selectedConceptId);

  useEffect(() => {
    setSelectedConceptId(null);
  }, [examId]);

  return (
    <section className="moi-page moi-concept-wiki" aria-labelledby="moi-concept-title">
      <header className="moi-concept-header">
        <h1 id="moi-concept-title" className="moi-title">{conceptCopy.title}</h1>
        <p className="moi-lead">{conceptCopy.lead}</p>
      </header>

      {recommendationsQuery.isPending ? (
        <p className="moi-concept-status" role="status" aria-live="polite">{conceptCopy.loading}</p>
      ) : recommendationsQuery.isError ? (
        <div className="moi-concept-error" role="alert">
          <p>{conceptCopy.loadFailed}</p>
          <button type="button" className="moi-study-link" onClick={() => void recommendationsQuery.refetch()}>
            {conceptCopy.retry}
          </button>
        </div>
      ) : recommendationsQuery.data.items.length === 0 ? (
        <section className="moi-concept-empty" aria-label={conceptCopy.emptyTitle}>
          <h2>{conceptCopy.emptyTitle}</h2>
          <p>{recommendationsQuery.data.reviewedContentAvailable ? conceptCopy.emptyDescription : conceptCopy.unsupportedDescription}</p>
          <p className="moi-note">{conceptCopy.evidenceNote}</p>
        </section>
      ) : (
        <div className="moi-concept-layout">
          <nav className="moi-concept-index" aria-label={conceptCopy.contents}>
            <h2 className="moi-concept-section-title">{conceptCopy.contents}</h2>
            <ol className="moi-concept-list">
              {recommendationsQuery.data.items.map((item, index) => (
                <li key={item.conceptId}>
                  <button
                    type="button"
                    className="moi-concept-choice"
                    aria-pressed={selectedConceptId === item.conceptId}
                    onClick={() => setSelectedConceptId(item.conceptId)}
                  >
                    <span className="moi-concept-choice-heading">
                      <span className="moi-concept-rank" aria-hidden="true">{index + 1}</span>
                      <span className="moi-concept-choice-title">{item.title}</span>
                    </span>
                    <span className="moi-concept-choice-reason"><span>{conceptCopy.reason}: </span>{item.reason}</span>
                    <span className="moi-concept-choice-count">{conceptCopy.relatedCount(item.relatedQuestionCount)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <div className="moi-concept-detail-region" aria-live="polite" aria-busy={detailQuery.isFetching}>
            {selectedConceptId === null ? (
              <p className="moi-concept-placeholder">{conceptCopy.emptyDescription}</p>
            ) : detailQuery.isPending ? (
              <p className="moi-concept-status" role="status">{conceptCopy.detailLoading}</p>
            ) : detailQuery.isError ? (
              <div className="moi-concept-error" role="alert">
                <p>{conceptCopy.detailFailed}</p>
                <button type="button" className="moi-study-link" onClick={() => void detailQuery.refetch()}>
                  {conceptCopy.retry}
                </button>
              </div>
            ) : detailQuery.data ? (
              <article className="moi-concept-document">
                <h2>{detailQuery.data.title}</h2>
                <section aria-labelledby="moi-concept-summary-title">
                  <h3 id="moi-concept-summary-title">{conceptCopy.summary}</h3>
                  <p>{detailQuery.data.summary}</p>
                </section>

                <section aria-labelledby="moi-concept-confusions-title">
                  <h3 id="moi-concept-confusions-title">{conceptCopy.confusions}</h3>
                  <dl className="moi-concept-comparisons">
                    {detailQuery.data.confusions.map((confusion) => (
                      <div className="moi-concept-comparison" key={confusion.term}>
                        <dt>{confusion.term} <span aria-hidden="true">↔</span> {confusion.with}</dt>
                        <dd>{confusion.difference}</dd>
                      </div>
                    ))}
                  </dl>
                </section>

                <section aria-labelledby="moi-concept-sources-title">
                  <h3 id="moi-concept-sources-title">{conceptCopy.sources}</h3>
                  <ul className="moi-concept-sources">
                    {detailQuery.data.sourceUrls.map((url, index) => (
                      <li key={url}>
                        <a href={url} target="_blank" rel="noreferrer">
                          {conceptCopy.sourceLink(index + 1)}
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="moi-concept-related" aria-labelledby="moi-concept-related-title">
                  <h3 id="moi-concept-related-title">{conceptCopy.relatedQuestions}</h3>
                  {detailQuery.data.relatedQuestions.length === 0 ? (
                    <p>{conceptCopy.noRelatedQuestions}</p>
                  ) : (
                    <>
                      <details>
                        <summary>{conceptCopy.relatedQuestionCount(detailQuery.data.relatedQuestions.length)}</summary>
                        <ol className="moi-concept-question-list">
                          {detailQuery.data.relatedQuestions.map((question, index) => (
                            <li key={`${index}-${question.stem}`}>
                              <p>{question.stem}</p>
                              <ul className="moi-concept-signal-list">
                                {question.hasWrongHistory ? <li>{conceptCopy.wrongHistory}</li> : null}
                                {question.bookmarked ? <li>{conceptCopy.bookmarked}</li> : null}
                              </ul>
                            </li>
                          ))}
                        </ol>
                      </details>
                      <div className="moi-concept-actions">
                        {detailQuery.data.relatedQuestions.some((question) => question.hasWrongHistory) ? (
                          <Link className="moi-study-link" to={reviewHref(searchParams, 'wrong')}>{conceptCopy.wrongReview}</Link>
                        ) : null}
                        {detailQuery.data.relatedQuestions.some((question) => question.bookmarked) ? (
                          <Link className="moi-study-link" to={reviewHref(searchParams, 'bookmark')}>{conceptCopy.bookmarkReview}</Link>
                        ) : null}
                      </div>
                    </>
                  )}
                </section>
              </article>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
