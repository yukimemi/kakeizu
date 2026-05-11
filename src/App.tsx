import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import { RequireAdmin } from "./auth/RequireAdmin";
import { TreePage } from "./pages/TreePage";
import { AdminPage } from "./pages/AdminPage";
import { AdminTreeViewPage } from "./pages/AdminTreeViewPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <RequireAuth>
          <Routes>
            <Route path="/" element={<TreePage />} />
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <AdminPage />
                </RequireAdmin>
              }
            />
            <Route
              path="/admin/tree/:treeId"
              element={
                <RequireAdmin>
                  <AdminTreeViewPage />
                </RequireAdmin>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </RequireAuth>
      </BrowserRouter>
    </AuthProvider>
  );
}
