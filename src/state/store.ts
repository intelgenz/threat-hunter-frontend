import { create } from "zustand";
import type { AuthUser } from "../api/auth";

type AppState = {
  selectedActorId: number | null;
  setSelectedActorId: (id: number | null) => void;
  toast: { message: string; type: "success" | "error" } | null;
  showToast: (message: string, type?: "success" | "error") => void;
  clearToast: () => void;
  authToken: string | null;
  authUser: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  clearAuth: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  selectedActorId: null,
  setSelectedActorId: (id) => set({ selectedActorId: id }),
  toast: null,
  showToast: (message, type = "success") => set({ toast: { message, type } }),
  clearToast: () => set({ toast: null }),
  authToken: localStorage.getItem("auth_token"),
  authUser: null,
  setAuth: (token, user) => {
    localStorage.setItem("auth_token", token);
    set({ authToken: token, authUser: user });
  },
  clearAuth: () => {
    localStorage.removeItem("auth_token");
    set({ authToken: null, authUser: null });
  },
}));
