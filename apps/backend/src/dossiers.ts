import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Module,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Data } from "./core";
@Controller("dossiers")
class DossiersController {
  constructor(private data: Data) {}
  @Get() list() {
    return this.data
      .collection("dossiers")
      .find()
      .sort({ created_at: -1 })
      .limit(200)
      .toArray();
  }
  @Post() async create(@Body() body: { name: string }) {
    if (
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.length > 200
    )
      throw new BadRequestException("Tên hồ sơ không hợp lệ");
    const dossier = {
      _id: randomUUID(),
      name: body.name.trim(),
      created_at: new Date(),
    };
    await this.data.collection("dossiers").insertOne(dossier);
    return dossier;
  }
  @Get(":id") async get(@Param("id") id: string) {
    const dossier = await this.data.collection("dossiers").findOne({ _id: id });
    if (!dossier) throw new NotFoundException();
    const [documents, jobs, results, reviews] = await Promise.all(
      ["documents", "jobs", "results", "reviews"].map((c) =>
        this.data.collection(c).find({ dossier_id: id }).toArray(),
      ),
    );
    return {
      ...dossier,
      documents: documents.map(({ key, ...d }: any) => d),
      jobs: jobs.map(({ result, token, ...job }: any) => job),
      results,
      reviews,
    };
  }
  @Get(":id/export") export(@Param("id") id: string) {
    return this.get(id);
  }
}
@Module({ controllers: [DossiersController] })
export class DossiersModule {}
