import { App, TFile } from "obsidian";
import { parseMarkdownHabits } from "./parser";
import { ParsedFileData, RangeResolution, ResolvedHabitValue, ScanCandidate, ScanResult } from "./types";

interface CacheEntry {
  mtime: number;
  parsed: ParsedFileData;
}

interface AggregateBucket {
  numericSum: number;
  hasNumeric: boolean;
  boolTrue: boolean;
  boolFalse: boolean;
}

export class HabitScanner {
  private app: App;
  private cache = new Map<string, CacheEntry>();

  constructor(app: App) {
    this.app = app;
  }

  invalidatePath(path: string): void {
    this.cache.delete(path);
  }

  clear(): void {
    this.cache.clear();
  }

  async scan(currentFile: TFile, range: RangeResolution): Promise<ScanResult> {
    const files = this.getFilesForRange(currentFile, range.type);
    const dateSet = new Set(range.dates);

    const aggregates = new Map<string, Map<string, AggregateBucket>>();
    const candidatesByDate = new Map<string, ScanCandidate[]>();
    const habitsFound = new Set<string>();

    for (const file of files) {
      const parsed = await this.getParsedFile(file);

      for (const [date, lines] of parsed.headingLinesByDate.entries()) {
        if (!dateSet.has(date)) {
          continue;
        }

        const dateValues = parsed.valuesByDateHabit.get(date);
        const habits = new Set<string>(dateValues ? [...dateValues.keys()] : []);
        const line = lines[0] ?? 1;

        const existing = candidatesByDate.get(date) ?? [];
        existing.push({ file, headingLine: line, habitsWithData: habits });
        candidatesByDate.set(date, existing);
      }

      for (const [date, valuesByHabit] of parsed.valuesByDateHabit.entries()) {
        if (!dateSet.has(date)) {
          continue;
        }

        for (const [habit, value] of valuesByHabit.entries()) {
          habitsFound.add(habit);
          const byDate = aggregates.get(habit) ?? new Map<string, AggregateBucket>();
          aggregates.set(habit, byDate);

          const bucket = byDate.get(date) ?? {
            numericSum: 0,
            hasNumeric: false,
            boolTrue: false,
            boolFalse: false
          };

          if (value.kind === "numeric") {
            bucket.hasNumeric = true;
            bucket.numericSum += value.value;
          } else if (value.value) {
            bucket.boolTrue = true;
          } else {
            bucket.boolFalse = true;
          }

          byDate.set(date, bucket);
        }
      }
    }

    const valuesByHabit = new Map<string, Map<string, ResolvedHabitValue>>();

    for (const [habit, byDate] of aggregates.entries()) {
      const resolvedByDate = new Map<string, ResolvedHabitValue>();

      for (const [date, bucket] of byDate.entries()) {
        if (bucket.hasNumeric) {
          resolvedByDate.set(date, { kind: "numeric", value: bucket.numericSum });
          continue;
        }

        if (bucket.boolTrue) {
          resolvedByDate.set(date, { kind: "boolean", value: true });
        } else if (bucket.boolFalse) {
          resolvedByDate.set(date, { kind: "boolean", value: false });
        }
      }

      valuesByHabit.set(habit, resolvedByDate);
    }

    return {
      dates: range.dates,
      valuesByHabit,
      habitsFound,
      candidatesByDate,
      scannedFiles: files
    };
  }

  private async getParsedFile(file: TFile): Promise<ParsedFileData> {
    const cached = this.cache.get(file.path);
    if (cached != null && cached.mtime === file.stat.mtime) {
      return cached.parsed;
    }

    const content = await this.app.vault.cachedRead(file);
    const parsed = parseMarkdownHabits(file, content);
    this.cache.set(file.path, { mtime: file.stat.mtime, parsed });
    return parsed;
  }

  private getFilesForRange(currentFile: TFile, type: RangeResolution["type"]): TFile[] {
    if (type === "week") {
      return this.shouldIgnoreFile(currentFile.path) ? [] : [currentFile];
    }

    const allMarkdown = this.app.vault
      .getMarkdownFiles()
      .filter((file) => !this.shouldIgnoreFile(file.path));

    const dir = getParentPath(currentFile.path);
    if (type === "month") {
      return allMarkdown.filter((file) => getParentPath(file.path) === dir);
    }

    return allMarkdown.filter((file) => {
      const fileDir = getParentPath(file.path);
      return fileDir === dir || fileDir.startsWith(`${dir}/`);
    });
  }

  private shouldIgnoreFile(path: string): boolean {
    const segments = path.split("/");
    return segments.some((segment) => segment.toLowerCase() === "templates");
  }
}

function getParentPath(path: string): string {
  const idx = path.lastIndexOf("/");
  if (idx === -1) {
    return "";
  }
  return path.slice(0, idx);
}
