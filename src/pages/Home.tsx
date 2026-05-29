import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import { listUsers } from "../api/auth";
import PendingGrid from "../components/grids/PendingGrid";
import { finalizePendingActors, setAssessment, setPendingChecked } from "../api/malware";
import { useAppStore } from "../state/store";

type Status = "pending" | "threat_actor" | "not_threat";

type ActorRow = {
  id: number;
  name: string;
  status: Status;
  alias_count: number;
  pending_reviewed?: boolean;
  assessment?: string | null;
  assigned_to_user_id?: number | null;
};

type UserRow = {
  id: number;
  email: string;
  role: string;
  active: boolean;
};

export default function Home() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("pending");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ActorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const showToast = useAppStore((s) => s.showToast);
  const clearAuth = useAppStore((s) => s.clearAuth);
  const authUser = useAppStore((s) => s.authUser);
  const [stats, setStats] = useState<any | null>(null);
  const [nonPendingPage, setNonPendingPage] = useState(1);
  const nonPendingPageSize = 25;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [users, setUsers] = useState<UserRow[]>([]);

  const fetchStats = () => {
    client
      .get("/stats")
      .then((res) => setStats(res.data))
      .catch(() => setStats(null));
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    client
      .get<ActorRow[]>("/actors", {
        params: { search, status },
      })
      .then((res) => {
        if (alive) setRows(res.data || []);
      })
      .catch(() => {
        if (alive) {
          setRows([]);
          showToast("Failed to load actors.", "error");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [search, status, authUser]);

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (!authUser || authUser.role !== "admin") {
      return;
    }
    listUsers()
      .then((rows: UserRow[]) => setUsers(rows))
      .catch(() => setUsers([]));
  }, [authUser]);

  const pendingRows = useMemo(() => {
    const onlyPending = rows.filter((r) => r.status === "pending");
    const seen = new Set<string>();
    const deduped: ActorRow[] = [];
    for (const row of onlyPending) {
      const key = row.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(row);
    }
    return deduped;
  }, [rows]);
  const checkedPendingRows = useMemo(
    () => pendingRows.filter((r) => Boolean(r.pending_reviewed)),
    [pendingRows]
  );
  const isPendingView = status === "pending";
  const nonPendingRows = useMemo(() => rows.filter((r) => r.status !== "pending"), [rows]);
  const nonPendingTotalPages = Math.max(
    1,
    Math.ceil(nonPendingRows.length / nonPendingPageSize)
  );
  const nonPendingStart = (nonPendingPage - 1) * nonPendingPageSize;
  const nonPendingPageRows = nonPendingRows.slice(
    nonPendingStart,
    nonPendingStart + nonPendingPageSize
  );

  useEffect(() => {
    setNonPendingPage(1);
  }, [rows.length, status, search]);

  const handlePendingStatusToggle = async (id: number, next: boolean) => {
    try {
      await setPendingChecked(id, next);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, pending_reviewed: next } : r)));
    } catch {
      showToast("Failed to update pending status.", "error");
    }
  };

  const handleAssessmentToggle = async (id: number, next: "yes" | "no") => {
    try {
      await setAssessment(id, next);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, assessment: next } : r)));
    } catch {
      showToast("Failed to update AI assessment.", "error");
    }
  };

  const handleBulkProceed = async () => {
    const actorIds = checkedPendingRows.map((row) => row.id);
    if (actorIds.length === 0) {
      showToast("No checked entries to proceed.", "error");
      return;
    }
    try {
      await finalizePendingActors(actorIds);
      setRows((prev) => prev.filter((r) => !actorIds.includes(r.id)));
      showToast(`Processed ${actorIds.length} checked entries.`, "success");
      fetchStats();
    } catch {
      showToast("Bulk proceed failed.", "error");
    }
  };

  const handleMoveToPending = async (id: number) => {
    try {
      await client.post(`/actors/${id}/status`, { status: "pending" });
      setRows((prev) => prev.filter((r) => r.id !== id));
      showToast("Moved to pending.", "success");
      fetchStats();
    } catch {
      showToast("Move to pending failed.", "error");
    }
  };

  const getAssignedLabel = (userId?: number | null) => {
    if (!userId) {
      return "Unassigned";
    }
    const user = users.find((row) => row.id === userId);
    return user ? `${user.email} (${user.role})` : `User ${userId}`;
  };


  const totals = stats || { pending: 0, validated: 0, not_threat: 0 };
  const viewLabel = status === "pending" ? "Pending" : status === "threat_actor" ? "Validated" : "Not Threat Actor";

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "" : "collapsed"}`}>
        <h3>Threat Actor Validator</h3>
        <button
          className="btn btn-ghost"
          style={{ width: "100%", marginBottom: "8px" }}
          onClick={() => {
            clearAuth();
            navigate("/login");
          }}
        >
          Sign out
        </button>
        <button
          className="btn btn-ghost"
          style={{ width: "100%", marginBottom: "8px" }}
          onClick={() => {
            setStatus("pending");
          }}
        >
          Home
        </button>
        {authUser?.role === "admin" ? (
          <button
            className="btn btn-ghost"
            style={{ width: "100%", marginBottom: "8px" }}
            onClick={() => navigate("/admin")}
          >
            Admin
          </button>
        ) : null}

        <div style={{ margin: "10px 0", borderTop: "1px solid #2b2b2b" }} />

        <div style={{ marginTop: "12px" }}>
          <div style={{ fontWeight: 600, marginBottom: "6px" }}>Pending</div>
          <button
            className="btn"
            style={{ width: "100%", marginBottom: "6px" }}
            onClick={() => {
              setStatus("pending");
            }}
          >
            Pending: {totals.pending}
          </button>
        </div>

        <div style={{ margin: "12px 0", borderTop: "1px solid #2b2b2b" }} />

        <div>
          <button
            className="btn"
            style={{ width: "100%", marginBottom: "6px" }}
            onClick={() => {
              setStatus("threat_actor");
            }}
          >
            Validated: {totals.validated}
          </button>
          <button
            className="btn"
            style={{ width: "100%", marginBottom: "6px" }}
            onClick={() => {
              setStatus("not_threat");
            }}
          >
            Not Threat Actor: {totals.not_threat}
          </button>
        </div>

      </aside>

      <main className="main">
        <div className="page-topbar">
          <button
            className="btn drawer-toggle"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen((prev) => !prev)}
          >
            {sidebarOpen ? "←" : "→"}
          </button>
        </div>
        <div className="view-header" style={{ marginBottom: "16px" }}>
          <div>
            <h2 className="section-title" style={{ marginBottom: "6px" }}>
              Threat Actor Validator
            </h2>
          </div>
          <div className="view-pill-wrapper">
            <span className="view-label">{viewLabel}</span>
          </div>
        </div>
        <div className="card" style={{ marginBottom: "12px" }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              placeholder="Search name, alias, source..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input"
              style={{ minWidth: "280px", flex: 1 }}
            />
          </div>
        </div>

        {loading && <div>Loading...</div>}

        {isPendingView ? (
          <>
            <div className="card" style={{ marginBottom: "12px", display: "flex", gap: "12px", alignItems: "center" }}>
              <button
                className="btn btn-primary"
                onClick={handleBulkProceed}
                disabled={checkedPendingRows.length === 0}
              >
                Proceed checked ({checkedPendingRows.length})
              </button>
              <span className="muted">Only checked entries will be finalized.</span>
            </div>
            <PendingGrid
              rows={pendingRows}
              onOpenDetail={(id) => navigate(`/actors/${id}`)}
              onToggleStatus={handlePendingStatusToggle}
              onToggleAssessment={handleAssessmentToggle}
            />
          </>
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Name</th>
                  {authUser?.role === "admin" ? (
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Assigned To</th>
                  ) : null}
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Move to Pending</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Open</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Aliases</th>
                </tr>
              </thead>
              <tbody>
                {nonPendingPageRows.map((r) => (
                  <tr key={r.id}>
                    <td
                      style={{ padding: "6px 4px", cursor: "pointer" }}
                      onClick={() => navigate(`/actors/${r.id}`)}
                    >
                      {r.name}
                    </td>
                    {authUser?.role === "admin" ? (
                      <td style={{ padding: "6px 4px" }}>{getAssignedLabel(r.assigned_to_user_id)}</td>
                    ) : null}
                    <td style={{ padding: "6px 4px" }}>
                      <button
                        className="btn-glass btn-glass-orange"
                        onClick={() => handleMoveToPending(r.id)}
                      >
                        Move
                      </button>
                    </td>
                    <td style={{ padding: "6px 4px" }}>
                      <button
                        onClick={() => navigate(`/actors/${r.id}`)}
                        className="btn-glass btn-glass-orange"
                      >
                        Open
                      </button>
                    </td>
                    <td style={{ padding: "6px 4px" }}>{r.alias_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: "8px", display: "flex", gap: "8px", alignItems: "center" }}>
              <button
                className="btn"
                onClick={() => setNonPendingPage((p) => Math.max(1, p - 1))}
                disabled={nonPendingPage <= 1}
              >
                Prev
              </button>
              <span>
                Page {nonPendingPage} of {nonPendingTotalPages}
              </span>
              <button
                className="btn"
                onClick={() => setNonPendingPage((p) => Math.min(nonPendingTotalPages, p + 1))}
                disabled={nonPendingPage >= nonPendingTotalPages}
              >
                Next
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
