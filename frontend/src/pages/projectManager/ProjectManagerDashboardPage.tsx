import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { StatusBadge } from "../../components/ui/StatusBadge";
import { useWorkspacePageTitle } from "../../contexts/AdminChromeContext";
import { useAuth } from "../../hooks/useAuth";
import { listPmWorkplaceNeeds, listProjects } from "../../services/projectApi";
import type { ProjectSummary, WorkplaceNeed } from "../../types/project";
import { formatCurrencyINR } from "../../utils/formatCurrency";
import { formatDisplayTitle } from "../../utils/formatDisplayTitle";
import { navigateToProjectWorkspace } from "../../utils/projectCreateRoutes";
import { formatHeaderDate, getGreeting } from "../worker/workerFormatters";

import "./ProjectManagerPages.css";

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

const formatStatus = (project: ProjectSummary): string =>
  project.is_archived
    ? "Archived"
    : project.status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

export const ProjectManagerDashboardPage = () => {
  useWorkspacePageTitle("Dashboard");
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [needs, setNeeds] = useState<WorkplaceNeed[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const [projectData, needsData] = await Promise.all([
          listProjects(),
          listPmWorkplaceNeeds({ includeResolved: false }),
        ]);
        setProjects(projectData.results);
        setNeeds(needsData.results);
      } catch (error) {
        setErrorMessage(getErrorMessage(error, "Unable to load the dashboard right now."));
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  const milestoneTotal = useMemo(
    () => projects.reduce((sum, project) => sum + (project.milestone_count || 0), 0),
    [projects],
  );
  const documentTotal = useMemo(
    () => projects.reduce((sum, project) => sum + (project.document_count || 0), 0),
    [projects],
  );

  const needsByProject = useMemo(() => {
    const counts = new Map<number, number>();
    needs.forEach((need) => {
      counts.set(need.project_id, (counts.get(need.project_id) ?? 0) + 1);
    });
    return counts;
  }, [needs]);

  return (
    <div className="pm-dashboard">
      <header className="pm-dashboard__header">
        <div>
          <p className="pm-dashboard__kicker">
            {getGreeting()}, {user?.name ?? "Project Manager"}
          </p>
          <h1 className="pm-dashboard__title">Dashboard</h1>
          <p className="pm-dashboard__subtitle">
            Trace each assigned project through milestones, documents, site needs and finance.
          </p>
        </div>
        <p className="pm-dashboard__date">{formatHeaderDate(new Date())}</p>
      </header>

      {errorMessage ? (
        <div className="alert alert-danger mb-0 project-manager-projects-page__alert">{errorMessage}</div>
      ) : null}

      <section className="pm-dashboard__stats" aria-label="Workspace summary">
        <article className="pm-dashboard__stat">
          <span>Projects</span>
          <strong>{isLoading ? "—" : projects.length}</strong>
        </article>
        <article className="pm-dashboard__stat">
          <span>Milestones</span>
          <strong>{isLoading ? "—" : milestoneTotal}</strong>
        </article>
        <article className="pm-dashboard__stat">
          <span>Documents</span>
          <strong>{isLoading ? "—" : documentTotal}</strong>
        </article>
        <article className="pm-dashboard__stat">
          <span>Workplace Needs</span>
          <strong>{isLoading ? "—" : needs.length}</strong>
        </article>
      </section>

      <section className="pm-dashboard__map" aria-label="Project component tracer">
        <div className="pm-dashboard__map-head">
          <h2>Project tracer</h2>
          <p>How work moves from a project into its components.</p>
        </div>
        <ol className="pm-dashboard__trace">
          <li>
            <Link className="pm-dashboard__trace-node" to="/project-manager/projects">
              <span className="pm-dashboard__trace-label">Project</span>
              <strong>{isLoading ? "—" : projects.length}</strong>
            </Link>
          </li>
          <li className="pm-dashboard__trace-line" aria-hidden="true" />
          <li>
            <Link className="pm-dashboard__trace-node" to="/project-manager/milestones">
              <span className="pm-dashboard__trace-label">Milestones</span>
              <strong>{isLoading ? "—" : milestoneTotal}</strong>
            </Link>
          </li>
          <li className="pm-dashboard__trace-line" aria-hidden="true" />
          <li>
            <Link className="pm-dashboard__trace-node" to="/project-manager/documents">
              <span className="pm-dashboard__trace-label">Documents</span>
              <strong>{isLoading ? "—" : documentTotal}</strong>
            </Link>
          </li>
          <li className="pm-dashboard__trace-line" aria-hidden="true" />
          <li>
            <Link className="pm-dashboard__trace-node" to="/project-manager/workplace-needs">
              <span className="pm-dashboard__trace-label">Needs</span>
              <strong>{isLoading ? "—" : needs.length}</strong>
            </Link>
          </li>
          <li className="pm-dashboard__trace-line" aria-hidden="true" />
          <li>
            <Link className="pm-dashboard__trace-node" to="/project-manager/profit-loss">
              <span className="pm-dashboard__trace-label">Profit &amp; Loss</span>
              <strong>Live</strong>
            </Link>
          </li>
        </ol>
      </section>

      <section className="pm-dashboard__list" aria-label="Assigned projects">
        <div className="pm-dashboard__list-head">
          <h2>Assigned projects</h2>
          <span>{isLoading ? "…" : `${projects.length} active`}</span>
        </div>
        {isLoading ? (
          <p className="pm-dashboard__empty">Loading projects...</p>
        ) : projects.length === 0 ? (
          <p className="pm-dashboard__empty">No projects assigned yet.</p>
        ) : (
          <ul className="pm-dashboard__projects">
            {projects.map((project) => {
              const progress = Number(project.progress_percentage || 0);
              const needCount = needsByProject.get(project.project_id) ?? 0;
              return (
                <li key={project.project_id}>
                  <article className="pm-dashboard__project">
                    <button
                      type="button"
                      className="pm-dashboard__project-main"
                      onClick={() =>
                        navigateToProjectWorkspace(
                          navigate,
                          "project-manager",
                          project.project_id,
                          "overview",
                        )
                      }
                    >
                      <div className="pm-dashboard__project-top">
                        <h3>{formatDisplayTitle(project.project_name) || project.project_name}</h3>
                        <StatusBadge
                          className="status-badge--compact"
                          label={formatStatus(project)}
                          tone={project.is_archived ? "archived" : project.status}
                        />
                      </div>
                      <p className="pm-dashboard__project-meta">
                        {formatDate(project.start_date)} → {formatDate(project.end_date)}
                        <span aria-hidden="true">·</span>
                        {formatCurrencyINR(project.initial_budget)}
                      </p>
                      <div className="pm-dashboard__progress">
                        <div className="pm-dashboard__progress-head">
                          <span>Progress</span>
                          <strong>{progress.toFixed(0)}%</strong>
                        </div>
                        <div
                          className="pm-dashboard__progress-bar"
                          role="progressbar"
                          aria-valuenow={progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <span style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
                        </div>
                      </div>
                    </button>
                    <div className="pm-dashboard__mini-trace" aria-label="Project components">
                      <button
                        type="button"
                        onClick={() =>
                          navigateToProjectWorkspace(
                            navigate,
                            "project-manager",
                            project.project_id,
                            "overview",
                          )
                        }
                      >
                        Overview
                      </button>
                      <span aria-hidden="true" />
                      <button
                        type="button"
                        onClick={() =>
                          navigateToProjectWorkspace(
                            navigate,
                            "project-manager",
                            project.project_id,
                            "milestones",
                          )
                        }
                      >
                        Milestones
                        <em>{project.milestone_count}</em>
                      </button>
                      <span aria-hidden="true" />
                      <button
                        type="button"
                        onClick={() =>
                          navigateToProjectWorkspace(
                            navigate,
                            "project-manager",
                            project.project_id,
                            "documents",
                          )
                        }
                      >
                        Documents
                        <em>{project.document_count}</em>
                      </button>
                      <span aria-hidden="true" />
                      <Link to="/project-manager/workplace-needs">
                        Needs
                        <em>{needCount}</em>
                      </Link>
                      <span aria-hidden="true" />
                      <Link to="/project-manager/profit-loss">P&amp;L</Link>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};

export default ProjectManagerDashboardPage;
