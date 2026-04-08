import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import type { AuthUser } from "../../types";

interface ShellProps {
  user: AuthUser;
  onLogout: () => void;
}

export default function Shell({ user, onLogout }: ShellProps) {
  return (
    <div className="shell">
      <Sidebar user={user} />
      <div className="shell-main">
        <TopBar user={user} onLogout={onLogout} />
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
