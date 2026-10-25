import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { StatusBadge } from "../../components/ui/StatusBadge";
import { useAuth } from "../../hooks/useAuth";
import { fetchAdminDashboard } from "../../services/adminDashboardApi";
import type { AdminDashboardData } from "../../types/adminDashboard";
import { formatCurrencyINR } from "../../utils/formatCurrency";
import { formatDisplayTitle } from "../../utils/formatDisplayTitle";
import { navigateToProjectWorkspace } from "../../utils/projectCreateRoutes";
import { formatHeaderDate, getGreeting } from "../worker/workerFormatters";

import "../../styles/roleDashboard.css";

const ACTIVITY_LIMIT = 4;

const formatDateTime = (value: string | null): string => {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
};

const formatRelativeTime = (value: string): string => {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return formatDateTime(value);
  }

  const diffMs = Date.now() - timestamp;
  const minutes = Math.round(diffMs / 60000);

  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.round(hours / 24);
  if (days < 7) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
};

const statusTone = (
  healthKey: string,
): "planning" | "active" | "delayed" | "on_hold" | "completed" | "neutral" => {
  if (healthKey === "planning") {
    return "planning";
  }
  if (healthKey === "on_track" || healthKey === "active" || healthKey === "completed") {
    return healthKey === "completed" ? "completed" : "active";
  }
  if (healthKey === "delayed") {
    return "delayed";
  }
  if (healthKey === "on_hold") {
    return "on_hold";
  }
  return "neutral";
};

export const AdminDashboardPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetchAdminDashboard();
      setData(response);
    } catch {
      setErrorMessage("Unable to load dashboard information.");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const openProject = (projectId: number) => {
    navigateToProjectWorkspace(navigate, "admin", projectId, "overview");
  };

  const recentActivity = useMemo(() => data?.recent_activity.slice(0, ACTIVITY_LIMIT) ?? [], [data]);

  return (
    <div className="role-dash">
      <header className="role-dash__header">
        <div>
          <p className="role-dash__kicker">
            {getGreeting()}, {user?.name ?? "Administrator"}
          </p>
          <h1 className="role-dash__title">Dashboard</h1>
          <p className="role-dash__subtitle">
            Trace the company portfolio through projects, people and finance.
          </p>
        </div>
        <p className="role-dash__date">{formatHeaderDate(new Date())}</p>
      </header>

      {errorMessage ? (
        <div className="alert alert-danger mb-0" role="alert">
          {errorMessage}{" "}
          <button type="button" className="admin-btn admin-btn--secondary" onClick={() => void loadDashboard()}>
            Retry
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <p className="role-dash__empty">Loading dashboard...</p>
      ) : data ? (
        <>
          <section className="role-dash__stats" aria-label="Workspace summary">
            <article className="role-dash__stat">
              <span>Active projects</span>
              <strong>{data.kpis.active_projects}</strong>
            </article>
            <article className="role-dash__stat">
              <span>On schedule</span>
              <strong>{data.kpis.on_schedule_projects}</strong>
            </article>
            <article className="role-dash__stat">
              <span>Milestones due</span>
              <strong>{data.kpis.milestones_due_soon}</strong>
            </article>
            <article className="role-dash__stat">
              <span>Team</span>
              <strong>{data.team.active_users}</strong>
            </article>
          </section>

          <section className="role-dash__map" aria-label="Company tracer">
            <div className="role-dash__map-head">
              <h2>Workspace tracer</h2>
              <p>How the company workspace is connected.</p>
            </div>
            <ol className="role-dash__trace">
              <li>
                <Link className="role-dash__trace-node" to="/admin/projects">
                  <span className="role-dash__trace-label">Projects</span>
                  <strong>{data.kpis.total_projects}</strong>
                </Link>
              </li>
              <li className="role-dash__trace-line" aria-hidden="true" />
              <li>
                <Link className="role-dash__trace-node" to="/admin/people/project-managers">
                  <span className="role-dash__trace-label">People</span>
                  <strong>{data.team.total_users}</strong>
                </Link>
              </li>
              <li className="role-dash__trace-line" aria-hidden="true" />
              <li>
                <Link className="role-dash__trace-node" to="/admin/profit-loss">
                  <span className="role-dash__trace-label">Profit &amp; Loss</span>
                  <strong>{formatCurrencyINR(data.budget_overview.total_allocated)}</strong>
                </Link>
              </li>
            </ol>
          </section>

          <section className="role-dash__list">
            <div className="role-dash__list-head">
              <h2>Project performance</h2>
              <Link to="/admin/projects">{data.project_performance.length} active</Link>
            </div>
            {data.project_performance.length === 0 ? (
              <p className="role-dash__empty">No active projects yet.</p>
            ) : (
              <ul className="role-dash__projects">
                {data.project_performance.map((project) => {
                  const progress = Math.max(0, Math.min(100, Math.round(project.progress_percentage)));
                  return (
                    <li key={project.project_id}>
                      <article className="role-dash__project">
                        <button
                          type="button"
                          className="role-dash__project-main"
                          onClick={() => openProject(project.project_id)}
                        >
                          <div className="role-dash__project-top">
                            <h3>{formatDisplayTitle(project.project_name) || project.project_name}</h3>
                            <StatusBadge
                              className="status-badge--compact"
                              label={project.health}
                              tone={statusTone(project.health_key)}
                            />
                          </div>
                          <p className="role-dash__project-meta">
                            {project.project_manager?.name ?? "Unassigned"}
                            <span aria-hidden="true">·</span>
                            {formatCurrencyINR(project.initial_budget)}
                          </p>
                          <div className="role-dash__progress">
                            <div className="role-dash__progress-head">
                              <span>Progress</span>
                              <strong>{progress}%</strong>
                            </div>
                            <div className="role-dash__progress-bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                              <span style={{ width: `${progress}%` }} />
                            </div>
                          </div>
                        </button>
                        <div className="role-dash__mini-trace">
                          <button type="button" onClick={() => openProject(project.project_id)}>
                            Overview
                          </button>
                          <span aria-hidden="true" />
                          <button
                            type="button"
                            onClick={() =>
                              navigateToProjectWorkspace(navigate, "admin", project.project_id, "milestones")
                            }
                          >
                            Milestones
                            <em>{project.milestone_count}</em>
                          </button>
                          <span aria-hidden="true" />
                          <button
                            type="button"
                            onClick={() =>
                              navigateToProjectWorkspace(navigate, "admin", project.project_id, "documents")
                            }
                          >
                            Documents
                          </button>
                          <span aria-hidden="true" />
                          <Link to="/admin/profit-loss">P&amp;L</Link>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="role-dash__map">
            <div className="role-dash__map-head">
              <h2>Recent activity</h2>
              <span>{recentActivity.length} latest</span>
            </div>
            {recentActivity.length === 0 ? (
              <p className="role-dash__empty">No recent activity.</p>
            ) : (
              <ul className="role-dash__feed">
                {recentActivity.map((item) => (
                  <li key={`${item.type}-${item.timestamp}-${item.title}`} className="role-dash__feed-item">
                    <div>
                      <strong>{item.title}</strong>
                      <span>
                        {item.subtitle} · {formatRelativeTime(item.timestamp)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
};

export default AdminDashboardPage;
