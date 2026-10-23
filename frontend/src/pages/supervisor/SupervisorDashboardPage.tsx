import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

import { useWorkspacePageTitle } from "../../contexts/AdminChromeContext";
import { useAuth } from "../../hooks/useAuth";
import {
  listProjectDailyUpdates,
  listProjects,
  listSupervisorWorkplaceNeeds,
} from "../../services/projectApi";
import type { DailyTaskUpdate, ProjectSummary, WorkplaceNeed } from "../../types/project";
import {
  formatHeaderDate,
  getGreeting,
} from "../worker/workerFormatters";

import "./SupervisorPages.css";

const NeedsIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none">
    <path
      d="M8 7h8M8 12h5M7 3.5h10A2.5 2.5 0 0 1 19.5 6v12A2.5 2.5 0 0 1 17 20.5H7A2.5 2.5 0 0 1 4.5 18V6A2.5 2.5 0 0 1 7 3.5Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const getErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (axios.isAxiosError(error)) {
    return (error.response?.data as { message?: string } | undefined)?.message ?? fallbackMessage;
  }
  return fallbackMessage;
};

export const SupervisorDashboardPage = () => {
  useWorkspacePageTitle("Supervisor Dashboard");
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [pendingNeeds, setPendingNeeds] = useState<WorkplaceNeed[]>([]);
  const [pendingDailyUpdates, setPendingDailyUpdates] = useState<DailyTaskUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const [projectData, needData] = await Promise.all([
          listProjects(),
          listSupervisorWorkplaceNeeds(),
        ]);
        setProjects(projectData.results);
        setPendingNeeds(needData.results);

        const updateLists = await Promise.all(
          projectData.results.map((project) =>
            listProjectDailyUpdates(project.project_id).catch(() => ({
              count: 0,
              results: [] as DailyTaskUpdate[],
            })),
          ),
        );
        const pending = updateLists
          .flatMap((list) => list.results)
          .filter((update) => update.supervisor_review_status === "pending");
        setPendingDailyUpdates(pending);
      } catch (error) {
        setErrorMessage(
          getErrorMessage(error, "Unable to load the Supervisor dashboard right now."),
        );
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  const workerName = user?.name ?? "Supervisor";
  const greeting = getGreeting();
  const todayLabel = formatHeaderDate(new Date());
  const previewProjects = projects.slice(0, 3);

  return (
    <main className="supervisor-page">
      <div className="supervisor-page-content">
        {errorMessage ? (
          <div className="alert alert-danger supervisor-page__alert" role="alert">
            {errorMessage}
          </div>
        ) : null}

        <header className="supervisor-page__intro">
          <div className="supervisor-page__intro-row">
            <p className="supervisor-page__greeting">
              {greeting}, {workerName}
            </p>
            <p className="supervisor-page__date">{todayLabel}</p>
          </div>
          <p className="supervisor-page__support">
            Here&apos;s what needs your attention today.
          </p>
        </header>

        <section className="supervisor-page__stats" aria-label="Supervisor summary">
          <article className="supervisor-card supervisor-page__stat">
            <span className="supervisor-page__label">Pending Daily Updates</span>
            <strong className="supervisor-page__stat-value">
              {isLoading ? "—" : pendingDailyUpdates.length}
            </strong>
          </article>
          <article className="supervisor-card supervisor-page__stat">
            <span className="supervisor-page__label">Workplace Needs</span>
            <strong className="supervisor-page__stat-value">
              {isLoading ? "—" : pendingNeeds.length}
            </strong>
          </article>
          <article className="supervisor-card supervisor-page__stat">
            <span className="supervisor-page__label">Assigned Projects</span>
            <strong className="supervisor-page__stat-value">
              {isLoading ? "—" : projects.length}
            </strong>
          </article>
        </section>

        <section className="supervisor-page__section">
          <div className="supervisor-page__section-header">
            <h3 className="supervisor-page__section-title">Daily Work to Review</h3>
            <Link className="supervisor-page__section-link" to="/supervisor/verifications?tab=tasks">
              Review completions →
            </Link>
          </div>
          {isLoading ? (
            <div className="supervisor-card supervisor-page__loading">Loading updates...</div>
          ) : pendingDailyUpdates.length === 0 ? (
            <div className="supervisor-empty supervisor-empty--compact">
              <strong className="supervisor-empty__title">No daily updates waiting</strong>
              <p className="supervisor-empty__description">
                Worker completion submissions appear in Verifications.
              </p>
            </div>
          ) : (
            <div className="supervisor-card supervisor-page__preview-list">
              {pendingDailyUpdates.slice(0, 4).map((update) => (
                <div key={update.update_id} className="supervisor-page__preview-row">
                  <div>
                    <strong>{update.task_title ?? "Task update"}</strong>
                    <span>
                      {update.worker?.name ?? "Worker"} · {update.project_name}
                      {" · "}
                      {Number(update.completion_percentage).toFixed(0)}%
                    </span>
                  </div>
                  <Link
                    className="supervisor-page__section-link"
                    to="/supervisor/verifications?tab=tasks"
                  >
                    Review
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="supervisor-page__section">
          <div className="supervisor-page__section-header">
            <h3 className="supervisor-page__section-title">Workplace Needs</h3>
            <Link className="supervisor-page__section-link" to="/supervisor/verifications?tab=needs">
              Verifications →
            </Link>
          </div>
          {isLoading ? (
            <div className="supervisor-card supervisor-page__loading">Loading requests...</div>
          ) : pendingNeeds.length === 0 ? (
            <div className="supervisor-empty supervisor-empty--compact">
              <span className="supervisor-empty__icon" aria-hidden="true">
                <NeedsIcon />
              </span>
              <strong className="supervisor-empty__title">No requests to verify</strong>
              <p className="supervisor-empty__description">
                New worker requests will appear here.
              </p>
            </div>
          ) : (
            <div className="supervisor-card supervisor-page__preview-list">
              {pendingNeeds.slice(0, 3).map((need) => (
                <div key={need.request_id} className="supervisor-page__preview-row">
                  <div>
                    <strong>{need.category_label}</strong>
                    <span>
                      {need.submitted_by?.name ?? "Worker"} · {need.project_name}
                    </span>
                  </div>
                  <span className="supervisor-badge supervisor-badge--priority">
                    {need.priority_label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="supervisor-page__section">
          <div className="supervisor-page__section-header">
            <h3 className="supervisor-page__section-title">Assigned Projects</h3>
            <Link className="supervisor-page__section-link" to="/supervisor/projects">
              Projects →
            </Link>
          </div>
          {isLoading ? (
            <div className="supervisor-card supervisor-page__loading">Loading projects...</div>
          ) : previewProjects.length === 0 ? (
            <div className="supervisor-empty supervisor-empty--compact">
              <strong className="supervisor-empty__title">No projects assigned</strong>
              <p className="supervisor-empty__description">
                Projects assigned to you will appear here.
              </p>
            </div>
          ) : (
            <div className="supervisor-page__project-list">
              {previewProjects.map((project) => (
                <article key={project.project_id} className="supervisor-page__project-card">
                  <div className="supervisor-page__project-card-top">
                    <strong>{project.project_name}</strong>
                    <span className="supervisor-badge supervisor-badge--status">
                      {project.is_archived
                        ? "Archived"
                        : project.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="supervisor-page__project-meta">
                    <div className="supervisor-page__project-meta-row">
                      <span>Project Manager</span>
                      <span>{project.project_manager?.name ?? "Unassigned"}</span>
                    </div>
                    <div className="supervisor-page__project-meta-row">
                      <span>Milestones</span>
                      <span>{project.milestone_count}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

export default SupervisorDashboardPage;
