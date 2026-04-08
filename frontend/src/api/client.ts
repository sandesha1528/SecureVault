import axios, {
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";

const BASE_URL = "/api";

const client: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// ── Request interceptor — attach access token ─────────────────────────────
client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem("sv_access_token");
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor — refresh token on 401 ───────────────────────────
let _refreshing = false;
let _queue: Array<(token: string) => void> = [];

client.interceptors.response.use(
  (res: AxiosResponse) => res,
  async (error) => {
    const original = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    if (_refreshing) {
      return new Promise((resolve) => {
        _queue.push((token: string) => {
          original.headers.Authorization = `Bearer ${token}`;
          resolve(client(original));
        });
      });
    }

    original._retry = true;
    _refreshing = true;

    const refreshToken = localStorage.getItem("sv_refresh_token");
    if (!refreshToken) {
      _refreshing = false;
      localStorage.clear();
      window.location.href = "/login";
      return Promise.reject(error);
    }

    try {
      const res = await axios.post(`${BASE_URL}/auth/refresh`, {
        refresh_token: refreshToken,
      });
      const { access_token, refresh_token } = res.data as {
        access_token: string;
        refresh_token: string;
      };

      localStorage.setItem("sv_access_token", access_token);
      localStorage.setItem("sv_refresh_token", refresh_token);

      _queue.forEach((cb) => cb(access_token));
      _queue = [];

      original.headers.Authorization = `Bearer ${access_token}`;
      return client(original);
    } catch {
      localStorage.clear();
      window.location.href = "/login";
      return Promise.reject(error);
    } finally {
      _refreshing = false;
    }
  }
);

export default client;
