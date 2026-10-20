// 우측 Drawer — native <dialog> + showModal() 기반 (ADR-0057, 이슈 #215).
// top layer·포커스 트랩·Escape·`::backdrop`·닫힘 시 포커스 복귀를 브라우저가 제공하고,
// 새 런타임 의존성은 0이다. jsdom 등 showModal 미지원 환경에서는 open 속성 폴백을 쓴다.
import * as React from 'react';
import { cn } from '@/ui/lib/utils';

export interface DrawerProps extends React.DialogHTMLAttributes<HTMLDialogElement> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 닫힌 뒤 포커스를 되돌릴 요소(트리거). */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

interface ScrollLock {
  scrollY: number;
  htmlOverflow: string;
  bodyOverflow: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
}

function supportsModal(dialog: HTMLDialogElement): boolean {
  return typeof dialog.showModal === 'function' && typeof dialog.close === 'function';
}

export function Drawer({ open, onOpenChange, returnFocusRef, className, children, ...props }: DrawerProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const lockRef = React.useRef<ScrollLock | null>(null);
  const wasOpenRef = React.useRef(false);

  // 배경 스크롤 잠금 — iOS Safari는 position:fixed + scrollY 복원이 필요하다 (ADR-0057).
  const lockScroll = React.useCallback(() => {
    if (lockRef.current) return;
    const { documentElement, body } = document;
    const scrollY = window.scrollY;
    lockRef.current = {
      scrollY,
      htmlOverflow: documentElement.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
    };
    documentElement.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
  }, []);

  const releaseScroll = React.useCallback(() => {
    const lock = lockRef.current;
    if (!lock) return;
    lockRef.current = null;
    document.documentElement.style.overflow = lock.htmlOverflow;
    document.body.style.overflow = lock.bodyOverflow;
    document.body.style.position = lock.bodyPosition;
    document.body.style.top = lock.bodyTop;
    document.body.style.left = lock.bodyLeft;
    document.body.style.right = lock.bodyRight;
    document.body.style.width = lock.bodyWidth;
    // 잠금으로 바깥으로 밀린 스크롤 위치를 되돌린다 (iOS position:fixed 대응).
    if (window.scrollY !== lock.scrollY) window.scrollTo(0, lock.scrollY);
  }, []);

  // 언마운트(로그아웃·401 전환) 시 잠금이 남지 않게 한다.
  React.useEffect(() => releaseScroll, [releaseScroll]);

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) {
        if (supportsModal(dialog)) dialog.showModal();
        else dialog.setAttribute('open', '');
      }
      lockScroll();
    } else if (dialog.open) {
      if (supportsModal(dialog)) dialog.close();
      else dialog.removeAttribute('open');
      releaseScroll();
    }
    if (wasOpenRef.current && !open) {
      wasOpenRef.current = false;
      returnFocusRef?.current?.focus();
      return;
    }
    wasOpenRef.current = open;
  }, [open, lockScroll, releaseScroll, returnFocusRef]);

  const requestClose = React.useCallback(() => onOpenChange(false), [onOpenChange]);

  return (
    <dialog
      ref={dialogRef}
      data-slot="drawer"
      className={cn('moi-drawer', className)}
      onCancel={(event) => {
        // 네이티브 닫힘을 막고 상태를 단일 경로로 통일한다.
        event.preventDefault();
        requestClose();
      }}
      onClose={requestClose}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        // 백드롭(다이얼로그 자신)을 클릭한 경우에만 닫는다 — 패널 내부 클릭은 무시.
        if (event.target === event.currentTarget) requestClose();
      }}
      {...props}
    >
      {/* 패널은 열린 동안에만 마운트한다 — 닫힌 상태에서 숨은 링크가 AT·키보드에 남지 않게 한다.
          dialog 엘로먼트는 항상 마운트되어 있어 닫힘 시 트리거로의 포커스 복귀가 유지된다. */}
      {open ? children : null}
    </dialog>
  );
}
