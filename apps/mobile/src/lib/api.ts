/** Shared authenticated HTTP client for the Relay native application. */
import { create, isAxiosError } from 'axios';

const configuredBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

if (!configuredBaseUrl) {
  // Fail at first request with a useful message rather than silently calling localhost.
  console.warn('[Relay mobile] Set EXPO_PUBLIC_API_URL in apps/mobile/.env');
}

export const API_BASE_URL = (configuredBaseUrl || 'http://localhost:5001/api').replace(/\/$/, '');
export const API_ORIGIN = API_BASE_URL.replace(/\/api$/, '');

let accessToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export const api = create({
  baseURL: API_BASE_URL,
  timeout: 12_000,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  // Native authentication uses an Authorization header, not browser cookies.
  withCredentials: false,
});

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

export function getErrorMessage(error: unknown, fallback: string) {
  if (isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (typeof message === 'string' && message.length < 240) return message;
    if (error.code === 'ECONNABORTED') return 'The request timed out. Please try again.';
    if (!error.response) return 'Unable to reach Relay. Check your connection and API URL.';
  }
  return fallback;
}

// Expired/deleted-account sessions should return to the auth boundary rather
// than leaving protected screens mounted with a credential that no longer works.
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (isAxiosError(error) && error.response?.status === 401 && accessToken) {
      unauthorizedHandler?.();
    }
    return Promise.reject(error);
  },
);
