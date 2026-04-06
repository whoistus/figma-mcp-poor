import { build, context } from "esbuild";
import { copyFileSync } from "fs";

const isWatch = process.argv.includes("--watch");

const buildOptions = {
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "dist/main.js",
  target: "es2017",
  format: "iife",
  sourcemap: false,
};

if (isWatch) {
  const ctx = await context(buildOptions);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await build(buildOptions);
}

copyFileSync("src/ui.html", "dist/ui.html");
console.log("Build complete.");
