import { App, MarkdownPostProcessorContext, MarkdownView, Notice, TFile, parseYaml } from "obsidian";
import { normalizeIsoDate } from "./parser";
import { HabitScanner } from "./scanner";
import {
  HeatmapBlockConfig,
  NormalizedConfig,
  NumericThresholdConfig,
  NumericThreshold,
  RangeResolution,
  RenderContextModel,
  ResolvedHabitValue,
  ScanCandidate,
  ScanResult,
  WeekStart
} from "./types";

const DEFAULT_CONFIG: NormalizedConfig = {
  range: {
    type: "week",
    fromTitle: true
  },
  habits: {
    mode: "auto",
    list: []
  },
  colors: {
    noData: "#2b2b2b",
    blankFuture: "transparent",
    boolean: {
      true: "#22c55e",
      false: "#ef4444"
    },
    numeric: {
      thresholds: [
        { kind: "le", value: 0, color: "#111827" },
        { kind: "le", value: 10, color: "#1f2937" },
        { kind: "le", value: 25, color: "#374151" },
        { kind: "le", value: 50, color: "#4b5563" },
        { kind: "gt", value: 50, color: "#6b7280" }
      ]
    }
  },
  display: {
    title: "",
    showLegend: true,
    cellSize: 12,
    gap: 2,
    weekStart: "Monday"
  }
};

export class HabitHeatmapRenderer {
  private app: App;
  private scanner: HabitScanner;

  constructor(app: App, scanner: HabitScanner) {
    this.app = app;
    this.scanner = scanner;
  }

  async render(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) {
      this.renderError(el, ["Heatmap can only render inside markdown files."]);
      return;
    }

    const parsed = parseConfig(source);
    if (!parsed.ok) {
      this.renderError(el, [parsed.error]);
      return;
    }

    const configResult = normalizeConfig(parsed.value);
    if (!configResult.ok) {
      this.renderError(el, configResult.errors);
      return;
    }

    const rangeResult = resolveRange(configResult.config, file);
    if (!rangeResult.ok) {
      this.renderError(el, rangeResult.errors);
      return;
    }

    const scan = await this.scanner.scan(file, rangeResult.range);
    const habits = resolveHabitList(configResult.config, scan);

    if (habits.length === 0) {
      this.renderInfo(el, "No habits found in range");
      return;
    }

    this.renderHeatmap(el, {
      currentFile: file,
      config: configResult.config,
      range: rangeResult.range,
      scan
    }, habits);
  }

  private renderHeatmap(el: HTMLElement, model: RenderContextModel, habits: string[]): void {
    el.empty();

    const root = el.createDiv({ cls: "habit-heatmap-plugin" });
    const effectiveCellSize = model.range.type === "month" ? model.config.display.cellSize + 8 : model.config.display.cellSize;
    root.style.setProperty("--hh-cell-size", `${effectiveCellSize}px`);
    root.style.setProperty("--hh-cell-gap", `${model.config.display.gap}px`);

    if (model.config.display.title.trim().length > 0) {
      root.createEl("h4", { text: model.config.display.title.trim(), cls: "habit-heatmap-plugin__title" });
    }

    if (model.range.type === "week") {
      this.renderWeekGrid(root, model, habits);
    } else {
      this.renderCalendarGrids(root, model, habits);
    }

    if (model.config.display.showLegend) {
      this.renderLegend(root, model.config);
    }
  }

  private renderWeekGrid(root: HTMLElement, model: RenderContextModel, habits: string[]): void {
    const table = root.createDiv({ cls: "habit-heatmap-plugin__week" });

    for (const habit of habits) {
      const row = table.createDiv({ cls: "habit-heatmap-plugin__week-row" });
      row.createDiv({ cls: "habit-heatmap-plugin__habit-label", text: toHabitDisplayName(habit) });

      const byDate = model.scan.valuesByHabit.get(habit) ?? new Map<string, ResolvedHabitValue>();
      for (const date of model.range.dates) {
        const value = byDate.get(date);
        const cell = row.createDiv({ cls: "habit-heatmap-plugin__cell" });
        this.decorateCell(cell, model, habit, date, value);
      }
    }
  }

  private renderCalendarGrids(root: HTMLElement, model: RenderContextModel, habits: string[]): void {
    const inRange = new Set(model.range.dates);
    const gridBounds = getCalendarBounds(model.range, model.config.display.weekStart);
    const sectionsWrap = root.createDiv({
      cls: `habit-heatmap-plugin__sections ${model.range.type === "month" ? "habit-heatmap-plugin__sections--month" : ""}`
    });

    for (const habit of habits) {
      const section = sectionsWrap.createDiv({ cls: "habit-heatmap-plugin__section" });
      section.createEl("h5", { text: toHabitDisplayName(habit), cls: "habit-heatmap-plugin__section-title" });

      const byDate = model.scan.valuesByHabit.get(habit) ?? new Map<string, ResolvedHabitValue>();
      const grid = section.createDiv({ cls: "habit-heatmap-plugin__calendar" });
      const isYear = model.range.type === "year";

      if (!isYear) {
        const weekdayLabels = buildWeekdayLabels(model.config.display.weekStart);
        for (const label of weekdayLabels) {
          grid.createDiv({ cls: "habit-heatmap-plugin__weekday", text: label });
        }
      }

      const daysWrap = grid.createDiv({
        cls: `habit-heatmap-plugin__days ${isYear ? "habit-heatmap-plugin__days--year" : ""}`
      });

      const totalDays = dayDiffInclusive(gridBounds.start, gridBounds.end);
      for (let i = 0; i < totalDays; i++) {
        const currentDate = toIsoDate(addDays(gridBounds.start, i));
        const cell = daysWrap.createDiv({ cls: "habit-heatmap-plugin__cell" });

        if (!inRange.has(currentDate)) {
          cell.addClass("habit-heatmap-plugin__cell--outside");
          cell.title = `${currentDate} (outside selected range)`;
          continue;
        }

        this.decorateCell(cell, model, habit, currentDate, byDate.get(currentDate));
      }
    }
  }

  private decorateCell(
    cell: HTMLElement,
    model: RenderContextModel,
    habit: string,
    date: string,
    value: ResolvedHabitValue | undefined
  ): void {
    const appearance = resolveAppearance(model.config, date, value);
    cell.style.setProperty("background", appearance.color);
    if (appearance.kind === "blank") {
      cell.addClass("habit-heatmap-plugin__cell--blank");
    }

    cell.title = `${date} • ${habit}: ${appearance.tooltip}`;
    cell.addEventListener("click", async () => {
      await this.navigateToDate(model, habit, date);
    });
  }

  private async navigateToDate(model: RenderContextModel, habit: string, date: string): Promise<void> {
    const candidate = await this.pickCandidate(model, habit, date);
    if (candidate == null) {
      new Notice(`No heading found for ${date}`);
      return;
    }

    const leaf = this.app.workspace.getLeaf(true);
    await leaf.openFile(candidate.file, { active: true });
    this.app.workspace.revealLeaf(leaf);

    const view = leaf.view;
    if (!(view instanceof MarkdownView)) {
      return;
    }

    const line = Math.max(candidate.headingLine - 1, 0);
    const editor = view.editor;
    editor.setCursor({ line, ch: 0 });
    editor.scrollIntoView(
      {
        from: { line, ch: 0 },
        to: { line, ch: 0 }
      },
      true
    );
  }

  private async pickCandidate(model: RenderContextModel, habit: string, date: string): Promise<ScanCandidate | null> {
    if (model.range.type === "week") {
      const exact = model.scan.candidatesByDate.get(date)?.find((candidate) => candidate.file.path === model.currentFile.path);
      if (exact != null) {
        return exact;
      }

      const nearest = await this.findNearestHeading(model.currentFile, date);
      if (nearest != null) {
        return nearest;
      }
      return null;
    }

    const candidates = model.scan.candidatesByDate.get(date) ?? [];
    const preferred = candidates.find((candidate) => candidate.habitsWithData.has(habit));
    if (preferred != null) {
      return preferred;
    }

    if (candidates.length > 0) {
      return candidates[0];
    }

    for (const file of model.scan.scannedFiles) {
      const nearest = await this.findNearestHeading(file, date);
      if (nearest != null) {
        return nearest;
      }
    }

    return null;
  }

  private async findNearestHeading(file: TFile, date: string): Promise<ScanCandidate | null> {
    const content = await this.app.vault.cachedRead(file);
    const lines = content.split(/\r?\n/);

    const target = parseIsoDate(date);
    if (target == null) {
      return null;
    }

    let exactLine: number | null = null;
    let nearestLine: number | null = null;
    let nearestDiff = Number.MAX_SAFE_INTEGER;

    for (let i = 0; i < lines.length; i++) {
      const dateMatch = lines[i].match(/^\s{0,3}#{1,6}\s+(\d{4}\.\d{2}\.\d{2})\s*$/);
      if (dateMatch == null) {
        continue;
      }

      const iso = normalizeIsoDate(dateMatch[1].replace(/\./g, "-"));
      if (iso == null) {
        continue;
      }

      const lineNumber = i + 1;
      if (iso === date) {
        exactLine = lineNumber;
        break;
      }

      const headingDate = parseIsoDate(iso);
      if (headingDate == null) {
        continue;
      }

      const diff = Math.abs(headingDate.getTime() - target.getTime());
      if (diff < nearestDiff) {
        nearestDiff = diff;
        nearestLine = lineNumber;
      }
    }

    const finalLine = exactLine ?? nearestLine;
    if (finalLine == null) {
      return null;
    }

    return {
      file,
      headingLine: finalLine,
      habitsWithData: new Set()
    };
  }

  private renderLegend(root: HTMLElement, config: NormalizedConfig): void {
    const legend = root.createDiv({ cls: "habit-heatmap-plugin__legend" });
    const baseRow = legend.createDiv({ cls: "habit-heatmap-plugin__legend-row" });
    const numericRow = legend.createDiv({ cls: "habit-heatmap-plugin__legend-row" });

    appendLegendItem(baseRow, config.colors.boolean.true, "Boolean true");
    appendLegendItem(baseRow, config.colors.boolean.false, "Boolean false");
    appendLegendItem(baseRow, config.colors.noData, "No data (past)");
    appendLegendItem(baseRow, config.colors.blankFuture, "Blank (today/future missing)");

    for (const threshold of config.colors.numeric.thresholds) {
      const label = threshold.kind === "le" ? `Numeric <= ${threshold.value}` : `Numeric > ${threshold.value}`;
      appendLegendItem(numericRow, threshold.color, label);
    }
  }

  private renderError(el: HTMLElement, errors: string[]): void {
    el.empty();
    const box = el.createDiv({ cls: "habit-heatmap-plugin__error" });
    box.createEl("strong", { text: "Habit heatmap config error" });
    const list = box.createEl("ul");
    for (const error of errors) {
      list.createEl("li", { text: error });
    }
  }

  private renderInfo(el: HTMLElement, message: string): void {
    el.empty();
    const box = el.createDiv({ cls: "habit-heatmap-plugin__info" });
    box.setText(message);
  }
}

function appendLegendItem(parent: HTMLElement, color: string, label: string): void {
  const item = parent.createDiv({ cls: "habit-heatmap-plugin__legend-item" });
  const swatch = item.createSpan({ cls: "habit-heatmap-plugin__legend-swatch" });
  swatch.style.setProperty("background", color);
  item.createSpan({ text: label });
}

function resolveAppearance(
  config: NormalizedConfig,
  date: string,
  value: ResolvedHabitValue | undefined
): { color: string; tooltip: string; kind: "data" | "blank" } {
  const today = todayIsoDate();

  if (value == null) {
    if (date >= today) {
      return {
        color: config.colors.blankFuture,
        tooltip: "blank (today/future missing)",
        kind: "blank"
      };
    }

    return {
      color: config.colors.noData,
      tooltip: "no data",
      kind: "data"
    };
  }

  if (value.kind === "boolean") {
    return {
      color: value.value ? config.colors.boolean.true : config.colors.boolean.false,
      tooltip: value.value ? "true" : "false",
      kind: "data"
    };
  }

  return {
    color: resolveNumericColor(config.colors.numeric.thresholds, value.value),
    tooltip: `${value.value}`,
    kind: "data"
  };
}

function resolveNumericColor(thresholds: NumericThreshold[], value: number): string {
  for (const threshold of thresholds) {
    if (threshold.kind === "le" && value <= threshold.value) {
      return threshold.color;
    }

    if (threshold.kind === "gt" && value > threshold.value) {
      return threshold.color;
    }
  }

  return thresholds[thresholds.length - 1]?.color ?? "#6b7280";
}

function resolveHabitList(config: NormalizedConfig, scan: ScanResult): string[] {
  if (config.habits.mode === "list") {
    return [...new Set(config.habits.list.filter((habit) => isLowerSnakeCase(habit)))];
  }

  return [...scan.habitsFound].sort((a, b) => a.localeCompare(b));
}

function toHabitDisplayName(habit: string): string {
  return habit
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function isLowerSnakeCase(value: string): boolean {
  return /^[a-z0-9_]+$/.test(value);
}

function parseConfig(source: string): { ok: true; value: HeatmapBlockConfig } | { ok: false; error: string } {
  const trimmed = source.trim();
  if (trimmed.length === 0) {
    return { ok: true, value: {} };
  }

  try {
    const parsed = trimmed.startsWith("{") || trimmed.startsWith("[") ? JSON.parse(trimmed) : parseYaml(trimmed);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "Config must be an object (JSON/YAML mapping)." };
    }

    return { ok: true, value: parsed as HeatmapBlockConfig };
  } catch (error) {
    return { ok: false, error: `Failed to parse config: ${(error as Error).message}` };
  }
}

function normalizeConfig(input: HeatmapBlockConfig): { ok: true; config: NormalizedConfig } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  const thresholdsInput = input.colors?.numeric?.thresholds ?? [];
  const thresholds = thresholdsInput.length > 0 ? normalizeThresholds(thresholdsInput, errors) : DEFAULT_CONFIG.colors.numeric.thresholds;

  const list = (input.habits?.list ?? [])
    .map((habit) => `${habit}`.trim())
    .filter((habit) => habit.length > 0);
  const invalidListHabits = list.filter((habit) => !isLowerSnakeCase(habit));

  const mode = input.habits?.mode ?? DEFAULT_CONFIG.habits.mode;
  if (mode !== "auto" && mode !== "list") {
    errors.push("habits.mode must be auto or list");
  }

  if (mode === "list" && list.length === 0) {
    errors.push("habits.list must include at least one habit when habits.mode=list");
  }
  if (invalidListHabits.length > 0) {
    errors.push(`habits.list contains invalid names (use lower_snake_case): ${invalidListHabits.join(", ")}`);
  }

  const config: NormalizedConfig = {
    range: {
      type: input.range?.type ?? DEFAULT_CONFIG.range.type,
      year: input.range?.year,
      month: input.range?.month,
      fromTitle: input.range?.fromTitle ?? DEFAULT_CONFIG.range.fromTitle
    },
    habits: {
      mode: mode === "list" ? "list" : "auto",
      list: [...new Set(list)]
    },
    colors: {
      noData: input.colors?.noData ?? DEFAULT_CONFIG.colors.noData,
      blankFuture: input.colors?.blankFuture ?? DEFAULT_CONFIG.colors.blankFuture,
      boolean: {
        true: input.colors?.boolean?.true ?? DEFAULT_CONFIG.colors.boolean.true,
        false: input.colors?.boolean?.false ?? DEFAULT_CONFIG.colors.boolean.false
      },
      numeric: {
        thresholds
      }
    },
    display: {
      title: input.display?.title ?? DEFAULT_CONFIG.display.title,
      showLegend: input.display?.showLegend ?? DEFAULT_CONFIG.display.showLegend,
      cellSize: clampNumber(input.display?.cellSize, 6, 30, DEFAULT_CONFIG.display.cellSize),
      gap: clampNumber(input.display?.gap, 0, 8, DEFAULT_CONFIG.display.gap),
      weekStart: input.display?.weekStart === "Sunday" ? "Sunday" : "Monday"
    }
  };

  if (config.range.type !== "week" && config.range.type !== "month" && config.range.type !== "year") {
    errors.push("range.type must be week, month, or year");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, config };
}

function normalizeThresholds(
  input: NumericThresholdConfig[] | undefined,
  errors: string[]
): NumericThreshold[] {
  const output: NumericThreshold[] = [];

  for (const entry of input ?? []) {
    if (typeof entry !== "object" || entry == null) {
      continue;
    }

    const anyEntry = entry as Record<string, unknown>;
    if (typeof anyEntry.color !== "string" || anyEntry.color.trim().length === 0) {
      continue;
    }

    if (typeof anyEntry.le === "number") {
      output.push({ kind: "le", value: anyEntry.le, color: anyEntry.color });
      continue;
    }

    if (typeof anyEntry.gt === "number") {
      output.push({ kind: "gt", value: anyEntry.gt, color: anyEntry.color });
    }
  }

  if (output.length === 0) {
    errors.push("colors.numeric.thresholds must include at least one valid threshold");
    return DEFAULT_CONFIG.colors.numeric.thresholds;
  }

  return output;
}

function resolveRange(config: NormalizedConfig, file: TFile): { ok: true; range: RangeResolution } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (config.range.type === "week") {
    if (config.range.fromTitle !== true) {
      errors.push("week range requires range.fromTitle=true");
      return { ok: false, errors };
    }

    const titleMatch = file.basename.match(/^\s*(\d{4}\.\d{2}\.\d{2})\s*-\s*(\d{4}\.\d{2}\.\d{2})\s*$/);
    if (titleMatch == null) {
      errors.push("week note title must match YYYY.MM.dd - YYYY.MM.dd");
      return { ok: false, errors };
    }

    const start = normalizeIsoDate(titleMatch[1].replace(/\./g, "-"));
    const end = normalizeIsoDate(titleMatch[2].replace(/\./g, "-"));

    if (start == null || end == null) {
      errors.push("week note title contains invalid date");
      return { ok: false, errors };
    }

    const dates = enumerateDates(start, end);
    if (dates.length !== 7) {
      errors.push(`week range must include exactly 7 dates, found ${dates.length}`);
      return { ok: false, errors };
    }

    return {
      ok: true,
      range: {
        type: "week",
        startDate: start,
        endDate: end,
        dates
      }
    };
  }

  if (config.range.type === "month") {
    const year = config.range.year;
    const month = config.range.month;

    if (!isValidYear(year)) {
      errors.push("month range requires range.year");
    }
    if (!Number.isInteger(month) || month == null || month < 1 || month > 12) {
      errors.push("month range requires range.month (1-12)");
    }
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = new Date(year as number, month as number, 0);
    const end = toIsoDate(endDate);

    return {
      ok: true,
      range: {
        type: "month",
        startDate: start,
        endDate: end,
        dates: enumerateDates(start, end)
      }
    };
  }

  if (!isValidYear(config.range.year)) {
    return { ok: false, errors: ["year range requires range.year"] };
  }

  const year = config.range.year as number;
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  return {
    ok: true,
    range: {
      type: "year",
      startDate: start,
      endDate: end,
      dates: enumerateDates(start, end)
    }
  };
}

function getCalendarBounds(range: RangeResolution, weekStart: WeekStart): { start: Date; end: Date } {
  const start = parseIsoDate(range.startDate) as Date;
  const end = parseIsoDate(range.endDate) as Date;

  const startIndex = weekdayIndex(start, weekStart);
  const endIndex = weekdayIndex(end, weekStart);

  return {
    start: addDays(start, -startIndex),
    end: addDays(end, 6 - endIndex)
  };
}

function weekdayIndex(date: Date, weekStart: WeekStart): number {
  const sundayBased = date.getDay();
  if (weekStart === "Sunday") {
    return sundayBased;
  }
  return (sundayBased + 6) % 7;
}

function buildWeekdayLabels(weekStart: WeekStart): string[] {
  return weekStart === "Sunday" ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
}

function enumerateDates(startIso: string, endIso: string): string[] {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (start == null || end == null || start.getTime() > end.getTime()) {
    return [];
  }

  const output: string[] = [];
  const total = dayDiffInclusive(start, end);
  for (let i = 0; i < total; i++) {
    output.push(toIsoDate(addDays(start, i)));
  }

  return output;
}

function dayDiffInclusive(start: Date, end: Date): number {
  const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const endMidnight = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return Math.floor((endMidnight - startMidnight) / 86400000) + 1;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseIsoDate(date: string): Date | null {
  const normalized = normalizeIsoDate(date);
  if (normalized == null) {
    return null;
  }

  const [year, month, day] = normalized.split("-").map((part) => Number(part));
  return new Date(year, month - 1, day);
}

function todayIsoDate(): string {
  const now = new Date();
  return toIsoDate(now);
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function isValidYear(year: unknown): year is number {
  return Number.isInteger(year) && (year as number) >= 1970 && (year as number) <= 9999;
}
