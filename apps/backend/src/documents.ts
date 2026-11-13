import {
  BadRequestException,
  Controller,
  Get,
  Module,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import busboy from "busboy";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { Data, StoragePort } from "./core";
@Controller()
class DocumentsController {
  private previews = 0;
  constructor(
    private data: Data,
    private storage: StoragePort,
  ) {}
  @Post("dossiers/:id/documents") async upload(
    @Param("id") id: string,
    @Req() req: Request,
  ) {
    if (!(await this.data.collection("dossiers").findOne({ _id: id })))
      throw new NotFoundException();
    const tasks: Promise<any>[] = [];
    const saved: any[] = [];
    let failure = "";
    try {
      const parser = busboy({
        headers: req.headers,
        limits: {
          fileSize: Number(process.env.MAX_FILE_MB || 200) * 1024 * 1024,
          files: 20,
          fields: 0,
          parts: 20,
        },
      });
      parser.on("filesLimit", () => {
        failure = "Tối đa 20 file";
      });
      parser.on("partsLimit", () => {
        failure = "Quá nhiều phần upload";
      });
      parser.on("file", (_field, stream, info) => {
        if (
          !["application/pdf", "image/png", "image/jpeg"].includes(
            info.mimeType,
          )
        ) {
          failure = "Chỉ nhận PDF, PNG, JPEG";
          stream.resume();
          return;
        }
        tasks.push(
          (async () => {
            const file = await this.storage.save(stream);
            saved.push(file);
            if (stream.truncated) {
              failure = "File vượt giới hạn dung lượng";
              return;
            }
            return {
              _id: randomUUID(),
              dossier_id: id,
              ...file,
              filename: info.filename.slice(0, 255),
              mime_type: info.mimeType,
              created_at: new Date(),
            };
          })().catch((e) => {
            failure = String(e);
          }),
        );
      });
      await new Promise<void>((resolve, reject) => {
        parser.on("close", resolve);
        parser.on("error", reject);
        req.on("aborted", () => {
          parser.destroy(new Error("Upload bị ngắt"));
        });
        req.pipe(parser);
      });
      const docs = (await Promise.all(tasks)).filter(Boolean);
      if (failure || !docs.length) throw new Error(failure || "Không có file");
      await this.data.collection("documents").insertMany(docs);
      return docs.map(({ key, ...d }: any) => d);
    } catch (error) {
      await Promise.allSettled(tasks);
      await Promise.all(saved.map((f) => this.storage.remove(f.key)));
      throw new BadRequestException(String(error));
    }
  }
  @Get("documents/:id/file") async file(
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const doc = await this.data.collection("documents").findOne({ _id: id });
    if (!doc) throw new NotFoundException();
    res.setHeader("Content-Type", doc.mime_type);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", "inline");
    createReadStream(this.storage.path(doc.key))
      .on("error", () => res.destroy())
      .pipe(res);
  }
  @Get("documents/:id/pages/:page") async page(
    @Param("id") id: string,
    @Param("page") page: string,
    @Res() res: Response,
  ) {
    if (!/^[1-9][0-9]{0,3}$/.test(page))
      throw new BadRequestException("Trang không hợp lệ");
    if (this.previews >= 2)
      throw new BadRequestException("Đang tạo ảnh xem trước, vui lòng thử lại");
    const doc = await this.data.collection("documents").findOne({ _id: id });
    if (!doc) throw new NotFoundException();
    this.previews++;
    try {
      const image = await new Promise<Buffer>((ok, fail) =>
        execFile(
          resolve("services/ai-worker/.venv/bin/python"),
          [
            resolve("scripts/render-page.py"),
            this.storage.path(doc.key),
            doc.mime_type,
            page,
          ],
          { timeout: 20000, maxBuffer: 8 * 1024 * 1024, encoding: "buffer" },
          (err, stdout) => (err ? fail(err) : ok(stdout)),
        ),
      );
      res.type("png").send(image);
    } catch {
      throw new BadRequestException("Không thể mở trang tài liệu");
    } finally {
      this.previews--;
    }
  }
}
@Module({ controllers: [DocumentsController] })
export class DocumentsModule {}
