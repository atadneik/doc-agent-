import "reflect-metadata";
import "dotenv/config";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { CoreModule } from "./core";
import { DossiersModule } from "./dossiers";
import { DocumentsModule } from "./documents";
import { JobsModule } from "./jobs";
import { FindingsModule } from "./findings";
import { ReviewsModule } from "./reviews";
import { HealthModule } from "./health";
@Module({
  imports: [
    CoreModule,
    DossiersModule,
    DocumentsModule,
    JobsModule,
    FindingsModule,
    ReviewsModule,
    HealthModule,
  ],
})
class AppModule {}
async function main() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  await app.listen(Number(process.env.PORT || 3100), "127.0.0.1");
  app.getHttpServer().requestTimeout = 300000;
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
