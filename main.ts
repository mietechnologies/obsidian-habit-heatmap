import { Editor, MarkdownFileInfo, MarkdownView, Plugin, TAbstractFile, TFile } from "obsidian";
import { HabitHeatmapRenderer } from "./renderer";
import { HabitScanner } from "./scanner";

const TEMPLATE_BLOCK = "```habit-heatmap\nrange:\n  type: week\n  fromTitle: true\nhabits:\n  mode: auto\ncolors:\n  noData: \"#2b2b2b\"\n  boolean:\n    true: \"#22c55e\"\n    false: \"#ef4444\"\n  numeric:\n    thresholds:\n      - le: 0\n        color: \"#111827\"\n      - le: 10\n        color: \"#1f2937\"\n      - le: 25\n        color: \"#374151\"\n      - le: 50\n        color: \"#4b5563\"\n      - gt: 50\n        color: \"#6b7280\"\ndisplay:\n  title: \"\"\n  showLegend: true\n  cellSize: 12\n  gap: 2\n```";

export default class HabitHeatmapPlugin extends Plugin {
  private scanner!: HabitScanner;
  private renderer!: HabitHeatmapRenderer;
  private refreshTimer: number | null = null;

  onload() {
    this.scanner = new HabitScanner(this.app);
    this.renderer = new HabitHeatmapRenderer(this.app, this.scanner);

    this.registerMarkdownCodeBlockProcessor("habit-heatmap", (source, el, ctx) => {
      void this.renderer.render(source, el, ctx).catch((error) => {
        console.error("habit-heatmap: render failed", error);
      });
    });

    this.addCommand({
      id: "insert-heatmap",
      name: "Insert heatmap",
      editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
        this.insertTemplate(editor, ctx.file ?? null);
      }
    });

    this.addCommand({
      id: "refresh-heatmaps",
      name: "Refresh heatmaps",
      callback: () => {
        this.refreshOpenMarkdownPreviews();
      }
    });

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.scanner.invalidatePath(file.path);
          this.scheduleRefresh();
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.invalidateIfMarkdown(file);
        this.scheduleRefresh();
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile && file.extension === "md") {
          this.scanner.invalidatePath(file.path);
        }
        this.scanner.invalidatePath(oldPath);
        this.scheduleRefresh();
      })
    );
  }

  onunload() {
    if (this.refreshTimer != null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.scanner.clear();
  }

  private insertTemplate(editor: Editor, file: TFile | null): void {
    const insertion = file != null && editor.getValue().length > 0 ? `\n\n${TEMPLATE_BLOCK}\n` : `${TEMPLATE_BLOCK}\n`;
    editor.replaceSelection(insertion);
  }

  private invalidateIfMarkdown(file: TAbstractFile): void {
    if (file instanceof TFile && file.extension === "md") {
      this.scanner.invalidatePath(file.path);
    }
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer != null) {
      window.clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.refreshOpenMarkdownPreviews();
    }, 120);
  }

  private refreshOpenMarkdownPreviews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) {
        continue;
      }

      view.previewMode.rerender(true);
    }
  }
}
