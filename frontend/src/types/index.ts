// ── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  requires_totp: boolean;
  access_token?: string;
  refresh_token?: string;
  username?: string;
  role?: string;
}

export interface TOTPVerifyRequest {
  username: string;
  code: string;
  session_token: string;
}

export interface TOTPSetupResponse {
  secret: string;
  uri: string;
  qr_png_b64: string;
}

export interface AuthUser {
  user_id: string;
  username: string;
  role: string;
  access_token: string;
  refresh_token: string;
}

// ── Secrets ──────────────────────────────────────────────────────────────────

export interface SecretMeta {
  id: string;
  path: string;
  version: number;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: number;
  expires_at: number | null;
}

export interface Secret extends SecretMeta {
  value: string;
}

export interface SecretWriteRequest {
  value: string;
  metadata?: Record<string, unknown> | null;
  expires_at?: number | null;
}

// ── SSH ───────────────────────────────────────────────────────────────────────

export interface SignRequest {
  public_key: string;
  ttl_hours?: number;
}

export interface SignedCert {
  cert_id: string;
  cert: string;
  fingerprint: string;
  principals: string[];
  valid_from: number;
  valid_to: number;
  serial: number;
}

export interface CertRecord {
  id: string;
  user_id: string;
  public_key_fingerprint: string;
  principals: string[];
  valid_from: number;
  valid_to: number;
  revoked: boolean;
  issued_at: number;
  serial: number;
}

// ── RBAC ─────────────────────────────────────────────────────────────────────

export interface Role {
  id: string;
  name: string;
  parent_role_id: string | null;
  permissions: string[];
}

export interface UserRecord {
  id: string;
  username: string;
  role_id: string | null;
  role_name: string | null;
  totp_enabled: boolean;
  is_active: boolean;
  created_at: number;
  last_login: number | null;
}

export interface UserCreateRequest {
  username: string;
  password: string;
  role_id: string;
}

export interface RoleCreateRequest {
  name: string;
  parent_role_id?: string | null;
  permissions: string[];
}

// ── Rotation ─────────────────────────────────────────────────────────────────

export interface RotationConfig {
  id: string;
  name: string;
  db_type: "postgres" | "mysql" | "redis" | "mongo";
  secret_path: string;
  rotation_interval_hours: number;
  last_rotated_at: number | null;
  next_rotation_at: number | null;
  is_active: boolean;
  webhook_url: string | null;
}

export interface RotationConfigCreate {
  name: string;
  db_type: "postgres" | "mysql" | "redis" | "mongo";
  connection_string: string;
  secret_path: string;
  rotation_interval_hours: number;
  webhook_url?: string | null;
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export interface AuditEvent {
  id: number;
  ts: number;
  actor_id: string | null;
  actor_username: string | null;
  action: string;
  resource: string | null;
  outcome: "success" | "denied" | "error";
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AuditLogResponse {
  events: AuditEvent[];
  total: number;
  limit: number;
  offset: number;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export interface DashboardStats {
  secret_count: number;
  active_certs: number;
  next_rotation: number | null;
  audit_events_24h: number;
}
