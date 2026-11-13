import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../apps/backend/package.json", import.meta.url),
);
const { Jobs } = require("./dist/jobs.js");
let stored;
let unavailable = true;
const messages = [];
const data = {
  collection(name) {
    return {
      find() {
        return name === "documents"
          ? { toArray: async () => [{ _id: "document" }] }
          : {
              limit() {
                return { toArray: async () => (stored ? [stored] : []) };
              },
            };
      },
      async updateOne(query, update) {
        if (update.$setOnInsert && !stored) stored = update.$setOnInsert;
        if (update.$set) Object.assign(stored, update.$set);
      },
      async findOne() {
        return stored;
      },
    };
  },
  redis: {
    async xadd(...message) {
      if (unavailable) throw new Error("simulated Redis outage");
      messages.push(message);
    },
  },
};
const service = new Jobs(data);
const original = console.error;
console.error = () => {};
const job = await service.create("dossier", "request");
console.error = original;
assert.equal(job.status, "queued");
assert.equal(job.dispatch_at.getTime(), 0);
assert.equal(messages.length, 0);
unavailable = false;
await service.dispatch();
assert.equal(messages.length, 1);
assert.equal(messages[0].at(-1), job._id);
assert(job.dispatch_at.getTime() > 0);
console.log("PASS Mongo job survives failed enqueue and dispatcher recovers");
