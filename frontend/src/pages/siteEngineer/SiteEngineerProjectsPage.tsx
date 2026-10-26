import axios from "axios";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useWorkspacePageTitle } from "../../contexts/AdminChromeContext";
import { listProjects } from "../../services/projectApi";
import type { ProjectSummary } from "../../types/project";
import { formatDisplayTitle } from "../../utils/formatDisplayTitle";

import "./SiteEngineerPages.css";

const getErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (axios.isAxiosError(error)) {
    return (error.response?.data as { message?: string } | undefined)?.message ?? fallbackMessage;
  }
  return fallbackMessage;
};

export const SiteEngineerProjectsPage = () => {
  useWorkspacePageTitle("Projects & Milestones");
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const projectData = await listProjects();
        setProjects(projectData.results);
      } catch (error) {
        setErrorMessage(getErrorMessage(error, "Unable to load assigned projects right now."));
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  return (
    <main className="site-engineer-page">
      <div className="site-engineer-page-content">
        <header>
          <h1 className="site-engineer-page__title">Projects &amp; Milestones</h1>
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
            <h2 className="site-engineer-card__title">Assigned Projects</h2>
            <Link className="site-engineer-card__link" to="/site-engineer/tasks">
              Manage tasks
            </Link>
          </div>

          {isLoading ? (
            <div className="site-engineer-empty">Loading projects...</div>
          ) : projects.length === 0 ? (
            <div className="site-engineer-empty">No projects assigned to you.</div>
          ) : (
            <div className="site-engineer-project-grid">
              {projects.map((project) => (
                <button
                  key={project.project_id}
                  type="button"
                  className="site-engineer-project-card"
                  onClick={() => navigate(`/site-engineer/projects/${project.project_id}`)}
                >
                  <strong>
                    {formatDisplayTitle(project.project_name) || project.project_name}
                  </strong>
                  <span>{project.status.replace(/_/g, " ")}</span>
                  <small>
                    {project.milestone_count} milestones · Progress{" "}
                    {Number(project.progress_percentage || 0).toFixed(0)}%
                  </small>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

export default SiteEngineerProjectsPage;
