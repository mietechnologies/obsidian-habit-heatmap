import { TFile } from "obsidian";

export type RangeType = "week" | "month" | "year";
export type HabitMode = "auto" | "list";
export type WeekStart = "Monday" | "Sunday";

export interface HeatmapBlockConfig {
  range?: {
    type?: RangeType;
    year?: number;
    month?: number;
    fromTitle?: boolean;
  };
  habits?: {
    mode?: HabitMode;
    list?: string[];
  };
  colors?: {
    noData?: string;
    blankFuture?: string;
    boolean?: {
      true?: string;
      false?: string;
    };
    numeric?: {
      thresholds?: NumericThresholdConfig[];
    };
  };
  display?: {
    title?: string;
    showLegend?: boolean;
    cellSize?: number;
    gap?: number;
    weekStart?: WeekStart;
  };
}

export type NumericThresholdConfig =
  | {
      le: number;
      color: string;
    }
  | {
      gt: number;
      color: string;
    };

export type NumericThreshold =
  | {
      kind: "le";
      value: number;
      color: string;
    }
  | {
      kind: "gt";
      value: number;
      color: string;
    };

export interface NormalizedConfig {
  range: {
    type: RangeType;
    year?: number;
    month?: number;
    fromTitle?: boolean;
  };
  habits: {
    mode: HabitMode;
    list: string[];
  };
  colors: {
    noData: string;
    blankFuture: string;
    boolean: {
      true: string;
      false: string;
    };
    numeric: {
      thresholds: NumericThreshold[];
    };
  };
  display: {
    title: string;
    showLegend: boolean;
    cellSize: number;
    gap: number;
    weekStart: WeekStart;
  };
}

export interface RangeResolution {
  type: RangeType;
  startDate: string;
  endDate: string;
  dates: string[];
}

export type ResolvedHabitValue =
  | {
      kind: "numeric";
      value: number;
    }
  | {
      kind: "boolean";
      value: boolean;
    };

export interface DateAccumulator {
  numericSum: number;
  hasNumeric: boolean;
  inlineTrue: boolean;
  inlineFalse: boolean;
  checklistTrue: boolean;
  checklistFalse: boolean;
}

export interface ParsedFileData {
  file: TFile;
  valuesByDateHabit: Map<string, Map<string, ResolvedHabitValue>>;
  headingLinesByDate: Map<string, number[]>;
}

export interface ParseLineResult {
  date: string;
  habit: string;
  accumulator: DateAccumulator;
}

export interface ScanCandidate {
  file: TFile;
  headingLine: number;
  habitsWithData: Set<string>;
}

export interface ScanResult {
  dates: string[];
  valuesByHabit: Map<string, Map<string, ResolvedHabitValue>>;
  habitsFound: Set<string>;
  candidatesByDate: Map<string, ScanCandidate[]>;
  scannedFiles: TFile[];
}

export interface RenderContextModel {
  currentFile: TFile;
  config: NormalizedConfig;
  range: RangeResolution;
  scan: ScanResult;
}
