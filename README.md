# Habit Heatmap Plugin

Inline habit heatmaps for Obsidian via a `habit-heatmap` code block.

## Date Heading Format

Habit parsing is section-based and only activates after headings that match exactly:

- `YYYY.MM.dd` (example: `## 2026.02.10`)

Entries under that heading belong to that date until the next date heading.

## Habit Entry Formats

### Inline values (anywhere in text)

- `habit-<name>::<value>`
- Habit name format is **lower_snake_case** (with prefix `habit-`)
- Examples:
  - `habit-workout::35`
  - `habit-reading_minutes::23`
  - `habit-stop_smoking::true`
  - `habit-sugar::no`

Multiple tokens per line are supported.

Value rules:
- Numeric: integer/decimal, summed per day
- Boolean: strict `true|false|yes|no`

Boolean merge in one day:
1. Any inline `true/yes` => `true`
2. Else checklist state if present (`[x]` true, `[ ]` false)
3. Else inline `false/no` => `false`

### Checklist values

- Checkbox task text containing `habit-<name>`:
  - `- [x] habit-workout` => true
  - `- [ ] habit-workout` => false
  - `- [x] habit-reading 20min` => true

Checklist parsing also follows date heading boundaries.

Display labels:
- Habit names are rendered as title case labels by replacing `_` with spaces.
- Example: `stop_smoking` -> `Stop Smoking`

## Embed Block

Use a fenced code block:

```habit-heatmap
range:
  type: week
  fromTitle: true
habits:
  mode: auto
colors:
  noData: "#2b2b2b"
  blankFuture: "transparent"
  boolean:
    true: "#22c55e"
    false: "#ef4444"
  numeric:
    thresholds:
      - le: 0
        color: "#111827"
      - le: 10
        color: "#1f2937"
      - le: 25
        color: "#374151"
      - le: 50
        color: "#4b5563"
      - gt: 50
        color: "#6b7280"
display:
  title: ""
  showLegend: true
  cellSize: 12
  gap: 2
  weekStart: Monday
```

JSON is also supported.

## Range Modes

### Week
- `range.type: week`
- `range.fromTitle: true` required
- Current note title must be: `YYYY.MM.dd - YYYY.MM.dd`
- Inclusive span must be exactly 7 dates
- Scans current note only

### Month
- `range.type: month`
- Requires `range.year` and `range.month` (1-12)
- Scans markdown notes in current note directory only (no subdirectories)

### Year
- `range.type: year`
- Requires `range.year`
- Scans markdown notes in current note directory and all subdirectories

Files in folders named `templates` (case-insensitive) are ignored.

## Habits Mode

- `habits.mode: auto` -> detect habits from scanned data in selected range
- `habits.mode: list` -> explicit list via `habits.list`

If auto finds none, render shows `No habits found in range`.

## Missing Day Behavior

For missing habit data on a date:
- Past dates (< today): `colors.noData` (treated as missed)
- Today and future dates: `colors.blankFuture` (blank)

## Interaction

- Hover each cell for tooltip: date + value/status
- Click cell to open note and jump to closest matching date heading
- Best note selection for click:
  - Week: current note
  - Month/Year: prefer note with data for that habit/date, else first note with that date heading

## Command

Command palette:
- `Insert habit heatmap`
- `Refresh habit heatmaps`

Inserts a template block at cursor.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
