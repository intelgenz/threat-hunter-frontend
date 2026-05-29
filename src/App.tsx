import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { getMe } from "./api/auth";
import ToastHost from "./components/ToastHost";
import Admin from "./pages/Admin";
import Detail from "./pages/Detail";
import Login from "./pages/Login";
import Home from "./pages/Home";
import { useAppStore } from "./state/store";

export default function App() {
  const authToken = useAppStore((s) => s.authToken);
  const authUser = useAppStore((s) => s.authUser);
  const setAuth = useAppStore((s) => s.setAuth);
  const clearAuth = useAppStore((s) => s.clearAuth);

  useEffect(() => {
    if (!authToken || authUser) {
      return;
    }
    getMe()
      .then((res) => {
        if (res.authenticated && res.user) {
          setAuth(authToken, res.user);
        } else {
          clearAuth();
        }
      })
      .catch(() => {
        clearAuth();
      });
  }, [authToken, authUser, clearAuth, setAuth]);

  return (
    <BrowserRouter>
      <ToastHost />
      <Routes>
        {!authToken ? (
          <>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Login />} />
          </>
        ) : (
          <>
            <Route path="/" element={<Home />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/actors/:id" element={<Detail />} />
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Home />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  );
}
