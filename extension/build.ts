await Bun.build({
  entrypoints: [
    "src/workers/background.ts",
    "src/ui/popup.ts",
  ],
  outdir: ".",
  target: "browser",
  naming: "[name].js",
});

console.log("Build complete! Load the extension/ folder in Edge.");
