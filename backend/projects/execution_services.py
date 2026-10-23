from django.db import transaction
from django.db.models import Prefetch, Q
from django.utils import timezone
from rest_framework import status

from accounts.permissions import (
    CLIENT_ROLE_NAME,
    COMPANY_ADMIN_ROLE_NAME,
    PROJECT_MANAGER_ROLE_NAME,
    SITE_ENGINEER_ROLE_NAME,
    SUPERVISOR_ROLE_NAME,
    WORKER_ROLE_NAME,
    get_user_role_name,
)

from .models import DailyTaskUpdate, Milestone, MilestoneExtension, MilestoneTask, Project, ProjectAssignment, TaskWorkerAssignment
from .serializers import (
    get_milestone_progress_percentage,
    get_project_progress_percentage,
    get_task_progress_percentage,
)
from .services import ProjectService, ProjectServiceError


class ProjectExecutionService:
    MANAGER_ROLES = (COMPANY_ADMIN_ROLE_NAME, PROJECT_MANAGER_ROLE_NAME)
    TASK_DESIGNER_ROLES = (COMPANY_ADMIN_ROLE_NAME, PROJECT_MANAGER_ROLE_NAME, SITE_ENGINEER_ROLE_NAME)
    TASK_VIEWER_ROLES = (COMPANY_ADMIN_ROLE_NAME, PROJECT_MANAGER_ROLE_NAME, SITE_ENGINEER_ROLE_NAME, SUPERVISOR_ROLE_NAME)
    CONCERN_VIEWER_ROLES = (COMPANY_ADMIN_ROLE_NAME, PROJECT_MANAGER_ROLE_NAME, SITE_ENGINEER_ROLE_NAME, SUPERVISOR_ROLE_NAME)

    @staticmethod
    def _get_profile(login_account):
        return ProjectService._get_profile(login_account)

    @classmethod
    def _accessible_project_queryset(cls, login_account):
        profile = cls._get_profile(login_account)
        role_name = get_user_role_name(login_account)
        queryset = ProjectService._detail_queryset()

        if role_name == COMPANY_ADMIN_ROLE_NAME:
            return queryset

        if role_name == PROJECT_MANAGER_ROLE_NAME:
            return queryset.filter(
                Q(created_by=profile)
                | Q(
                    assignments__user=profile,
                    assignments__assignment_role=ProjectAssignment.ROLE_PROJECT_MANAGER,
                    assignments__is_active=True,
                ),
            ).distinct()

        if role_name == SITE_ENGINEER_ROLE_NAME:
            return queryset.filter(
                assignments__user=profile,
                assignments__assignment_role=ProjectAssignment.ROLE_SITE_ENGINEER,
                assignments__is_active=True,
            ).distinct()

        if role_name == SUPERVISOR_ROLE_NAME:
            return queryset.filter(
                assignments__user=profile,
                assignments__assignment_role=ProjectAssignment.ROLE_SUPERVISOR,
                assignments__is_active=True,
            ).distinct()

        if role_name == CLIENT_ROLE_NAME:
            return queryset.filter(
                assignments__user=profile,
                assignments__assignment_role=ProjectAssignment.ROLE_CLIENT,
                assignments__is_active=True,
            ).distinct()

        raise ProjectServiceError(
            message="You do not have permission to access project execution data.",
            error_code="permission_denied",
            status_code=status.HTTP_403_FORBIDDEN,
            errors={"permission": ["You do not have permission to access project execution data."]},
        )

    @classmethod
    def _get_accessible_project(cls, *, login_account, project_id):
        try:
            return cls._accessible_project_queryset(login_account).get(pk=project_id)
        except Project.DoesNotExist as exc:
            raise ProjectServiceError(
                message="Project was not found or is not accessible.",
                error_code="project_not_found",
                status_code=status.HTTP_404_NOT_FOUND,
                errors={"project": ["Project was not found or is not accessible."]},
            ) from exc

    @classmethod
    def _ensure_role(cls, login_account, allowed_roles, message):
        role_name = get_user_role_name(login_account)
        if role_name not in allowed_roles:
            raise ProjectServiceError(
                message=message,
                error_code="permission_denied",
                status_code=status.HTTP_403_FORBIDDEN,
                errors={"permission": [message]},
            )
        return cls._get_profile(login_account), role_name

    @staticmethod
    def _task_assignment_prefetch(include_inactive=False):
        assignment_queryset = TaskWorkerAssignment.objects.select_related(
            "worker__role",
            "assigned_by__role",
            "task__milestone__project",
        ).prefetch_related(
            Prefetch(
                "daily_updates",
                queryset=DailyTaskUpdate.objects.select_related(
                    "supervisor_reviewed_by__role",
                    "engineer_reviewed_by__role",
                ).order_by("-work_date", "-created_at", "-update_id"),
                to_attr="ordered_updates",
            ),
        )

        if not include_inactive:
            assignment_queryset = assignment_queryset.filter(is_active=True)

        return Prefetch(
            "worker_assignments",
            queryset=assignment_queryset,
            to_attr="active_worker_assignments" if not include_inactive else "prefetched_worker_assignments",
        )

    @classmethod
    def _task_queryset(cls):
        return MilestoneTask.objects.select_related(
            "milestone__project",
            "created_by__role",
            "approved_by__role",
        ).prefetch_related(cls._task_assignment_prefetch())

    @classmethod
    def _get_viewable_milestone(cls, *, login_account, project_id, milestone_id):
        project = cls._get_accessible_project(login_account=login_account, project_id=project_id)

        try:
            # Query Milestone directly — project detail already prefetches milestones with
            # different extension/task querysets; reusing project.milestones.prefetch_related
            # raises ValueError for conflicting prefetched_extensions lookups.
            return (
                Milestone.objects.filter(project_id=project.pk)
                .prefetch_related(
                    Prefetch(
                        "extensions",
                        queryset=MilestoneExtension.objects.select_related("extended_by__role").order_by(
                            "-created_at",
                            "-extension_id",
                        ),
                        to_attr="prefetched_extensions",
                    ),
                    Prefetch(
                        "tasks",
                        queryset=cls._task_queryset().order_by("sort_order", "task_id"),
                        to_attr="prefetched_tasks",
                    ),
                )
                .get(pk=milestone_id)
            )
        except Milestone.DoesNotExist as exc:
            raise ProjectServiceError(
                message="Milestone was not found or is not accessible.",
                error_code="milestone_not_found",
                status_code=status.HTTP_404_NOT_FOUND,
                errors={"milestone": ["Milestone was not found or is not accessible."]},
            ) from exc

    @classmethod
    def _get_manageable_milestone(cls, *, login_account, project_id, milestone_id):
        project = ProjectService._get_manageable_project(login_account=login_account, project_id=project_id)

        try:
            return project.milestones.get(pk=milestone_id)
        except Milestone.DoesNotExist as exc:
            raise ProjectServiceError(
                message="Milestone was not found or cannot be managed.",
                error_code="milestone_not_found",
                status_code=status.HTTP_404_NOT_FOUND,
                errors={"milestone": ["Milestone was not found or cannot be managed."]},
            ) from exc

    @classmethod
    def _get_designer_milestone(cls, *, login_account, project_id, milestone_id):
        _, role_name = cls._ensure_role(
            login_account,
            cls.TASK_DESIGNER_ROLES,
            "Only Company Administrator, Project Manager, or Site Engineer can manage milestone tasks.",
        )

        if role_name in cls.MANAGER_ROLES:
            return cls._get_manageable_milestone(
                login_account=login_account,
                project_id=project_id,
                milestone_id=milestone_id,
            )

        project = cls._get_accessible_project(login_account=login_account, project_id=project_id)

        try:
            return project.milestones.get(pk=milestone_id)
        except Milestone.DoesNotExist as exc:
            raise ProjectServiceError(
                message="Milestone was not found or is not assigned to this Site Engineer.",
                error_code="milestone_not_found",
                status_code=status.HTTP_404_NOT_FOUND,
                errors={"milestone": ["Milestone was not found or is not assigned to this Site Engineer."]},
            ) from exc

    @classmethod
    def _get_task_for_view(cls, *, login_account, project_id, milestone_id, task_id):
        milestone = cls._get_viewable_milestone(
            login_account=login_account,
            project_id=project_id,
            milestone_id=milestone_id,
        )

        for task in getattr(milestone, "prefetched_tasks", []):
            if task.task_id == task_id:
                return task

        try:
            return cls._task_queryset().get(pk=task_id, milestone_id=milestone_id, milestone__project_id=project_id)
        except MilestoneTask.DoesNotExist as exc:
            raise ProjectServiceError(
                message="Task was not found.",
                error_code="task_not_found",
                status_code=status.HTTP_404_NOT_FOUND,
                errors={"task": ["Task was not found."]},
            ) from exc

    @classmethod
    def _get_task_for_design(cls, *, login_account, project_id, milestone_id, task_id):
        milestone = cls._get_designer_milestone(
            login_account=login_account,
            project_id=project_id,
            milestone_id=milestone_id,
        )

        try:
            return cls._task_queryset().get(pk=task_id, milestone=milestone)
        except MilestoneTask.DoesNotExist as exc:
            raise ProjectServiceError(
                message="Task was not found or cannot be managed.",
                error_code="task_not_found",
                status_code=status.HTTP_404_NOT_FOUND,
                errors={"task": ["Task was not found or cannot be managed."]},
            ) from exc

    @classmethod
    def _get_task_for_supervisor(cls, *, login_account, project_id, milestone_id, task_id):
        cls._ensure_role(
            login_account,
            (SUPERVISOR_ROLE_NAME,),
            "Only Supervisor can assign work to workers.",
        )
        project = cls._get_accessible_project(login_account=login_account, project_id=project_id)

        try:
            milestone = project.milestones.get(pk=milestone_id)
        except Milestone.DoesNotExist as exc:
            raise ProjectServiceError(
                message="Milestone was not found or is not assigned to this Supervisor.",
                error_code="milestone_not_found",
                status_code=status.HTTP_404_NOT_FOUND,
                errors={"milestone": ["Milestone was not found or is not assigned to this Supervisor."]},
            ) from exc

        try:
            return cls._task_queryset().get(pk=task_id, milestone=milestone)
        except MilestoneTask.DoesNotExist as exc:
            raise ProjectServiceError(
                message="Task was not found or is not accessible.",
                error_code="task_not_found",
                status_code=status.HTTP_404_NOT_FOUND,
                errors={"task": ["Task was not found or is not accessible."]},
            ) from exc

    @classmethod
    def _get_assignment(cls, *, assignment_id):
        try:
            return TaskWorkerAssignment.objects.select_related(
                "worker__role",
                "assigned_by__role",
                "task__milestone__project",
            ).prefetch_related(
                Prefetch(
                    "daily_updates",
                    queryset=DailyTaskUpdate.objects.select_related(
                        "supervisor_reviewed_by__role",
                        "engineer_reviewed_by__role",
                    ).order_by("-work_date", "-created_at", "-update_id"),
                    to_attr="ordered_updates",
                ),
            ).get(pk=assignment_id)
        except TaskWorkerAssignment.DoesNotExist as exc:
            raise ProjectServiceError(
                message="Task assignment was not found.",
                error_code="assignment_not_found",
                status_code=status.HTTP_404_NOT_FOUND,
                errors={"assignment": ["Task assignment was not found."]},
            ) from exc

    @classmethod
    def _get_task_update(cls, *, update_id):
        try:
            return DailyTaskUpdate.objects.select_related(
                "assignment__worker__role",
                "assignment__task__milestone__project",
                "assignment__task",
                "assignment__task__milestone",
                "supervisor_reviewed_by__role",
                "engineer_reviewed_by__role",
            ).get(pk=update_id)
        except DailyTaskUpdate.DoesNotExist as exc:
            raise ProjectServiceError(
                message="Daily task update was not found.",
                error_code="daily_update_not_found",
                status_code=status.HTTP_404_NOT_FOUND,
                errors={"daily_update": ["Daily task update was not found."]},
            ) from exc

    @classmethod
    def _validate_worker_access_to_assignment(cls, *, login_account, assignment):
        profile, _ = cls._ensure_role(
            login_account,
            (WORKER_ROLE_NAME,),
            "Only Worker can update assigned work items.",
        )

        if assignment.worker_id != profile.user_id:
            raise ProjectServiceError(
                message="This task assignment does not belong to the authenticated worker.",
                error_code="permission_denied",
                status_code=status.HTTP_403_FORBIDDEN,
                errors={"permission": ["This task assignment does not belong to the authenticated worker."]},
            )

        if not assignment.is_active:
            raise ProjectServiceError(
                message="This task assignment is inactive and cannot be updated.",
                error_code="assignment_inactive",
                status_code=status.HTTP_400_BAD_REQUEST,
                errors={"assignment": ["This task assignment is inactive and cannot be updated."]},
            )

        return profile

    @classmethod
    def _validate_supervisor_access_to_assignment(cls, *, login_account, assignment):
        cls._ensure_role(
            login_account,
            (SUPERVISOR_ROLE_NAME,),
            "Only Supervisor can review worker task updates.",
        )
        cls._get_accessible_project(
            login_account=login_account,
            project_id=assignment.task.milestone.project_id,
        )

    @classmethod
    def _validate_engineer_access_to_assignment(cls, *, login_account, assignment):
        cls._ensure_role(
            login_account,
            (SITE_ENGINEER_ROLE_NAME,),
            "Only Site Engineer can verify supervisor-reviewed daily updates.",
        )
        cls._get_accessible_project(
            login_account=login_account,
            project_id=assignment.task.milestone.project_id,
        )

    @classmethod
    def _refresh_milestone_status(cls, milestone):
        current_date = timezone.localdate()
        progress = get_milestone_progress_percentage(milestone)

        if progress >= 100:
            next_status = Milestone.STATUS_COMPLETED
        elif milestone.effective_end_date and current_date > milestone.effective_end_date:
            next_status = Milestone.STATUS_DELAYED
        elif progress > 0:
            next_status = Milestone.STATUS_IN_PROGRESS
        else:
            next_status = Milestone.STATUS_PLANNED

        if milestone.status != next_status:
            milestone.status = next_status
            milestone.save(update_fields=["status", "updated_at"])

        cls._refresh_project_status(milestone.project)

    @classmethod
    def _refresh_project_status(cls, project):
        if project.status == Project.STATUS_ON_HOLD:
            return

        progress = get_project_progress_percentage(project)

        if progress >= 100:
            next_status = Project.STATUS_COMPLETED
        elif progress > 0:
            next_status = Project.STATUS_ACTIVE
        else:
            return

        if project.status != next_status:
            project.status = next_status
            project.save(update_fields=["status", "updated_at"])

    @classmethod
    def _refresh_task_status(cls, task):
        current_date = timezone.localdate()
        progress = get_task_progress_percentage(task)

        if progress >= 100:
            next_status = MilestoneTask.STATUS_COMPLETED
        elif task.effective_end_date and current_date > task.effective_end_date:
            next_status = MilestoneTask.STATUS_DELAYED
        elif progress > 0:
            next_status = MilestoneTask.STATUS_IN_PROGRESS
        else:
            next_status = MilestoneTask.STATUS_PLANNED

        if task.status != next_status:
            task.status = next_status
            task.save(update_fields=["status", "updated_at"])

        cls._refresh_milestone_status(task.milestone)

    @classmethod
    def list_available_workers(cls, *, login_account, project_id):
        cls._ensure_role(
            login_account,
            (COMPANY_ADMIN_ROLE_NAME, PROJECT_MANAGER_ROLE_NAME, SITE_ENGINEER_ROLE_NAME, SUPERVISOR_ROLE_NAME),
            "Only Company Administrator, Project Manager, Site Engineer, or Supervisor can view worker assignments.",
        )
        cls._get_accessible_project(login_account=login_account, project_id=project_id)
        return list(ProjectService._build_lookup_queryset(WORKER_ROLE_NAME))

    @classmethod
    def list_milestone_extensions(cls, *, login_account, project_id, milestone_id):
        milestone = cls._get_viewable_milestone(
            login_account=login_account,
            project_id=project_id,
            milestone_id=milestone_id,
        )
        return list(getattr(milestone, "prefetched_extensions", []))

    @classmethod
    @transaction.atomic
    def create_milestone_extension(cls, *, login_account, project_id, milestone_id, **validated_data):
        profile, _ = cls._ensure_role(
            login_account,
            cls.MANAGER_ROLES,
            "Only Company Administrator or Project Manager can extend milestone timelines.",
        )
        milestone = cls._get_manageable_milestone(
            login_account=login_account,
            project_id=project_id,
            milestone_id=milestone_id,
        )

        previous_end_date = milestone.effective_end_date
        new_end_date = validated_data["new_end_date"]

        if previous_end_date and new_end_date <= previous_end_date:
            raise ProjectServiceError(
                message="The new completion date must be later than the current milestone deadline.",
                error_code="validation_error",
                status_code=status.HTTP_400_BAD_REQUEST,
                errors={"new_end_date": ["The new completion date must be later than the current milestone deadline."]},
            )

        extension = MilestoneExtension.objects.create(
            milestone=milestone,
            previous_end_date=previous_end_date,
            new_end_date=new_end_date,
            reason=validated_data.get("reason", ""),
            extended_by=profile,
        )

        milestone.revised_end_date = new_end_date
        milestone.save(update_fields=["revised_end_date", "updated_at"])
        cls._refresh_milestone_status(milestone)

        return extension

    @classmethod
    def _get_manageable_extension(cls, *, login_account, project_id, milestone_id, extension_id):
        milestone = cls._get_manageable_milestone(
            login_account=login_account,
            project_id=project_id,
            milestone_id=milestone_id,
        )
        try:
            return MilestoneExtension.objects.select_related(
                "milestone",
                "extended_by__role",
            ).get(pk=extension_id, milestone=milestone)
        except MilestoneExtension.DoesNotExist as exc:
            raise ProjectServiceError(
                message="Milestone extension not found.",
                error_code="not_found",
                status_code=status.HTTP_404_NOT_FOUND,
            ) from exc

    @classmethod
    def _get_viewable_extension(cls, *, login_account, project_id, milestone_id, extension_id):
        milestone = cls._get_viewable_milestone(
            login_account=login_account,
            project_id=project_id,
            milestone_id=milestone_id,
        )
        try:
            return MilestoneExtension.objects.select_related(
                "milestone",
                "extended_by__role",
            ).get(pk=extension_id, milestone=milestone)
        except MilestoneExtension.DoesNotExist as exc:
            raise ProjectServiceError(
                message="Milestone extension not found.",
                error_code="not_found",
                status_code=status.HTTP_404_NOT_FOUND,
            ) from exc

    @classmethod
    def _sync_milestone_revised_end_date(cls, milestone):
        latest_extension = (
            milestone.extensions.order_by("-new_end_date", "-extension_id").first()
        )
        milestone.revised_end_date = latest_extension.new_end_date if latest_extension else None
        milestone.save(update_fields=["revised_end_date", "updated_at"])
        cls._refresh_milestone_status(milestone)

    @classmethod
    @transaction.atomic
    def update_milestone_extension(
        cls,
        *,
        login_account,
        project_id,
        milestone_id,
        extension_id,
        **validated_data,
    ):
        cls._ensure_role(
            login_account,
            cls.MANAGER_ROLES,
            "Only Company Administrator or Project Manager can update milestone extensions.",
        )
        extension = cls._get_manageable_extension(
            login_account=login_account,
            project_id=project_id,
            milestone_id=milestone_id,
            extension_id=extension_id,
        )

        new_end_date = validated_data.get("new_end_date", extension.new_end_date)
        previous_end_date = extension.previous_end_date

        if previous_end_date and new_end_date <= previous_end_date:
            raise ProjectServiceError(
                message="The new completion date must be later than the previous milestone deadline.",
                error_code="validation_error",
                status_code=status.HTTP_400_BAD_REQUEST,
                errors={
                    "new_end_date": [
                        "The new completion date must be later than the previous milestone deadline.",
                    ],
                },
            )

        if "new_end_date" in validated_data:
            extension.new_end_date = new_end_date
        if "reason" in validated_data:
            extension.reason = validated_data.get("reason", "")

        extension.save()
        cls._sync_milestone_revised_end_date(extension.milestone)
        return extension

    @classmethod
    @transaction.atomic
    def delete_milestone_extension(cls, *, login_account, project_id, milestone_id, extension_id):
        cls._ensure_role(
            login_account,
            cls.MANAGER_ROLES,
            "Only Company Administrator or Project Manager can delete milestone extensions.",
        )
        extension = cls._get_manageable_extension(
            login_account=login_account,
            project_id=project_id,
            milestone_id=milestone_id,
            extension_id=extension_id,
        )
        milestone = extension.milestone
        extension.delete()
        cls._sync_milestone_revised_end_date(milestone)
        return {"extension_id": extension_id}

    @classmethod
    def list_milestone_tasks(cls, *, login_account, project_id, milestone_id):
        cls._ensure_role(
            login_account,
            cls.TASK_VIEWER_ROLES,
            "Only Company Administrator, Project Manager, Site Engineer, or Supervisor can view milestone tasks.",
        )
        milestone = cls._get_viewable_milestone(
            login_account=login_account,
            project_id=project_id,
            milestone_id=milestone_id,
        )
        return list(getattr(milestone, "prefetched_tasks", []))

    @classmethod
    def _validate_task_timeline_against_milestone(cls, milestone, *, planned_start_date, planned_end_date):
        """Ensure task dates sit within the milestone window when both sides are set."""
        errors = {}
        milestone_start = milestone.planned_start_date
        milestone_end = milestone.effective_end_date

        if planned_start_date and planned_end_date and planned_end_date < planned_start_date:
            errors["planned_end_date"] = ["Task end date cannot be earlier than the start date."]

        if planned_start_date and milestone_start and planned_start_date < milestone_start:
            errors["planned_start_date"] = [
                "Task start date cannot be earlier than the milestone start date."
            ]

        if planned_end_date and milestone_end and planned_end_date > milestone_end:
            errors["planned_end_date"] = [
                "Task end date cannot be later than the applicable milestone deadline."
            ]

        if errors:
            raise ProjectServiceError(
                message="Task timeline is outside the milestone schedule.",
                error_code="validation_error",
                status_code=status.HTTP_400_BAD_REQUEST,
                errors=errors,
            )

    @classmethod
    @transaction.atomic
    def create_milestone_task(cls, *, login_account, project_id, milestone_id, **validated_data):
        profile, role_name = cls._ensure_role(
            login_account,
            cls.TASK_DESIGNER_ROLES,
            "Only Company Administrator, Project Manager, or Site Engineer can create milestone tasks.",
        )
        milestone = cls._get_designer_milestone(
            login_account=login_account,
            project_id=project_id,
            milestone_id=milestone_id,
        )

        cls._validate_task_timeline_against_milestone(
            milestone,
            planned_start_date=validated_data.get("planned_start_date"),
            planned_end_date=validated_data.get("planned_end_date"),
        )

        sort_order = validated_data.get("sort_order")
        if sort_order is None:
            last_task = milestone.tasks.order_by("-sort_order", "-task_id").first()
            validated_data["sort_order"] = 1 if last_task is None else last_task.sort_order + 1

        auto_approve = role_name in cls.MANAGER_ROLES
        task = MilestoneTask.objects.create(
            milestone=milestone,
            created_by=profile,
            is_approved=auto_approve,
            approved_at=timezone.now() if auto_approve else None,
            approved_by=profile if auto_approve else None,
            approval_note=validated_data.pop("approval_note", "") if auto_approve else "",
            **validated_data,
        )

        return cls._task_queryset().get(pk=task.pk)

    @classmethod
    @transaction.atomic
    def update_milestone_task(cls, *, login_account, project_id, milestone_id, task_id, **validated_data):
        profile, role_name = cls._ensure_role(
            login_account,
            cls.TASK_DESIGNER_ROLES,
            "Only Company Administrator, Project Manager, or Site Engineer can update milestone tasks.",
        )
        task = cls._get_task_for_design(
            login_account=login_account,
            project_id=project_id,
            milestone_id=milestone_id,
            task_id=task_id,
        )

        next_start = validated_data.get("planned_start_date", task.planned_start_date)
        next_end = validated_data.get("planned_end_date", task.planned_end_date)
        if "planned_start_date" in validated_data or "planned_end_date" in validated_data:
            cls._validate_task_timeline_against_milestone(
                task.milestone,
                planned_start_date=next_start,
                planned_end_date=next_end,
            )

        for field_name, value in validated_data.items():
            setattr(task, field_name, value)

        if role_name in cls.MANAGER_ROLES:
            task.is_approved = True
            task.approved_at = timezone.now()
            task.approved_by = profile
        else:
            task.is_approved = False
            task.approved_at = None
            task.approved_by = None
            task.approval_note = ""

        task.save()
        return cls._task_queryset().get(pk=task.pk)

    @classmethod
    @transaction.atomic
    def delete_milestone_task(cls, *, login_account, project_id, milestone_id, task_id):
        task = cls._get_task_for_design(
            login_account=login_account,
            project_id=project_id,
            milestone_id=milestone_id,
            task_id=task_id,
        )
        deleted_task_id = task.task_id
        task.delete()
        return {"deleted": True, "task_id": deleted_task_id}

    @classmethod
    @transaction.atomic
    def approve_milestone_task(cls, *, login_account, project_id, milestone_id, task_id, approval_note=""):
        profile, _ = cls._ensure_role(
            login_account,
            cls.MANAGER_ROLES,
            "Only Company Administrator or Project Manager can approve milestone tasks.",
        )
        task = cls._get_task_for_design(
            login_account=login_account,
            project_id=project_id,
            milestone_id=milestone_id,
            task_id=task_id,
        )
        task.is_approved = True
        task.approved_at = timezone.now()
        task.approved_by = profile
        task.approval_note = approval_note or ""
        task.save(update_fields=["is_approved", "approved_at", "approved_by", "approval_note", "updated_at"])
        return cls._task_queryset().get(pk=task.pk)

    @classmethod
    @transaction.atomic
    def reject_milestone_task(cls, *, login_account, project_id, milestone_id, task_id, approval_note=""):
        profile, _ = cls._ensure_role(
            login_account,
            cls.MANAGER_ROLES,
            "Only Company Administrator or Project Manager can reject milestone tasks.",
        )
        task = cls._get_task_for_design(
            login_account=login_account,
            project_id=project_id,
            milestone_id=milestone_id,
            task_id=task_id,
        )
        task.is_approved = False
        task.approved_at = None
        task.approved_by = None
        task.approval_note = approval_note or "Rejected"
        task.save(update_fields=["is_approved", "approved_at", "approved_by", "approval_note", "updated_at"])
        return cls._task_queryset().get(pk=task.pk)

    @classmethod
    def list_pending_approval_tasks(cls, *, login_account, project_id):
        cls._ensure_role(
            login_account,
            cls.MANAGER_ROLES,
            "Only Company Administrator or Project Manager can review pending task approvals.",
        )
        cls._get_accessible_project(login_account=login_account, project_id=project_id)
        return list(
            cls._task_queryset()
            .filter(
                milestone__project_id=project_id,
                is_approved=False,
            )
            .order_by("milestone__sort_order", "sort_order", "task_id"),
        )

    @classmethod
    def list_project_daily_updates(cls, *, login_account, project_id):
        cls._ensure_role(
            login_account,
            cls.CONCERN_VIEWER_ROLES,
            "Only Company Administrator, Project Manager, Site Engineer, or Supervisor can view daily updates.",
        )
        cls._get_accessible_project(login_account=login_account, project_id=project_id)
        return list(
            DailyTaskUpdate.objects.select_related(
                "assignment__worker__role",
                "assignment__task__milestone__project",
                "supervisor_reviewed_by__role",
                "engineer_reviewed_by__role",
                "concern_resolved_by__role",
            )
            .filter(assignment__task__milestone__project_id=project_id)
            .order_by("-work_date", "-created_at", "-update_id"),
        )

    @classmethod
    def list_task_assignments(cls, *, login_account, project_id, milestone_id, task_id):
        cls._ensure_role(
            login_account,
            cls.TASK_VIEWER_ROLES,
            "Only Company Administrator, Project Manager, Site Engineer, or Supervisor can view task assignments.",
        )
        task = cls._get_task_for_view(
            login_account=login_account,
            project_id=project_id,
            milestone_id=milestone_id,
            task_id=task_id,
        )
        return list(getattr(task, "active_worker_assignments", []))

    @classmethod
    @transaction.atomic
    def create_task_assignment(cls, *, login_account, project_id, milestone_id, task_id, worker, duty_instructions="", is_active=True):
        profile, _ = cls._ensure_role(
            login_account,
            (SUPERVISOR_ROLE_NAME,),
            "Only Supervisor can assign work to workers.",
        )
        task = cls._get_task_for_supervisor(
            login_account=login_account,
            project_id=project_id,
            milestone_id=milestone_id,
            task_id=task_id,
        )

        if not task.is_approved:
            raise ProjectServiceError(
                message="The task must be approved by the Project Manager or Company Administrator before assignment.",
                error_code="task_not_approved",
                status_code=status.HTTP_400_BAD_REQUEST,
                errors={"task": ["The task must be approved by the Project Manager or Company Administrator before assignment."]},
            )

        worker = ProjectService._validate_assignment_user(
            worker,
            WORKER_ROLE_NAME,
            "Selected Worker account is inactive.",
        )

        existing_assignment = TaskWorkerAssignment.objects.filter(task=task, worker=worker).first()
        if existing_assignment and existing_assignment.is_active:
            raise ProjectServiceError(
                message="This worker is already assigned to this task.",
                error_code="worker_already_assigned",
                status_code=status.HTTP_400_BAD_REQUEST,
                errors={"worker_id": ["This worker is already assigned to this task."]},
            )

        assignment, _ = TaskWorkerAssignment.objects.get_or_create(
            task=task,
            worker=worker,
            defaults={
                "assigned_by": profile,
                "duty_instructions": duty_instructions,
                "is_active": is_active,
            },
        )

        assignment.assigned_by = profile
        assignment.duty_instructions = duty_instructions
        assignment.is_active = is_active
        assignment.save()

        return cls._get_assignment(assignment_id=assignment.assignment_id)

    @classmethod
    @transaction.atomic
    def update_task_assignment(cls, *, login_account, project_id, milestone_id, task_id, assignment_id, **validated_data):
        cls._ensure_role(
            login_account,
            (SUPERVISOR_ROLE_NAME,),
            "Only Supervisor can update worker assignments.",
        )
        task = cls._get_task_for_supervisor(
            login_account=login_account,
            project_id=project_id,
            milestone_id=milestone_id,
            task_id=task_id,
        )
        assignment = cls._get_assignment(assignment_id=assignment_id)

        if assignment.task_id != task.task_id:
            raise ProjectServiceError(
                message="Task assignment does not belong to the selected task.",
                error_code="assignment_not_found",
                status_code=status.HTTP_404_NOT_FOUND,
                errors={"assignment": ["Task assignment does not belong to the selected task."]},
            )

        if "worker" in validated_data:
            assignment.worker = ProjectService._validate_assignment_user(
                validated_data["worker"],
                WORKER_ROLE_NAME,
                "Selected Worker account is inactive.",
            )

        if "duty_instructions" in validated_data:
            assignment.duty_instructions = validated_data["duty_instructions"]

        if "is_active" in validated_data:
            assignment.is_active = validated_data["is_active"]

        assignment.assigned_by = cls._get_profile(login_account)
        assignment.save()
        return cls._get_assignment(assignment_id=assignment.assignment_id)

    @classmethod
    @transaction.atomic
    def deactivate_task_assignment(cls, *, login_account, project_id, milestone_id, task_id, assignment_id):
        cls._ensure_role(
            login_account,
            (SUPERVISOR_ROLE_NAME,),
            "Only Supervisor can deactivate worker assignments.",
        )
        task = cls._get_task_for_supervisor(
            login_account=login_account,
            project_id=project_id,
            milestone_id=milestone_id,
            task_id=task_id,
        )
        assignment = cls._get_assignment(assignment_id=assignment_id)

        if assignment.task_id != task.task_id:
            raise ProjectServiceError(
                message="Task assignment does not belong to the selected task.",
                error_code="assignment_not_found",
                status_code=status.HTTP_404_NOT_FOUND,
                errors={"assignment": ["Task assignment does not belong to the selected task."]},
            )

        assignment.is_active = False
        assignment.save(update_fields=["is_active", "updated_at"])
        return {"deleted": True, "assignment_id": assignment.assignment_id}

    @classmethod
    def list_task_updates(cls, *, login_account, assignment_id):
        assignment = cls._get_assignment(assignment_id=assignment_id)
        role_name = get_user_role_name(login_account)

        if role_name == WORKER_ROLE_NAME:
            cls._validate_worker_access_to_assignment(login_account=login_account, assignment=assignment)
        elif role_name == SUPERVISOR_ROLE_NAME:
            cls._validate_supervisor_access_to_assignment(login_account=login_account, assignment=assignment)
        elif role_name == SITE_ENGINEER_ROLE_NAME:
            cls._validate_engineer_access_to_assignment(login_account=login_account, assignment=assignment)
        elif role_name not in cls.MANAGER_ROLES:
            raise ProjectServiceError(
                message="You do not have permission to view daily task updates.",
                error_code="permission_denied",
                status_code=status.HTTP_403_FORBIDDEN,
                errors={"permission": ["You do not have permission to view daily task updates."]},
            )
        else:
            ProjectService._get_manageable_project(
                login_account=login_account,
                project_id=assignment.task.milestone.project_id,
            )

        return list(getattr(assignment, "ordered_updates", []))

    @classmethod
    @transaction.atomic
    def create_or_update_daily_task_update(cls, *, login_account, assignment_id, **validated_data):
        assignment = cls._get_assignment(assignment_id=assignment_id)
        cls._validate_worker_access_to_assignment(login_account=login_account, assignment=assignment)

        work_date = validated_data.get("work_date") or timezone.localdate()
        defaults = {
            "completion_percentage": validated_data["completion_percentage"],
            "status": validated_data["status"],
            "remark": validated_data.get("remark", ""),
            "concern_text": validated_data.get("concern_text", ""),
            "incomplete_reason": validated_data.get("incomplete_reason", ""),
            "incomplete_reason_detail": validated_data.get("incomplete_reason_detail", ""),
            "has_safety_issue": validated_data.get("has_safety_issue", False),
        }

        update, created = DailyTaskUpdate.objects.get_or_create(
            assignment=assignment,
            work_date=work_date,
            defaults=defaults,
        )

        if not created:
            update.completion_percentage = defaults["completion_percentage"]
            update.status = defaults["status"]
            update.remark = defaults["remark"]
            update.concern_text = defaults["concern_text"]
            update.incomplete_reason = defaults["incomplete_reason"]
            update.incomplete_reason_detail = defaults["incomplete_reason_detail"]
            update.has_safety_issue = defaults["has_safety_issue"]

        update.supervisor_review_status = DailyTaskUpdate.REVIEW_PENDING
        update.supervisor_review_note = ""
        update.supervisor_reviewed_at = None
        update.supervisor_reviewed_by = None
        update.engineer_review_status = DailyTaskUpdate.REVIEW_PENDING
        update.engineer_review_note = ""
        update.engineer_reviewed_at = None
        update.engineer_reviewed_by = None
        update.save()

        return DailyTaskUpdate.objects.select_related(
            "assignment__worker__role",
            "assignment__task__milestone__project",
            "supervisor_reviewed_by__role",
            "engineer_reviewed_by__role",
        ).get(pk=update.pk)

    @classmethod
    @transaction.atomic
    def review_daily_task_update_by_supervisor(cls, *, login_account, update_id, review_status, review_note=""):
        profile = cls._get_profile(login_account)
        update = cls._get_task_update(update_id=update_id)
        cls._validate_supervisor_access_to_assignment(login_account=login_account, assignment=update.assignment)

        update.supervisor_review_status = review_status
        update.supervisor_review_note = review_note or ""
        update.supervisor_reviewed_at = timezone.now()
        update.supervisor_reviewed_by = profile
        update.engineer_review_status = DailyTaskUpdate.REVIEW_PENDING
        update.engineer_review_note = ""
        update.engineer_reviewed_at = None
        update.engineer_reviewed_by = None
        update.save()

        return DailyTaskUpdate.objects.select_related(
            "assignment__worker__role",
            "assignment__task__milestone__project",
            "supervisor_reviewed_by__role",
            "engineer_reviewed_by__role",
        ).get(pk=update.pk)

    @classmethod
    @transaction.atomic
    def review_daily_task_update_by_engineer(cls, *, login_account, update_id, review_status, review_note=""):
        profile = cls._get_profile(login_account)
        update = cls._get_task_update(update_id=update_id)
        cls._validate_engineer_access_to_assignment(login_account=login_account, assignment=update.assignment)

        if update.supervisor_review_status != DailyTaskUpdate.REVIEW_APPROVED:
            raise ProjectServiceError(
                message="Only supervisor-verified updates can be reviewed by the Site Engineer.",
                error_code="validation_error",
                status_code=status.HTTP_400_BAD_REQUEST,
                errors={
                    "review_status": [
                        "Only supervisor-verified updates can be reviewed by the Site Engineer."
                    ]
                },
            )

        update.engineer_review_status = review_status
        update.engineer_review_note = review_note or ""
        update.engineer_reviewed_at = timezone.now()
        update.engineer_reviewed_by = profile
        update.save()

        task = cls._task_queryset().get(pk=update.assignment.task_id)
        cls._refresh_task_status(task)

        return DailyTaskUpdate.objects.select_related(
            "assignment__worker__role",
            "assignment__task__milestone__project",
            "supervisor_reviewed_by__role",
            "engineer_reviewed_by__role",
        ).get(pk=update.pk)

    @classmethod
    def list_worker_assignments(cls, *, login_account):
        profile, _ = cls._ensure_role(
            login_account,
            (WORKER_ROLE_NAME,),
            "Only Worker can access assigned work items.",
        )

        return list(
            TaskWorkerAssignment.objects.filter(worker=profile, is_active=True).select_related(
                "worker__role",
                "assigned_by__role",
                "task__milestone__project",
            ).prefetch_related(
                Prefetch(
                    "daily_updates",
                    queryset=DailyTaskUpdate.objects.select_related(
                        "supervisor_reviewed_by__role",
                        "engineer_reviewed_by__role",
                    ).order_by("-work_date", "-created_at", "-update_id"),
                    to_attr="ordered_updates",
                ),
            ).order_by("task__milestone__sort_order", "task__sort_order", "assignment_id"),
        )

    @classmethod
    def list_project_concerns(cls, *, login_account, project_id):
        cls._ensure_role(
            login_account,
            cls.CONCERN_VIEWER_ROLES,
            "Only Company Administrator, Project Manager, Site Engineer, or Supervisor can review project concerns.",
        )
        cls._get_accessible_project(login_account=login_account, project_id=project_id)

        return list(
            DailyTaskUpdate.objects.select_related(
                "assignment__worker__role",
                "assignment__task__milestone__project",
                "supervisor_reviewed_by__role",
                "engineer_reviewed_by__role",
                "concern_resolved_by__role",
            ).filter(
                assignment__task__milestone__project_id=project_id,
            ).filter(
                Q(has_safety_issue=True) | ~Q(concern_text=""),
            ).order_by("-has_safety_issue", "-work_date", "-created_at", "-update_id"),
        )

    @classmethod
    @transaction.atomic
    def resolve_project_concern(cls, *, login_account, project_id, update_id, resolved=True):
        profile, _ = cls._ensure_role(
            login_account,
            (SUPERVISOR_ROLE_NAME, *cls.MANAGER_ROLES),
            "Only Supervisor, Project Manager, or Company Administrator can resolve concerns.",
        )
        cls._get_accessible_project(login_account=login_account, project_id=project_id)

        try:
            update = DailyTaskUpdate.objects.select_related(
                "assignment__worker__role",
                "assignment__task__milestone__project",
                "supervisor_reviewed_by__role",
                "engineer_reviewed_by__role",
                "concern_resolved_by__role",
            ).get(
                update_id=update_id,
                assignment__task__milestone__project_id=project_id,
            )
        except DailyTaskUpdate.DoesNotExist as exc:
            raise ProjectServiceError(
                message="Concern update was not found for this project.",
                error_code="not_found",
                status_code=status.HTTP_404_NOT_FOUND,
                errors={"update": ["Concern update was not found for this project."]},
            ) from exc

        has_concern = bool(update.concern_text.strip()) or update.has_safety_issue
        if not has_concern:
            raise ProjectServiceError(
                message="This daily update does not contain a concern.",
                error_code="validation_error",
                status_code=status.HTTP_400_BAD_REQUEST,
                errors={"update": ["This daily update does not contain a concern."]},
            )

        update.concern_resolved = bool(resolved)
        update.concern_resolved_at = timezone.now() if resolved else None
        update.concern_resolved_by = profile if resolved else None
        update.save(
            update_fields=[
                "concern_resolved",
                "concern_resolved_at",
                "concern_resolved_by",
                "updated_at",
            ],
        )
        return update
