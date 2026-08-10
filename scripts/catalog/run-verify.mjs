import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const testsDir = path.join(projectDir, "tests");
const testFiles = fs.readdirSync(testsDir)
  .filter((name) => name.endsWith(".test.mjs"))
  .map((name) => path.join(testsDir, name));

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: projectDir,
    env: { ...process.env, KITRADE_BUILD_MODE: "production" },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

run(["--test", ...testFiles]);
run([path.join(projectDir, "scripts", "catalog", "sync-catalog.mjs")]);
run([path.join(projectDir, "scripts", "catalog", "build-site.mjs")]);
run([path.join(projectDir, "scripts", "catalog", "generate-seo-audits.mjs")]);
run([path.join(projectDir, "scripts", "catalog", "verify-build.mjs")]);
run([path.join(projectDir, "scripts", "catalog", "http-audit.mjs")]);
