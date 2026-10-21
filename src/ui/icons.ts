// #233 Slice A — 아이콘 계약·매핑 기반 (ADR-0073, DESIGN.md §4).
// Lucide 단일 계열. 액션별 named export만 제공하며 집계 객체/default export는 두지 않는다(tree-shaking 보존).
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  CircleUser,
  ClipboardCheck,
  Flag,
  History,
  Loader2,
  LogOut,
  Menu,
  PieChart,
  Play,
  PlayCircle,
  RefreshCw,
  Send,
  SkipForward,
  X,
  XCircle,
} from 'lucide-react';

export type IconSize = 16 | 20 | 24;
export type IconAria = 'hidden' | 'label';

export interface IconSpec {
  /** Lucide 아이콘 컴포넌트. */
  icon: LucideIcon;
  /** 별칭(하위 호환). */
  component?: LucideIcon;
  Icon?: LucideIcon;
  /** 픽셀 크기 토큰. */
  size: IconSize;
  /** 접근성 모드. */
  aria: IconAria;
  /** aria='label'일 때 필수 라벨 키. */
  labelKey?: string | null;
  label?: string | null;
  key?: string;
}

const spec = (
  icon: LucideIcon,
  size: IconSize,
  aria: IconAria,
  labelKey?: string | null,
  key?: string,
): IconSpec => ({
  icon,
  component: icon,
  Icon: icon,
  size,
  aria,
  labelKey: aria === 'label' ? (labelKey ?? key ?? null) : null,
  label: aria === 'label' ? (labelKey ?? key ?? null) : null,
  key: key ?? labelKey ?? undefined,
});

export const iconMenu: IconSpec = spec(Menu, 24, 'label', 'menu', 'menu');
export const iconClose: IconSpec = spec(X, 24, 'label', 'close', 'close');
export const iconSelect: IconSpec = spec(ChevronDown, 16, 'hidden', null, 'select');
export const iconStart: IconSpec = spec(Play, 20, 'hidden', null, 'start');
export const iconResume: IconSpec = spec(PlayCircle, 20, 'hidden', null, 'resume');
export const iconPrev: IconSpec = spec(ChevronLeft, 20, 'hidden', null, 'prev');
export const iconNext: IconSpec = spec(ChevronRight, 20, 'hidden', null, 'next');
export const iconSubmit: IconSpec = spec(Send, 20, 'hidden', null, 'submit');
export const iconPass: IconSpec = spec(SkipForward, 20, 'hidden', null, 'pass');
export const iconUnanswered: IconSpec = spec(CircleDashed, 20, 'hidden', null, 'unanswered');
export const iconCorrect: IconSpec = spec(Check, 20, 'hidden', null, 'correct');
export const iconWrong: IconSpec = spec(X, 20, 'hidden', null, 'wrong');
export const iconBookmark: IconSpec = spec(Bookmark, 20, 'label', 'bookmark', 'bookmark');
export const iconReport: IconSpec = spec(Flag, 20, 'hidden', null, 'report');
export const iconAbandon: IconSpec = spec(XCircle, 20, 'hidden', null, 'abandon');
export const iconCancel: IconSpec = spec(X, 16, 'hidden', null, 'cancel');
export const iconConfirm: IconSpec = spec(Check, 16, 'hidden', null, 'confirm');
export const iconResult: IconSpec = spec(ClipboardCheck, 20, 'hidden', null, 'result');
export const iconHistory: IconSpec = spec(History, 20, 'hidden', null, 'history');
export const iconAnalysis: IconSpec = spec(PieChart, 20, 'hidden', null, 'analysis');
export const iconRefresh: IconSpec = spec(RefreshCw, 16, 'hidden', null, 'refresh');
export const iconLoading: IconSpec = spec(Loader2, 16, 'hidden', null, 'loading');
export const iconSaveSuccess: IconSpec = spec(CheckCircle2, 16, 'hidden', null, 'saveSuccess');
export const iconSaveFailure: IconSpec = spec(AlertCircle, 16, 'hidden', null, 'saveFailure');
export const iconLogout: IconSpec = spec(LogOut, 20, 'hidden', null, 'logout');
export const iconAccount: IconSpec = spec(CircleUser, 20, 'hidden', null, 'account');

// 별칭(호환) — 동일 명세를 공유한다.
export const iconPlay = iconStart;
export const iconPlayCircle = iconResume;
export const iconChevronLeft = iconPrev;
export const iconChevronRight = iconNext;
export const iconSend = iconSubmit;
export const iconSkip = iconPass;
export const iconSkipForward = iconPass;
export const iconCircleDashed = iconUnanswered;
export const iconCheck = iconCorrect;
export const iconFlag = iconReport;
export const iconXCircle = iconAbandon;
export const iconClipboardCheck = iconResult;
export const iconPieChart = iconAnalysis;
export const iconStats = iconAnalysis;
export const iconRefreshCw = iconRefresh;
export const iconSpinner = iconLoading;
export const iconLoader = iconLoading;
export const iconCheckCircle = iconSaveSuccess;
export const iconCheckCircle2 = iconSaveSuccess;
export const iconAlertCircle = iconSaveFailure;
export const iconLogOut = iconLogout;
export const iconUser = iconAccount;
export const iconCircleUser = iconAccount;
export const iconChevronDown = iconSelect;
