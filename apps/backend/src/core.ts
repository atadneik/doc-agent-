import { Global, Injectable, Module, OnModuleInit } from "@nestjs/common";
import { MongoClient, Db } from "mongodb";
import Redis from "ioredis";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Transform, Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export abstract class StoragePort {
  abstract save(
    stream: Readable,
  ): Promise<{ key: string; sha256: string; size: number }>;
  abstract path(key: string): string;
  abstract remove(key: string): Promise<void>;
}
@Injectable()
export class LocalStorage extends StoragePort {
  root = resolve(process.env.STORAGE_ROOT || "runtime/storage");
  path(key: string) {
    if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("Invalid storage key");
    return resolve(this.root, key);
  }
  async remove(key: string) {
    await unlink(this.path(key)).catch(() => {});
  }
  async save(stream: Readable) {
    await mkdir(this.root, { recursive: true });
    const key = randomUUID(),
      hash = createHash("sha256");
    let size = 0;
    const tap = new Transform({
      transform(chunk, _encoding, cb) {
        size += chunk.length;
        hash.update(chunk);
        cb(null, chunk);
      },
    });
    try {
      await pipeline(
        stream,
        tap,
        createWriteStream(this.path(key), { flags: "wx", mode: 0o600 }),
      );
    } catch (error) {
      await this.remove(key);
      throw error;
    }
    return { key, sha256: hash.digest("hex"), size };
  }
}
@Injectable()
export class Data implements OnModuleInit {
  client = new MongoClient(
    process.env.MONGO_URL || "mongodb://127.0.0.1:27028",
  );
  db!: Db;
  redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6389", {
    maxRetriesPerRequest: 1,
  });
  async onModuleInit() {
    this.redis.on("error", (e) => console.error("Redis:", e.message));
    await this.client.connect();
    this.db = this.client.db(process.env.MONGO_DB || "logistics");
    await this.db
      .collection("jobs")
      .createIndex({ dossier_id: 1, request_key: 1 }, { unique: true });
    await this.db
      .collection("results")
      .createIndex({ job_id: 1 }, { unique: true });
    await this.db.collection("documents").createIndex({ dossier_id: 1 });
  }
  collection(name: string): any {
    return this.db.collection(name);
  }
}
@Global()
@Module({
  providers: [Data, { provide: StoragePort, useClass: LocalStorage }],
  exports: [Data, StoragePort],
})
export class CoreModule {}
