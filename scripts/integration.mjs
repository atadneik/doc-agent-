import { spawn } from "node:child_process";
import { openAsBlob } from "node:fs";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import Ajv from "ajv";
import { Readable } from "node:stream";
const root = process.cwd();
const database = "logistics_test_" + Date.now();
const env = {
  ...process.env,
  MONGO_DB: database,
  REDIS_STREAM: database + ":jobs",
  PORT: "3101",
  MAX_FILE_MB: "1",
  STORAGE_ROOT: root + "/runtime/integration-storage",
};
const children = [];
const logs = [];
function start(cmd, args, cwd = root) {
  const child = spawn(cmd, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  child.stdout.on("data", (d) => logs.push(String(d)));
  child.stderr.on("data", (d) => logs.push(String(d)));
  return child;
}
async function command(cmd, args, cwd = root) {
  const child = start(cmd, args, cwd);
  await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(cmd + " exit " + code)),
    );
  });
}
async function api(path, options) {
  const res = await fetch("http://127.0.0.1:3101/api" + path, options);
  const body = await res.json();
  assert(res.ok, JSON.stringify(body));
  return body;
}
const post = (body) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
try {
  await command("services/ai-worker/.venv/bin/python", [
    "scripts/generate-fixtures.py",
  ]);
  start("node", ["apps/backend/dist/main.js"]);
  for (let i = 0; i < 60; i++) {
    try {
      await api("/dossiers");
      break;
    } catch {
      if (i === 59) throw new Error("Backend startup failed");
      await delay(500);
    }
  }
  const dossier = await api(
    "/dossiers",
    post({ name: "TEST tổng hợp — 1 sai lệch biết trước" }),
  );
  const boundary = "logistics-test-boundary";
  async function* oversized() {
    yield `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="oversized.pdf"\r\nContent-Type: application/pdf\r\n\r\n`;
    for (let i = 0; i < 32; i++) yield Buffer.alloc(65536, 65);
    yield `\r\n--${boundary}--\r\n`;
  }
  const rejected = await fetch(
    "http://127.0.0.1:3101/api/dossiers/" + dossier._id + "/documents",
    {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=" + boundary },
      body: Readable.from(oversized()),
      duplex: "half",
    },
  );
  assert.equal(
    rejected.status,
    400,
    "streamed file above configured limit rejected",
  );
  assert.equal((await api("/dossiers/" + dossier._id)).documents.length, 0);
  const form = new FormData();
  for (const name of [
    "invoice",
    "packing_list",
    "bill_of_lading",
    "certificate_of_origin",
  ])
    form.append(
      "files",
      await openAsBlob(root + "/runtime/fixtures/" + name + ".pdf", {
        type: "application/pdf",
      }),
      name + ".pdf",
    );
  const documents = await api("/dossiers/" + dossier._id + "/documents", {
    method: "POST",
    body: form,
  });
  assert.equal(documents.length, 4);
  assert(documents.every((d) => d.sha256.length === 64));
  const job = await api(
    "/dossiers/" + dossier._id + "/jobs",
    post({ request_key: "integration-1" }),
  );
  const duplicate = await api(
    "/dossiers/" + dossier._id + "/jobs",
    post({ request_key: "integration-1" }),
  );
  assert.equal(job._id, duplicate._id);
  start(
    root + "/services/ai-worker/.venv/bin/python",
    ["-m", "tests.run_fake_worker"],
    root + "/services/ai-worker",
  );
  let data;
  for (let i = 0; i < 90; i++) {
    data = await api("/dossiers/" + dossier._id);
    if (data.results.length) break;
    assert(
      !data.jobs.some((j) => j.status === "failed"),
      JSON.stringify(data.jobs),
    );
    await delay(500);
  }
  assert.equal(data.results.length, 1, "worker result persisted");
  const result = data.results[0];
  assert.equal(result.model, "TEST_ONLY_FAKE_INFERENCE");
  const validate = new Ajv().compile(
    JSON.parse(await readFile("contracts/schemas/extraction.json", "utf8")),
  );
  for (const extraction of result.extractions)
    assert(validate(extraction), JSON.stringify(validate.errors));
  const mismatches = result.findings.filter((f) => f.status === "mismatch");
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0].rule.id, "gross-weight");
  assert.equal(mismatches[0].left[0].normalized_value, "1000");
  assert.equal(mismatches[0].right[0].normalized_value, "1050");
  assert(mismatches[0].left[0].bbox, "real PDF evidence coordinates");
  await api(
    "/findings/" + mismatches[0].id + "/reviews",
    post({ decision: "confirmed", note: "Đã kiểm tra fixture: chênh 50 kg" }),
  );
  const exported = await api("/dossiers/" + dossier._id + "/export");
  assert.equal(exported.reviews.length, 1);
  const preview = await fetch(
    "http://127.0.0.1:3101/api/documents/" + documents[0]._id + "/pages/1",
  );
  assert(preview.ok);
  assert.equal(preview.headers.get("content-type"), "image/png");
  assert((await preview.arrayBuffer()).byteLength > 1000);
  await command(
    root + "/services/ai-worker/.venv/bin/python",
    ["-m", "tests.integration_resilience", job._id],
    root + "/services/ai-worker",
  );
  await delay(2000);
  data = await api("/dossiers/" + dossier._id);
  assert.equal(data.results.length, 1);
  const report = {
    status: "PASS",
    inference: "TEST_ONLY_FAKE_INFERENCE",
    database,
    dossier_id: dossier._id,
    checks: [
      "stream upload four PDFs",
      "SHA256",
      "idempotent job creation",
      "Redis consumer group",
      "worker PDF extraction",
      "one known mismatch",
      "TS validation of actual Python result",
      "review persistence",
      "JSON export",
      "page preview",
      "resilience checks",
    ],
    mismatches: mismatches.length,
  };
  await mkdir("runtime", { recursive: true });
  await writeFile(
    "runtime/integration-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  console.error(logs.join("").slice(-15000));
  throw e;
} finally {
  for (const child of children)
    if (child.exitCode === null) child.kill("SIGTERM");
}
