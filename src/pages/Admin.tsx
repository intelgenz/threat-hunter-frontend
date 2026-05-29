import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import client from "../api/client";
import { assignActors, createUser, listUsers, type AuthUser } from "../api/auth";
import { useAppStore } from "../state/store";

type Status = "pending" | "threat_actor" | "not_threat";

type ActorRow = {
  id: number;
  name: string;
  status: Status;
  alias_count: number;
  assigned_to_user_id?: number | null;
};

type UserRow = {
  id: number;
  email: string;
  role: string;
  active: boolean;
};

export default function Admin() {
  const navigate = useNavigate();
  const authUser = useAppStore((s) => s.authUser as AuthUser | null);
  const showToast = useAppStore((s) => s.showToast);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status | "all">("all");
  const [assignmentFilter, setAssignmentFilter] = useState<"all" | "unassigned" | "assigned">("all");
  const [rows, setRows] = useState<ActorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<"admin" | "user">("user");
  const [createBusy, setCreateBusy] = useState(false);
  const [selectedActorIds, setSelectedActorIds] = useState<number[]>([]);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!authUser || authUser.role !== "admin") {
      navigate("/");
    }
  }, [authUser, navigate]);

  const loadUsers = () => {
    if (!authUser || authUser.role !== "admin") {
      return;
    }
    listUsers()
      .then((items) => setUsers(items))
      .catch(() => setUsers([]));
  };

  useEffect(() => {
    loadUsers();
  }, [authUser]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    client
      .get<ActorRow[]>("/actors", {
        params: {
          search,
          status: status === "all" ? undefined : status,
          assignment: assignmentFilter,
        },
      })
      .then((res) => {
        if (alive) setRows(res.data || []);
      })
      .catch(() => {
        if (alive) {
          setRows([]);
          showToast("Failed to load rows.", "error");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [search, status, assignmentFilter, showToast]);

  useEffect(() => {
    setSelectedActorIds([]);
    setPage(1);
  }, [search, status, assignmentFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  const getAssignedLabel = (userId?: number | null) => {
    if (!userId) {
      return "Unassigned";
    }
    const user = users.find((row) => row.id === userId);
    return user ? `${user.email} (${user.role})` : `User ${userId}`;
  };

  const toggleSelectedActor = (actorId: number) => {
    setSelectedActorIds((prev) =>
      prev.includes(actorId) ? prev.filter((id) => id !== actorId) : [...prev, actorId]
    );
  };

  const selectAllVisible = () => {
    const visibleIds = visibleRows.map((row) => row.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedActorIds.includes(id));
    setSelectedActorIds(allSelected ? [] : visibleIds);
  };

  const handleCreateUser = async () => {
    setCreateBusy(true);
    try {
      await createUser({
        email: createEmail,
        password: createPassword,
        role: createRole,
      });
      showToast("User created.", "success");
      setCreateEmail("");
      setCreatePassword("");
      loadUsers();
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? String(error.response?.data?.detail || "Create user failed.")
        : "Create user failed.";
      showToast(message, "error");
    } finally {
      setCreateBusy(false);
    }
  };

  const handleBulkAssign = async () => {
    const userId = Number(assignUserId);
    if (!Number.isFinite(userId) || selectedActorIds.length === 0) {
      showToast("Select rows and a user.", "error");
      return;
    }

    const selectedRows = rows.filter((row) => selectedActorIds.includes(row.id));
    const reassignedRows = selectedRows.filter(
      (row) => row.assigned_to_user_id != null && row.assigned_to_user_id !== userId
    );
    if (reassignedRows.length > 0) {
      const confirmMessage =
        reassignedRows.length === 1
          ? `Reassign "${reassignedRows[0].name}"? This will overwrite the current owner.`
          : `Reassign ${reassignedRows.length} rows? This will overwrite existing owners.`;
      if (!window.confirm(confirmMessage)) {
        return;
      }
    }

    setAssignBusy(true);
    try {
      await assignActors({ actor_ids: selectedActorIds, user_id: userId });
      showToast(`Assigned ${selectedActorIds.length} rows.`, "success");
      setSelectedActorIds([]);
      loadUsers();
      setRows((prev) =>
        prev.map((row) =>
          selectedActorIds.includes(row.id) ? { ...row, assigned_to_user_id: userId } : row
        )
      );
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? String(error.response?.data?.detail || "Bulk assign failed.")
        : "Bulk assign failed.";
      showToast(message, "error");
    } finally {
      setAssignBusy(false);
    }
  };

  if (!authUser || authUser.role !== "admin") {
    return null;
  }

  return (
    <div className="main admin-page">
      <div className="page-header">
        <button className="btn btn-ghost" onClick={() => navigate("/")}>
          Back
        </button>
        <div className="header-left">
          <div className="eyebrow">Admin console</div>
          <h2 className="page-title">User and assignment management</h2>
          <div className="muted">Create users, filter rows, and bulk assign ownership.</div>
        </div>
      </div>

      <div className="detail-grid single">
        <div className="card">
          <div className="section-head">
            <h3 className="section-title">Create User</h3>
            <span className="muted">Add a new analyst or admin</span>
          </div>
          <div className="action-row" style={{ marginTop: 12 }}>
            <input
              className="input"
              placeholder="Email"
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
            />
            <input
              className="input"
              type="password"
              placeholder="Password"
              value={createPassword}
              onChange={(e) => setCreatePassword(e.target.value)}
            />
            <select className="select" value={createRole} onChange={(e) => setCreateRole(e.target.value as "admin" | "user")}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <button className="btn btn-primary" onClick={handleCreateUser} disabled={createBusy}>
              {createBusy ? "Creating..." : "Create user"}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="section-head">
            <h3 className="section-title">Filters and Bulk Assign</h3>
            <span className="muted">Select rows, choose one owner, confirm overwrite if needed</span>
          </div>
          <div className="action-row" style={{ marginTop: 12 }}>
            <input
              className="input"
              placeholder="Search name, alias, source..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as Status | "all")}>
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="threat_actor">Validated</option>
              <option value="not_threat">Not Threat Actor</option>
            </select>
            <select
              className="select"
              value={assignmentFilter}
              onChange={(e) => setAssignmentFilter(e.target.value as "all" | "unassigned" | "assigned")}
            >
              <option value="all">All rows</option>
              <option value="unassigned">Unassigned only</option>
              <option value="assigned">Assigned only</option>
            </select>
            <select className="select" value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)}>
              <option value="">Select user</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.email} ({user.role})
                </option>
              ))}
            </select>
            <select className="select" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              <option value={20}>20 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
            </select>
            <button className="btn" onClick={selectAllVisible}>
              {visibleRows.length > 0 && visibleRows.every((row) => selectedActorIds.includes(row.id))
                ? "Clear visible"
                : "Select visible"}
            </button>
            <button className="btn btn-primary" onClick={handleBulkAssign} disabled={assignBusy}>
              {assignBusy ? "Assigning..." : `Assign selected (${selectedActorIds.length})`}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="section-head">
            <h3 className="section-title">Rows</h3>
            <span className="muted">{loading ? "Loading..." : `${rows.length} rows`}</span>
          </div>
          <table className="table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Select</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Name</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Status</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Assigned To</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Open</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Aliases</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td style={{ padding: "6px 4px" }}>
                    <input
                      type="checkbox"
                      checked={selectedActorIds.includes(row.id)}
                      onChange={() => toggleSelectedActor(row.id)}
                    />
                  </td>
                  <td style={{ padding: "6px 4px" }}>{row.name}</td>
                  <td style={{ padding: "6px 4px" }}>{row.status}</td>
                  <td style={{ padding: "6px 4px" }}>{getAssignedLabel(row.assigned_to_user_id)}</td>
                  <td style={{ padding: "6px 4px" }}>
                    <button className="btn-glass btn-glass-orange" onClick={() => navigate(`/actors/${row.id}`)}>
                      Open
                    </button>
                  </td>
                  <td style={{ padding: "6px 4px" }}>{row.alias_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="action-row" style={{ marginTop: 12, alignItems: "center" }}>
            <button className="btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              Prev
            </button>
            <span className="muted">
              Page {page} of {totalPages}
            </span>
            <button className="btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
