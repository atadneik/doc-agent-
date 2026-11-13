# Báo cáo kiểm chứng — 2026-09-15

## Phạm vi bàn giao

Source hoạt động, monorepo, lockfiles, Compose, schema, rules, fixtures và UI đã được triển khai. Luồng end-to-end được kiểm chứng với PDF thật sinh từ dữ liệu tổng hợp, MongoDB/Redis thật và **fake inference được ghi nhãn rõ**. Chưa xác nhận pipeline model/OCR với chứng từ thực tế.

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Khảo sát repository/AGENTS | PASS | Repository ban đầu trống; không có AGENTS ở root/ancestors đã kiểm tra |
| Typecheck/build NestJS + React/Vite | PASS | `pnpm build` |
| Python domain/contracts/PDF | PASS | 23 tests: số, ngày, đơn vị, rule, evidence, missing adjustments, stable finding IDs, PDF xoay, page limit, scan thiếu OCR |
| TS JSON Schema | PASS | `pnpm test`: review, rules, evidence; integration validate Python output bằng AJV |
| Mongo + Redis riêng MVP | PASS | Docker Compose healthy, ports localhost 27028/6389 |
| Upload → worker → persistence | PASS | 4 PDF, SHA256, queue consumer, extraction, một sai lệch gross weight 1000/1050 kg |
| Chặn upload vượt ngưỡng | PASS | Gửi multipart 2 MiB bằng stream với giới hạn test 1 MiB; HTTP 400, không lưu document record |
| Retry/idempotency/recovery | PASS | competing claim, stale lease token, 3-attempt limit, unique results, projection repair, Redis XAUTOCLAIM |
| Job đã lưu nhưng enqueue lỗi | PASS | TS test Redis failure rồi dispatcher phục hồi |
| Review/export/ảnh trang | PASS | API integration; review ghi chú/thời gian và PNG response |
| UI tạo hồ sơ/xem finding/duyệt/highlight | PASS | Chrome: ảnh trang naturalWidth 861, highlight thật, lưu ghi chú 50 kg |
| Upload file qua công cụ Chrome | UNVERIFIED | Công cụ từ chối đường dẫn vì workspace roots; fixture được nạp qua API, upload API đã PASS |
| Qwen inference thật | INFERENCE_UNVERIFIED | Smoke thực thi, exit 1, thiếu MODEL_PATH/checkpoint; `runtime/inference-report.json` |
| PaddleOCR CPU thật | UNVERIFIED | Chưa cài extra OCR và chưa có detection/recognition weights local |
| OOM thực tế / hard timeout native | UNVERIFIED | Có mã bounded retry/timeout, chưa gây OOM/GPU hang để thử |
| Độ chính xác trên chứng từ thật | UNVERIFIED | Không có tập dữ liệu thực đã gán nhãn |

## Tài nguyên đo được

- CPU: Intel Core i5-13500HX, 14 core / 20 logical CPU.
- RAM: khoảng 15 GiB, khả dụng ban đầu 5,9 GiB; swap 2 GiB.
- GPU: NVIDIA RTX 4050 Laptop, 6141 MiB VRAM, sử dụng 102 MiB lúc kiểm tra.
- Driver 595.91.07, NVIDIA-SMI hiển thị CUDA capability 13.2. Đây không phải phiên bản CUDA wheel PyTorch đã cài.
- `nvidia-smi` trong sandbox lỗi; chạy ngoài sandbox PASS. Không thay driver hay can thiệp các dịch vụ GPU khác.
- Dung lượng root ban đầu 9,6 GiB, sau dependencies/infrastructure khoảng 8,3 GiB. Chưa đủ ngân sách tải checkpoint gốc ~8,9 GB và cài thêm bộ inference.
- Python hệ thống 3.10.12; uv chọn Python 3.11.15 cho venv. Node 22.18.0, pnpm host 11.5.0; dự án pin 10.18.3. Docker 29.4.0, Compose 5.1.3.

## Model thực tế và dữ liệu

Tất cả kết quả end-to-end trong bàn giao ghi `TEST_ONLY_FAKE_INFERENCE`. **Không có Qwen inference thành công**; model smoke report có `model: null`. Chỉ synthetic fixture được tạo/upload. Fixture browser trong database `logistics` mang tên “Kiểm thử giao diện — chứng từ tổng hợp”; fake worker đã tự thoát sau một job, không còn chạy nền để xử lý tài liệu mới.

Ứng dụng local tại http://127.0.0.1:5173 có thể xem fixture này. Hồ sơ mới cần trọng số/runtime thật để chạy. Các lượt integration dùng database/stream riêng với tiền tố `logistics_test_`; runtime artifacts được bỏ qua bằng `.gitignore`.

## Giới hạn cần lưu ý

Rule chỉ demo/unvalidated. Shipment totals phải cùng đơn vị; không ghép container–seal theo từng container; không gán shipper thành seller. Số có một dấu phân cách và ba chữ số phía sau, ngày d/m không rõ locale đều ambiguous. Bbox là text/OCR block chứa trích dẫn, không xác nhận đúng ngữ nghĩa bởi chuyên gia. Các trường thiếu là null; chúng không biến thành số 0.

MVP không công khai, không có quản lý người dùng. Chưa thử tải 200 MiB thực tế, PDF cực dài/scan hàng loạt, tắt máy đột ngột và đầy đĩa giữa upload. Không tuyên bố hiệu năng, tỷ lệ chính xác hoặc model NF4 chắc chắn vừa 6 GB VRAM. Xem [kiến trúc](architecture.md) cho giới hạn timeout, lưu giữ và mở rộng dữ liệu.

PyMuPDF phát 5 DeprecationWarning về SWIG trong pytest; không có test lỗi. Invoice total vẫn phụ thuộc việc bóc tách đủ dòng hàng; chưa đánh giá độ bao phủ trên bảng thực tế. Model có thể trả JSON thiếu/hỏng và job sẽ retry có giới hạn rồi báo failed, không sửa giá trị bằng phỏng đoán.
