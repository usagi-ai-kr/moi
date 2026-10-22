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

export type IconSpec =
  | { icon: LucideIcon; size: IconSize; aria: 'hidden'; labelKey: null }
  | { icon: LucideIcon; size: IconSize; aria: 'label'; labelKey: string };

function spec(
  icon: LucideIcon,
  size: IconSize,
  aria: 'hidden',
  labelKey?: null,
): IconSpec;
function spec(
  icon: LucideIcon,
  size: IconSize,
  aria: 'label',
  labelKey: string,
): IconSpec;
function spec(
  icon: LucideIcon,
  size: IconSize,
  aria: 'hidden' | 'label',
  labelKey: string | null = null,
): IconSpec {
  if (aria === 'label') {
    if (!labelKey) throw new Error('aria=label requires labelKey');
    return { icon, size, aria, labelKey };
  }
  return { icon, size, aria: 'hidden', labelKey: null };
}

export const iconMenu = /*#__PURE__*/ spec(Menu, 24, 'label', 'menu');
export const iconClose = /*#__PURE__*/ spec(X, 24, 'label', 'close');
export const iconSelect = /*#__PURE__*/ spec(ChevronDown, 16, 'hidden', null);
export const iconStart = /*#__PURE__*/ spec(Play, 20, 'hidden', null);
export const iconResume = /*#__PURE__*/ spec(PlayCircle, 20, 'hidden', null);
export const iconPrev = /*#__PURE__*/ spec(ChevronLeft, 20, 'hidden', null);
export const iconNext = /*#__PURE__*/ spec(ChevronRight, 20, 'hidden', null);
export const iconSubmit = /*#__PURE__*/ spec(Send, 20, 'hidden', null);
export const iconPass = /*#__PURE__*/ spec(SkipForward, 20, 'hidden', null);
export const iconUnanswered = /*#__PURE__*/ spec(CircleDashed, 20, 'hidden', null);
export const iconCorrect = /*#__PURE__*/ spec(Check, 20, 'hidden', null);
export const iconWrong = /*#__PURE__*/ spec(X, 20, 'hidden', null);
export const iconBookmark = /*#__PURE__*/ spec(Bookmark, 20, 'label', 'bookmark');
export const iconReport = /*#__PURE__*/ spec(Flag, 20, 'hidden', null);
export const iconAbandon = /*#__PURE__*/ spec(XCircle, 20, 'hidden', null);
export const iconCancel = /*#__PURE__*/ spec(X, 16, 'hidden', null);
export const iconConfirm = /*#__PURE__*/ spec(Check, 16, 'hidden', null);
export const iconResult = /*#__PURE__*/ spec(ClipboardCheck, 20, 'hidden', null);
export const iconHistory = /*#__PURE__*/ spec(History, 20, 'hidden', null);
export const iconAnalysis = /*#__PURE__*/ spec(PieChart, 20, 'hidden', null);
export const iconRefresh = /*#__PURE__*/ spec(RefreshCw, 16, 'hidden', null);
export const iconLoading = /*#__PURE__*/ spec(Loader2, 16, 'hidden', null);
export const iconSaveSuccess = /*#__PURE__*/ spec(CheckCircle2, 16, 'hidden', null);
export const iconSaveFailure = /*#__PURE__*/ spec(AlertCircle, 16, 'hidden', null);
export const iconLogout = /*#__PURE__*/ spec(LogOut, 20, 'hidden', null);
export const iconAccount = /*#__PURE__*/ spec(CircleUser, 20, 'hidden', null);