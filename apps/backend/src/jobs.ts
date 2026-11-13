import {
  BadRequestException,
  Controller,
  Injectable,
  Module,
  OnModuleInit,
  Param,
  Post,
  Body,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Data } from "./core";
@Injectable()
export class Jobs implements OnModuleInit {
  constructor(private data: Data) {}
  onModuleInit() {
    setInterval(() => this.dispatch().catch(console.error), 3000).unref();
  }
  async create(dossier_id: string, request_key: string) {
    const docs = await this.data
      .collection("documents")
      .find({ dossier_id })
      .toArray();
    if (!docs.length) throw new BadRequestException("Hồ sơ chưa có tài liệu");
    if (!request_key || request_key.length > 100)
      throw new BadRequestException("Thiếu request_key");
    const job = {
      _id: randomUUID(),
      dossier_id,
      request_key,
      document_ids: docs.map((d: any) => d._id),
      status: "queued",
      attempts: 0,
      created_at: new Date(),
      dispatch_at: new Date(0),
    };
    await this.data
      .collection("jobs")
      .updateOne(
        { dossier_id, request_key },
        { $setOnInsert: job },
        { upsert: true },
      );
    await this.dispatch().catch(console.error);
    return this.data.collection("jobs").findOne({ dossier_id, request_key });
  }
  async dispatch() {
    // Durable Mongo outbox: repeat delivery is safe; worker deduplicates by job ID.
    const jobs = await this.data
      .collection("jobs")
      .find({
        status: "queued",
        dispatch_at: { $lt: new Date(Date.now() - 30000) },
      })
      .limit(100)
      .toArray();
    for (const job of jobs) {
      await this.data.redis.xadd(
        process.env.REDIS_STREAM || "logistics:jobs",
        "*",
        "job_id",
        job._id,
      );
      await this.data
        .collection("jobs")
        .updateOne(
          { _id: job._id, status: "queued" },
          { $set: { dispatch_at: new Date() } },
        );
    }
  }
}
@Controller("dossiers/:id/jobs")
class JobsController {
  constructor(private jobs: Jobs) {}
  @Post() create(
    @Param("id") id: string,
    @Body() body: { request_key: string },
  ) {
    return this.jobs.create(id, body.request_key);
  }
}
@Module({ controllers: [JobsController], providers: [Jobs], exports: [Jobs] })
export class JobsModule {}
