import {
  BadRequestException,
  Body,
  Controller,
  Module,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";
import Ajv from "ajv";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Data } from "./core";
const validate = new Ajv().compile(
  JSON.parse(readFileSync("contracts/schemas/review.json", "utf8")),
);
@Controller("findings")
class ReviewsController {
  constructor(private data: Data) {}
  @Post(":id/reviews") async review(
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    if (!validate(body)) throw new BadRequestException(validate.errors);
    const result = await this.data
      .collection("results")
      .findOne({ "findings.id": id });
    if (!result) throw new NotFoundException();
    const review = {
      _id: randomUUID(),
      finding_id: id,
      dossier_id: result.dossier_id,
      ...(body as object),
      created_at: new Date(),
    };
    await this.data.collection("reviews").insertOne(review);
    return review;
  }
}
@Module({ controllers: [ReviewsController] })
export class ReviewsModule {}
