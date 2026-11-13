import { spawn } from "node:child_process";
import { resolve } from "node:path";
const root = process.cwd(),
  children = [];
function start(cmd, args, cwd = root) {
  const child = spawn(cmd, args, { cwd, stdio: "inherit", env: process.env });
  children.push(child);
  child.on("error", (e) => console.error(e.message));
  return child;
}
start("node", ["apps/backend/dist/main.js"]);
start(
  "node",
  [resolve("apps/web/node_modules/vite/bin/vite.js"), "preview"],
  resolve("apps/web"),
);
const worker = start(
  resolve("services/ai-worker/.venv/bin/python"),
  ["-m", "entrypoints.worker"],
  resolve("services/ai-worker"),
);
worker.on("exit", (code) => {
  if (code)
    console.error(
      "INFERENCE_UNVERIFIED: worker không khởi động được; xem lỗi phía trên. Web/API vẫn chạy để quản lý hồ sơ.",
    );
});
function stop() {
  for (const child of children) child.kill("SIGTERM");
  process.exit();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
