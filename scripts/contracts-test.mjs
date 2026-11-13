import Ajv from "ajv";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const ajv = new Ajv();
const schema = (name) =>
  JSON.parse(readFileSync("contracts/schemas/" + name + ".json", "utf8"));
const review = ajv.compile(schema("review"));
assert(review({ decision: "confirmed", note: "Đã kiểm tra" }));
assert(!review({ decision: "approve", note: "" }));
assert(!review({ decision: "confirmed", note: "", unexpected: true }));
const rules = ajv.compile(schema("rules"));
assert(rules(JSON.parse(readFileSync("knowledge/rules/demo-v1.json", "utf8"))));
const field = ajv.compile(schema("field"));
const evidence = {
  raw_value: "1000",
  normalized_value: "1000",
  unit: "kg",
  currency: null,
  document_id: "doc",
  page_number: 1,
  evidence_text: "gross weight 1000 kg",
  bbox: [0, 0, 10, 10],
  coordinate_system: "pdf_points",
  page_width: 595,
  page_height: 842,
  extraction_method: "pdf_text",
  verification_status: "anchored",
  scope: "shipment",
  scope_id: null,
};
assert(field(evidence));
assert(!field({ ...evidence, page_number: 0 }));
assert(!field({ ...evidence, bbox: [1, 2] }));
console.log("PASS TS shared contracts: reviews, rules, evidence");
