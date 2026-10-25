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
import { StatusBadge } from "../../components/ui/StatusBadge";
import type { DailyTaskUpdate, ProjectSummary, WorkplaceNeed } from "../../types/project";
import { formatDisplayTitle } from "../../utils/formatDisplayTitle";
import {
  formatHeaderDate,
  getGreeting,
} from "../worker/workerFormatters";

import "../../styles/roleDashboard.css";

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

  return (
    <div className="role-dash">
      <header className="role-dash__header">
        <div>
          <p className="role-dash__kicker">
            {greeting}, {workerName}
          </p>
          <h1 className="role-dash__title">Dashboard</h1>
          <p className="role-dash__subtitle">
            Trace site work through projects, daily reviews and workplace needs.
          </p>
        </div>
        <p className="role-dash__date">{todayLabel}</p>
      </header>

      {errorMessage ? (
        <div className="alert alert-danger mb-0" role="alert">
          {errorMessage}
        </div>
      ) : null}

      <section className="role-dash__stats role-dash__stats--3" aria-label="Supervisor summary">
        <article className="role-dash__stat">
          <span>Daily updates</span>
          <strong>{isLoading ? "—" : pendingDailyUpdates.length}</strong>
        </article>
        <article className="role-dash__stat">
          <span>Workplace needs</span>
          <strong>{isLoading ? "—" : pendingNeeds.length}</strong>
        </article>
        <article className="role-dash__stat">
          <span>Projects</span>
          <strong>{isLoading ? "—" : projects.length}</strong>
        </article>
      </section>

      <section className="role-dash__map" aria-label="Supervisor tracer">
        <div className="role-dash__map-head">
          <h2>Work tracer</h2>
          <p>How supervisor reviews connect to the site.</p>
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
            <Link className="role-dash__trace-node" to="/supervisor/verifications/tasks">
              <span className="role-dash__trace-label">Verifications</span>
              <strong>{isLoading ? "—" : pendingDailyUpdates.length}</strong>
            </Link>
          </li>
          <li className="role-dash__trace-line" aria-hidden="true" />
          <li>
            <Link className="role-dash__trace-node" to="/supervisor/verifications/needs">
              <span className="role-dash__trace-label">Needs</span>
              <strong>{isLoading ? "—" : pendingNeeds.length}</strong>
            </Link>
          </li>
        </ol>
      </section>

      <section className="role-dash__list">
        <div className="role-dash__list-head">
          <h2>Assigned projects</h2>
          <Link to="/supervisor/projects">View all</Link>
        </div>
        {isLoading ? (
          <p className="role-dash__empty">Loading projects...</p>
        ) : projects.length === 0 ? (
          <p className="role-dash__empty">No projects assigned yet.</p>
        ) : (
          <ul className="role-dash__projects">
            {projects.map((project) => {
              const progress = Number(project.progress_percentage || 0);
              return (
                <li key={project.project_id}>
                  <article className="role-dash__project">
                    <Link className="role-dash__project-main" to="/supervisor/projects">
                      <div className="role-dash__project-top">
                        <h3>{formatDisplayTitle(project.project_name) || project.project_name}</h3>
                        <StatusBadge
                          className="status-badge--compact"
                          label={project.is_archived ? "Archived" : project.status.replace(/_/g, " ")}
                          tone={project.is_archived ? "archived" : project.status}
                        />
                      </div>
                      <p className="role-dash__project-meta">
                        {project.project_manager?.name ?? "Unassigned"}
                        <span aria-hidden="true">·</span>
                        {project.milestone_count} milestones
                      </p>
                      <div className="role-dash__progress">
                        <div className="role-dash__progress-head">
                          <span>Progress</span>
                          <strong>{progress.toFixed(0)}%</strong>
                        </div>
                        <div className="role-dash__progress-bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                          <span style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
                        </div>
                      </div>
                    </Link>
                    <div className="role-dash__mini-trace">
                      <Link to="/supervisor/projects">Projects</Link>
                      <span aria-hidden="true" />
                      <Link to="/supervisor/verifications/tasks">Verifications</Link>
                      <span aria-hidden="true" />
                      <Link to="/supervisor/verifications/needs">Needs</Link>
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

export default SupervisorDashboardPage;
