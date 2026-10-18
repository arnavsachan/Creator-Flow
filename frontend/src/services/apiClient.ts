import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';

const BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  'http://127.0.0.1:8000/api/v1';

const defaultConfig: AxiosRequestConfig = {
  baseURL: BASE_URL,
  timeout: 15000, // 15 seconds
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
};

export const apiClient: AxiosInstance = axios.create(defaultConfig);

// Interceptors can be attached here for auth tokens and consistent error handling
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const normalizedError = {
      message:
        error.response?.data?.message ||
        error.message ||
        'An unexpected network error occurred.',
      status: error.response?.status,
      data: error.response?.data,
    };
    return Promise.reject(normalizedError);
  }
);

export type HealthStatus = 'ok' | 'not_ready' | 'unreachable';

export interface BackendHealthResponse {
  status: HealthStatus;
  service?: string;
  environment?: string;
  database?: string;
}

/**
 * Checks backend connectivity and readiness with a strict 3-second timeout.
 * Never throws into the UI.
 */
export async function checkBackendHealth(): Promise<BackendHealthResponse> {
  const rootUrl = BASE_URL.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const healthRes = await fetch(`${rootUrl}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!healthRes.ok) {
      clearTimeout(timeoutId);
      return { status: 'unreachable' };
    }

    const healthData = await healthRes.json();

    const readyRes = await fetch(`${rootUrl}/health/ready`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (readyRes.status === 200) {
      const readyData = await readyRes.json();
      return {
        status: 'ok',
        service: healthData.service,
        environment: healthData.environment,
        database: readyData.database,
      };
    } else if (readyRes.status === 503) {
      const readyData = await readyRes.json();
      return {
        status: 'not_ready',
        service: healthData.service,
        environment: healthData.environment,
        database: readyData.database,
      };
    }

    return {
      status: 'not_ready',
      service: healthData.service,
      environment: healthData.environment,
    };
  } catch {
    clearTimeout(timeoutId);
    return { status: 'unreachable' };
  }
}

export default apiClient;
