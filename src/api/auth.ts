import client from "./client";

export type AuthUser = {
  id: number;
  email: string;
  role: string;
  active: boolean;
};

export type UserCreatePayload = {
  email: string;
  password: string;
  role?: string;
};

export type AssignActorPayload = {
  actor_id: number;
  user_id: number;
};

export type BulkAssignActorsPayload = {
  actor_ids: number[];
  user_id: number;
};

export async function login(email: string, password: string) {
  const res = await client.post("/auth/login", { email, password });
  return res.data as { access_token: string; user_id: number; email: string; role: string };
}

export async function bootstrapAdmin(email: string, password: string) {
  const res = await client.post("/auth/bootstrap-admin", { email, password });
  return res.data as { access_token: string; user_id: number; email: string; role: string };
}

export async function getMe() {
  const res = await client.get("/auth/me");
  return res.data as { authenticated: boolean; user: AuthUser | null };
}

export async function listUsers() {
  const res = await client.get("/auth/users");
  return res.data as AuthUser[];
}

export async function createUser(payload: UserCreatePayload) {
  const res = await client.post("/auth/users", payload);
  return res.data as AuthUser;
}

export async function assignActor(payload: AssignActorPayload) {
  const res = await client.post("/auth/assign", payload);
  return res.data as { ok: boolean };
}

export async function assignActors(payload: BulkAssignActorsPayload) {
  const res = await client.post("/auth/assign-bulk", payload);
  return res.data as { ok: boolean; processed: number };
}
