import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import { TreePage } from "./pages/TreePage";

export default function App() {
  return (
    <AuthProvider>
      <RequireAuth>
        <TreePage />
      </RequireAuth>
    </AuthProvider>
  );
}
