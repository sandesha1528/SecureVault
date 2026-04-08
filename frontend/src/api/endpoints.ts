import client from "./client";
import type {
  AuditLogResponse,
  CertRecord,
  LoginRequest,
  LoginResponse,
  Role,
  RoleCreateRequest,
  RotationConfig,
  RotationConfigCreate,
  Secret,
  SecretMeta,
  SecretWriteRequest,
  SignedCert,
  SignRequest,
  TOTPSetupResponse,
  TOTPVerifyRequest,
  UserCreateRequest,
  UserRecord,
} from "../types";

// ── Auth ──────────────────────────────────────────────────────────────────────

export const login = (body: LoginRequest) =>
  client.post<LoginResponse>("/auth/login", body).then((r) => r.data);

export const verifyTotp = (body: TOTPVerifyRequest) =>
  client.post<LoginResponse>("/auth/totp/verify", body).then((r) => r.data);

export const refreshTokens = (refresh_token: string) =>
  client.post<LoginResponse>("/auth/refresh", { refresh_token }).then((r) => r.data);

export const logout = (refresh_token: string) =>
  client.post("/auth/logout", { refresh_token }).then((r) => r.data);

export const totpSetup = () =>
  client.get<TOTPSetupResponse>("/auth/totp/setup").then((r) => r.data);

export const totpEnableConfirm = (secret: string, code: string) =>
  client
    .post("/auth/totp/enable/confirm", { secret, code })
    .then((r) => r.data);

// ── Secrets ───────────────────────────────────────────────────────────────────

export const listSecrets = (prefix = "") =>
  client.get<string[]>("/secrets", { params: { prefix } }).then((r) => r.data);

export const getSecret = (path: string, version?: number) =>
  client
    .get<Secret>(`/secrets/${path}`, { params: version ? { version } : {} })
    .then((r) => r.data);

export const writeSecret = (path: string, body: SecretWriteRequest) =>
  client.put<SecretMeta>(`/secrets/${path}`, body).then((r) => r.data);

export const deleteSecret = (path: string, hard = false) =>
  client
    .delete(`/secrets/${path}`, { params: { hard } })
    .then((r) => r.data);

export const listVersions = (path: string) =>
  client
    .get<SecretMeta[]>(`/secrets/${path}/versions`)
    .then((r) => r.data);

// ── SSH ───────────────────────────────────────────────────────────────────────

export const signCert = (body: SignRequest) =>
  client.post<SignedCert>("/ssh/sign", body).then((r) => r.data);

export const getCaPubkey = () =>
  client.get<{ public_key: string }>("/ssh/ca-pubkey").then((r) => r.data);

export const getMyCerts = () =>
  client.get<CertRecord[]>("/ssh/certs").then((r) => r.data);

export const revokeCert = (certId: string) =>
  client.post(`/ssh/revoke/${certId}`).then((r) => r.data);

export const rotateCA = () =>
  client.post("/ssh/rotate-ca").then((r) => r.data);

// ── RBAC ──────────────────────────────────────────────────────────────────────

export const listUsers = () =>
  client.get<UserRecord[]>("/users").then((r) => r.data);

export const createUser = (body: UserCreateRequest) =>
  client.post<UserRecord>("/users", body).then((r) => r.data);

export const updateUser = (
  userId: string,
  body: Partial<{ password: string; role_id: string; is_active: boolean }>
) => client.patch(`/users/${userId}`, body).then((r) => r.data);

export const deleteUser = (userId: string) =>
  client.delete(`/users/${userId}`).then((r) => r.data);

export const listRoles = () =>
  client.get<Role[]>("/roles").then((r) => r.data);

export const createRole = (body: RoleCreateRequest) =>
  client.post<Role>("/roles", body).then((r) => r.data);

export const updateRole = (roleId: string, body: RoleCreateRequest) =>
  client.put<Role>(`/roles/${roleId}`, body).then((r) => r.data);

export const deleteRole = (roleId: string) =>
  client.delete(`/roles/${roleId}`).then((r) => r.data);

// ── Rotation ──────────────────────────────────────────────────────────────────

export const listRotationConfigs = () =>
  client.get<RotationConfig[]>("/rotation/configs").then((r) => r.data);

export const createRotationConfig = (body: RotationConfigCreate) =>
  client.post<RotationConfig>("/rotation/configs", body).then((r) => r.data);

export const deleteRotationConfig = (id: string) =>
  client.delete(`/rotation/configs/${id}`).then((r) => r.data);

export const triggerRotation = (id: string) =>
  client.post(`/rotation/trigger/${id}`).then((r) => r.data);

// ── Audit ─────────────────────────────────────────────────────────────────────

export const getAuditLog = (params: {
  limit?: number;
  offset?: number;
  action?: string;
  actor?: string;
  outcome?: string;
  since?: number;
  until?: number;
}) =>
  client
    .get<AuditLogResponse>("/audit/log", { params })
    .then((r) => r.data);
