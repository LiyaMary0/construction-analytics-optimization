import axios from "axios";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { StatusBadge } from "../../components/ui/StatusBadge";
import { useWorkspacePageTitle } from "../../contexts/AdminChromeContext";
import { listProjectDocuments, listProjectMilestones, listProjects } from "../../services/projectApi";
import {
  MILESTONE_STATUS_OPTIONS,
  PROJECT_DOCUMENT_TYPE_OPTIONS,
  type Milestone,
  type ProjectDocument,
} from "../../types/project";
import { formatDisplayTitle } from "../../utils/formatDisplayTitle";
import { getProjectMilestonePath, navigateToProjectWorkspace } from "../../utils/projectCreateRoutes";
import { setSelectedProjectId } from "../../utils/selectedProjectSession";

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

const formatStatus = (value: string): string =>
  MILESTONE_STATUS_OPTIONS.find((option) => option.value === value)?.label ??
  value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

const formatDocumentType = (value: string): string =>
  PROJECT_DOCUMENT_TYPE_OPTIONS.find((option) => option.value === value)?.label ??
  value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

type PickerTab = "milestones" | "documents";

type ProjectManagerPickerPageProps = {
  tab: PickerTab;
};

type MilestoneRow = Milestone & { project_name: string };
type DocumentRow = ProjectDocument & { project_name: string };

const COPY: Record<PickerTab, { title: string; subtitle: string; empty: string }> = {
  milestones: {
    title: "Milestones",
    subtitle: "Track planned phases, progress and due dates across assigned projects.",
    empty: "No milestones on assigned projects yet.",
  },
  documents: {
    title: "Documents",
    subtitle: "Review drawings, contracts and other files stored on assigned projects.",
    empty: "No documents on assigned projects yet.",
  },
};

export const ProjectManagerPickerPage = ({ tab }: ProjectManagerPickerPageProps) => {
  const copy = COPY[tab];
  useWorkspacePageTitle(copy.title);
  const navigate = useNavigate();
  const [milestones, setMilestones] = useState<MilestoneRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const projectData = await listProjects();

        if (tab === "milestones") {
          const bundles = await Promise.all(
            projectData.results.map(async (project) => {
              const data = await listProjectMilestones(project.project_id);
              return data.results.map((milestone) => ({
                ...milestone,
                project_name: project.project_name,
              }));
            }),
          );
          setMilestones(bundles.flat());
          setDocuments([]);
        } else {
          const bundles = await Promise.all(
            projectData.results.map(async (project) => {
              const data = await listProjectDocuments(project.project_id);
              return data.results.map((document) => ({
                ...document,
                project_name: project.project_name,
              }));
            }),
          );
          setDocuments(bundles.flat());
          setMilestones([]);
        }
      } catch (error) {
        setErrorMessage(getErrorMessage(error, "Unable to load this page right now."));
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [tab]);

  const openMilestone = (milestone: MilestoneRow) => {
    setSelectedProjectId(milestone.project_id);
    navigate(getProjectMilestonePath("project-manager", milestone.project_id, milestone.milestone_id), {
      state: { projectId: milestone.project_id },
    });
  };

  const openDocumentProject = (projectId: number) => {
    navigateToProjectWorkspace(navigate, "project-manager", projectId, "documents");
  };

  return (
    <div className="project-manager-projects-page">
      <header className="project-manager-projects-page__header">
        <h1 className="project-manager-projects-page__title">{copy.title}</h1>
        <p className="project-manager-projects-page__subtitle">{copy.subtitle}</p>
      </header>

      {errorMessage ? (
        <div className="alert alert-danger mb-0 project-manager-projects-page__alert">{errorMessage}</div>
      ) : null}

      {isLoading ? (
        <p className="project-manager-hub__empty">Loading {copy.title.toLowerCase()}...</p>
      ) : tab === "milestones" ? (
        milestones.length === 0 ? (
          <p className="project-manager-hub__empty">{copy.empty}</p>
        ) : (
          <ul className="project-manager-hub__cards">
            {milestones.map((milestone) => {
              const progress = Number(milestone.progress_percentage || 0);
              return (
                <li key={`${milestone.project_id}-${milestone.milestone_id}`}>
                  <button
                    type="button"
                    className="project-manager-hub__card"
                    onClick={() => openMilestone(milestone)}
                  >
                    <div className="project-manager-hub__card-header">
                      <h2 className="project-manager-hub__card-title">
                        {formatDisplayTitle(milestone.title) || milestone.title}
                      </h2>
                      <StatusBadge
                        className="status-badge--compact"
                        label={formatStatus(milestone.status)}
                        tone={milestone.status}
                      />
                    </div>
                    <p className="project-manager-hub__card-secondary">
                      {formatDisplayTitle(milestone.project_name) || milestone.project_name}
                    </p>
                    <div className="project-manager-hub__metrics">
                      <div className="project-manager-hub__metric">
                        <span className="project-manager-hub__metric-label">Schedule</span>
                        <span className="project-manager-hub__metric-value">
                          {formatDate(milestone.planned_start_date)} →{" "}
                          {formatDate(milestone.effective_end_date)}
                        </span>
                      </div>
                      <div className="project-manager-hub__metric">
                        <span className="project-manager-hub__metric-label">Tasks</span>
                        <span className="project-manager-hub__metric-value">{milestone.task_count}</span>
                      </div>
                      <div className="project-manager-hub__metric project-manager-hub__metric--progress">
                        <div className="project-manager-hub__progress-head">
                          <span className="project-manager-hub__metric-label">Progress</span>
                          <strong className="project-manager-hub__metric-value">
                            {progress.toFixed(0)}%
                          </strong>
                        </div>
                        <div
                          className="project-manager-hub__progress-bar"
                          role="progressbar"
                          aria-valuenow={progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <span style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : documents.length === 0 ? (
        <p className="project-manager-hub__empty">{copy.empty}</p>
      ) : (
        <ul className="project-manager-hub__cards">
          {documents.map((document) => (
            <li key={`${document.project_id}-${document.document_id}`}>
              <button
                type="button"
                className="project-manager-hub__card"
                onClick={() => openDocumentProject(document.project_id)}
              >
                <div className="project-manager-hub__card-header">
                  <h2 className="project-manager-hub__card-title">
                    {formatDisplayTitle(document.title) || document.title}
                  </h2>
                </div>
                <p className="project-manager-hub__card-secondary">
                  {formatDisplayTitle(document.project_name) || document.project_name}
                </p>
                <div className="project-manager-hub__metrics project-manager-hub__metrics--documents">
                  <div className="project-manager-hub__metric">
                    <span className="project-manager-hub__metric-label">Type</span>
                    <span className="project-manager-hub__metric-value">
                      {formatDocumentType(document.document_type)}
                    </span>
                  </div>
                  <div className="project-manager-hub__metric">
                    <span className="project-manager-hub__metric-label">File</span>
                    <span className="project-manager-hub__metric-value">
                      {document.file_name || "No file attached"}
                    </span>
                  </div>
                  <div className="project-manager-hub__metric">
                    <span className="project-manager-hub__metric-label">Uploaded by</span>
                    <span className="project-manager-hub__metric-value">
                      {document.uploaded_by?.name ?? "—"}
                    </span>
                  </div>
                  <div className="project-manager-hub__metric">
                    <span className="project-manager-hub__metric-label">Uploaded</span>
                    <span className="project-manager-hub__metric-value">
                      {formatDate(document.created_at)}
                    </span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ProjectManagerPickerPage;
