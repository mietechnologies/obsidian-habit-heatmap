import { TFile } from "obsidian";
import { DateAccumulator, ParsedFileData, ResolvedHabitValue } from "./types";

const DATE_HEADING_PATTERN = /^\s{0,3}#{1,6}\s+(\d{4}\.\d{2}\.\d{2})\s*$/;
const INLINE_HABIT_PATTERN = /habit-([a-z0-9_]+)::(true|false|yes|no|-?\d+(?:\.\d+)?)/g;
const CHECKLIST_PATTERN = /^\s*[-*]\s+\[( |x|X)\]\s+(.+)$/;
const CHECKLIST_HABIT_PATTERN = /habit-([a-z0-9_]+)/g;

export function parseMarkdownHabits(file: TFile, content: string): ParsedFileData {
  const accumulators = new Map<string, Map<string, DateAccumulator>>();
  const headingLinesByDate = new Map<string, number[]>();

  const lines = content.split(/\r?\n/);
  let activeDate: string | null = null;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const heading = parseDateHeading(line);
    if (heading != null) {
      activeDate = heading;
      const entries = headingLinesByDate.get(activeDate) ?? [];
      entries.push(index + 1);
      headingLinesByDate.set(activeDate, entries);
      continue;
    }

    if (activeDate == null) {
      continue;
    }

    extractInlineTokens(line, activeDate, accumulators);
    extractChecklistTokens(line, activeDate, accumulators);
  }

  return {
    file,
    valuesByDateHabit: resolveAccumulators(accumulators),
    headingLinesByDate
  };
}

function parseDateHeading(line: string): string | null {
  const match = line.match(DATE_HEADING_PATTERN);
  if (match == null) {
    return null;
  }

  const iso = headingToIso(match[1]);
  return normalizeIsoDate(iso);
}

function extractInlineTokens(
  line: string,
  activeDate: string,
  accumulators: Map<string, Map<string, DateAccumulator>>
): void {
  const matches = line.matchAll(INLINE_HABIT_PATTERN);
  for (const match of matches) {
    const habit = (match[1] ?? "").trim();
    const rawValue = (match[2] ?? "").trim().toLowerCase();
    if (habit.length === 0) {
      continue;
    }

    const bucket = getAccumulator(accumulators, activeDate, habit);
    if (rawValue === "true" || rawValue === "yes") {
      bucket.inlineTrue = true;
      continue;
    }

    if (rawValue === "false" || rawValue === "no") {
      bucket.inlineFalse = true;
      continue;
    }

    const numeric = Number(rawValue);
    if (Number.isFinite(numeric)) {
      bucket.hasNumeric = true;
      bucket.numericSum += numeric;
    }
  }
}

function extractChecklistTokens(
  line: string,
  activeDate: string,
  accumulators: Map<string, Map<string, DateAccumulator>>
): void {
  const checklistMatch = line.match(CHECKLIST_PATTERN);
  if (checklistMatch == null) {
    return;
  }

  const checked = checklistMatch[1].toLowerCase() === "x";
  const text = checklistMatch[2];

  const matches = text.matchAll(CHECKLIST_HABIT_PATTERN);
  for (const habitMatch of matches) {
    const habit = (habitMatch[1] ?? "").trim();
    if (habit.length === 0) {
      continue;
    }

    const bucket = getAccumulator(accumulators, activeDate, habit);
    if (checked) {
      bucket.checklistTrue = true;
    } else {
      bucket.checklistFalse = true;
    }
  }
}

function getAccumulator(
  accumulators: Map<string, Map<string, DateAccumulator>>,
  date: string,
  habit: string
): DateAccumulator {
  const normalizedHabit = habit.trim();
  const byHabit = accumulators.get(date) ?? new Map<string, DateAccumulator>();
  accumulators.set(date, byHabit);

  const existing = byHabit.get(normalizedHabit);
  if (existing != null) {
    return existing;
  }

  const next: DateAccumulator = {
    numericSum: 0,
    hasNumeric: false,
    inlineTrue: false,
    inlineFalse: false,
    checklistTrue: false,
    checklistFalse: false
  };

  byHabit.set(normalizedHabit, next);
  return next;
}

function resolveAccumulators(
  accumulators: Map<string, Map<string, DateAccumulator>>
): Map<string, Map<string, ResolvedHabitValue>> {
  const output = new Map<string, Map<string, ResolvedHabitValue>>();

  for (const [date, habits] of accumulators.entries()) {
    const resolvedByHabit = new Map<string, ResolvedHabitValue>();

    for (const [habit, accumulator] of habits.entries()) {
      if (accumulator.hasNumeric) {
        resolvedByHabit.set(habit, {
          kind: "numeric",
          value: accumulator.numericSum
        });
        continue;
      }

      const bool = resolveBoolean(accumulator);
      if (bool != null) {
        resolvedByHabit.set(habit, {
          kind: "boolean",
          value: bool
        });
      }
    }

    if (resolvedByHabit.size > 0) {
      output.set(date, resolvedByHabit);
    }
  }

  return output;
}

// Merge rule for boolean values within one day:
// 1) Any inline true => true
// 2) Otherwise use checklist state if present (any checked => true, else unchecked => false)
// 3) Otherwise inline false => false
function resolveBoolean(acc: DateAccumulator): boolean | null {
  if (acc.inlineTrue) {
    return true;
  }

  if (acc.checklistTrue) {
    return true;
  }

  if (acc.checklistFalse) {
    return false;
  }

  if (acc.inlineFalse) {
    return false;
  }

  return null;
}

function headingToIso(heading: string): string {
  return heading.replace(/\./g, "-");
}

export function normalizeIsoDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return `${yearText}-${monthText}-${dayText}`;
}
