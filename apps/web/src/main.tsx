import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Ajv from "ajv";
import extractionSchema from "../../../contracts/schemas/extraction.json";
import "./style.css";

type Evidence = {
  raw_value: string | null;
  normalized_value: string | null;
  unit: string | null;
  currency: string | null;
  document_id: string;
  page_number: number;
  evidence_text: string | null;
  bbox: number[] | null;
  coordinate_system: string;
  page_width: number;
  page_height: number;
  extraction_method: string;
  verification_status: string;
  scope: string;
  scope_id: string | null;
};
type Finding = {
  id: string;
  rule: {
    id: string;
    version: string;
    description: string;
    validation: string;
  };
  status: string;
  detail: string;
  left: Evidence[];
  right: Evidence[];
};
type Extraction = {
  document_id: string;
  document_type: string;
  fields: Record<string, Evidence[]>;
};
type Dossier = {
  _id: string;
  name: string;
  documents: { _id: string; filename: string; mime_type: string }[];
  jobs: { _id: string; status: string; error?: string }[];
  results: {
    job_id: string;
    model: string;
    findings: Finding[];
    extractions: Extraction[];
  }[];
  reviews: {
    finding_id: string;
    decision: string;
    note: string;
    created_at: string;
  }[];
};
const validate = new Ajv().compile(extractionSchema);
const labels: Record<string, string> = {
  queued: "Đang chờ",
  processing: "Đang xử lý",
  completed: "Hoàn tất",
  needs_review: "Cần duyệt",
  failed: "Lỗi",
  match: "Khớp",
  mismatch: "Sai lệch",
  insufficient_data: "Thiếu dữ liệu",
  not_applicable: "Không áp dụng",
  confirmed: "Xác nhận sai lệch",
  rejected: "Bác bỏ",
  needs_check: "Cần kiểm tra thêm",
};
async function api(path: string, init?: RequestInit) {
  const res = await fetch("/api" + path, init);
  const body = await res.json();
  if (!res.ok)
    throw new Error(
      typeof body.message === "string" ? body.message : JSON.stringify(body),
    );
  return body;
}
const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
function WorkerNotice() {
  const [health, setHealth] = useState<{
    worker: string;
    message?: string;
  } | null>(null);
  useEffect(() => {
    const check = () =>
      api("/health")
        .then(setHealth)
        .catch(() => {});
    check();
    const timer = setInterval(check, 10000);
    return () => clearInterval(timer);
  }, []);
  return health?.worker === "unavailable" ? (
    <div className="alert" role="status">
      {health.message || "Worker chưa sẵn sàng"}
    </div>
  ) : null;
}
function App() {
  const [list, setList] = useState<{ _id: string; name: string }[]>([]),
    [selected, setSelected] = useState(""),
    [dossier, setDossier] = useState<Dossier | null>(null),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [view, setView] = useState<Evidence | null>(null),
    [filter, setFilter] = useState("all");
  async function refresh() {
    setList(await api("/dossiers"));
  }
  async function load(id = selected) {
    if (!id) return;
    const data: Dossier = await api("/dossiers/" + id);
    for (const result of data.results)
      for (const extraction of result.extractions)
        if (!validate(extraction))
          throw new Error("Kết quả worker không hợp lệ theo schema");
    setDossier(data);
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    setDossier(null);
    setView(null);
    load(selected).catch((e) => setError(String(e)));
    const timer = setInterval(
      () => load(selected).catch((e) => setError(String(e))),
      2500,
    );
    return () => clearInterval(timer);
  }, [selected]);
  const evidence = (v: Evidence, i: number) => (
    <button className="evidence" key={i} onClick={() => setView(v)}>
      <strong>
        {v.normalized_value ?? "Chưa xác định"} {v.unit ?? v.currency}
      </strong>
      <span>
        Gốc: {v.raw_value ?? "—"} · Trang {v.page_number}
      </span>
      <span>{v.evidence_text ?? "Chưa có bằng chứng"}</span>
      <small>
        {v.verification_status === "anchored"
          ? "Đã gắn bằng chứng"
          : v.verification_status === "ambiguous"
            ? "Giá trị mơ hồ"
            : "Chưa xác định bằng chứng"}{" "}
        · {v.scope}
      </small>
    </button>
  );
  const document = dossier?.documents.find((d) => d._id === view?.document_id);
  return (
    <>
      <header>
        <span className="mark">L</span>
        <div>
          <h1>Đối chiếu chứng từ</h1>
          <p>Logistics · Không gian làm việc local</p>
        </div>
        <span className="pill">MVP / Quy tắc demo</span>
      </header>
      <div className="layout">
        <aside>
          <h2>Hồ sơ</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action(async () => {
                const d = await api("/dossiers", post({ name }));
                setName("");
                await refresh();
                setSelected(d._id);
              });
            }}
          >
            <label htmlFor="name">Tên hồ sơ mới</label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              placeholder="Lô hàng tháng 9"
            />
            <button disabled={busy}>+ Tạo hồ sơ</button>
          </form>
          <nav>
            {list.map((d) => (
              <button
                className={selected === d._id ? "selected" : ""}
                key={d._id}
                onClick={() => setSelected(d._id)}
              >
                {d.name}
              </button>
            ))}
          </nav>
        </aside>
        <main>
          {error && (
            <div role="alert" className="alert">
              {error}
            </div>
          )}
          {!dossier ? (
            <div className="empty">
              <h2>Chứng từ rõ ràng, đối chiếu có bằng chứng.</h2>
              <p>
                Tạo hoặc chọn hồ sơ để tải Invoice, Packing List, B/L và C/O.
              </p>
            </div>
          ) : (
            <>
              <div className="title">
                <div>
                  <p className="eyebrow">HỒ SƠ ĐỐI CHIẾU</p>
                  <h2>{dossier.name}</h2>
                </div>
                <a
                  href={"/api/dossiers/" + selected + "/export"}
                  download="ket-qua.json"
                >
                  Xuất JSON ↗
                </a>
              </div>
              <section>
                <h3>1. Tài liệu đầu vào</h3>
                <label className="upload">
                  Tải nhiều PDF / PNG / JPEG · tối đa 200 MB/file
                  <input
                    aria-label="Tải chứng từ"
                    type="file"
                    multiple
                    accept=".pdf,.png,.jpg,.jpeg"
                    disabled={busy}
                    onChange={(e) => {
                      const files = e.target.files;
                      if (!files?.length) return;
                      const form = new FormData();
                      Array.from(files).forEach((f) => form.append("files", f));
                      action(async () => {
                        await api("/dossiers/" + selected + "/documents", {
                          method: "POST",
                          body: form,
                        });
                        await api(
                          "/dossiers/" + selected + "/jobs",
                          post({ request_key: crypto.randomUUID() }),
                        );
                        await load();
                      });
                      e.target.value = "";
                    }}
                  />
                </label>
                <div className="docs">
                  {dossier.documents.map((d) => (
                    <a
                      target="_blank"
                      rel="noreferrer"
                      key={d._id}
                      href={"/api/documents/" + d._id + "/file"}
                    >
                      {d.filename} ↗
                    </a>
                  ))}
                </div>
                {dossier.jobs.map((j) => (
                  <p key={j._id}>
                    <span className={"badge " + j.status}>
                      {labels[j.status]}
                    </span>{" "}
                    {j.error && <span className="error">{j.error}</span>}
                  </p>
                ))}
                <button
                  disabled={busy || !dossier.documents.length}
                  onClick={() =>
                    action(async () => {
                      await api(
                        "/dossiers/" + selected + "/jobs",
                        post({ request_key: crypto.randomUUID() }),
                      );
                      await load();
                    })
                  }
                >
                  Đối chiếu lại
                </button>
              </section>
              <section>
                <div className="title">
                  <h3>2. Kết quả & bằng chứng</h3>
                  <select
                    aria-label="Lọc kết quả"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">Tất cả</option>
                    <option value="mismatch">Sai lệch</option>
                    <option value="insufficient_data">Thiếu dữ liệu</option>
                  </select>
                </div>
                {!dossier.results.length && (
                  <p className="muted">
                    Kết quả sẽ xuất hiện sau khi worker xử lý.
                  </p>
                )}
                {dossier.results.map((r) => (
                  <div key={r.job_id}>
                    <p className="muted">Model thực tế: {r.model}</p>
                    {r.findings
                      .filter((f) => filter === "all" || f.status === filter)
                      .map((f) => (
                        <article key={f.id}>
                          <div className="title">
                            <h4>{f.rule.description}</h4>
                            <span className={"badge " + f.status}>
                              {labels[f.status]}
                            </span>
                          </div>
                          <p className="muted">
                            {f.rule.id} · v{f.rule.version} ·{" "}
                            {f.rule.validation}
                          </p>
                          <div className="comparison">
                            <div>
                              {f.left.length
                                ? f.left.map(evidence)
                                : "Không có giá trị bên trái"}
                            </div>
                            <div>
                              {f.right.length
                                ? f.right.map(evidence)
                                : "Không có giá trị bên phải"}
                            </div>
                          </div>
                          <p>{f.detail}</p>
                          <form
                            className="review"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const form = new FormData(e.currentTarget);
                              action(async () => {
                                await api(
                                  "/findings/" + f.id + "/reviews",
                                  post({
                                    decision: form.get("decision"),
                                    note: form.get("note"),
                                  }),
                                );
                                await load();
                              });
                            }}
                          >
                            <select name="decision" aria-label="Quyết định">
                              <option value="confirmed">
                                Xác nhận sai lệch
                              </option>
                              <option value="rejected">Bác bỏ</option>
                              <option value="needs_check">
                                Cần kiểm tra thêm
                              </option>
                            </select>
                            <input
                              name="note"
                              aria-label="Ghi chú duyệt"
                              placeholder="Ghi chú kiểm tra"
                              maxLength={4000}
                            />
                            <button disabled={busy}>Lưu duyệt</button>
                          </form>
                          {dossier.reviews
                            .filter((v) => v.finding_id === f.id)
                            .map((v, i) => (
                              <p key={i} className="muted">
                                {labels[v.decision]} · {v.note} ·{" "}
                                {new Date(v.created_at).toLocaleString("vi-VN")}
                              </p>
                            ))}
                        </article>
                      ))}
                    <h3>Dữ liệu bóc tách</h3>
                    {r.extractions.map((d) => (
                      <details key={d.document_id}>
                        <summary>
                          {
                            dossier.documents.find(
                              (v) => v._id === d.document_id,
                            )?.filename
                          }{" "}
                          · {d.document_type}
                        </summary>
                        {Object.entries(d.fields).map(([name, values]) => (
                          <div key={name}>
                            <h4>{name}</h4>
                            {values.map(evidence)}
                          </div>
                        ))}
                      </details>
                    ))}
                  </div>
                ))}
              </section>
              <p className="muted">
                Kiểm tra tính nhất quán chứng từ bằng quy tắc demo chưa được
                chuyên gia xác nhận. Kết quả không phải kết luận đủ điều kiện
                thông quan.
              </p>
            </>
          )}
        </main>
      </div>
      {view && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-label="Bằng chứng tài liệu"
        >
          <div className="viewer">
            <div className="title">
              <h3>
                {document?.filename} · Trang {view.page_number}
              </h3>
              <button autoFocus onClick={() => setView(null)}>
                Đóng
              </button>
            </div>
            <p>
              {view.evidence_text} ·{" "}
              {view.bbox
                ? "Vùng bằng chứng được tô trên ảnh trang bên dưới."
                : "Chưa có tọa độ đáng tin cậy."}
            </p>
            <div className="page-preview">
              <img
                src={
                  "/api/documents/" +
                  view.document_id +
                  "/pages/" +
                  view.page_number
                }
                alt={"Trang " + view.page_number}
              />
              {view.bbox && view.verification_status === "anchored" && (
                <span
                  className="highlight"
                  style={{
                    left: `${(view.bbox[0] / view.page_width) * 100}%`,
                    top: `${(view.bbox[1] / view.page_height) * 100}%`,
                    width: `${((view.bbox[2] - view.bbox[0]) / view.page_width) * 100}%`,
                    height: `${((view.bbox[3] - view.bbox[1]) / view.page_height) * 100}%`,
                  }}
                />
              )}
            </div>
            <a
              target="_blank"
              rel="noreferrer"
              href={
                "/api/documents/" +
                view.document_id +
                "/file#page=" +
                view.page_number
              }
            >
              Mở tài liệu gốc tại trang {view.page_number} ↗
            </a>
          </div>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <>
    <WorkerNotice />
    <App />
  </>,
);
