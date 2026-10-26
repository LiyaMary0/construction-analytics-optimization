import axios from "axios";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ProjectTimeline } from "../../components/projects/ProjectTimeline";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useWorkspacePageTitle } from "../../contexts/AdminChromeContext";
import { getProject, listProjectMilestones } from "../../services/projectApi";
import type { Milestone, ProjectDetail } from "../../types/project";
import { formatDisplayTitle } from "../../utils/formatDisplayTitle";

import "./SiteEngineerPages.css";

const getErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (axios.isAxiosError(error)) {
    return (error.response?.data as { message?: string } | undefined)?.message ?? fallbackMessage;
  }
  return fallbackMessage;
};

const formatDate = (value: string | null): string => {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
};

export const SiteEngineerProjectDetailPage = () => {
  const { projectId: projectIdParam } = useParams();
  const projectId = projectIdParam ? Number(projectIdParam) : null;
  const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [isDetailLoading, setIsDetailLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pageTitle = selectedProject
    ? formatDisplayTitle(selectedProject.project_name) || selectedProject.project_name
    : "Project details";
  useWorkspacePageTitle(pageTitle);

  useEffect(() => {
    if (!projectId || !Number.isFinite(projectId)) {
      setIsDetailLoading(false);
      setErrorMessage("Project was not found.");
      return;
    }

    const loadProject = async () => {
      setIsDetailLoading(true);
      setErrorMessage(null);
      try {
        const [project, milestoneData] = await Promise.all([
          getProject(projectId),
          listProjectMilestones(projectId),
        ]);
        setSelectedProject(project);
        setMilestones(milestoneData.results);
      } catch (error) {
        setErrorMessage(getErrorMessage(error, "Unable to load project milestones right now."));
      } finally {
        setIsDetailLoading(false);
      }
    };

    void loadProject();
  }, [projectId]);

  return (
    <main className="site-engineer-page">
      <div className="site-engineer-page-content">
        <header>
          <Link className="site-engineer-card__link" to="/site-engineer/projects">
            ← Back to projects
          </Link>
          <h1 className="site-engineer-page__title">{pageTitle}</h1>
          <p className="site-engineer-page__subtitle">
            Review authorized project schedules, deadlines, and planned vs verified progress.
          </p>
        </header>

        {errorMessage ? (
          <div className="alert alert-danger site-engineer-page__alert" role="alert">
            {errorMessage}
          </div>
        ) : null}

        <section className="site-engineer-card">
          <div className="site-engineer-card__header">
            <h2 className="site-engineer-card__title">
              {selectedProject
                ? formatDisplayTitle(selectedProject.project_name) ||
                  selectedProject.project_name
                : "Milestone Details"}
            </h2>
          </div>

          {isDetailLoading ? (
            <div className="site-engineer-empty">Loading milestones...</div>
          ) : !selectedProject ? (
            <div className="site-engineer-empty">Select a project to view milestones.</div>
          ) : (
            <>
              <p className="site-engineer-page__support" style={{ marginBottom: 14 }}>
                {selectedProject.description || "No project description."} PM:{" "}
                {selectedProject.project_manager?.name ?? "Unassigned"} · Supervisors:{" "}
                {(selectedProject.supervisors?.length
                  ? selectedProject.supervisors
                  : selectedProject.supervisor
                    ? [selectedProject.supervisor]
                    : []
                )
                  .map((member) => member.name)
                  .join(", ") || "Unassigned"}
              </p>

              {milestones.length === 0 ? (
                <div className="site-engineer-empty">No milestones for this project.</div>
              ) : (
                <div className="site-engineer-milestone-table-wrap">
                  <table className="site-engineer-milestone-table">
                    <thead>
                      <tr>
                        <th>Milestone</th>
                        <th>Start</th>
                        <th>Original Deadline</th>
                        <th>Current Deadline</th>
                        <th>Planned %</th>
                        <th>Actual Verified %</th>
                        <th>Schedule</th>
                      </tr>
                    </thead>
                    <tbody>
                      {milestones.map((milestone) => (
                        <tr key={milestone.milestone_id}>
                          <td>
                            {formatDisplayTitle(milestone.title) || milestone.title}
                            {milestone.description ? (
                              <span className="meta">{milestone.description}</span>
                            ) : null}
                          </td>
                          <td>{formatDate(milestone.planned_start_date)}</td>
                          <td>{formatDate(milestone.planned_end_date)}</td>
                          <td>
                            {formatDate(
                              milestone.effective_end_date || milestone.planned_end_date,
                            )}
                          </td>
                          <td>
                            {Number(milestone.expected_progress_percentage || 0).toFixed(0)}%
                          </td>
                          <td>{Number(milestone.progress_percentage || 0).toFixed(0)}%</td>
                          <td>
                            <StatusBadge
                              className="status-badge--compact"
                              label={milestone.schedule_status_label || "On Schedule"}
                              tone={
                                milestone.schedule_status === "behind_schedule"
                                  ? "delayed"
                                  : milestone.schedule_status === "ahead_of_schedule"
                                    ? "active"
                                    : milestone.schedule_status === "completed"
                                      ? "completed"
                                      : "planning"
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ marginTop: 18 }}>
                <ProjectTimeline milestones={milestones} hideTitle />
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
};

export default SiteEngineerProjectDetailPage;
