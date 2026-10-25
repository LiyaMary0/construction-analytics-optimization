import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useWorkspacePageTitle } from "../../contexts/AdminChromeContext";
import { useAuth } from "../../hooks/useAuth";
import {
  listProjectDailyUpdates,
  listProjectMilestones,
  listProjects,
} from "../../services/projectApi";
import type { DailyTaskUpdate, Milestone, ProjectSummary } from "../../types/project";
import { formatDisplayTitle } from "../../utils/formatDisplayTitle";
import { formatHeaderDate, getGreeting } from "../worker/workerFormatters";
import { StatusBadge } from "../../components/ui/StatusBadge";

import "../../styles/roleDashboard.css";

type MilestoneRow = Milestone & { project_name: string; project_id: number };

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

export const SiteEngineerDashboardPage = () => {
  useWorkspacePageTitle("Site Engineer Dashboard");
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [milestones, setMilestones] = useState<MilestoneRow[]>([]);
  const [pendingUpdates, setPendingUpdates] = useState<DailyTaskUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const projectData = await listProjects();
        setProjects(projectData.results);

        const milestoneBundles = await Promise.all(
          projectData.results.map(async (project) => {
            const [milestoneData, updateData] = await Promise.all([
              listProjectMilestones(project.project_id),
              listProjectDailyUpdates(project.project_id),
            ]);
            return {
              project,
              milestones: milestoneData.results.map((milestone) => ({
                ...milestone,
                project_name: project.project_name,
                project_id: project.project_id,
              })),
              updates: updateData.results,
            };
          }),
        );

        setMilestones(milestoneBundles.flatMap((bundle) => bundle.milestones));
        setPendingUpdates(
          milestoneBundles
            .flatMap((bundle) => bundle.updates)
            .filter(
              (update) =>
                update.supervisor_review_status === "approved" &&
                update.engineer_review_status === "pending",
            ),
        );
      } catch (error) {
        setErrorMessage(
          getErrorMessage(error, "Unable to load the Site Engineer dashboard right now."),
        );
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  const behindCount = useMemo(
    () => milestones.filter((item) => item.schedule_status === "behind_schedule").length,
    [milestones],
  );

  return (
    <div className="role-dash">
      <header className="role-dash__header">
        <div>
          <p className="role-dash__kicker">
            {getGreeting()}, {user?.name ?? "Site Engineer"}
          </p>
          <h1 className="role-dash__title">Dashboard</h1>
          <p className="role-dash__subtitle">
            Trace assigned projects through milestones, tasks and verifications.
          </p>
        </div>
        <p className="role-dash__date">{formatHeaderDate(new Date())}</p>
      </header>

      {errorMessage ? (
        <div className="alert alert-danger mb-0" role="alert">
          {errorMessage}
        </div>
      ) : null}

      <section className="role-dash__stats" aria-label="Workspace summary">
        <article className="role-dash__stat">
          <span>Projects</span>
          <strong>{isLoading ? "—" : projects.length}</strong>
        </article>
        <article className="role-dash__stat">
          <span>Milestones</span>
          <strong>{isLoading ? "—" : milestones.length}</strong>
        </article>
        <article className="role-dash__stat">
          <span>Verifications</span>
          <strong>{isLoading ? "—" : pendingUpdates.length}</strong>
        </article>
        <article className="role-dash__stat">
          <span>Behind schedule</span>
          <strong>{isLoading ? "—" : behindCount}</strong>
        </article>
      </section>

      <section className="role-dash__map" aria-label="Site engineer tracer">
        <div className="role-dash__map-head">
          <h2>Work tracer</h2>
          <p>How site engineering work is connected.</p>
        </div>
        <ol className="role-dash__trace">
          <li>
            <Link className="role-dash__trace-node" to="/site-engineer/projects">
              <span className="role-dash__trace-label">Projects</span>
              <strong>{isLoading ? "—" : projects.length}</strong>
            </Link>
          </li>
          <li className="role-dash__trace-line" aria-hidden="true" />
          <li>
            <Link className="role-dash__trace-node" to="/site-engineer/tasks">
              <span className="role-dash__trace-label">Tasks</span>
              <strong>{isLoading ? "—" : milestones.length}</strong>
            </Link>
          </li>
          <li className="role-dash__trace-line" aria-hidden="true" />
          <li>
            <Link className="role-dash__trace-node" to="/site-engineer/verifications">
              <span className="role-dash__trace-label">Verifications</span>
              <strong>{isLoading ? "—" : pendingUpdates.length}</strong>
            </Link>
          </li>
        </ol>
      </section>

      <section className="role-dash__list">
        <div className="role-dash__list-head">
          <h2>Assigned projects</h2>
          <span>{isLoading ? "…" : `${projects.length} active`}</span>
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
                    <Link className="role-dash__project-main" to="/site-engineer/projects">
                      <div className="role-dash__project-top">
                        <h3>{formatDisplayTitle(project.project_name) || project.project_name}</h3>
                        <StatusBadge
                          className="status-badge--compact"
                          label={project.status.replace(/_/g, " ")}
                          tone={project.status}
                        />
                      </div>
                      <p className="role-dash__project-meta">
                        {formatDate(project.start_date)} → {formatDate(project.end_date)}
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
                      <Link to="/site-engineer/projects">
                        Milestones
                        <em>{project.milestone_count}</em>
                      </Link>
                      <span aria-hidden="true" />
                      <Link to="/site-engineer/tasks">Tasks</Link>
                      <span aria-hidden="true" />
                      <Link to="/site-engineer/verifications">Verifications</Link>
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

export default SiteEngineerDashboardPage;
