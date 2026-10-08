from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import update_last_login
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import status
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import RefreshToken, TokenError

from .models import LoginAccount, UserProfile

password_reset_token_generator = PasswordResetTokenGenerator()


class AuthenticationServiceError(Exception):
    def __init__(self, message, error_code, status_code, errors=None):
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.errors = errors or {}


class AuthenticationService:
    GENERIC_RESET_MESSAGE = (
        "If an account exists for that email, password reset instructions are ready."
    )

    @staticmethod
    def _get_login_account(login_id):
        try:
            return LoginAccount.objects.select_related("user__role").get(pk=login_id)
        except LoginAccount.DoesNotExist as exc:
            raise AuthenticationServiceError(
                message="Authentication account was not found.",
                error_code="account_not_found",
                status_code=status.HTTP_404_NOT_FOUND,
                errors={"account": ["Authentication account was not found."]},
            ) from exc

    @staticmethod
    def _ensure_account_is_active(login_account):
        if not login_account.is_active:
            raise AuthenticationServiceError(
                message="This login account is inactive.",
                error_code="inactive_login_account",
                status_code=status.HTTP_403_FORBIDDEN,
                errors={"account": ["This login account is inactive."]},
            )

        if login_account.user.status != UserProfile.STATUS_ACTIVE:
            raise AuthenticationServiceError(
                message="This user profile is not active.",
                error_code="inactive_user_profile",
                status_code=status.HTTP_403_FORBIDDEN,
                errors={"user": ["This user profile is not active."]},
            )

    @staticmethod
    def _build_user_payload(login_account):
        profile = login_account.user
        role = profile.role

        return {
            "login_id": login_account.login_id,
            "user_id": profile.user_id,
            "name": profile.name,
            "email": profile.email,
            "login_email": login_account.email,
            "phone_number": profile.phone_number,
            "status": profile.status,
            "is_active": login_account.is_active,
            "role": {
                "role_id": role.role_id,
                "role_name": role.role_name,
                "description": role.description,
            },
        }

    @staticmethod
    def _build_token_payload(refresh_token):
        token_payload = {
            "access": str(refresh_token.access_token),
        }

        if api_settings.ROTATE_REFRESH_TOKENS:
            if api_settings.BLACKLIST_AFTER_ROTATION:
                try:
                    refresh_token.blacklist()
                except AttributeError:
                    pass

            refresh_token.set_jti()
            refresh_token.set_exp()
            refresh_token.set_iat()

        token_payload["refresh"] = str(refresh_token)
        return token_payload

    @classmethod
    def login(cls, *, email, password, request=None):
        login_account = authenticate(request=request, email=email, password=password)

        if login_account is None:
            raise AuthenticationServiceError(
                message="Invalid email or password.",
                error_code="invalid_credentials",
                status_code=status.HTTP_401_UNAUTHORIZED,
                errors={"credentials": ["Invalid email or password."]},
            )

        login_account = cls._get_login_account(login_account.pk)
        cls._ensure_account_is_active(login_account)

        refresh_token = RefreshToken.for_user(login_account)
        update_last_login(None, login_account)

        return {
            "tokens": {
                "access": str(refresh_token.access_token),
                "refresh": str(refresh_token),
            },
            "user": cls._build_user_payload(login_account),
        }

    @classmethod
    def login_with_google(cls, *, id_token_value):
        client_id = getattr(settings, "GOOGLE_CLIENT_ID", "") or ""
        if not client_id:
            raise AuthenticationServiceError(
                message="Google sign-in is not configured.",
                error_code="google_not_configured",
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                errors={"google": ["Google sign-in is not configured."]},
            )

        try:
            from google.auth.transport import requests as google_requests
            from google.oauth2 import id_token as google_id_token

            payload = google_id_token.verify_oauth2_token(
                id_token_value,
                google_requests.Request(),
                client_id,
            )
        except Exception as exc:
            raise AuthenticationServiceError(
                message="Google sign-in could not be verified.",
                error_code="invalid_google_token",
                status_code=status.HTTP_401_UNAUTHORIZED,
                errors={"google": ["Google sign-in could not be verified."]},
            ) from exc

        email = str(payload.get("email") or "").strip().lower()
        if not email or not payload.get("email_verified", True):
            raise AuthenticationServiceError(
                message="Google did not provide a verified email.",
                error_code="google_email_unverified",
                status_code=status.HTTP_401_UNAUTHORIZED,
                errors={"email": ["Google did not provide a verified email."]},
            )

        login_account = (
            LoginAccount.objects.select_related("user__role")
            .filter(email__iexact=email)
            .first()
        )
        if login_account is None:
            raise AuthenticationServiceError(
                message="No FORTESITE account exists for this Google email.",
                error_code="google_account_not_found",
                status_code=status.HTTP_401_UNAUTHORIZED,
                errors={
                    "email": [
                        "No FORTESITE account exists for this Google email. Ask your Company Administrator to create one.",
                    ]
                },
            )

        cls._ensure_account_is_active(login_account)
        refresh_token = RefreshToken.for_user(login_account)
        update_last_login(None, login_account)

        return {
            "tokens": {
                "access": str(refresh_token.access_token),
                "refresh": str(refresh_token),
            },
            "user": cls._build_user_payload(login_account),
        }

    @classmethod
    def refresh(cls, *, refresh):
        try:
            refresh_token = RefreshToken(refresh)
        except TokenError as exc:
            raise AuthenticationServiceError(
                message="Invalid or expired refresh token.",
                error_code="invalid_refresh_token",
                status_code=status.HTTP_401_UNAUTHORIZED,
                errors={"refresh": ["Invalid or expired refresh token."]},
            ) from exc

        login_account = cls._get_login_account(refresh_token["user_id"])
        cls._ensure_account_is_active(login_account)

        return {
            "tokens": cls._build_token_payload(refresh_token),
            "user": cls._build_user_payload(login_account),
        }

    @staticmethod
    def logout(*, refresh):
        try:
            refresh_token = RefreshToken(refresh)
            refresh_token.blacklist()
        except TokenError as exc:
            raise AuthenticationServiceError(
                message="Invalid or expired refresh token.",
                error_code="invalid_refresh_token",
                status_code=status.HTTP_401_UNAUTHORIZED,
                errors={"refresh": ["Invalid or expired refresh token."]},
            ) from exc

        return {"logged_out": True}

    @classmethod
    def _build_reset_path(cls, login_account):
        uid = urlsafe_base64_encode(force_bytes(login_account.pk))
        token = password_reset_token_generator.make_token(login_account)
        return f"/reset-password?uid={uid}&token={token}"

    @classmethod
    def request_password_reset(cls, *, email):
        """Always return a generic message. Never reveal whether the email exists."""
        payload = {"requested": True}
        normalized_email = email.strip().lower()

        login_account = (
            LoginAccount.objects.select_related("user")
            .filter(email__iexact=normalized_email, is_active=True)
            .first()
        )

        if (
            login_account is None
            or login_account.user.status != UserProfile.STATUS_ACTIVE
        ):
            return payload

        reset_path = cls._build_reset_path(login_account)
        frontend_base = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:5173").rstrip(
            "/"
        )
        reset_link = f"{frontend_base}{reset_path}"

        try:
            send_mail(
                subject="Reset your FORTESITE password",
                message=(
                    "Use this link to reset your password. It expires after a short time "
                    "and can be used only once.\n\n"
                    f"{reset_link}\n\n"
                    "If you did not request this, you can ignore this email."
                ),
                from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@fortesite.local"),
                recipient_list=[login_account.email],
                fail_silently=True,
            )
        except Exception:
            # Email failures must not break forgot-password or reveal account existence.
            pass

        # Local/dev convenience when SMTP is not configured: return the path so the UI works.
        email_backend = getattr(settings, "EMAIL_BACKEND", "")
        if settings.DEBUG or "console" in email_backend:
            payload["reset_path"] = reset_path

        return payload

    @classmethod
    def reset_password(cls, *, uid, token, password):
        try:
            login_id = force_str(urlsafe_base64_decode(uid))
            login_account = LoginAccount.objects.select_related("user").get(pk=login_id)
        except (LoginAccount.DoesNotExist, ValueError, TypeError, OverflowError) as exc:
            raise AuthenticationServiceError(
                message="This password reset link is invalid or has expired.",
                error_code="invalid_reset_token",
                status_code=status.HTTP_400_BAD_REQUEST,
                errors={"token": ["This password reset link is invalid or has expired."]},
            ) from exc

        if not login_account.is_active or login_account.user.status != UserProfile.STATUS_ACTIVE:
            raise AuthenticationServiceError(
                message="This account cannot reset its password right now.",
                error_code="inactive_account",
                status_code=status.HTTP_403_FORBIDDEN,
                errors={"account": ["This account cannot reset its password right now."]},
            )

        if not password_reset_token_generator.check_token(login_account, token):
            raise AuthenticationServiceError(
                message="This password reset link is invalid or has expired.",
                error_code="invalid_reset_token",
                status_code=status.HTTP_400_BAD_REQUEST,
                errors={"token": ["This password reset link is invalid or has expired."]},
            )

        try:
            validate_password(password, user=login_account)
        except DjangoValidationError as exc:
            raise AuthenticationServiceError(
                message="Unable to set that password.",
                error_code="invalid_password",
                status_code=status.HTTP_400_BAD_REQUEST,
                errors={"password": list(exc.messages)},
            ) from exc

        login_account.set_password(password)
        login_account.save(update_fields=["password", "updated_at"])
        return {"reset": True}
