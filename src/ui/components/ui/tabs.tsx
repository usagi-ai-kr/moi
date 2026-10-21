import { createContext, useCallback, useContext, useId, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

// 의존성 0 Tabs primitive (#224 — @radix-ui/react-tabs 미도입, shadcn API 형태).
// WAI-ARIA APG 자동 활성화: ArrowLeft/Right/Up/Down 이동+활성, Home/End, roving tabindex.

interface TabsContextValue {
  value: string;
  onValueChange: (v: string) => void;
  baseId: string;
  registerOrder: (v: string) => void;
  orderRef: React.MutableRefObject<string[]>;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('Tabs compound components must be used inside <Tabs>');
  return ctx;
}

export function tabId(baseId: string, value: string): string {
  return `${baseId}-tab-${value}`;
}

export function panelId(baseId: string, value: string): string {
  return `${baseId}-panel-${value}`;
}

export function Tabs({
  value,
  onValueChange,
  children,
}: {
  value: string;
  onValueChange: (v: string) => void;
  children: ReactNode;
}) {
  const baseId = useId();
  const orderRef = useRef<string[]>([]);
  const registerOrder = useCallback((v: string) => {
    if (!orderRef.current.includes(v)) orderRef.current.push(v);
  }, []);
  return (
    <TabsContext.Provider value={{ value, onValueChange, baseId, registerOrder, orderRef }}>
      {children}
    </TabsContext.Provider>
  );
}

export function TabsList({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="moi-tabs-list">
      {children}
    </div>
  );
}

function focusTab(baseId: string, value: string): void {
  document.getElementById(tabId(baseId, value))?.focus();
}

export function TabsTrigger({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  const { value: active, onValueChange, baseId, registerOrder, orderRef } = useTabsContext();
  registerOrder(value);
  const selected = active === value;

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const order = orderRef.current;
    const idx = order.indexOf(value);
    if (idx === -1) return;
    let next: string | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      next = order[(idx + 1) % order.length];
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      next = order[(idx - 1 + order.length) % order.length];
    } else if (e.key === 'Home') {
      next = order[0];
    } else if (e.key === 'End') {
      next = order[order.length - 1];
    }
    if (next !== null) {
      e.preventDefault();
      onValueChange(next);
      focusTab(baseId, next);
    }
  };

  return (
    <button
      type="button"
      role="tab"
      id={tabId(baseId, value)}
      aria-selected={selected}
      aria-controls={panelId(baseId, value)}
      tabIndex={selected ? 0 : -1}
      className="moi-tab"
      data-state={selected ? 'active' : 'inactive'}
      onClick={() => onValueChange(value)}
      onKeyDown={handleKeyDown}
    >
      {children}
    </button>
  );
}

// 활성 탭 패널만 마운트한다 (숨은 탭 DOM 전개 금지 — #224 AC-10).
export function TabsContent({
  value,
  children,
  label,
}: {
  value: string;
  children: ReactNode;
  label: string;
}) {
  const { value: active, baseId } = useTabsContext();
  if (active !== value) return null;
  return (
    <div
      role="tabpanel"
      id={panelId(baseId, value)}
      aria-labelledby={tabId(baseId, value)}
      aria-label={label}
      tabIndex={0}
      className="moi-tab-panel"
    >
      {children}
    </div>
  );
}
