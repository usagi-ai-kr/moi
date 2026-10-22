import * as React from 'react';
import { copy } from '../copy';
import './study-abandon.css';
import { Button } from '../components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

// #223 포기 확인 전용 다이얼로그 — 공용 ConfirmDialog 대신 primitives 직접 구성.
// 확정은 일반 Button이라 Radix 자동 닫힘이 없고, 성공 때만 부모가 닫는다.
// 오버레이 클릭은 Radix 내장 preventDefault로 비확정. 취소가 기본 포커스(Radix cancelRef).
interface Props {
  open: boolean;
  pending: boolean;
  error: string | null;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onConfirm: () => void;
  onRequestClose: () => void;
}

export function AbandonConfirmDialog({ open, pending, error, triggerRef, onConfirm, onRequestClose }: Props) {
  const errorRef = React.useRef<HTMLParagraphElement>(null);
  React.useEffect(() => {
    if (!pending && error !== null) errorRef.current?.focus();
  }, [pending, error]);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onRequestClose();
      }}
    >
      <AlertDialogContent
        onEscapeKeyDown={(e) => {
          if (pending) e.preventDefault();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          const t = triggerRef.current;
          if (t && document.contains(t)) t.focus();
        }}
      >
        <AlertDialogTitle>{copy.study.abandonTitle}</AlertDialogTitle>
        <AlertDialogDescription>{copy.study.abandonDesc}</AlertDialogDescription>
        {error && (
          <p ref={errorRef} role="alert" tabIndex={-1} className="moi-abandon-error">
            {error}
          </p>
        )}
        <div className="moi-abandon-actions">
          <AlertDialogCancel disabled={pending}>{copy.study.cancel}</AlertDialogCancel>
          <Button type="button" variant="destructive" pending={pending} disabled={pending} onClick={onConfirm}>
            {copy.study.confirmAbandon}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
