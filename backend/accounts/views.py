from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from .responses import error_response, success_response
from .serializers import (
    ForgotPasswordSerializer,
    GoogleLoginSerializer,
    LoginSerializer,
    LogoutSerializer,
    RefreshSerializer,
    ResetPasswordSerializer,
)
from .services import AuthenticationService, AuthenticationServiceError


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)

        if not serializer.is_valid():
            return error_response(
                message="Login request validation failed.",
                errors=serializer.errors,
                error_code="validation_error",
            )

        try:
            login_data = AuthenticationService.login(
                email=serializer.validated_data["email"],
                password=serializer.validated_data["password"],
                request=request,
            )
        except AuthenticationServiceError as exc:
            return error_response(
                message=exc.message,
                errors=exc.errors,
                status_code=exc.status_code,
                error_code=exc.error_code,
            )
        except Exception:
            return error_response(
                message="An unexpected authentication error occurred during login.",
                errors={"server": ["Please try again later."]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                error_code="authentication_error",
            )

        return success_response(message="Login successful.", data=login_data)


class GoogleLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = GoogleLoginSerializer(data=request.data)

        if not serializer.is_valid():
            return error_response(
                message="Google login request validation failed.",
                errors=serializer.errors,
                error_code="validation_error",
            )

        try:
            login_data = AuthenticationService.login_with_google(
                id_token_value=serializer.validated_data["id_token"],
            )
        except AuthenticationServiceError as exc:
            return error_response(
                message=exc.message,
                errors=exc.errors,
                status_code=exc.status_code,
                error_code=exc.error_code,
            )
        except Exception:
            return error_response(
                message="An unexpected authentication error occurred during Google login.",
                errors={"server": ["Please try again later."]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                error_code="authentication_error",
            )

        return success_response(message="Login successful.", data=login_data)


class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LogoutSerializer(data=request.data)

        if not serializer.is_valid():
            return error_response(
                message="Logout request validation failed.",
                errors=serializer.errors,
                error_code="validation_error",
            )

        try:
            logout_data = AuthenticationService.logout(refresh=serializer.validated_data["refresh"])
        except AuthenticationServiceError as exc:
            return error_response(
                message=exc.message,
                errors=exc.errors,
                status_code=exc.status_code,
                error_code=exc.error_code,
            )
        except Exception:
            return error_response(
                message="An unexpected authentication error occurred during logout.",
                errors={"server": ["Please try again later."]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                error_code="authentication_error",
            )

        return success_response(message="Logout successful.", data=logout_data)


class RefreshView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RefreshSerializer(data=request.data)

        if not serializer.is_valid():
            return error_response(
                message="Refresh request validation failed.",
                errors=serializer.errors,
                error_code="validation_error",
            )

        try:
            refresh_data = AuthenticationService.refresh(refresh=serializer.validated_data["refresh"])
        except AuthenticationServiceError as exc:
            return error_response(
                message=exc.message,
                errors=exc.errors,
                status_code=exc.status_code,
                error_code=exc.error_code,
            )
        except Exception:
            return error_response(
                message="An unexpected authentication error occurred during token refresh.",
                errors={"server": ["Please try again later."]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                error_code="authentication_error",
            )

        return success_response(message="Token refreshed successfully.", data=refresh_data)


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)

        if not serializer.is_valid():
            return error_response(
                message="Forgot password request validation failed.",
                errors=serializer.errors,
                error_code="validation_error",
            )

        try:
            data = AuthenticationService.request_password_reset(
                email=serializer.validated_data["email"],
            )
        except Exception:
            return error_response(
                message="Unable to process the password reset request right now.",
                errors={"server": ["Please try again later."]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                error_code="password_reset_error",
            )

        return success_response(
            message=AuthenticationService.GENERIC_RESET_MESSAGE,
            data=data,
        )


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)

        if not serializer.is_valid():
            return error_response(
                message="Reset password request validation failed.",
                errors=serializer.errors,
                error_code="validation_error",
            )

        try:
            data = AuthenticationService.reset_password(
                uid=serializer.validated_data["uid"],
                token=serializer.validated_data["token"],
                password=serializer.validated_data["password"],
            )
        except AuthenticationServiceError as exc:
            return error_response(
                message=exc.message,
                errors=exc.errors,
                status_code=exc.status_code,
                error_code=exc.error_code,
            )
        except Exception:
            return error_response(
                message="Unable to reset the password right now.",
                errors={"server": ["Please try again later."]},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                error_code="password_reset_error",
            )

        return success_response(
            message="Password updated successfully. You can sign in with your new password.",
            data=data,
        )
