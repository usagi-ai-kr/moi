import { createContext, useCallback, useContext, useId, useLayoutEffect, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

// 의존성 0 Tabs primitive (#224 — @radix-ui/react-tabs 미도입, shadcn API 형태).
// WAI-ARIA APG 자동 활성화: ArrowLeft/Right/Up/Down 이동+활성, Home/End, roving tabindex.
// 접근성 계약: ① 비활성 탭은 dangling `aria-controls`를 갖지 않는다(선택 탭만 참조).
//            ② 방향키 이동의 포커스는 **선택 커밋 이후**로 이동해 focus == aria-selected 를 유지한다.

interface TabsContextValue {
  value: string;
  onValueChange: (v: string) => void;
  baseId: string;
  registerOrder: (v: string) => void;
  orderRef: React.MutableRefObject<string[]>;
  // 키보드 이동으로 포커스를 옮길 대상 예약값 (선택 커밋 뒤에 소비한다).
  focusRequestRef: React.MutableRefObject<string | null>;
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
  const focusRequestRef = useRef<string | null>(null);
  const registerOrder = useCallback((v: string) => {
    if (!orderRef.current.includes(v)) orderRef.current.push(v);
  }, []);
  return (
    <TabsContext.Provider
      value={{ value, onValueChange, baseId, registerOrder, orderRef, focusRequestRef }}
    >
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

export function TabsTrigger({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  const {
    value: active,
    onValueChange,
    baseId,
    registerOrder,
    orderRef,
    focusRequestRef,
  } = useTabsContext();
  registerOrder(value);
  const selected = active === value;
  const btnRef = useRef<HTMLButtonElement>(null);

  // 방향키 이동 포커스는 선택이 커밋된 뒤(커밋과 같은 프레임)에 옮긴다.
  // 그 전에는 aria-selected 가 아직 이전 탭이므로 focus != aria-selected 구간이 생긴다.
  useLayoutEffect(() => {
    if (!selected) return;
    if (focusRequestRef.current !== value) return;
    focusRequestRef.current = null;
    btnRef.current?.focus();
  }, [selected, value, focusRequestRef]);

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
      // 선택 커밋 뒤에 포커스를 옮길 대상을 예약한다 (커밋 전 이동 금지).
      focusRequestRef.current = next;
      onValueChange(next);
    }
  };

  return (
    <button
      type="button"
      role="tab"
      ref={btnRef}
      id={tabId(baseId, value)}
      aria-selected={selected}
      // 비활성 탭의 panel 은 DOM에 없으므로 dangling 참조를 만들지 않는다 (선택 탭만 참조).
      aria-controls={selected ? panelId(baseId, value) : undefined}
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
