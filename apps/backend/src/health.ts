import { Controller, Get, Module } from "@nestjs/common";
import { readFile } from "node:fs/promises";
@Controller("health")
class HealthController {
  @Get() async health() {
    try {
      const state = JSON.parse(
        await readFile("runtime/worker-status.json", "utf8"),
      );
      if (Date.now() - state.timestamp > 90000)
        return {
          worker: "unavailable",
          message:
            "Worker không còn gửi tín hiệu hoạt động. Hồ sơ sẽ chờ đến khi worker được khởi động.",
        };
      return state;
    } catch {
      return {
        worker: "unavailable",
        message:
          "Worker chưa khởi động. Cần cấu hình trọng số local để xử lý chứng từ.",
      };
    }
  }
}
@Module({ controllers: [HealthController] })
export class HealthModule {}
