// #121 — scripts/lib/third-party-notices.mjs의 타입 표면 (typecheck용).
export const NEEDS_REVIEW: string;
export interface RawLicenseEntry {
  name: string;
  versions?: string[];
  paths?: string[];
  license?: unknown;
  homepage?: string;
}
export interface InstalledPackage {
  author?: unknown;
  homepage?: unknown;
  license?: unknown;
  repository?: unknown;
}
export interface VersionedEntry {
  name: string;
  version: string;
  path: string;
}
export interface NoticeInput {
  name: string;
  version: string;
  license?: unknown;
  homepage?: string;
}
export interface NoticeEntry {
  name: string;
  version: string;
  license: string;
  copyright: string;
  url: string;
}
export function normalizeLicense(entryLicense: unknown, pkg: InstalledPackage): string;
export function resolveCopyright(licenseHit: string): string;
export function extractSourceUrl(pkg: InstalledPackage, fallbackHomepage: string): string;
export function matchPathForVersion(paths: string[] | undefined, name: string, version: string): string;
export function expandEntryVersions(entry: RawLicenseEntry): VersionedEntry[];
export function toNoticeEntry(
  input: NoticeInput,
  installed?: InstalledPackage,
  licenseHit?: string,
): NoticeEntry;
export function sortNotices<T>(entries: T[]): T[];
export function renderNotices(entries: NoticeEntry[], meta: { count: number; lockfile?: string }): string;
export function checkLockfileConsistency(input: {
  packageJsonText: string;
  lockfileText: string;
}): { ok: boolean; problems: string[] };
export function findMissingInLockfile(entries: NoticeEntry[], lockfileText: string): string[];
export function findPureDevOnly(entryNames: string[], devDeps: string[], deps?: string[]): string[];
