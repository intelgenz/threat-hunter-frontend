import { useEffect } from "react";
import { useAppStore } from "../state/store";

export default function ToastHost() {
  const toast = useAppStore((s) => s.toast);
  const clearToast = useAppStore((s) => s.clearToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => clearToast(), 2500);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  if (!toast) return null;

  const bg = toast.type === "error" ? "#fef3f2" : "#ecfdf3";
  const border = toast.type === "error" ? "#fda29b" : "#6ce9a6";
  const color = toast.type === "error" ? "#b42318" : "#027a48";

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        top: 16,
        zIndex: 1000,
        background: bg,
        border: `1px solid ${border}`,
        color,
        padding: "10px 14px",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
      }}
    >
      {toast.message}
    </div>
  );
}
