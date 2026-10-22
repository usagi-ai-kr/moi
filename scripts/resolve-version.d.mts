// scripts/resolve-version.mjs 의 타입 표면 (typecheck용).
export const MILESTONE_API: string;
export const PLACEHOLDER_VERSION: string;
export interface ParsedVersion {
  readonly version: string;
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}
export interface ResolvedVersion {
  readonly version: string;
  readonly buildDate: string;
}
export function parseVersionTitle(title: string): ParsedVersion | null;
export function hasOpenIssues(value: unknown): boolean;
export function selectVersion(milestones?: ReadonlyArray<Record<string, unknown>> | null): string;
export function buildDateKst(now?: Date): string;
export function fetchMilestones(options?: {
  run?: (command: string, args: string[]) => Promise<{ stdout: string }>;
}): Promise<ReadonlyArray<Record<string, unknown>>>;
export function resolveVersion(options?: {
  run?: (command: string, args: string[]) => Promise<{ stdout: string }>;
  now?: Date;
}): Promise<ResolvedVersion>;
