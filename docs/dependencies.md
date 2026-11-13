# Phiên bản và nguồn chính thức

Đã đối chiếu tài liệu ngày 2026-09-15 và chọn bộ phiên bản cụ thể, không dùng `latest`. Lockfiles giữ transitive dependencies; không khẳng định đây là bộ mới nhất.

| Thành phần | Phiên bản |
|---|---|
| Node đã đo / pnpm dự án | 22.18.0 / 10.18.3 |
| NestJS / TypeScript | 11.1.6 / 5.9.3 |
| React / Vite | 19.1.1 / 7.1.9 |
| MongoDB / Redis image | 7.0.16 / 7.4.2-alpine |
| Python venv / uv đã đo | 3.11.15 / 0.11.7 |
| PyTorch / torchvision | 2.8.0 / 0.23.0 |
| Transformers / bitsandbytes / Accelerate | 4.57.1 / 0.48.1 / 1.10.1 |
| PaddleOCR / PaddlePaddle CPU | 3.2.0 / 3.2.0 |
| PyMuPDF / Pydantic / JSON Schema validator | 1.26.5 / 2.12.3 / 4.25.1 |

Qwen3-VL implementation tồn tại trong [source tag Transformers v4.57.1](https://github.com/huggingface/transformers/blob/v4.57.1/src/transformers/models/qwen3_vl/modeling_qwen3_vl.py). Tích hợp NF4 dựa trên [hướng dẫn quantization Transformers v4.57.1](https://huggingface.co/docs/transformers/v4.57.1/en/quantization/bitsandbytes) và [bitsandbytes 0.48.1 installation](https://huggingface.co/docs/bitsandbytes/v0.48.1/installation). Đây là xác minh hỗ trợ ở tài liệu/source; chưa có phép chạy GPU thực tế trong dự án.

[Model repository](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct/tree/ebb281ec70b05090aa6165b016eac8ec08e71b17) liệt kê hai shard gốc khoảng 4,97 GB + 3,91 GB; lượng tử hóa runtime không loại bỏ nhu cầu lưu weights gốc. Revision dùng trong lệnh tải là `ebb281ec70b05090aa6165b016eac8ec08e71b17`.

Các nguồn đã tham khảo thêm: [Vite prerequisites](https://vite.dev/guide/), [Nest migration](https://docs.nestjs.com/migration-guide), [PaddleOCR quick start](https://www.paddleocr.ai/main/en/quick_start.html), [Redis XAUTOCLAIM](https://redis.io/docs/latest/commands/xautoclaim/). Build thực tế là xác nhận cho bộ Node/TS hiện tại; OCR runtime vẫn chưa kiểm chứng.
