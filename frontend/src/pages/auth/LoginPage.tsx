import { useEffect, useMemo, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { yupResolver } from "@hookform/resolvers/yup";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { AuthSplitLayout } from "../../components/auth/AuthSplitLayout";
import { resolvePostLoginRoute } from "../../config/roleRoutes";
import { useAuth } from "../../hooks/useAuth";

import { loginSchema, type LoginFormValues } from "./loginSchema";

import type { ApiErrorResponse } from "../../types/auth";

import "./LoginPage.css";

const MailIcon = () => (
  <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 22 22" width="18">
    <rect
      x="3"
      y="4"
      width="16"
      height="14"
      rx="2.2"
      stroke="currentColor"
      strokeWidth="1.7"
    />
    <path
      d="m4.8 6.3 5.1 4.1a1.8 1.8 0 0 0 2.2 0l5.1-4.1"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    />
  </svg>
);

const LockIcon = () => (
  <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 22 22" width="18">
    <path
      d="M7 9V7.3A4 4 0 0 1 11 3.5a4 4 0 0 1 4 3.8V9"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.7"
    />
    <rect
      x="5"
      y="9"
      width="12"
      height="10"
      rx="2.2"
      stroke="currentColor"
      strokeWidth="1.7"
    />
  </svg>
);

const EyeIcon = ({ visible }: { visible: boolean }) => (
  <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 22 22" width="18">
    <path
      d="M2.8 11s3-5 8.2-5 8.2 5 8.2 5-3 5-8.2 5-8.2-5-8.2-5Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    />
    <circle cx="11" cy="11" r="2.5" stroke="currentColor" strokeWidth="1.7" />
    {visible ? null : (
      <path
        d="m4 18 14-14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    )}
  </svg>
);

const GoogleGIcon = () => (
  <svg
    aria-hidden="true"
    width="22"
    height="22"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    focusable="false"
  >
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

const getFirstErrorMessage = (
  value?: string | string[],
): string | undefined => {
  if (!value) {
    return undefined;
  }

  return Array.isArray(value) ? value[0] : value;
};

export const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, login, loginWithGoogle, status, user } = useAuth();
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const loginWithGoogleRef = useRef(loginWithGoogle);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";

  const requestedPath = useMemo(() => {
    const routeState = location.state as
      | {
          from?: {
            pathname?: string;
          };
        }
      | undefined;

    return routeState?.from?.pathname ?? null;
  }, [location.state]);

  loginWithGoogleRef.current = loginWithGoogle;
  const requestedPathRef = useRef(requestedPath);
  requestedPathRef.current = requestedPath;

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    mode: "all",
    reValidateMode: "onChange",
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
    },
    resolver: yupResolver(loginSchema),
  });

  useEffect(() => {
    if (status === "authenticated" && isAuthenticated) {
      navigate(resolvePostLoginRoute(user?.role.role_name, requestedPath), {
        replace: true,
      });
    }
  }, [isAuthenticated, navigate, requestedPath, status, user?.role.role_name]);

  const onSubmit = async (values: LoginFormValues) => {
    setServerMessage(null);

    try {
      const session = await login(
        {
          email: values.email,
          password: values.password,
        },
        {
          rememberMe: values.rememberMe,
        },
      );

      navigate(
        resolvePostLoginRoute(session.user.role.role_name, requestedPath),
        { replace: true },
      );
    } catch (error) {
      if (isAxiosError<ApiErrorResponse>(error)) {
        const apiError = error.response?.data;
        const emailMessage = getFirstErrorMessage(
          apiError?.errors?.email as string | string[] | undefined,
        );
        const passwordMessage = getFirstErrorMessage(
          apiError?.errors?.password as string | string[] | undefined,
        );
        const credentialsMessage = getFirstErrorMessage(
          apiError?.errors?.credentials as string | string[] | undefined,
        );

        if (emailMessage) {
          setError("email", { type: "server", message: emailMessage });
        }

        if (passwordMessage) {
          setError("password", { type: "server", message: passwordMessage });
        }

        if (credentialsMessage) {
          setError("password", { type: "server", message: credentialsMessage });
        }

        setServerMessage(apiError?.message ?? "Unable to sign in right now.");
        return;
      }

        setServerMessage("Unable to sign in right now. Please try again.");
    }
  };

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current) {
      return;
    }

    const applyGoogleCredential = async (idToken: string) => {
      setServerMessage(null);
      setIsGoogleLoading(true);
      try {
        const session = await loginWithGoogleRef.current(idToken);
        navigate(resolvePostLoginRoute(session.user.role.role_name, requestedPathRef.current), {
          replace: true,
        });
      } catch (error) {
        if (isAxiosError<ApiErrorResponse>(error)) {
          setServerMessage(
            error.response?.data?.message ?? "Unable to sign in with Google right now.",
          );
        } else {
          setServerMessage("Unable to sign in with Google right now. Please try again.");
        }
      } finally {
        setIsGoogleLoading(false);
      }
    };

    const renderGoogleButton = () => {
      const google = (
        window as typeof window & {
          google?: {
            accounts: {
              id: {
                initialize: (config: {
                  client_id: string;
                  callback: (response: { credential?: string }) => void;
                }) => void;
                renderButton: (
                  element: HTMLElement,
                  options: { theme: string; size: string; width: number; text: string },
                ) => void;
              };
            };
          };
        }
      ).google;

      if (!google || !googleButtonRef.current) {
        return;
      }

      googleButtonRef.current.innerHTML = "";
      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response) => {
          if (response.credential) {
            void applyGoogleCredential(response.credential);
          }
        },
      });
      google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        width: Math.max(
          240,
          Math.min(400, googleButtonRef.current.offsetWidth || 400),
        ),
        text: "continue_with",
      });
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      "script[src='https://accounts.google.com/gsi/client']",
    );
    if (existingScript) {
      renderGoogleButton();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = renderGoogleButton;
    document.head.appendChild(script);
  }, [googleClientId, navigate]);

  return (
    <AuthSplitLayout contentClassName="login-page__content">
      <div className="login-page__card">
        <header className="login-page__card-header">
          <h2 className="login-page__heading">Login to your account</h2>
        </header>

        {serverMessage ? (
          <div className="login-page__alert" role="alert">
            {serverMessage}
          </div>
        ) : null}

        <form className="login-page__form" noValidate onSubmit={handleSubmit(onSubmit)}>
          <div className="login-page__field">
            <label className="login-page__form-label" htmlFor="email">
              Email
            </label>
            <div
              className={`login-page__input-group ${
                errors.email ? "login-page__input-group--error" : ""
              }`}
            >
              <span className="login-page__icon-shell" aria-hidden="true">
                <MailIcon />
              </span>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="name@company.com"
                aria-invalid={Boolean(errors.email)}
                className={`form-control login-page__form-control ${
                  errors.email ? "is-invalid" : ""
                }`}
                {...register("email")}
              />
            </div>
            {errors.email?.message ? (
              <div className="login-page__form-error">{errors.email.message}</div>
            ) : null}
          </div>

          <div className="login-page__field">
            <label className="login-page__form-label" htmlFor="password">
              Password
            </label>
            <div
              className={`login-page__input-group ${
                errors.password ? "login-page__input-group--error" : ""
              }`}
            >
              <span className="login-page__icon-shell" aria-hidden="true">
                <LockIcon />
              </span>
              <input
                id="password"
                type={isPasswordVisible ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                aria-invalid={Boolean(errors.password)}
                className={`form-control login-page__form-control ${
                  errors.password ? "is-invalid" : ""
                }`}
                {...register("password")}
              />
              <button
                type="button"
                className="login-page__password-toggle"
                aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                onClick={() => setIsPasswordVisible((visible) => !visible)}
              >
                <EyeIcon visible={isPasswordVisible} />
              </button>
            </div>
            {errors.password?.message ? (
              <div className="login-page__form-error">{errors.password.message}</div>
            ) : null}
          </div>

          <div className="login-page__remember-row">
            <div className="form-check login-page__remember">
              <input
                id="rememberMe"
                type="checkbox"
                className="form-check-input"
                {...register("rememberMe")}
              />
              <label className="form-check-label" htmlFor="rememberMe">
                Remember me
              </label>
            </div>
            <Link className="login-page__forgot-link" to="/forgot-password">
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn w-100 login-page__submit"
          >
            {isSubmitting ? (
              <span className="login-page__submit-loading">
                <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                Signing in...
              </span>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        {googleClientId ? (
          <>
            <div className="login-page__divider" role="separator">
              <span>or</span>
            </div>
            <div className="login-page__google">
              {isGoogleLoading ? (
                <p className="login-page__google-status">Signing in with Google...</p>
              ) : null}
              <div className="login-page__google-button">
                <div className="login-page__google-visual" aria-hidden="true">
                  <span className="login-page__google-g">
                    <GoogleGIcon />
                  </span>
                  <span className="login-page__google-label">Continue with Google</span>
                </div>
                <div ref={googleButtonRef} className="login-page__google-hitbox" />
              </div>
            </div>
          </>
        ) : null}

        <p className="login-page__support-note">
          Need access? Contact your Company Administrator.
        </p>
      </div>
    </AuthSplitLayout>
  );
};

export default LoginPage;
