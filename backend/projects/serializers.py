from decimal import Decimal, ROUND_HALF_UP

from rest_framework import serializers

from accounts.models import UserProfile
from accounts.permissions import (
    CLIENT_ROLE_NAME,
    PROJECT_MANAGER_ROLE_NAME,
    SITE_ENGINEER_ROLE_NAME,
    SUPERVISOR_ROLE_NAME,
)

from .models import DailyTaskUpdate, Milestone, MilestoneTask, Project, ProjectAssignment, ProjectDocument


ZERO_DECIMAL = Decimal("0.00")
HUNDRED_DECIMAL = Decimal("100.00")


def quantize_percentage(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


SCHEDULE_STATUS_AHEAD = "ahead_of_schedule"
SCHEDULE_STATUS_ON = "on_schedule"
SCHEDULE_STATUS_BEHIND = "behind_schedule"
SCHEDULE_STATUS_COMPLETED = "completed"
SCHEDULE_STATUS_NOT_STARTED = "not_started"
SCHEDULE_TOLERANCE = Decimal("2.00")


def calculate_expected_progress(start_date, end_date):
    if not start_date or not end_date:
        return ZERO_DECIMAL

    if end_date <= start_date:
        return HUNDRED_DECIMAL

    from django.utils import timezone

    today = timezone.localdate()
    if today <= start_date:
        return ZERO_DECIMAL

    if today >= end_date:
        return HUNDRED_DECIMAL

    total_days = (end_date - start_date).days
    elapsed_days = (today - start_date).days

    if total_days <= 0:
        return HUNDRED_DECIMAL

    return quantize_percentage((Decimal(elapsed_days) / Decimal(total_days)) * HUNDRED_DECIMAL)


def compute_schedule_status(
    actual_progress: Decimal,
    expected_progress: Decimal,
    *,
    entity_status=None,
) -> str:
    """Compare verified actual progress vs planned progress with a small tolerance."""
    if entity_status == "completed" or actual_progress >= HUNDRED_DECIMAL:
        return SCHEDULE_STATUS_COMPLETED

    if expected_progress <= ZERO_DECIMAL and actual_progress <= ZERO_DECIMAL:
        return SCHEDULE_STATUS_NOT_STARTED

    delta = actual_progress - expected_progress
    if abs(delta) <= SCHEDULE_TOLERANCE:
        return SCHEDULE_STATUS_ON
    if delta > SCHEDULE_TOLERANCE:
        return SCHEDULE_STATUS_AHEAD
    return SCHEDULE_STATUS_BEHIND


SCHEDULE_STATUS_LABELS = {
    SCHEDULE_STATUS_AHEAD: "Ahead of Schedule",
    SCHEDULE_STATUS_ON: "On Schedule",
    SCHEDULE_STATUS_BEHIND: "Behind Schedule",
    SCHEDULE_STATUS_COMPLETED: "Completed",
    SCHEDULE_STATUS_NOT_STARTED: "Not Started",
}

def get_task_progress_percentage(task: MilestoneTask) -> Decimal:
    if task.status == MilestoneTask.STATUS_COMPLETED:
        return HUNDRED_DECIMAL

    active_assignments = list(getattr(task, "active_worker_assignments", []))
    if not active_assignments:
        assignment_queryset = task.worker_assignments.filter(is_active=True).prefetch_related("daily_updates")
        active_assignments = list(assignment_queryset)

    if not active_assignments:
        return ZERO_DECIMAL

    completion_values: list[Decimal] = []

    for assignment in active_assignments:
        approved_update = None
        ordered_updates = list(getattr(assignment, "ordered_updates", []))

        if ordered_updates:
            approved_update = next(
                (
                    update
                    for update in ordered_updates
                    if update.supervisor_review_status == DailyTaskUpdate.REVIEW_APPROVED
                    and update.engineer_review_status == DailyTaskUpdate.REVIEW_APPROVED
                ),
                None,
            )

        if approved_update is None:
            approved_updates = list(getattr(assignment, "approved_engineer_updates", []))
            if approved_updates:
                # Prefer dual-verified updates only (supervisor + engineer approved).
                approved_update = next(
                    (
                        update
                        for update in approved_updates
                        if update.supervisor_review_status == DailyTaskUpdate.REVIEW_APPROVED
                    ),
                    None,
                )

        if approved_update is None:
            approved_update = (
                assignment.daily_updates.filter(
                    supervisor_review_status=DailyTaskUpdate.REVIEW_APPROVED,
                    engineer_review_status=DailyTaskUpdate.REVIEW_APPROVED,
                )
                .order_by("-work_date", "-created_at", "-update_id")
                .first()
            )

        if approved_update is None:
            completion_values.append(ZERO_DECIMAL)
        elif approved_update.status == DailyTaskUpdate.STATUS_COMPLETED:
            completion_values.append(HUNDRED_DECIMAL)
        else:
            completion_values.append(approved_update.completion_percentage)

    if not completion_values:
        return ZERO_DECIMAL

    total = sum(completion_values, ZERO_DECIMAL)
    return quantize_percentage(total / Decimal(len(completion_values)))


def get_milestone_progress_percentage(milestone: Milestone) -> Decimal:
    tasks = list(getattr(milestone, "prefetched_tasks", []))
    if not tasks:
        task_queryset = milestone.tasks.all().prefetch_related("worker_assignments__daily_updates")
        tasks = list(task_queryset)

    if not tasks:
        return ZERO_DECIMAL

    completed_count = sum(
        1 for task in tasks if get_task_progress_percentage(task) >= HUNDRED_DECIMAL
    )
    return quantize_percentage(
        (Decimal(completed_count) / Decimal(len(tasks))) * HUNDRED_DECIMAL
    )


def get_project_progress_percentage(project: Project) -> Decimal:
    milestones = list(getattr(project, "milestones").all()) if hasattr(project, "milestones") else []
    if not milestones:
        return ZERO_DECIMAL

    values = [get_milestone_progress_percentage(milestone) for milestone in milestones]
    if not values:
        return ZERO_DECIMAL

    total = sum(values, ZERO_DECIMAL)
    return quantize_percentage(total / Decimal(len(values)))


class ProjectLookupUserSerializer(serializers.ModelSerializer):
    role_name = serializers.CharField(source="role.role_name", read_only=True)

    class Meta:
        model = UserProfile
        fields = ("user_id", "name", "email", "role_name")


class ProjectUserSummarySerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = ("user_id", "name", "email", "role")

    def get_role(self, obj):
        return {
            "role_id": obj.role.role_id,
            "role_name": obj.role.role_name,
            "description": obj.role.description,
        }


class ProjectSummarySerializer(serializers.ModelSerializer):
    created_by = ProjectUserSummarySerializer(read_only=True)
    project_manager = serializers.SerializerMethodField()
    client = serializers.SerializerMethodField()
    site_engineer = serializers.SerializerMethodField()
    supervisor = serializers.SerializerMethodField()
    site_engineers = serializers.SerializerMethodField()
    supervisors = serializers.SerializerMethodField()
    milestone_count = serializers.IntegerField(read_only=True)
    document_count = serializers.IntegerField(read_only=True)
    progress_percentage = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = (
            "project_id",
            "project_name",
            "description",
            "status",
            "start_date",
            "end_date",
            "initial_budget",
            "is_archived",
            "created_by",
            "project_manager",
            "client",
            "site_engineer",
            "supervisor",
            "site_engineers",
            "supervisors",
            "milestone_count",
            "document_count",
            "progress_percentage",
            "created_at",
            "updated_at",
        )

    def get_progress_percentage(self, obj):
        return str(get_project_progress_percentage(obj))

    def _iter_assignment_users(self, obj, assignment_role):
        assignments = getattr(obj, "active_assignments", [])
        users = []
        for assignment in assignments:
            if assignment.assignment_role == assignment_role and assignment.is_active and assignment.user:
                users.append(assignment.user)
        return users

    def _get_assignment_user(self, obj, assignment_role):
        users = self._iter_assignment_users(obj, assignment_role)
        return users[0] if users else None

    def _serialize_assignment_user(self, obj, assignment_role):
        user = self._get_assignment_user(obj, assignment_role)
        return ProjectUserSummarySerializer(user).data if user else None

    def _serialize_assignment_users(self, obj, assignment_role):
        users = self._iter_assignment_users(obj, assignment_role)
        return ProjectUserSummarySerializer(users, many=True).data

    def get_project_manager(self, obj):
        return self._serialize_assignment_user(obj, ProjectAssignment.ROLE_PROJECT_MANAGER)

    def get_client(self, obj):
        return self._serialize_assignment_user(obj, ProjectAssignment.ROLE_CLIENT)

    def get_site_engineer(self, obj):
        # Backward-compatible singular field (first active Site Engineer).
        return self._serialize_assignment_user(obj, ProjectAssignment.ROLE_SITE_ENGINEER)

    def get_supervisor(self, obj):
        # Backward-compatible singular field (first active Supervisor).
        return self._serialize_assignment_user(obj, ProjectAssignment.ROLE_SUPERVISOR)

    def get_site_engineers(self, obj):
        return self._serialize_assignment_users(obj, ProjectAssignment.ROLE_SITE_ENGINEER)

    def get_supervisors(self, obj):
        return self._serialize_assignment_users(obj, ProjectAssignment.ROLE_SUPERVISOR)


class ProjectDetailSerializer(ProjectSummarySerializer):
    class Meta(ProjectSummarySerializer.Meta):
        fields = ProjectSummarySerializer.Meta.fields


class MilestoneSerializer(serializers.ModelSerializer):
    project_id = serializers.IntegerField(source="project.project_id", read_only=True)
    revised_end_date = serializers.DateField(read_only=True)
    effective_end_date = serializers.SerializerMethodField()
    progress_percentage = serializers.SerializerMethodField()
    expected_progress_percentage = serializers.SerializerMethodField()
    schedule_status = serializers.SerializerMethodField()
    schedule_status_label = serializers.SerializerMethodField()
    task_count = serializers.SerializerMethodField()
    extension_count = serializers.SerializerMethodField()

    class Meta:
        model = Milestone
        fields = (
            "milestone_id",
            "project_id",
            "title",
            "description",
            "planned_start_date",
            "planned_end_date",
            "revised_end_date",
            "effective_end_date",
            "contract_value",
            "planned_cost",
            "status",
            "sort_order",
            "task_count",
            "extension_count",
            "progress_percentage",
            "expected_progress_percentage",
            "schedule_status",
            "schedule_status_label",
            "created_at",
            "updated_at",
        )

    def get_effective_end_date(self, obj):
        return obj.effective_end_date

    def get_progress_percentage(self, obj):
        return str(get_milestone_progress_percentage(obj))

    def get_expected_progress_percentage(self, obj):
        return str(calculate_expected_progress(obj.planned_start_date, obj.effective_end_date))

    def get_schedule_status(self, obj):
        actual = get_milestone_progress_percentage(obj)
        expected = calculate_expected_progress(obj.planned_start_date, obj.effective_end_date)
        return compute_schedule_status(actual, expected, entity_status=obj.status)

    def get_schedule_status_label(self, obj):
        return SCHEDULE_STATUS_LABELS.get(self.get_schedule_status(obj), "On Schedule")

    def get_task_count(self, obj):
        prefetched_tasks = getattr(obj, "prefetched_tasks", None)
        if prefetched_tasks is not None:
            return len(prefetched_tasks)
        return obj.tasks.count()

    def get_extension_count(self, obj):
        prefetched_extensions = getattr(obj, "prefetched_extensions", None)
        if prefetched_extensions is not None:
            return len(prefetched_extensions)
        return obj.extensions.count()


class ProjectDocumentSerializer(serializers.ModelSerializer):
    project_id = serializers.IntegerField(source="project.project_id", read_only=True)
    milestone_id = serializers.IntegerField(source="milestone.milestone_id", read_only=True, allow_null=True)
    milestone_title = serializers.CharField(source="milestone.title", read_only=True, allow_null=True)
    uploaded_by = ProjectUserSummarySerializer(read_only=True)
    file_url = serializers.SerializerMethodField()
    file_name = serializers.SerializerMethodField()

    class Meta:
        model = ProjectDocument
        fields = (
            "document_id",
            "project_id",
            "milestone_id",
            "milestone_title",
            "title",
            "document_type",
            "description",
            "is_client_visible",
            "file_name",
            "file_url",
            "uploaded_by",
            "created_at",
            "updated_at",
        )

    def get_file_name(self, obj):
        return obj.file.name.split("/")[-1] if obj.file else None

    def get_file_url(self, obj):
        if not obj.file:
            return None

        request = self.context.get("request")
        url = obj.file.url
        return request.build_absolute_uri(url) if request is not None else url


class ProjectWriteSerializer(serializers.Serializer):
    project_name = serializers.CharField(max_length=200, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    status = serializers.ChoiceField(choices=Project.STATUS_CHOICES, required=False)
    start_date = serializers.DateField(required=False, allow_null=True)
    end_date = serializers.DateField(required=False, allow_null=True)
    initial_budget = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0.00"),
        required=False,
    )
    project_manager_id = serializers.PrimaryKeyRelatedField(
        queryset=UserProfile.objects.select_related("role").all(),
        required=False,
        allow_null=True,
    )
    client_id = serializers.PrimaryKeyRelatedField(
        queryset=UserProfile.objects.select_related("role").all(),
        required=False,
        allow_null=True,
    )
    site_engineer_id = serializers.PrimaryKeyRelatedField(
        queryset=UserProfile.objects.select_related("role").all(),
        required=False,
        allow_null=True,
    )
    supervisor_id = serializers.PrimaryKeyRelatedField(
        queryset=UserProfile.objects.select_related("role").all(),
        required=False,
        allow_null=True,
    )
    site_engineer_ids = serializers.PrimaryKeyRelatedField(
        queryset=UserProfile.objects.select_related("role").all(),
        many=True,
        required=False,
    )
    supervisor_ids = serializers.PrimaryKeyRelatedField(
        queryset=UserProfile.objects.select_related("role").all(),
        many=True,
        required=False,
    )

    def validate(self, attrs):
        if not attrs and self.partial:
            raise serializers.ValidationError("At least one field must be provided.")

        if not self.partial and "project_name" not in attrs:
            raise serializers.ValidationError({"project_name": ["This field is required."]})

        start_date = attrs.get("start_date")
        end_date = attrs.get("end_date")

        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError(
                {"end_date": ["End date cannot be earlier than the start date."]},
            )

        return attrs

    def _validate_role_user(self, value, expected_role_name, inactive_message):
        if value is None:
            return value

        if value.role.role_name != expected_role_name:
            raise serializers.ValidationError(f"Selected user is not a {expected_role_name}.")

        try:
            login_account = value.login_account
        except Exception:
            login_account = None

        if login_account is None or not login_account.is_active or value.status != UserProfile.STATUS_ACTIVE:
            raise serializers.ValidationError(inactive_message)

        return value

    def validate_project_manager_id(self, value):
        value = self._validate_role_user(
            value,
            PROJECT_MANAGER_ROLE_NAME,
            "Selected Project Manager account is inactive.",
        )

        request = self.context.get("request")
        if request is not None and value is not None:
            current_profile = getattr(request.user, "user", None)
            current_role_name = getattr(getattr(current_profile, "role", None), "role_name", None)

            if current_role_name == PROJECT_MANAGER_ROLE_NAME and current_profile and value.user_id != current_profile.user_id:
                raise serializers.ValidationError(
                    "Project Managers can only assign themselves to projects.",
                )

        return value

    def validate_client_id(self, value):
        return self._validate_role_user(
            value,
            CLIENT_ROLE_NAME,
            "Selected Client account is inactive.",
        )

    def validate_site_engineer_id(self, value):
        return self._validate_role_user(
            value,
            SITE_ENGINEER_ROLE_NAME,
            "Selected Site Engineer account is inactive.",
        )

    def validate_supervisor_id(self, value):
        return self._validate_role_user(
            value,
            SUPERVISOR_ROLE_NAME,
            "Selected Supervisor account is inactive.",
        )

    def validate_site_engineer_ids(self, value):
        return [
            self._validate_role_user(
                item,
                SITE_ENGINEER_ROLE_NAME,
                "Selected Site Engineer account is inactive.",
            )
            for item in value
        ]

    def validate_supervisor_ids(self, value):
        return [
            self._validate_role_user(
                item,
                SUPERVISOR_ROLE_NAME,
                "Selected Supervisor account is inactive.",
            )
            for item in value
        ]


class MilestoneWriteSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    planned_start_date = serializers.DateField(required=False, allow_null=True)
    planned_end_date = serializers.DateField(required=False, allow_null=True)
    revised_end_date = serializers.DateField(required=False, allow_null=True)
    contract_value = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        required=False,
        min_value=Decimal("0.00"),
    )
    planned_cost = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        required=False,
        min_value=Decimal("0.00"),
    )
    status = serializers.ChoiceField(choices=Milestone.STATUS_CHOICES, required=False)
    sort_order = serializers.IntegerField(required=False, min_value=1)

    def validate(self, attrs):
        if not attrs and self.partial:
            raise serializers.ValidationError("At least one field must be provided.")

        if not self.partial and "title" not in attrs:
            raise serializers.ValidationError({"title": ["This field is required."]})

        start_date = attrs.get("planned_start_date")
        end_date = attrs.get("planned_end_date")
        revised_end_date = attrs.get("revised_end_date")

        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError(
                {"planned_end_date": ["Milestone end date cannot be earlier than the start date."]},
            )

        if start_date and revised_end_date and revised_end_date < start_date:
            raise serializers.ValidationError(
                {"revised_end_date": ["Revised milestone end date cannot be earlier than the start date."]},
            )

        return attrs


class ProjectDocumentCreateSerializer(serializers.Serializer):
    milestone_id = serializers.PrimaryKeyRelatedField(
        queryset=Milestone.objects.select_related("project").all(),
        required=False,
        allow_null=True,
    )
    title = serializers.CharField(max_length=200)
    document_type = serializers.ChoiceField(choices=ProjectDocument.DOCUMENT_TYPE_CHOICES)
    file = serializers.FileField()
    description = serializers.CharField(required=False, allow_blank=True)
    is_client_visible = serializers.BooleanField(required=False, default=False)


class ProjectDocumentUpdateSerializer(serializers.Serializer):
    milestone_id = serializers.PrimaryKeyRelatedField(
        queryset=Milestone.objects.select_related("project").all(),
        required=False,
        allow_null=True,
    )
    title = serializers.CharField(max_length=200, required=False)
    document_type = serializers.ChoiceField(
        choices=ProjectDocument.DOCUMENT_TYPE_CHOICES,
        required=False,
    )
    file = serializers.FileField(required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    is_client_visible = serializers.BooleanField(required=False)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("At least one field must be provided.")

        return attrs
