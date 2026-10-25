import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { AddTaskModal } from "../../components/projects/AddTaskModal";
import { AddTimelineExtensionModal } from "../../components/projects/AddTimelineExtensionModal";
import { ConcernPanel } from "../../components/projects/ConcernPanel";
import { DailyUpdateBoard } from "../../components/projects/DailyUpdateBoard";
import { MilestoneExtensionManager } from "../../components/projects/MilestoneExtensionManager";
import { useProjectDetail } from "../../components/projects/ProjectDetailLayout";
import { PendingTaskApprovals } from "../../components/projects/PendingTaskApprovals";
import { TaskManager } from "../../components/projects/TaskManager";
import { EmptyState } from "../../components/ui/EmptyState";
import { StatusBadge } from "../../components/ui/StatusBadge";
import type {
  DailyTaskUpdate,
  MilestoneExtension,
  MilestoneTask,
} from "../../types/project";
import {
  getEditExtensionPath,
  getEditTaskPath,
  getProjectWorkspacePath,
} from "../../utils/projectCreateRoutes";

const formatDateLabel = (value: string | null): string => {
  if (!value) {
    return "Not set";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
};

const getDaySpan = (start: string | null, end: string | null): string | null => {
  if (!start || !end) {
    return null;
  }
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    return null;
  }
  const days = Math.round((endMs - startMs) / 86400000) + 1;
  return `${days} day${days === 1 ? "" : "s"}`;
};

export const ProjectMilestoneDetailPage = () => {
  const { milestoneId: milestoneIdParam } = useParams();
  const milestoneId = Number(milestoneIdParam);
  const navigate = useNavigate();
  const {
    scope,
    projectId,
    project,
    milestones,
    isExecutionLoading,
    loadMilestoneExecution,
    handleUpdateTask,
    handleDeleteTask,
    handleApproveTask,
    handleCreateTask,
    handleCreateExtension,
    handleDeleteExtension,
    handleApprovePendingTask,
    handleRejectPendingTask,
    handleResolveConcern,
    refreshProject,
    setNoticeMessage,
  } = useProjectDetail();

  const milestone = milestones.find((item) => item.milestone_id === milestoneId) ?? null;
  const [tasks, setTasks] = useState<MilestoneTask[]>([]);
  const [extensions, setExtensions] = useState<MilestoneExtension[]>([]);
  const [pendingApprovalTasks, setPendingApprovalTasks] = useState<MilestoneTask[]>([]);
  const [dailyUpdates, setDailyUpdates] = useState<DailyTaskUpdate[]>([]);
  const [concerns, setConcerns] = useState<DailyTaskUpdate[]>([]);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [isAddExtensionOpen, setIsAddExtensionOpen] = useState(false);

  const reloadExecution = async () => {
    if (!Number.isFinite(milestoneId)) {
      return;
    }
    const data = await loadMilestoneExecution(milestoneId);
    setTasks(data.tasks);
    setExtensions(data.extensions);
    setPendingApprovalTasks(data.pendingApprovalTasks);
    setDailyUpdates(data.dailyUpdates);
    setConcerns(data.concerns);
  };

  useEffect(() => {
    void reloadExecution();
  }, [milestoneId]);

  if (!milestone) {
    return (
      <EmptyState
        title="Milestone not found."
        description="It may have been deleted or you do not have access."
        action={
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            onClick={() =>
              navigate(getProjectWorkspacePath(scope, projectId, "milestones"), {
                state: { projectId },
              })
            }
          >
            Back to Milestones
          </button>
        }
      />
    );
  }

  const endDate = milestone.effective_end_date || milestone.planned_end_date;
  const span = getDaySpan(milestone.planned_start_date, endDate);
  const progress = Number(milestone.progress_percentage || 0);
  const statusLabel = milestone.status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

  return (
    <div className="project-milestone-detail">
      <header className="project-detail-layout__header">
        <div className="project-detail-layout__title-block">
          <div className="project-detail-layout__title-row">
            <h1 className="project-detail-layout__title">{milestone.title}</h1>
            <StatusBadge label={statusLabel} tone={milestone.status} />
          </div>
          <p className="project-detail-layout__section-subtitle">
            Milestone for {project?.project_name ?? "project"}
          </p>
        </div>
      </header>

      <section className="project-detail-overview__stats" aria-label="Milestone schedule">
        <article className="project-detail-overview__stat">
          <span className="project-detail-overview__stat-label">Start Date</span>
          <p className="project-detail-overview__stat-value">
            {formatDateLabel(milestone.planned_start_date)}
          </p>
        </article>
        <article className="project-detail-overview__stat">
          <span className="project-detail-overview__stat-label">End Date</span>
          <p className="project-detail-overview__stat-value">{formatDateLabel(endDate)}</p>
        </article>
        <article className="project-detail-overview__stat">
          <span className="project-detail-overview__stat-label">Duration</span>
          <p className="project-detail-overview__stat-value">{span ?? "—"}</p>
        </article>
        <article className="project-detail-overview__stat">
          <span className="project-detail-overview__stat-label">Progress</span>
          <p className="project-detail-overview__stat-value">{progress.toFixed(0)}%</p>
          <div
            className="project-detail-overview__stat-bar"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
          </div>
        </article>
      </section>

      <div className="milestone-detail-sections">
        <TaskManager
          embedded
          milestones={milestones}
          selectedMilestoneId={milestoneId}
          tasks={tasks}
          canManageTasks={true}
          canApproveTasks={true}
          onSelectMilestone={() => undefined}
          onCreateTask={async (payload) => {
            await handleCreateTask(milestoneId, payload);
            await reloadExecution();
          }}
          onUpdateTask={async (taskId, payload) => {
            await handleUpdateTask(milestoneId, taskId, payload);
            await reloadExecution();
          }}
          onDeleteTask={async (taskId) => {
            await handleDeleteTask(milestoneId, taskId);
            await reloadExecution();
          }}
          onApproveTask={async (taskId) => {
            await handleApproveTask(milestoneId, taskId);
            await reloadExecution();
          }}
          onRequestCreate={() => setIsAddTaskOpen(true)}
          onRequestEdit={(taskId) =>
            navigate(getEditTaskPath(scope, projectId, milestoneId, taskId), {
              state: { projectId },
            })
          }
        />

        <PendingTaskApprovals
          tasks={pendingApprovalTasks.filter(
            (task) => task.milestone.milestone_id === milestoneId,
          )}
          isLoading={isExecutionLoading}
          onApprove={async (task) => {
            await handleApprovePendingTask(task);
            await reloadExecution();
          }}
          onReject={async (task, note) => {
            await handleRejectPendingTask(task, note);
            await reloadExecution();
          }}
          hideWhenEmpty
        />

        <MilestoneExtensionManager
          embedded
          milestones={milestones}
          selectedMilestoneId={milestoneId}
          extensions={extensions}
          canManage={true}
          onSelectMilestone={() => undefined}
          onCreate={async (payload) => {
            await handleCreateExtension(milestoneId, payload);
            await reloadExecution();
            await refreshProject();
          }}
          onDelete={async (extensionId) => {
            await handleDeleteExtension(milestoneId, extensionId);
            await reloadExecution();
          }}
          onRequestCreate={() => setIsAddExtensionOpen(true)}
          onRequestEdit={(extensionId) =>
            navigate(getEditExtensionPath(scope, projectId, milestoneId, extensionId), {
              state: { projectId },
            })
          }
        />

        {isExecutionLoading ? (
          <EmptyState title="Loading daily updates..." />
        ) : (
          <DailyUpdateBoard
            title="Daily Work Updates"
            description=""
            updates={dailyUpdates.filter((update) => update.milestone_id === milestoneId)}
            mode="readonly"
          />
        )}

        {isExecutionLoading ? (
          <EmptyState title="Loading concerns..." />
        ) : (
          <ConcernPanel
            title="Concerns"
            description=""
            concerns={concerns.filter((concern) => concern.milestone_id === milestoneId)}
            canResolve={true}
            onResolve={async (updateId) => {
              await handleResolveConcern(updateId);
              await reloadExecution();
            }}
          />
        )}
      </div>

      <AddTaskModal
        isOpen={isAddTaskOpen}
        milestone={milestone}
        onClose={() => setIsAddTaskOpen(false)}
        onSubmit={async (payload) => {
          await handleCreateTask(milestoneId, payload);
          setNoticeMessage("Task added successfully.");
          await reloadExecution();
        }}
      />

      <AddTimelineExtensionModal
        isOpen={isAddExtensionOpen}
        milestone={milestone}
        onClose={() => setIsAddExtensionOpen(false)}
        onSubmit={async (payload) => {
          await handleCreateExtension(milestoneId, payload);
          setNoticeMessage("Timeline extension added successfully.");
          await reloadExecution();
          await refreshProject();
        }}
      />
    </div>
  );
};

export default ProjectMilestoneDetailPage;
