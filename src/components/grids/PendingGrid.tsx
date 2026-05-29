import { useEffect, useMemo, useState } from "react";

type PendingRow = {
  id: number;
  name: string;
  pending_reviewed?: boolean;
  assessment?: string | null;
};

type PendingStatusFilter = "all" | "pending" | "checked";

type Props = {
  rows: PendingRow[];
  onOpenDetail: (id: number) => void;
  onToggleStatus: (id: number, pendingReviewed: boolean) => void;
  onToggleAssessment: (id: number, assessment: "yes" | "no") => void;
};

const statusOptions: { value: PendingStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "checked", label: "Checked" },
];

const matchesStatusFilter = (pendingReviewed: boolean, filter: PendingStatusFilter) => {
  if (filter === "all") return true;
  if (filter === "pending") return !pendingReviewed;
  return pendingReviewed;
};


export default function PendingGrid({
  rows,
  onOpenDetail,
  onToggleStatus,
  onToggleAssessment,
}: Props) {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<PendingStatusFilter>("all");
  const [localStatus, setLocalStatus] = useState<Record<number, boolean>>({});
  const [localAssessment, setLocalAssessment] = useState<Record<number, "yes" | "no">>({});
  const pageSize = 25;

  const getPendingChecked = (row: PendingRow) =>
    localStatus[row.id] ?? Boolean(row.pending_reviewed);
  const getAssessment = (row: PendingRow) =>
    localAssessment[row.id] ?? ((row.assessment || "no").toLowerCase() === "yes" ? "yes" : "no");

  useEffect(() => {
    const next: Record<number, boolean> = {};
    const nextAssessment: Record<number, "yes" | "no"> = {};
    for (const row of rows) {
      next[row.id] = Boolean(row.pending_reviewed);
      nextAssessment[row.id] = (row.assessment || "no").toLowerCase() === "yes" ? "yes" : "no";
    }
    setLocalStatus(next);
    setLocalAssessment(nextAssessment);
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const pendingChecked = getPendingChecked(row);
      return matchesStatusFilter(pendingChecked, statusFilter);
    });
  }, [rows, localStatus, statusFilter]);

  const totalCount = rows.length;
  const filteredCount = filteredRows.length;

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const start = (page - 1) * pageSize;
  const pageRows = filteredRows.slice(start, start + pageSize);

  useEffect(() => {
    setPage(1);
  }, [rows.length, statusFilter]);

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => Math.min(totalPages, p + 1));
  const handleStatusToggle = (row: PendingRow) => {
    const current = getPendingChecked(row);
    const next = !current;
    setLocalStatus((prev) => ({ ...prev, [row.id]: next }));
    onToggleStatus(row.id, next);
  };

  const handleAssessmentToggle = (row: PendingRow) => {
    const current = getAssessment(row);
    const next = current === "yes" ? "no" : "yes";
    setLocalAssessment((prev) => ({ ...prev, [row.id]: next }));
    onToggleAssessment(row.id, next);
  };

  if (!rows.length) return <div>No entries found.</div>;

  return (
    <>
      <div style={{ marginBottom: "8px" }}>
        Showing {filteredCount} of {totalCount} pending entries.
      </div>
      <table className="table">
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              Name
            </th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span>Status</span>
                <select
                  className="input"
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as PendingStatusFilter)
                  }
                >
                  {statusOptions.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Open</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>AI Assessment</th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map((r) => {
            const pendingChecked = getPendingChecked(r);
            const assessment = getAssessment(r);
            return (
              <tr key={r.id}>
                <td style={{ padding: "6px 4px" }}>{r.name}</td>
                <td style={{ padding: "6px 4px" }}>
                  <button
                    className={`btn-glass ${pendingChecked ? "btn-glass-blue" : "btn-glass-orange"}`}
                    onClick={() => handleStatusToggle(r)}
                    >
                    {pendingChecked ? "Checked" : "Pending"}
                  </button>
                </td>
                <td style={{ padding: "6px 4px" }}>
                  <button
                    onClick={() => onOpenDetail(r.id)}
                    className="btn-glass btn-glass-orange"
                  >
                    Open
                  </button>
                </td>
                <td style={{ padding: "6px 4px" }}>
                  <button
                    className={`btn-glass ${assessment === "yes" ? "btn-glass-blue" : "btn-glass-orange"}`}
                    onClick={() => handleAssessmentToggle(r)}
                  >
                    {assessment === "yes" ? "Yes" : "No"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div
        style={{ marginTop: "8px", display: "flex", gap: "8px", alignItems: "center" }}
      >
        <button className="btn" onClick={goPrev} disabled={page <= 1}>
          Prev
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button className="btn" onClick={goNext} disabled={page >= totalPages}>
          Next
        </button>
      </div>
    </>
  );
}
