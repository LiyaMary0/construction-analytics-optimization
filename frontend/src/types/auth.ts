export const ROLE_NAMES = {
  COMPANY_ADMINISTRATOR: "Company Administrator",
  PROJECT_MANAGER: "Project Manager",
  SITE_ENGINEER: "Site Engineer",
  SUPERVISOR: "Supervisor",
  WORKER: "Worker",
  CLIENT: "Client",
} as const;

export type UserRoleName = (typeof ROLE_NAMES)[keyof typeof ROLE_NAMES];

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface RoleDetails {
  role_id: number;
  role_name: UserRoleName;
  description: string;
}

export interface AuthUser {
  login_id: number;
  user_id: number;
  name: string;
  email: string;
  login_email: string;
  phone_number: string;
  status: string;
  is_active: boolean;
  role: RoleDetails;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface AuthSession {
  tokens: AuthTokens;
  user: AuthUser;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginOptions {
  rememberMe?: boolean;
}

export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errors: Record<string, string[] | string>;
  error_code?: string;
}

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  login: (
    credentials: LoginCredentials,
    options?: LoginOptions,
  ) => Promise<AuthSession>;
  loginWithGoogle: (
    idToken: string,
    options?: LoginOptions,
  ) => Promise<AuthSession>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<AuthSession | null>;
  clearSession: () => void;
  hasRole: (...roles: UserRoleName[]) => boolean;
}
