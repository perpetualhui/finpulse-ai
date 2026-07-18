import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  env: { ...process.env, GITHUB_PAGES_BUILD: "1" },
});

child.on("exit", (code) => process.exit(code ?? 1));
