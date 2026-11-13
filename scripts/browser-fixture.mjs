import { openAsBlob } from "node:fs";
const base = "http://127.0.0.1:3100/api";
const list = await (await fetch(base + "/dossiers")).json();
const dossier = list.find(
  (d) => d.name === "Kiểm thử giao diện — chứng từ tổng hợp",
);
if (!dossier)
  throw new Error("Create the explicitly named synthetic test dossier first");
const form = new FormData();
for (const name of [
  "invoice",
  "packing_list",
  "bill_of_lading",
  "certificate_of_origin",
])
  form.append(
    "files",
    await openAsBlob("runtime/fixtures/" + name + ".pdf", {
      type: "application/pdf",
    }),
    name + ".pdf",
  );
const uploaded = await fetch(base + "/dossiers/" + dossier._id + "/documents", {
  method: "POST",
  body: form,
});
if (!uploaded.ok) throw new Error(await uploaded.text());
const job = await fetch(base + "/dossiers/" + dossier._id + "/jobs", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ request_key: "browser-synthetic-test" }),
});
if (!job.ok) throw new Error(await job.text());
console.log(await job.json());
