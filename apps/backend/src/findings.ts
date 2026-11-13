import { Controller, Get, Module, Param } from "@nestjs/common";
import { Data } from "./core";
@Controller("dossiers/:id/findings")
class FindingsController {
  constructor(private data: Data) {}
  @Get() async list(@Param("id") id: string) {
    return (
      await this.data.collection("results").find({ dossier_id: id }).toArray()
    ).flatMap((r: any) => r.findings);
  }
}
@Module({ controllers: [FindingsController] })
export class FindingsModule {}
