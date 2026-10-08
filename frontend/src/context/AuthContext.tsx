import {
  createContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { googleLoginRequest, loginRequest, logoutRequest } from "../services/authApi";
import { refreshSession } from "../services/refreshTokenManager";
import { tokenStorage } from "../services/tokenStorage";

import type {
  AuthContextValue,
  AuthSession,
  AuthStatus,
  AuthTokens,
  LoginOptions,
  AuthUser,
  LoginCredentials,
  UserRoleName,
} from "../types/auth";

const getInitialSessionState = (): {
  status: AuthStatus;
  user: AuthUser | null;
  tokens: AuthTokens | null;
} => {
  const session = tokenStorage.getSession();

  if (!session) {
    return {
      status: "unauthenticated",
      user: null,
      tokens: null,
    };
  }

  return {
    status: "authenticated",
    user: session.user,
    tokens: session.tokens,
  };
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const initialState = getInitialSessionState();
  const [status, setStatus] = useState<AuthStatus>(initialState.status);
  const [user, setUser] = useState<AuthUser | null>(initialState.user);
  const [tokens, setTokens] = useState<AuthTokens | null>(initialState.tokens);

  const syncFromStorage = (): void => {
    const session = tokenStorage.getSession();

    if (!session) {
      setStatus("unauthenticated");
      setUser(null);
      setTokens(null);
      return;
    }

    setStatus("authenticated");
    setUser(session.user);
    setTokens(session.tokens);
  };

  useEffect(() => {
    syncFromStorage();

    return tokenStorage.subscribe(() => {
      syncFromStorage();
    });
  }, []);

  const persistSession = (
    session: AuthSession,
    rememberMe = true,
  ): AuthSession => {
    tokenStorage.setSession(session, rememberMe);
    return session;
  };

  const clearSession = (): void => {
    tokenStorage.clearSession();
  };

  const login = async (
    credentials: LoginCredentials,
    options?: LoginOptions,
  ): Promise<AuthSession> => {
    const session = await loginRequest(credentials);
    return persistSession(session, options?.rememberMe ?? true);
  };

  const loginWithGoogle = async (
    idToken: string,
    options?: LoginOptions,
  ): Promise<AuthSession> => {
    const session = await googleLoginRequest(idToken);
    return persistSession(session, options?.rememberMe ?? true);
  };

  const logout = async (): Promise<void> => {
    const refreshToken = tokenStorage.getRefreshToken();

    try {
      if (refreshToken) {
        await logoutRequest(refreshToken);
      }
    } finally {
      clearSession();
    }
  };

  const refreshAuth = async (): Promise<AuthSession | null> => {
    setStatus("loading");

    const session = await refreshSession();

    if (!session) {
      setStatus("unauthenticated");
      return null;
    }

    setStatus("authenticated");
    return session;
  };

  const hasRole = (...roles: UserRoleName[]): boolean => {
    if (!user) {
      return false;
    }

    return roles.includes(user.role.role_name);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      tokens,
      isAuthenticated: status === "authenticated" && Boolean(tokens?.access),
      login,
      loginWithGoogle,
      logout,
      refreshAuth,
      clearSession,
      hasRole,
    }),
    [status, user, tokens],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
