import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Lock,
  Terminal,
  RefreshCw,
  Users,
  Shield,
  ScrollText,
} from "lucide-react";
import type { AuthUser } from "../../types";

interface SidebarProps {
  user: AuthUser;
}

const VAULT_ICON = (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <rect width="28" height="28" rx="8" fill="#7c6ff7" fillOpacity="0.15" />
    <rect x="5" y="5" width="18" height="18" rx="4" stroke="#7c6ff7" strokeWidth="1.5" />
    <circle cx="14" cy="14" r="3" fill="#7c6ff7" />
    <path d="M14 8V5M14 23v-3M8 14H5M23 14h-3" stroke="#7c6ff7" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", icon: <LayoutDashboard size={17} />, label: "Dashboard" },
  { to: "/secrets", icon: <Lock size={17} />, label: "Secrets" },
  { to: "/ssh", icon: <Terminal size={17} />, label: "SSH Certificates" },
  { to: "/rotation", icon: <RefreshCw size={17} />, label: "Rotation", roles: ["superadmin", "admin"] },
  { to: "/users", icon: <Users size={17} />, label: "Users", roles: ["superadmin", "admin"] },
  { to: "/roles", icon: <Shield size={17} />, label: "Roles", roles: ["superadmin"] },
  { to: "/audit", icon: <ScrollText size={17} />, label: "Audit Log", roles: ["superadmin", "admin"] },
];

export default function Sidebar({ user }: SidebarProps) {
  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(user.role)
  );

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        {VAULT_ICON}
        <span>SecureVault</span>
      </div>

      <div className="sidebar-nav">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </div>

      <div className="sidebar-footer">
        <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
          SecureVault v1.0
        </div>
      </div>
    </nav>
  );
}
