import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { copy } from '../copy';
import type { HistoryTab } from './history-tab-state';
import './history.css';

// 학습 현황 하위 탭 호스트 — tablist/tab/tabpanel + URL 연동은 HistoryPage가 소유한다 (#224).
// 비활성 패널은 마운트하지 않는다 (TabsContent가 null 반환).
export function HistoryTabs({
  value,
  onChange,
  summary,
  domains,
  completed,
}: {
  value: HistoryTab;
  onChange: (t: HistoryTab) => void;
  summary: ReactNode;
  domains: ReactNode;
  completed: ReactNode;
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as HistoryTab)}>
      <TabsList label={copy.history.tablistLabel}>
        <TabsTrigger value="summary">{copy.history.tabSummary}</TabsTrigger>
        <TabsTrigger value="domains">{copy.history.tabDomains}</TabsTrigger>
        <TabsTrigger value="completed">{copy.history.tabCompleted}</TabsTrigger>
      </TabsList>
      <TabsContent value="summary" label={copy.history.tabSummary}>
        {summary}
      </TabsContent>
      <TabsContent value="domains" label={copy.history.tabDomains}>
        {domains}
      </TabsContent>
      <TabsContent value="completed" label={copy.history.tabCompleted}>
        {completed}
      </TabsContent>
    </Tabs>
  );
}
