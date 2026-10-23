export const VERIFY_REQUIRED_FROM: number;
export function versionOf(file: string): number | null;
export function checkMigrations(input: {
  migrations: string[];
  downs?: string[];
  verifies?: string[];
  baseMigrations?: string[] | null;
}): string[];
export function verifyStatement(file: string, text: string): string;
export function combinedVerifySql(
  files: Array<{ name: string; text: string }>,
  options?: { failingOnly?: boolean },
): string;
