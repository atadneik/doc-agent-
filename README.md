# MVP đối chiếu chứng từ logistics

Ứng dụng local tiếng Việt: tạo hồ sơ, upload PDF/ảnh, xử lý từng trang, bóc tách có bằng chứng, đối chiếu quy tắc có phiên bản, duyệt và xuất JSON.

**Trạng thái bàn giao:** build TS, 23 test Python, contract TS/Python và tích hợp MongoDB/Redis đã PASS với adapter kiểm thử. Inference Qwen và PaddleOCR thực tế **UNVERIFIED** vì chưa có trọng số/dependencies inference. GPU được xác nhận hoạt động ngoài sandbox. Xem [báo cáo kiểm chứng](docs/verification.md).

## Cài đặt

Đã khóa pnpm 10.18.3, Python dependencies trong `services/ai-worker/uv.lock`. Node 22.18.0 đã kiểm chứng; Python thực tế của venv là 3.11.15 (hệ thống có 3.10.12). Cần pnpm, uv và Docker Compose.

```bash
pnpm install --frozen-lockfile
uv sync --project services/ai-worker --locked
docker compose -f infra/compose.yaml up -d --wait
pnpm build
```

Tạo `.env` ở root dựa trên `.env.example` nếu cần đổi cấu hình. Mặc định đủ để chạy API và web; đường dẫn tương đối trong cấu hình được tính từ root repository.

```bash
pnpm start
```

Mở http://127.0.0.1:5173. Backend: http://127.0.0.1:3100/api. MongoDB: 27028; Redis: 6389. Tất cả bind localhost. `Ctrl+C` dừng web/backend/worker; `docker compose -f infra/compose.yaml stop` dừng hạ tầng và giữ dữ liệu.

`pnpm start` gọi đúng runtime Qwen local. Nếu thiếu model, worker thoát lỗi và UI báo chưa sẵn sàng; không tự chuyển sang fake adapter. Hồ sơ upload được giữ queued để xử lý sau khi worker hoạt động. Không chạy hai bản `pnpm start` cùng lúc.

## Tải model riêng, không tải lúc khởi động

Chưa tải checkpoint trong lần bàn giao vì ổ đĩa thiếu khoảng trống cho cả trọng số gốc và PyTorch/CUDA. Nên chuẩn bị ít nhất 20 GB trống để cài đặt và tải; đây là ngân sách vận hành, không phải khẳng định model vừa VRAM. Không cần cài CUDA toolkit riêng nếu wheel PyTorch và driver đã tương thích.

```bash
uv sync --project services/ai-worker --locked --extra inference --extra download
cd services/ai-worker
uv run --no-sync python -m entrypoints.download_model \
  --repo Qwen/Qwen3-VL-4B-Instruct \
  --revision ebb281ec70b05090aa6165b016eac8ec08e71b17 \
  --output ../../models/Qwen3-VL-4B-Instruct
cd ../..
```

Đặt `MODEL_PATH=./models/Qwen3-VL-4B-Instruct` trong `.env`. Lệnh tải dùng cache/resume của Hugging Face, một checkpoint, `max_workers=1`, ghi manifest repo/revision. Có thể chạy lại chính lệnh trên sau khi mạng bị gián đoạn.

Runtime dùng `Qwen3VLForConditionalGeneration`, Transformers 4.57.1, bitsandbytes 0.48.1, PyTorch 2.8.0/torchvision 0.23.0; NF4 4-bit, double quantization, BF16 nếu GPU hỗ trợ, nếu không FP16. Model và processor đều `local_files_only=True`, không remote code, không API/inference server, `device_map={'':0}` không CPU offload. Có khóa liên tiến trình trước khi nạp model và khóa runtime cho một lượt GPU tại một thời điểm. Chỉ model cùng kiến trúc Qwen3-VL nhỏ hơn được cấu hình qua MODEL_PATH; không tự thay thế.

```bash
services/ai-worker/.venv/bin/python scripts/generate-fixtures.py
cd services/ai-worker
uv run --no-sync python -m entrypoints.smoke_inference
```

Smoke dùng ảnh invoice tổng hợp, ghi `runtime/inference-report.json`. Exit 0 chỉ khi inference thật trả loại invoice; thiếu model/GPU hoặc lỗi cho exit 1, không mock. Kết quả ghi model/revision nếu có manifest, thời gian và peak VRAM. OOM inference được thử lại một lần với ít pixel/token; OOM khi nạp checkpoint trả lỗi tài nguyên ngay vì giảm pixel không giúp nạp weights.

## OCR cho trang scan

```bash
uv sync --project services/ai-worker --locked --extra inference --extra download --extra ocr
```

Cần cung cấp trọng số PaddleOCR local (detection và recognition) tại `OCR_DET_PATH`, `OCR_REC_PATH`. Dùng model tương thích PaddleOCR 3.2.0 và ngôn ngữ chứng từ. Có thể chuẩn bị model bằng công cụ chính thức PaddleOCR trên máy có mạng, sau đó trỏ hai đường dẫn tới thư mục đã giải nén. Adapter chạy `device='cpu'`, tắt orientation/unwarping/line-orientation; không tự tải model khi thiếu đường dẫn. OCR scan chưa được kiểm chứng thực tế trong bàn giao. PDF có text hữu ích không cần cài OCR.

## Xử lý một hồ sơ

1. Tạo hồ sơ với tên lô hàng. Mỗi hồ sơ tương ứng một lô; không trộn các lô không liên quan.
2. Chọn nhiều Invoice, Packing List, B/L, C/O ở ô upload. UI gọi upload rồi tạo job cho snapshot toàn bộ tài liệu hiện có.
3. Theo dõi queued → processing → completed/needs_review hoặc failed. Job lỗi tự thử tối đa ba lần; “Đối chiếu lại” tạo một job mới.
4. Mở dữ liệu bóc tách hoặc bằng chứng bên cạnh hai giá trị. Ảnh trang có highlight nếu tọa độ đã gắn được; liên kết tài liệu gốc dùng `#page=N`.
5. Chọn xác nhận, bác bỏ hoặc cần kiểm tra thêm; ghi chú và lưu. Lịch sử review có thời gian, không ghi đè quyết định cũ.
6. Xuất JSON toàn bộ hồ sơ, các phiên xử lý, bằng chứng và reviews.

API chính:

| Thao tác | Endpoint |
|---|---|
| Danh sách/tạo hồ sơ | GET/POST `/api/dossiers` |
| Upload multipart `files` | POST `/api/dossiers/:id/documents` |
| Tạo job (idempotency) | POST `/api/dossiers/:id/jobs` với `{ "request_key": "unique-request" }` |
| Chi tiết/xuất | GET `/api/dossiers/:id`, `/api/dossiers/:id/export` |
| Findings | GET `/api/dossiers/:id/findings` |
| Review | POST `/api/findings/:id/reviews` với `decision`, `note` |
| File/ảnh trang | GET `/api/documents/:id/file`, `/api/documents/:id/pages/:page` |
| Tín hiệu worker | GET `/api/health` |

Upload giới hạn mặc định 200 MiB/file, 20 file/request, timeout HTTP 300 giây. Không buffer toàn bộ PDF. Worker mặc định 100 trang/file, ảnh nguồn tối đa 40 megapixel, ảnh render ~1 megapixel, context tổng 4096 token gồm output, output 1024 token, một lần đọc lại/trang và 600 giây/job. Bằng chứng lưu trong Mongo giới hạn 12 MiB/job để tránh giới hạn BSON. Kết quả quá lớn cần chia bộ chứng từ.

## Kiểm thử tái lập

```bash
pnpm build
pnpm test
uv run --project services/ai-worker --locked pytest services/ai-worker/tests
pnpm integration
```

Nếu pytest chạy từ root gặp import path do môi trường tùy chỉnh, dùng `cd services/ai-worker && uv run --locked pytest`.

Integration tự tạo PDF từ `evaluation/fixtures/shipment.json`, chạy backend cổng 3101 và worker test, dùng database/Redis stream riêng, kiểm tra upload → queue → PDF → normalize → rules → Mongo → review/export/preview. Tiến trình con dừng khi xong. Giữ database test và runtime files để có thể kiểm tra; không tự xóa dữ liệu Docker hiện hữu. Kết quả ghi `runtime/integration-report.json`.

Fixture có đúng một sai lệch: Packing List 1000 kg, B/L 1050 kg. `TEST_ONLY_FAKE_INFERENCE` chỉ parse định dạng fixture tổng hợp; không dùng để đo độ chính xác thực tế. Entry point production không import adapter này. Bộ dữ liệu thật, scan, đa ngôn ngữ và bảng phức tạp chưa được đánh giá.

## Kiến trúc và quy ước

Xem [kiến trúc](docs/architecture.md), [chọn phiên bản](docs/dependencies.md), [AGENTS.md](AGENTS.md). Quy tắc demo trong `knowledge/rules/demo-v1.json` được kiểm tra theo JSON Schema. Chúng chỉ kiểm tra tính nhất quán, chưa được chuyên gia logistics xác nhận và không kết luận đủ điều kiện thông quan.

Không commit `.env`, weights, uploads, PDF/ảnh sinh ra, logs, database hoặc secrets. Không có xác thực nhiều người dùng; không bind ra mạng công khai.
