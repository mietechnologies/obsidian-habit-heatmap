import esbuild from "esbuild";

const isProd = process.argv.includes("--prod");
const isWatch = process.argv.includes("--watch");

const context = await esbuild.context({
  entryPoints: ["main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*"],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: isProd ? false : "inline",
  treeShaking: true,
  outfile: "main.js"
});

if (isWatch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
