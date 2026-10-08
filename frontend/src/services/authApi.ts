import axios from "axios";

import type {
  ApiSuccessResponse,
  AuthSession,
  LoginCredentials,
} from "../types/auth";

type AppConfig = {
  __APP_CONFIG__?: {
    API_BASE_URL?: string;
  };
};

const trimTrailingSlash = (value: string): string => {
  return value.replace(/\/+$/, "");
};

const runtimeApiBaseUrl =
  (globalThis as typeof globalThis & AppConfig).__APP_CONFIG__?.API_BASE_URL ?? "";

const configuredApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.trim() || runtimeApiBaseUrl.trim() || "/api";

const API_BASE_URL = trimTrailingSlash(configuredApiBaseUrl);

export const publicApiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export const loginRequest = async (
  credentials: LoginCredentials,
): Promise<AuthSession> => {
  const response = await publicApiClient.post<ApiSuccessResponse<AuthSession>>(
    "/auth/login/",
    credentials,
  );

  return response.data.data;
};

export const googleLoginRequest = async (idToken: string): Promise<AuthSession> => {
  const response = await publicApiClient.post<ApiSuccessResponse<AuthSession>>(
    "/auth/google/",
    { id_token: idToken },
  );

  return response.data.data;
};

export const logoutRequest = async (refresh: string): Promise<void> => {
  await publicApiClient.post("/auth/logout/", { refresh });
};

export const refreshTokenRequest = async (
  refresh: string,
): Promise<AuthSession> => {
  const response = await publicApiClient.post<ApiSuccessResponse<AuthSession>>(
    "/auth/refresh/",
    { refresh },
  );

  return response.data.data;
};

export type ForgotPasswordResult = {
  requested: boolean;
  reset_path?: string;
};

export const forgotPasswordRequest = async (
  email: string,
): Promise<{ message: string; data: ForgotPasswordResult }> => {
  const response = await publicApiClient.post<
    ApiSuccessResponse<ForgotPasswordResult>
  >("/auth/forgot-password/", { email });

  return {
    message: response.data.message,
    data: response.data.data,
  };
};

export const resetPasswordRequest = async (payload: {
  uid: string;
  token: string;
  password: string;
  confirm_password: string;
}): Promise<string> => {
  const response = await publicApiClient.post<ApiSuccessResponse<{ reset: boolean }>>(
    "/auth/reset-password/",
    payload,
  );

  return response.data.message;
};
