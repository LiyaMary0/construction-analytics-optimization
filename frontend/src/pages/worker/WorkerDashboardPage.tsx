import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { isAxiosError } from "axios";

import { WorkerTaskBoard } from "../../components/projects/WorkerTaskBoard";
import { WorkplaceNeedsPanel } from "../../components/projects/WorkplaceNeedsPanel";
import { useWorkspacePageTitle } from "../../contexts/AdminChromeContext";
import { useAuth } from "../../hooks/useAuth";
import {
  clockInWorker,
  clockOutWorker,
  fetchWorkerAttendanceDashboard,
} from "../../services/attendanceApi";
import {
  createTaskAssignmentUpdate,
  createWorkplaceNeed,
  getWorkplaceNeedContext,
  listMyTaskAssignments,
  listMyWorkplaceNeeds,
} from "../../services/projectApi";

import type { ApiErrorResponse } from "../../types/auth";
import type { AttendanceShiftRecord, WorkerAttendanceDashboardData } from "../../types/attendance";
import type {
  DailyTaskUpdatePayload,
  TaskAssignment,
  WorkplaceNeed,
  WorkplaceNeedContextProject,
} from "../../types/project";

import {
  formatCompactDate,
  formatDisplayHours,
  formatDuration,
  formatHeaderDate,
  formatLoggedHours,
  formatRecordHours,
  formatStartedAt,
  formatTimeOnly,
  getElapsedSeconds,
  getFirstErrorMessage,
  getGreeting,
} from "./workerFormatters";

import "../../styles/roleDashboard.css";
import "./WorkerPages.css";

type TaskFilter = "all" | "pending" | "in_progress" | "completed";

const OPEN_NEED_STATUSES = new Set([
  "submitted",
  "under_supervisor_review",
  "verified",
  "forwarded_to_pm",
  "in_progress",
]);

const getAssignmentStatus = (assignment: TaskAssignment): string =>
  assignment.latest_update?.status ?? assignment.task.status ?? "planned";

const matchesFilter = (assignment: TaskAssignment, filter: TaskFilter): boolean => {
  if (filter === "all") {
    return true;
  }

  const status = getAssignmentStatus(assignment).toLowerCase();

  if (filter === "pending") {
    return status === "not_started" || status === "planned" || status === "pending";
  }
  if (filter === "in_progress") {
    return status === "in_progress";
  }
  return status === "completed";
};

const getNeedSubmitError = (error: unknown): string => {
  let message = "Unable to submit the workplace need.";
  if (isAxiosError<ApiErrorResponse>(error)) {
    const apiErrors = error.response?.data?.errors;
    const firstFieldError =
      apiErrors &&
      Object.values(apiErrors)
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .find(Boolean);
    message =
      (typeof firstFieldError === "string" ? firstFieldError : undefined) ??
      error.response?.data?.message ??
      message;
  }
  return message;
};

export const WorkerDashboardPage = () => {
  useWorkspacePageTitle("Worker Dashboard");
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<WorkerAttendanceDashboardData | null>(null);
  const [taskAssignments, setTaskAssignments] = useState<TaskAssignment[]>([]);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [workplaceNeeds, setWorkplaceNeeds] = useState<WorkplaceNeed[]>([]);
  const [workplaceNeedProjects, setWorkplaceNeedProjects] = useState<
    WorkplaceNeedContextProject[]
  >([]);
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
      const [attendanceResponse, assignmentResponse, needsResponse, contextResponse] =
        await Promise.all([
          fetchWorkerAttendanceDashboard(),
          listMyTaskAssignments(),
          listMyWorkplaceNeeds(),
          getWorkplaceNeedContext(),
        ]);
      setDashboard(attendanceResponse);
      setTaskAssignments(assignmentResponse.results);
      setWorkplaceNeeds(needsResponse.results);
      setWorkplaceNeedProjects(contextResponse.results);
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
  const completedShifts = summary?.completed_shift_count ?? 0;
  const totalHoursDisplay = formatDisplayHours(summary?.recorded_total_hours ?? 0);
  const todayLabel = formatHeaderDate(new Date());
  const greeting = getGreeting();
  const attendanceHistory = dashboard?.attendance.history ?? [];

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

  const filteredAssignments = useMemo(
    () => taskAssignments.filter((assignment) => matchesFilter(assignment, taskFilter)),
    [taskAssignments, taskFilter],
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

  const handleTaskUpdateSubmit = async (
    assignmentId: number,
    payload: DailyTaskUpdatePayload,
  ) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await createTaskAssignmentUpdate(assignmentId, payload);
      setSuccessMessage("Daily work update submitted.");
      await loadDashboard({ silent: true });
    } catch (error) {
      if (isAxiosError<ApiErrorResponse>(error)) {
        setErrorMessage(error.response?.data?.message ?? "Unable to submit the daily update.");
      } else {
        setErrorMessage("Unable to submit the daily update.");
      }
      throw error;
    }
  };

  const refreshSubmitContext = async () => {
    const contextResponse = await getWorkplaceNeedContext();
    setWorkplaceNeedProjects(contextResponse.results);
  };

  const handleWorkplaceNeedSubmit = async (payload: FormData) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await createWorkplaceNeed(payload);
      setSuccessMessage("Workplace need submitted.");
      await loadDashboard({ silent: true });
    } catch (error) {
      const message = getNeedSubmitError(error);
      setErrorMessage(message);
      throw new Error(message);
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
          <p className="role-dash__subtitle">
            Trace today&apos;s work through tasks, attendance and workplace needs.
          </p>
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

      <section className="role-dash__map" aria-label="Worker tracer">
        <div className="role-dash__map-head">
          <h2>Work tracer</h2>
          <p>How your day connects across the site.</p>
        </div>
        <ol className="role-dash__trace">
          <li>
            <Link className="role-dash__trace-node" to="/worker/tasks">
              <span className="role-dash__trace-label">Tasks</span>
              <strong>{isLoading ? "—" : taskAssignments.length}</strong>
            </Link>
          </li>
          <li className="role-dash__trace-line" aria-hidden="true" />
          <li>
            <Link className="role-dash__trace-node" to="/worker/attendance">
              <span className="role-dash__trace-label">Attendance</span>
              <strong>{isLoading ? "—" : completedShifts}</strong>
            </Link>
          </li>
          <li className="role-dash__trace-line" aria-hidden="true" />
          <li>
            <Link className="role-dash__trace-node" to="/worker/workplace-needs">
              <span className="role-dash__trace-label">Needs</span>
              <strong>{isLoading ? "—" : openNeeds.length}</strong>
            </Link>
          </li>
        </ol>
      </section>

      <section className="role-dash__list" aria-label="Assigned tasks">
        <div className="role-dash__list-head">
          <h2>Assigned tasks</h2>
          <Link to="/worker/tasks">{isLoading ? "…" : `${taskAssignments.length} assigned`}</Link>
        </div>
        {isLoading ? (
          <p className="role-dash__empty">Loading tasks...</p>
        ) : taskAssignments.length === 0 ? (
          <p className="role-dash__empty">No tasks assigned yet.</p>
        ) : (
          <>
            <div className="worker-page__filters" role="tablist" aria-label="Task filters">
              {(
                [
                  ["all", "All"],
                  ["pending", "Pending"],
                  ["in_progress", "In Progress"],
                  ["completed", "Completed"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={taskFilter === value}
                  className={`worker-page__filter${
                    taskFilter === value ? " worker-page__filter--active" : ""
                  }`}
                  onClick={() => setTaskFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <WorkerTaskBoard
              assignments={filteredAssignments}
              onSubmitUpdate={handleTaskUpdateSubmit}
              showHeader={false}
              title="Tasks"
            />
          </>
        )}
      </section>

      <section className="role-dash__map" aria-label="Attendance history">
        <div className="role-dash__map-head">
          <h2>Attendance history</h2>
          <Link to="/worker/attendance">{isLoading ? "…" : `${completedShifts} shifts`}</Link>
        </div>
        {isLoading ? (
          <p className="role-dash__empty">Loading attendance...</p>
        ) : attendanceHistory.length === 0 ? (
          <p className="role-dash__empty">No attendance records yet.</p>
        ) : (
          <div className="worker-page__table-wrap">
            <table className="worker-page__table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Clock In</th>
                  <th>Clock Out</th>
                  <th>Task</th>
                  <th>Hours</th>
                </tr>
              </thead>
              <tbody>
                {attendanceHistory.map((record: AttendanceShiftRecord) => (
                  <tr key={record.attendance_id}>
                    <td className="worker-page__table-date">
                      {formatCompactDate(record.attendance_date)}
                    </td>
                    <td>{formatTimeOnly(record.clock_in_at)}</td>
                    <td>{formatTimeOnly(record.clock_out_at)}</td>
                    <td>{record.task_title || "—"}</td>
                    <td className="worker-page__table-hours">{formatRecordHours(record)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="role-dash__list" aria-label="Workplace needs">
        <WorkplaceNeedsPanel
          mode="worker"
          title="Workplace needs"
          description="Submit a request and track it through supervisor verification."
          needs={workplaceNeeds}
          contextProjects={workplaceNeedProjects}
          isLoading={isLoading}
          onSubmitNeed={handleWorkplaceNeedSubmit}
          onPrepareSubmit={refreshSubmitContext}
          submitLabel="+ Submit Need"
        />
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
