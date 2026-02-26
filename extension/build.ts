await Bun.build({
  entrypoints: [
    "src/background.ts",
    "src/popup.ts",
  ],
  outdir: ".",
  target: "browser",
});

console.log("Build complete! Load the extension/ folder in Edge.");
