import type { ThemeConfig } from 'antd';
import { colors, layout, radius, typography } from './tokens';

// AntD 테마는 tokens.ts 값으로만 구성한다 (ADR-0012) — 여기에 리터럴 값 금지
export const moiTheme: ThemeConfig = {
  token: {
    colorPrimary: colors.orange,
    colorInfo: colors.orange,
    colorLink: colors.orange,
    colorTextBase: colors.ink,
    colorTextSecondary: colors.muted,
    colorBorder: colors.border,
    colorBgBase: colors.white,
    colorBgLayout: colors.surface,
    fontFamily: typography.fontUi,
    fontSize: typography.baseSize,
    borderRadius: radius.md,
    controlHeight: layout.controlHeight,
  },
  components: {
    Button: { controlHeight: layout.touchTargetMin },
  },
};
