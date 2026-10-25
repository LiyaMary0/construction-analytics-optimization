import axios from "axios";
import { useEffect, useState } from "react";

import { WorkplaceNeedsPanel } from "../../components/projects/WorkplaceNeedsPanel";
import { useWorkspacePageTitle } from "../../contexts/AdminChromeContext";
import { listPmWorkplaceNeeds, updateWorkplaceNeedByPm } from "../../services/projectApi";
import type { WorkplaceNeed } from "../../types/project";

import "./ProjectManagerPages.css";

const getErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (axios.isAxiosError(error)) {
    return (error.response?.data as { message?: string } | undefined)?.message ?? fallbackMessage;
  }
  return fallbackMessage;
};

export const ProjectManagerWorkplaceNeedsPage = () => {
  useWorkspacePageTitle("Workplace Needs");
  const [needs, setNeeds] = useState<WorkplaceNeed[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const loadNeeds = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await listPmWorkplaceNeeds({ includeResolved: false });
      setNeeds(response.results);
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, "Unable to load verified workplace needs right now."),
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadNeeds();
  }, []);

  const handlePmAction = async (
    requestId: number,
    action: "start" | "resolve" | "comment",
    comments: string,
  ) => {
    setNoticeMessage(null);
    setErrorMessage(null);

    try {
      await updateWorkplaceNeedByPm(requestId, { action, comments });
      setNoticeMessage(
        action === "resolve"
          ? "Workplace need marked resolved."
          : action === "start"
            ? "Workplace need marked in progress."
            : "Project Manager comments saved.",
      );
      await loadNeeds();
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, "Unable to update the workplace need right now."),
      );
      throw error;
    }
  };

  return (
    <div className="project-manager-projects-page project-manager-workplace-needs-page">
      <header className="project-manager-projects-page__header">
        <h1 className="project-manager-projects-page__title">Workplace Needs</h1>
        <p className="project-manager-projects-page__subtitle">
          Review requests verified by supervisors.
        </p>
      </header>

      {noticeMessage ? (
        <div className="alert alert-success mb-0 project-manager-projects-page__alert">
          {noticeMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="alert alert-danger mb-0 project-manager-projects-page__alert">
          {errorMessage}
        </div>
      ) : null}

      <WorkplaceNeedsPanel
        mode="project-manager"
        showTitle={false}
        needs={needs}
        isLoading={isLoading}
        onPmAction={handlePmAction}
      />
    </div>
  );
};

export default ProjectManagerWorkplaceNeedsPage;
