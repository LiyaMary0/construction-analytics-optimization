import axios from "axios";
import { useEffect, useMemo, useState } from "react";

import { AddTaskModal } from "../../components/projects/AddTaskModal";
import { ConcernPanel } from "../../components/projects/ConcernPanel";
import { TaskManager } from "../../components/projects/TaskManager";
import { WorkerAllocationPanel } from "../../components/projects/WorkerAllocationPanel";
import { useWorkspacePageTitle } from "../../contexts/AdminChromeContext";
import {
  createMilestoneTask,
  deleteMilestoneTask,
  listMilestoneTasks,
  listProjectConcerns,
  listProjectMilestones,
  listProjects,
  updateMilestoneTask,
} from "../../services/projectApi";
import type {
  DailyTaskUpdate,
  Milestone,
  MilestoneTask,
  MilestoneTaskPayload,
  ProjectSummary,
} from "../../types/project";
import { formatDisplayTitle } from "../../utils/formatDisplayTitle";

import "./SiteEngineerPages.css";

const getErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (axios.isAxiosError(error)) {
    return (error.response?.data as { message?: string } | undefined)?.message ?? fallbackMessage;
  }
  return fallbackMessage;
};

export const SiteEngineerTasksPage = () => {
  useWorkspacePageTitle("Task Management");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<number | null>(null);
  const [tasks, setTasks] = useState<MilestoneTask[]>([]);
  const [concerns, setConcerns] = useState<DailyTaskUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);

  const selectedMilestone = useMemo(
    () => milestones.find((milestone) => milestone.milestone_id === selectedMilestoneId) ?? null,
    [milestones, selectedMilestoneId],
  );

  const loadTasks = async (projectId: number, milestoneId: number | null) => {
    if (!milestoneId) {
      setTasks([]);
      return;
    }
    const taskData = await listMilestoneTasks(projectId, milestoneId);
    setTasks(taskData.results);
  };

  const loadProjectContext = async (projectId: number, preferredMilestoneId?: number | null) => {
    const [milestoneData, concernData] = await Promise.all([
      listProjectMilestones(projectId),
      listProjectConcerns(projectId),
    ]);
    setMilestones(milestoneData.results);
    setConcerns(concernData.results);

    const nextMilestoneId =
      preferredMilestoneId &&
      milestoneData.results.some((item) => item.milestone_id === preferredMilestoneId)
        ? preferredMilestoneId
        : milestoneData.results[0]?.milestone_id ?? null;

    setSelectedMilestoneId(nextMilestoneId);
    await loadTasks(projectId, nextMilestoneId);
  };

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const projectData = await listProjects();
        setProjects(projectData.results);
        const nextId = projectData.results[0]?.project_id ?? null;
        setSelectedProjectId(nextId);
        if (nextId) {
          await loadProjectContext(nextId);
        }
      } catch (error) {
        setErrorMessage(getErrorMessage(error, "Unable to load task workspace right now."));
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  const refresh = async () => {
    if (!selectedProjectId) {
      return;
    }
    await loadProjectContext(selectedProjectId, selectedMilestoneId);
  };

  const handleCreateTask = async (payload: MilestoneTaskPayload) => {
    if (!selectedProjectId || !selectedMilestoneId) {
      return;
    }
    try {
      await createMilestoneTask(selectedProjectId, selectedMilestoneId, payload);
      setNoticeMessage("Task created and submitted for Project Manager approval.");
      setErrorMessage(null);
      await refresh();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to create the task right now."));
      throw error;
    }
  };

  const handleUpdateTask = async (
    taskId: number,
    payload: Partial<MilestoneTaskPayload>,
  ) => {
    if (!selectedProjectId || !selectedMilestoneId) {
      return;
    }
    try {
      await updateMilestoneTask(selectedProjectId, selectedMilestoneId, taskId, payload);
      setNoticeMessage("Task updated and returned for approval.");
      setErrorMessage(null);
      await refresh();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to update the task right now."));
      throw error;
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    if (!selectedProjectId || !selectedMilestoneId) {
      return;
    }
    try {
      await deleteMilestoneTask(selectedProjectId, selectedMilestoneId, taskId);
      setNoticeMessage("Task deleted successfully.");
      setErrorMessage(null);
      await refresh();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to delete the task right now."));
    }
  };

  return (
    <main className="site-engineer-page">
      <div className="site-engineer-page-content">
        <header>
          <h1 className="site-engineer-page__title">Task Management</h1>
          <p className="site-engineer-page__subtitle">
            Break milestones into tasks with expected work, completion requirements, timelines, and
            workforce needs. Tasks are submitted for Project Manager approval before Supervisor
            assignment.
          </p>
        </header>

        {noticeMessage ? (
          <div className="alert alert-success site-engineer-page__alert">{noticeMessage}</div>
        ) : null}
        {errorMessage ? (
          <div className="alert alert-danger site-engineer-page__alert" role="alert">
            {errorMessage}
          </div>
        ) : null}

        <div className="site-engineer-toolbar">
          <label>
            <span>Project</span>
            <select
              value={selectedProjectId ?? ""}
              disabled={isLoading}
              onChange={(event) => {
                const projectId = Number(event.target.value);
                setSelectedProjectId(projectId || null);
                setNoticeMessage(null);
                if (projectId) {
                  void loadProjectContext(projectId).catch((error) => {
                    setErrorMessage(
                      getErrorMessage(error, "Unable to load the selected project."),
                    );
                  });
                } else {
                  setMilestones([]);
                  setSelectedMilestoneId(null);
                  setTasks([]);
                  setConcerns([]);
                }
              }}
            >
              <option value="">Select a project</option>
              {projects.map((project) => (
                <option key={project.project_id} value={project.project_id}>
                  {formatDisplayTitle(project.project_name) || project.project_name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isLoading ? (
          <div className="site-engineer-empty">Loading tasks...</div>
        ) : !selectedProjectId ? (
          <div className="site-engineer-empty">Select a project to manage milestone tasks.</div>
        ) : (
          <>
            <section className="site-engineer-card">
              <TaskManager
                milestones={milestones}
                selectedMilestoneId={selectedMilestoneId}
                tasks={tasks}
                canManageTasks
                canApproveTasks={false}
                onSelectMilestone={(milestoneId) => {
                  const nextId = milestoneId > 0 ? milestoneId : null;
                  setSelectedMilestoneId(nextId);
                  void loadTasks(selectedProjectId, nextId).catch((error) => {
                    setErrorMessage(
                      getErrorMessage(error, "Unable to load milestone tasks right now."),
                    );
                  });
                }}
                onCreateTask={handleCreateTask}
                onUpdateTask={handleUpdateTask}
                onDeleteTask={handleDeleteTask}
                onRequestCreate={() => setIsAddTaskOpen(true)}
              />
            </section>

            <section className="site-engineer-card">
              <WorkerAllocationPanel tasks={tasks} />
            </section>

            <section className="site-engineer-card">
              <ConcernPanel
                title="Open Concerns"
                description="Issues raised on daily updates for this project."
                concerns={concerns}
              />
            </section>
          </>
        )}
      </div>

      <AddTaskModal
        isOpen={isAddTaskOpen}
        milestone={selectedMilestone}
        onClose={() => setIsAddTaskOpen(false)}
        onSubmit={handleCreateTask}
      />
    </main>
  );
};

export default SiteEngineerTasksPage;
