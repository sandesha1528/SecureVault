import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Shell from "./components/layout/Shell";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Secrets from "./pages/Secrets";
import SSH from "./pages/SSH";
import Rotation from "./pages/Rotation";
import Users from "./pages/Users";
import Roles from "./pages/Roles";
import Audit from "./pages/Audit";

function ProtectedRoute({ children, user }: { children: React.ReactNode; user: ReturnType<typeof useAuth>["user"] }) {
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RoleGuard({ children, user, allowedRoles }: {
  children: React.ReactNode;
  user: ReturnType<typeof useAuth>["user"];
  allowedRoles: string[];
}) {
  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const auth = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            auth.user ? <Navigate to="/dashboard" replace /> : (
              <Login
                onLogin={auth.login}
                onTotpVerify={auth.verifyTotp}
                totpPending={auth.totpPending}
                loading={auth.loading}
                error={auth.error}
              />
            )
          }
        />

        <Route
          element={
            <ProtectedRoute user={auth.user}>
              {auth.user && (
                <Shell user={auth.user} onLogout={auth.logout} />
              )}
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route
            path="/secrets"
            element={auth.user ? <Secrets user={auth.user} /> : null}
          />
          <Route
            path="/ssh"
            element={auth.user ? <SSH user={auth.user} /> : null}
          />
          <Route
            path="/rotation"
            element={
              <RoleGuard user={auth.user} allowedRoles={["superadmin", "admin"]}>
                <Rotation />
              </RoleGuard>
            }
          />
          <Route
            path="/users"
            element={
              <RoleGuard user={auth.user} allowedRoles={["superadmin", "admin"]}>
                {auth.user ? <Users currentUserId={auth.user.user_id} /> : null}
              </RoleGuard>
            }
          />
          <Route
            path="/roles"
            element={
              <RoleGuard user={auth.user} allowedRoles={["superadmin"]}>
                <Roles />
              </RoleGuard>
            }
          />
          <Route
            path="/audit"
            element={
              <RoleGuard user={auth.user} allowedRoles={["superadmin", "admin"]}>
                <Audit />
              </RoleGuard>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
