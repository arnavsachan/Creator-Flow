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

export type ApiErrorKind =
  | 'network'
  | 'unauthorized'
  | 'not_found'
  | 'unavailable'
  | 'unknown';

export interface NormalizedApiError {
  status?: number;
  code?: string;
  message: string;
  kind: ApiErrorKind;
  data?: unknown;
}

/**
 * Normalizes Axios and network errors into a consistent structure.
 * Reads body.detail (string or array), body.error.code / body.error.message, and body.message.
 * Never includes tokens or headers in error messages.
 */
export function normalizeApiError(error: any): NormalizedApiError {
  if (!error) {
    return {
      message: 'An unknown error occurred.',
      kind: 'unknown',
    };
  }

  if (error.kind && typeof error.message === 'string') {
    return error as NormalizedApiError;
  }

  const status: number | undefined = error.response?.status;
  const body = error.response?.data;

  let code: string | undefined = undefined;
  if (typeof body?.error?.code === 'string') {
    code = body.error.code;
  } else if (typeof body?.code === 'string') {
    code = body.code;
  }

  let message: string | undefined = undefined;

  if (typeof body?.error?.message === 'string' && body.error.message.trim()) {
    message = body.error.message.trim();
  } else if (typeof body?.detail === 'string' && body.detail.trim()) {
    message = body.detail.trim();
  } else if (Array.isArray(body?.detail)) {
    message = body.detail
      .map((item: any) => {
        if (typeof item === 'string') return item;
        if (item?.msg && typeof item.msg === 'string') return item.msg;
        return JSON.stringify(item);
      })
      .filter(Boolean)
      .join('; ');
  } else if (typeof body?.message === 'string' && body.message.trim()) {
    message = body.message.trim();
  }

  let kind: ApiErrorKind = 'unknown';

  if (!error.response) {
    kind = 'network';
    if (!message) {
      const rawMsg = error.message;
      if (
        rawMsg &&
        !rawMsg.includes('Bearer') &&
        !rawMsg.toLowerCase().includes('authorization') &&
        !rawMsg.toLowerCase().includes('headers')
      ) {
        message = rawMsg;
      } else {
        message = 'Network connection failed or timed out.';
      }
    }
  } else if (status === 401 || status === 403) {
    kind = 'unauthorized';
    if (!message) {
      message = 'Session expired or authentication required.';
    }
  } else if (status === 404) {
    kind = 'not_found';
    if (!message) {
      message = 'The requested channel or resource was not found.';
    }
  } else if (status === 503 || status === 502 || status === 504) {
    kind = 'unavailable';
    if (!message) {
      message = 'Service is temporarily unavailable.';
    }
  } else {
    kind = 'unknown';
    if (!message) {
      message = 'An unexpected server error occurred.';
    }
  }

  let safeMessage = message || 'An unexpected error occurred.';

  // Security guard: never include bearer tokens or authorization headers in error messages
  if (
    safeMessage.includes('Bearer') ||
    safeMessage.toLowerCase().includes('authorization') ||
    safeMessage.toLowerCase().includes('headers')
  ) {
    safeMessage = 'Authentication failed. Please check credentials.';
  }

  return {
    status,
    code,
    message: safeMessage,
    kind,
    data: body,
  };
}

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }
    const normalizedError = normalizeApiError(error);
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
