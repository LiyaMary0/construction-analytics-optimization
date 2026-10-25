import axios from "axios";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { TaskAssignmentManager } from "../../components/projects/TaskAssignmentManager";
import { useWorkspacePageTitle } from "../../contexts/AdminChromeContext";
import {
  createTaskAssignment,
  deleteTaskAssignment,
  getProjectWorkerOptions,
  listMilestoneTasks,
  listProjectMilestones,
  listProjects,
  updateTaskAssignment,
} from "../../services/projectApi";
import type {
  Milestone,
  MilestoneTask,
  ProjectLookupUser,
  ProjectSummary,
  TaskWorkerAssignmentPayload,
} from "../../types/project";
import { formatDisplayTitle } from "../../utils/formatDisplayTitle";

import "../../styles/roleDashboard.css";
import "./SupervisorPages.css";

const getErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (axios.isAxiosError(error)) {
    return (error.response?.data as { message?: string } | undefined)?.message ?? fallbackMessage;
  }
  return fallbackMessage;
};

export const SupervisorAssignmentsPage = () => {
  const { projectId: projectIdParam } = useParams();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const selectedProjectId = projectIdParam ? Number(projectIdParam) : null;
  const isProjectPage = Number.isFinite(selectedProjectId) && selectedProjectId !== null;
  const isAssignPage = pathname.endsWith("/assign");
  const editingAssignmentId = searchParams.get("edit")
    ? Number(searchParams.get("edit"))
    : null;

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<number | null>(null);
  const [allTasks, setAllTasks] = useState<MilestoneTask[]>([]);
  const [milestoneTasks, setMilestoneTasks] = useState<MilestoneTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [workers, setWorkers] = useState<ProjectLookupUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const selectedProject = projects.find((project) => project.project_id === selectedProjectId);
  const pageTitle = isAssignPage
    ? "Assign Worker"
    : isProjectPage
      ? formatDisplayTitle(selectedProject?.project_name) || "Assignments"
      : "Assignments";
  useWorkspacePageTitle(pageTitle);

  const loadProjects = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const projectData = await listProjects();
      setProjects(projectData.results);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to load assigned projects."));
    } finally {
      setIsLoading(false);
    }
  };

  const applyTaskSelection = (
    tasks: MilestoneTask[],
    milestoneId: number | null,
    preferredTaskId?: number | null,
  ) => {
    let activeMilestoneId = milestoneId;
    let visibleTasks = activeMilestoneId
      ? tasks.filter((task) => task.milestone?.milestone_id === activeMilestoneId)
      : [];

    if (visibleTasks.length === 0 && tasks.length > 0) {
      activeMilestoneId = tasks[0]?.milestone?.milestone_id ?? activeMilestoneId;
      visibleTasks = tasks.filter(
        (task) => task.milestone?.milestone_id === activeMilestoneId,
      );
      setSelectedMilestoneId(activeMilestoneId);
    }

    setMilestoneTasks(visibleTasks);

    const nextTaskId =
      preferredTaskId && visibleTasks.some((task) => task.task_id === preferredTaskId)
        ? preferredTaskId
        : visibleTasks[0]?.task_id ?? null;
    setSelectedTaskId(nextTaskId);
  };

  const loadAssignments = async (projectId: number, milestoneId?: number | null) => {
    setIsDetailLoading(true);
    setErrorMessage(null);
    try {
      const [milestoneData, workerOptions] = await Promise.all([
        listProjectMilestones(projectId),
        getProjectWorkerOptions(projectId),
      ]);
      setMilestones(milestoneData.results);
      setWorkers(workerOptions);

      const projectTasks = (
        await Promise.all(
          milestoneData.results.map((milestone) =>
            listMilestoneTasks(projectId, milestone.milestone_id),
          ),
        )
      ).flatMap((item) => item.results);
      setAllTasks(projectTasks);

      const requestedMilestoneId =
        milestoneId && milestoneData.results.some((item) => item.milestone_id === milestoneId)
          ? milestoneId
          : null;
      const milestoneWithTasks =
        requestedMilestoneId &&
        projectTasks.some((task) => task.milestone?.milestone_id === requestedMilestoneId)
          ? requestedMilestoneId
          : projectTasks[0]?.milestone?.milestone_id ??
            milestoneData.results[0]?.milestone_id ??
            null;
      setSelectedMilestoneId(milestoneWithTasks);

      if (!milestoneWithTasks) {
        setMilestoneTasks([]);
        setSelectedTaskId(null);
        return;
      }

      const preferredTaskId = searchParams.get("task")
        ? Number(searchParams.get("task"))
        : null;
      applyTaskSelection(projectTasks, milestoneWithTasks, preferredTaskId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to load assignments."));
    } finally {
      setIsDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  useEffect(() => {
    if (!isProjectPage || !selectedProjectId) {
      return;
    }
    const milestoneFromQuery = searchParams.get("milestone");
    void loadAssignments(
      selectedProjectId,
      milestoneFromQuery ? Number(milestoneFromQuery) : undefined,
    );
  }, [isProjectPage, selectedProjectId, pathname]);

  const handleSelectMilestone = async (milestoneId: number) => {
    if (!selectedProjectId) {
      return;
    }
    const nextId = milestoneId > 0 ? milestoneId : null;
    setSelectedMilestoneId(nextId);
    if (!nextId) {
      setMilestoneTasks(allTasks);
      setSelectedTaskId(allTasks[0]?.task_id ?? null);
      return;
    }
    applyTaskSelection(allTasks, nextId, selectedTaskId);
  };

  const handleSelectTask = (taskId: number) => {
    const nextId = taskId > 0 ? taskId : null;
    setSelectedTaskId(nextId);
    if (!nextId) {
      return;
    }
    const selected =
      allTasks.find((task) => task.task_id === nextId) ??
      milestoneTasks.find((task) => task.task_id === nextId);
    const taskMilestoneId = selected?.milestone?.milestone_id ?? null;
    if (taskMilestoneId && taskMilestoneId !== selectedMilestoneId) {
      setSelectedMilestoneId(taskMilestoneId);
      setMilestoneTasks(
        allTasks.filter((task) => task.milestone?.milestone_id === taskMilestoneId),
      );
    }
  };

  const refresh = async () => {
    if (selectedProjectId) {
      await loadAssignments(selectedProjectId, selectedMilestoneId);
    }
  };

  const handleCreateAssignment = async (payload: TaskWorkerAssignmentPayload) => {
    if (!selectedProjectId || !selectedMilestoneId || !selectedTaskId) {
      return;
    }
    try {
      await createTaskAssignment(selectedProjectId, selectedMilestoneId, selectedTaskId, payload);
      setNoticeMessage("Worker assigned successfully.");
      await refresh();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to assign the worker right now."));
    }
  };

  const handleUpdateAssignment = async (
    assignmentId: number,
    payload: Partial<TaskWorkerAssignmentPayload>,
  ) => {
    if (!selectedProjectId || !selectedMilestoneId || !selectedTaskId) {
      return;
    }
    try {
      await updateTaskAssignment(
        selectedProjectId,
        selectedMilestoneId,
        selectedTaskId,
        assignmentId,
        payload,
      );
      setNoticeMessage("Worker assignment updated successfully.");
      await refresh();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to update the worker assignment right now."));
    }
  };

  const handleDeleteAssignment = async (assignmentId: number) => {
    if (!selectedProjectId || !selectedMilestoneId || !selectedTaskId) {
      return;
    }
    try {
      await deleteTaskAssignment(
        selectedProjectId,
        selectedMilestoneId,
        selectedTaskId,
        assignmentId,
      );
      setNoticeMessage("Worker assignment removed successfully.");
      await refresh();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to remove the worker assignment right now."));
    }
  };

  return (
    <main className="supervisor-page">
      <div className="supervisor-page-content supervisor-assign">
        {noticeMessage ? (
          <div className="alert alert-success supervisor-page__alert" role="alert">
            {noticeMessage}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="alert alert-danger supervisor-page__alert" role="alert">
            {errorMessage}
          </div>
        ) : null}

        {isProjectPage ? (
          <>
            <header className="supervisor-page__intro">
              <Link
                className="supervisor-assign__back"
                to={
                  isAssignPage && selectedProjectId
                    ? `/supervisor/assignments/${selectedProjectId}`
                    : "/supervisor/assignments"
                }
              >
                {isAssignPage ? "← Back to project assignments" : "← Back to assignments"}
              </Link>
              <p className="supervisor-page__support">
                {isAssignPage
                  ? "Choose a task, worker and duty instructions."
                  : "Review assigned workers, then open Assign Worker for the form."}
                {selectedProject
                  ? ` ${formatDisplayTitle(selectedProject.project_name) || selectedProject.project_name}.`
                  : ""}
              </p>
            </header>

            <section className="role-dash__map" aria-label="Assignment tracer">
              <div className="role-dash__map-head">
                <h2>Work tracer</h2>
                <p>Project into worker assignment.</p>
              </div>
              <ol className="role-dash__trace">
                <li>
                  <Link className="role-dash__trace-node" to="/supervisor/projects">
                    <span className="role-dash__trace-label">Project</span>
                    <strong>
                      {formatDisplayTitle(selectedProject?.project_name) ||
                        selectedProject?.project_name ||
                        "—"}
                    </strong>
                  </Link>
                </li>
                <li className="role-dash__trace-line" aria-hidden="true" />
                <li>
                  <Link
                    className="role-dash__trace-node"
                    to={
                      selectedProjectId
                        ? `/supervisor/assignments/${selectedProjectId}`
                        : "/supervisor/assignments"
                    }
                  >
                    <span className="role-dash__trace-label">Assignments</span>
                    <strong>Open</strong>
                  </Link>
                </li>
                <li className="role-dash__trace-line" aria-hidden="true" />
                <li>
                  {isAssignPage ? (
                    <span className="role-dash__trace-node">
                      <span className="role-dash__trace-label">Assign worker</span>
                      <strong>Live</strong>
                    </span>
                  ) : (
                    <Link
                      className="role-dash__trace-node"
                      to={`/supervisor/assignments/${selectedProjectId}/assign`}
                    >
                      <span className="role-dash__trace-label">Assign worker</span>
                      <strong>Open</strong>
                    </Link>
                  )}
                </li>
              </ol>
            </section>

            {isDetailLoading && milestones.length === 0 ? (
              <div className="supervisor-card supervisor-page__loading">Loading assignments...</div>
            ) : (
              <div className="supervisor-assign__panel">
                <div className="supervisor-page__assignment-controls">
                  <label
                    className="supervisor-page__control-label"
                    htmlFor="supervisor-assignment-milestone"
                  >
                    Milestone
                  </label>
                  <select
                    id="supervisor-assignment-milestone"
                    className="admin-control"
                    value={selectedMilestoneId ?? ""}
                    disabled={isDetailLoading}
                    onChange={(event) =>
                      void handleSelectMilestone(
                        event.target.value ? Number(event.target.value) : 0,
                      )
                    }
                  >
                    <option value="">Select a milestone</option>
                    {milestones.map((milestone) => (
                      <option key={milestone.milestone_id} value={milestone.milestone_id}>
                        {milestone.title}
                      </option>
                    ))}
                  </select>
                </div>

                {!selectedMilestoneId ? (
                  <div className="supervisor-empty">
                    <strong className="supervisor-empty__title">Select a milestone</strong>
                    <p className="supervisor-empty__description">
                      Choose a milestone to manage worker assignments.
                    </p>
                  </div>
                ) : (
                  <TaskAssignmentManager
                    tasks={milestoneTasks}
                    workers={workers}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={handleSelectTask}
                    onCreateAssignment={handleCreateAssignment}
                    onUpdateAssignment={handleUpdateAssignment}
                    onDeleteAssignment={handleDeleteAssignment}
                    view={isAssignPage ? "form" : "list"}
                    initialAssignmentId={isAssignPage ? editingAssignmentId : null}
                    onAssignClick={() => {
                      const params = new URLSearchParams();
                      if (selectedMilestoneId) {
                        params.set("milestone", String(selectedMilestoneId));
                      }
                      if (selectedTaskId) {
                        params.set("task", String(selectedTaskId));
                      }
                      navigate(
                        `/supervisor/assignments/${selectedProjectId}/assign?${params.toString()}`,
                      );
                    }}
                    onEditClick={(assignment) => {
                      const params = new URLSearchParams();
                      if (selectedMilestoneId) {
                        params.set("milestone", String(selectedMilestoneId));
                      }
                      if (selectedTaskId) {
                        params.set("task", String(selectedTaskId));
                      }
                      params.set("edit", String(assignment.assignment_id));
                      navigate(
                        `/supervisor/assignments/${selectedProjectId}/assign?${params.toString()}`,
                      );
                    }}
                    onSaved={() => {
                      if (selectedProjectId) {
                        navigate(`/supervisor/assignments/${selectedProjectId}`);
                      }
                    }}
                  />
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <header className="supervisor-page__intro">
              <p className="supervisor-page__support">
                Choose a project to assign workers and set duty instructions.
              </p>
            </header>

            <section className="role-dash__map" aria-label="Assignment tracer">
              <div className="role-dash__map-head">
                <h2>Work tracer</h2>
                <p>Choose a project, then assign workers.</p>
              </div>
              <ol className="role-dash__trace">
                <li>
                  <Link className="role-dash__trace-node" to="/supervisor/projects">
                    <span className="role-dash__trace-label">Projects</span>
                    <strong>{isLoading ? "—" : projects.length}</strong>
                  </Link>
                </li>
                <li className="role-dash__trace-line" aria-hidden="true" />
                <li>
                  <span className="role-dash__trace-node">
                    <span className="role-dash__trace-label">Assignments</span>
                    <strong>Select</strong>
                  </span>
                </li>
                <li className="role-dash__trace-line" aria-hidden="true" />
                <li>
                  <span className="role-dash__trace-node">
                    <span className="role-dash__trace-label">Assign worker</span>
                    <strong>—</strong>
                  </span>
                </li>
              </ol>
            </section>

            {isLoading ? (
              <div className="supervisor-card supervisor-page__loading">Loading projects...</div>
            ) : projects.length === 0 ? (
              <div className="supervisor-empty">
                <strong className="supervisor-empty__title">No projects assigned</strong>
                <p className="supervisor-empty__description">
                  Projects assigned to you will appear here.
                </p>
              </div>
            ) : (
              <div className="supervisor-page__project-list">
                {projects.map((project) => (
                  <button
                    key={project.project_id}
                    type="button"
                    className="supervisor-page__project-card"
                    onClick={() => navigate(`/supervisor/assignments/${project.project_id}`)}
                  >
                    <div className="supervisor-page__project-card-top">
                      <strong>
                        {formatDisplayTitle(project.project_name) || project.project_name}
                      </strong>
                      <span className="supervisor-badge supervisor-badge--status">
                        {project.is_archived ? "Archived" : project.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="supervisor-page__project-meta">
                      <div className="supervisor-page__project-meta-row">
                        <span>Milestones</span>
                        <span>{project.milestone_count}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
};

export default SupervisorAssignmentsPage;
