import { useEffect, useMemo, useState } from "react";
import { isAxiosError } from "axios";

import { useWorkspacePageTitle } from "../../contexts/AdminChromeContext";
import { useAuth } from "../../hooks/useAuth";
import {
  clockInWorker,
  clockOutWorker,
  fetchWorkerAttendanceDashboard,
} from "../../services/attendanceApi";
import { listMyTaskAssignments, listMyWorkplaceNeeds } from "../../services/projectApi";

import type { ApiErrorResponse } from "../../types/auth";
import type { WorkerAttendanceDashboardData } from "../../types/attendance";
import type { TaskAssignment, WorkplaceNeed } from "../../types/project";

import {
  formatDisplayHours,
  formatDuration,
  formatHeaderDate,
  formatLoggedHours,
  formatStartedAt,
  getElapsedSeconds,
  getFirstErrorMessage,
  getGreeting,
} from "./workerFormatters";

import "../../styles/roleDashboard.css";
import "./WorkerPages.css";

const OPEN_NEED_STATUSES = new Set([
  "submitted",
  "under_supervisor_review",
  "verified",
  "forwarded_to_pm",
  "in_progress",
]);

const getAssignmentStatus = (assignment: TaskAssignment): string =>
  assignment.latest_update?.status ?? assignment.task.status ?? "planned";

const formatStatusLabel = (status: string): string =>
  status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

export const WorkerDashboardPage = () => {
  useWorkspacePageTitle("Worker Dashboard");
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<WorkerAttendanceDashboardData | null>(null);
  const [taskAssignments, setTaskAssignments] = useState<TaskAssignment[]>([]);
  const [workplaceNeeds, setWorkplaceNeeds] = useState<WorkplaceNeed[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClockOutDialogOpen, setIsClockOutDialogOpen] = useState(false);
  const [isClockInDialogOpen, setIsClockInDialogOpen] = useState(false);
  const [selectedClockInAssignmentId, setSelectedClockInAssignmentId] = useState<number | "">("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const loadDashboard = async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIsLoading(true);
    }
    setErrorMessage(null);

    try {
      const [attendanceResponse, assignmentResponse, needsResponse] = await Promise.all([
        fetchWorkerAttendanceDashboard(),
        listMyTaskAssignments(),
        listMyWorkplaceNeeds(),
      ]);
      setDashboard(attendanceResponse);
      setTaskAssignments(assignmentResponse.results);
      setWorkplaceNeeds(needsResponse.results);
      setCurrentTime(new Date(attendanceResponse.server_time).getTime());
    } catch (error) {
      if (isAxiosError<ApiErrorResponse>(error)) {
        setErrorMessage(error.response?.data?.message ?? "Unable to load dashboard.");
        return;
      }
      setErrorMessage("Unable to load dashboard.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const currentShift = dashboard?.attendance.current_shift ?? null;
  const isClockedIn = dashboard?.attendance.is_clocked_in ?? false;

  useEffect(() => {
    if (!isClockedIn || !currentShift) {
      return undefined;
    }

    setCurrentTime(Date.now());
    const intervalId = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentShift, isClockedIn]);

  const elapsedSeconds = useMemo(() => {
    if (!currentShift || !isClockedIn) {
      return 0;
    }
    return getElapsedSeconds(currentShift.clock_in_at, currentTime);
  }, [currentShift, currentTime, isClockedIn]);

  const summary = dashboard?.attendance.summary;
  const workerName = dashboard?.worker?.name ?? user?.name ?? "Worker";
  const totalHoursDisplay = formatDisplayHours(summary?.recorded_total_hours ?? 0);
  const todayLabel = formatHeaderDate(new Date());
  const greeting = getGreeting();

  const activeAssignments = useMemo(
    () => taskAssignments.filter((assignment) => assignment.is_active),
    [taskAssignments],
  );

  const inProgressCount = useMemo(
    () =>
      taskAssignments.filter((assignment) => getAssignmentStatus(assignment) === "in_progress")
        .length,
    [taskAssignments],
  );

  const openNeeds = useMemo(
    () => workplaceNeeds.filter((need) => OPEN_NEED_STATUSES.has(need.status)),
    [workplaceNeeds],
  );

  const performClockIn = async (assignmentId?: number) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await clockInWorker(assignmentId);
      setSuccessMessage("Clocked in.");
      setIsClockInDialogOpen(false);
      setSelectedClockInAssignmentId("");
      await loadDashboard({ silent: true });
    } catch (error) {
      if (isAxiosError<ApiErrorResponse>(error)) {
        setErrorMessage(
          getFirstErrorMessage(error.response?.data?.errors?.attendance) ??
            error.response?.data?.message ??
            "Unable to clock in.",
        );
      } else {
        setErrorMessage("Unable to clock in.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClockIn = async () => {
    if (activeAssignments.length === 0) {
      await performClockIn();
      return;
    }

    if (activeAssignments.length === 1) {
      await performClockIn(activeAssignments[0].assignment_id);
      return;
    }

    setSelectedClockInAssignmentId(activeAssignments[0]?.assignment_id ?? "");
    setIsClockInDialogOpen(true);
  };

  const handleClockOut = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await clockOutWorker();
      setSuccessMessage(`Shift ended — ${formatLoggedHours(response.man_hour.total_hours)} logged`);
      setIsClockOutDialogOpen(false);
      await loadDashboard({ silent: true });
    } catch (error) {
      if (isAxiosError<ApiErrorResponse>(error)) {
        setErrorMessage(
          getFirstErrorMessage(error.response?.data?.errors?.attendance) ??
            error.response?.data?.message ??
            "Unable to clock out.",
        );
      } else {
        setErrorMessage("Unable to clock out.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="role-dash">
      {errorMessage ? (
        <div className="alert alert-danger mb-0" role="alert">
          {errorMessage}
        </div>
      ) : null}
      {successMessage ? (
        <div className="alert alert-success mb-0" role="alert">
          {successMessage}
        </div>
      ) : null}

      <header className="role-dash__header">
        <div>
          <p className="role-dash__kicker">
            {greeting}, {workerName}
          </p>
          <h1 className="role-dash__title">Dashboard</h1>
          <p className="role-dash__subtitle">Today&apos;s shift and assigned work.</p>
        </div>
        <p className="role-dash__date">{todayLabel}</p>
      </header>

      <section className="role-dash__stats" aria-label="Work summary">
        <article className="role-dash__stat">
          <span>Tasks</span>
          <strong>{isLoading ? "—" : taskAssignments.length}</strong>
        </article>
        <article className="role-dash__stat">
          <span>In progress</span>
          <strong>{isLoading ? "—" : inProgressCount}</strong>
        </article>
        <article className="role-dash__stat">
          <span>Total hours</span>
          <strong>{isLoading ? "—" : totalHoursDisplay}</strong>
        </article>
        <article className="role-dash__stat">
          <span>Workplace Needs</span>
          <strong>{isLoading ? "—" : openNeeds.length}</strong>
        </article>
      </section>

      <section className="role-dash__shift" aria-label="Today's shift">
        <div>
          <span className="role-dash__trace-label">{isClockedIn ? "On shift" : "Off shift"}</span>
          {isClockedIn && currentShift ? (
            <p className="role-dash__project-meta">
              Started {formatStartedAt(currentShift.clock_in_at)}
              {currentShift.task_title ? (
                <>
                  <span aria-hidden="true">·</span>
                  {currentShift.task_title}
                </>
              ) : null}
            </p>
          ) : (
            <p className="role-dash__project-meta">Clock in to begin today&apos;s hours.</p>
          )}
        </div>
        <div>
          <p className="role-dash__timer" aria-live="polite">
            {isClockedIn ? formatDuration(elapsedSeconds) : "00:00:00"}
          </p>
        </div>
        <div className="role-dash__shift-action">
          <button
            type="button"
            className={`worker-page__clock-btn worker-page__clock-btn--${isClockedIn ? "out" : "in"}`}
            disabled={isSubmitting || isLoading}
            onClick={() => {
              if (isClockedIn) {
                setIsClockOutDialogOpen(true);
                return;
              }
              void handleClockIn();
            }}
          >
            {isSubmitting ? "Saving..." : isClockedIn ? "Clock Out" : "Clock In"}
          </button>
        </div>
      </section>

      <section className="role-dash__list" aria-label="Assigned tasks">
        <div className="role-dash__list-head">
          <h2>Assigned tasks</h2>
          <span>{isLoading ? "…" : `${taskAssignments.length} assigned`}</span>
        </div>
        {isLoading ? (
          <p className="role-dash__empty">Loading tasks...</p>
        ) : taskAssignments.length === 0 ? (
          <p className="role-dash__empty">No tasks assigned yet.</p>
        ) : (
          <ul className="role-dash__feed">
            {taskAssignments.map((assignment) => (
              <li key={assignment.assignment_id} className="role-dash__feed-item">
                <div>
                  <strong>{assignment.task.title}</strong>
                  <span>
                    {assignment.task.project_name}
                    {assignment.task.milestone_title
                      ? ` · ${assignment.task.milestone_title}`
                      : ""}
                  </span>
                </div>
                <span>{formatStatusLabel(getAssignmentStatus(assignment))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isClockInDialogOpen ? (
        <div className="worker-page__dialog-backdrop" role="presentation">
          <div
            className="worker-page__dialog"
            aria-labelledby="worker-clock-in-title"
            aria-modal="true"
            role="dialog"
          >
            <h2 id="worker-clock-in-title">Select task for this shift</h2>
            <p>Choose which assigned task these man-hours should link to.</p>
            <label className="worker-page__dialog-field">
              <span>Task assignment</span>
              <select
                className="form-select"
                value={selectedClockInAssignmentId}
                onChange={(event) =>
                  setSelectedClockInAssignmentId(
                    event.target.value ? Number(event.target.value) : "",
                  )
                }
              >
                {activeAssignments.map((assignment) => (
                  <option key={assignment.assignment_id} value={assignment.assignment_id}>
                    {assignment.task.title} · {assignment.task.project_name}
                  </option>
                ))}
              </select>
            </label>
            <div className="worker-page__dialog-actions">
              <button
                type="button"
                className="worker-page__dialog-btn worker-page__dialog-btn--secondary"
                disabled={isSubmitting}
                onClick={() => setIsClockInDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="worker-page__dialog-btn worker-page__dialog-btn--primary"
                disabled={isSubmitting || selectedClockInAssignmentId === ""}
                onClick={() =>
                  void performClockIn(
                    typeof selectedClockInAssignmentId === "number"
                      ? selectedClockInAssignmentId
                      : undefined,
                  )
                }
              >
                {isSubmitting ? "Saving..." : "Clock In"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isClockOutDialogOpen ? (
        <div className="worker-page__dialog-backdrop" role="presentation">
          <div
            className="worker-page__dialog"
            aria-labelledby="worker-clock-out-title"
            aria-modal="true"
            role="dialog"
          >
            <h2 id="worker-clock-out-title">End shift?</h2>
            <p>Clock out and end the current shift?</p>
            <div className="worker-page__dialog-actions">
              <button
                type="button"
                className="worker-page__dialog-btn worker-page__dialog-btn--secondary"
                disabled={isSubmitting}
                onClick={() => setIsClockOutDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="worker-page__dialog-btn worker-page__dialog-btn--primary"
                disabled={isSubmitting}
                onClick={() => void handleClockOut()}
              >
                {isSubmitting ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default WorkerDashboardPage;
