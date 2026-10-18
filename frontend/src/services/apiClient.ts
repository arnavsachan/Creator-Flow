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
    // E.g. attach bearer token if present
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
    // Global error normalization
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

export default apiClient;
