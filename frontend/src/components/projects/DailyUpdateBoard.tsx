import { useMemo, useState } from "react";

import { EmptyState } from "../ui/EmptyState";
import { SectionHeader } from "../ui/SectionHeader";
import type { DailyTaskReviewPayload, DailyTaskUpdate } from "../../types/project";

import "./DailyUpdateBoard.css";

interface DailyUpdateBoardProps {
  title: string;
  description: string;
  updates: DailyTaskUpdate[];
  mode: "supervisor" | "site-engineer" | "readonly";
  onReview?: (updateId: number, payload: DailyTaskReviewPayload) => Promise<void>;
}

const formatDate = (value: string): string => {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
};

export const DailyUpdateBoard = ({
  title,
  description,
  updates,
  mode,
  onReview,
}: DailyUpdateBoardProps) => {
  const [notesByUpdateId, setNotesByUpdateId] = useState<Record<number, string>>({});
  const [reviewErrorsById, setReviewErrorsById] = useState<Record<number, string>>({});
  const [processingUpdateId, setProcessingUpdateId] = useState<number | null>(null);

  const filteredUpdates = useMemo(() => {
    if (mode === "supervisor") {
      return updates.filter((update) => update.supervisor_review_status === "pending");
    }

    if (mode === "site-engineer") {
      return updates.filter(
        (update) =>
          update.supervisor_review_status === "approved" &&
          update.engineer_review_status === "pending",
      );
    }

    return updates;
  }, [mode, updates]);

  const handleReview = async (
    updateId: number,
    review_status: DailyTaskReviewPayload["review_status"],
  ) => {
    if (!onReview) {
      return;
    }

    const note = notesByUpdateId[updateId]?.trim() ?? "";
    if (review_status === "rejected" && !note) {
      setReviewErrorsById((current) => ({
        ...current,
        [updateId]: "Add a rejection note before rejecting this update.",
      }));
      return;
    }

    setReviewErrorsById((current) => {
      const next = { ...current };
      delete next[updateId];
      return next;
    });
    setProcessingUpdateId(updateId);

    try {
      await onReview(updateId, {
        review_status,
        review_note: note,
      });
    } finally {
      setProcessingUpdateId(null);
    }
  };

  return (
    <section className="daily-update-board">
      {title ? <SectionHeader title={title} /> : null}
      {description ? <p className="daily-update-board__description">{description}</p> : null}

      {filteredUpdates.length === 0 ? (
        <EmptyState
          title={
            mode === "readonly"
              ? "No daily work updates have been submitted yet."
              : "No pending reviews."
          }
        />
      ) : (
        <div className="daily-update-board__list">
          {filteredUpdates.map((update) => (
            <article key={update.update_id} className="daily-update-board__card">
              <div className="daily-update-board__card-header">
                <div>
                  <h3>{update.task_title}</h3>
                  <span>
                    {update.worker?.name ?? "Worker"} | {update.milestone_title}
                  </span>
                </div>
                <span className="daily-update-board__status">
                  {update.completion_percentage}% {update.status.replace(/_/g, " ")}
                </span>
              </div>

              <div className="daily-update-board__meta">
                <span>Work Date: {formatDate(update.work_date)}</span>
                <span>
                  Supervisor: {update.supervisor_review_status.replace(/_/g, " ")}
                </span>
                <span>
                  Engineer: {update.engineer_review_status.replace(/_/g, " ")}
                </span>
                {update.has_safety_issue ? <span>Safety issue flagged</span> : null}
              </div>

              <p>{update.remark || "No remark"}</p>

              {update.man_hour_context ? (
                mode === "site-engineer" ? (
                  <div className="daily-update-board__manpower">
                    <div className="daily-update-board__metrics">
                      <div>
                        <span>Completion %</span>
                        <strong>{Number(update.completion_percentage).toFixed(0)}%</strong>
                      </div>
                      <div>
                        <span>Utilization %</span>
                        <strong>
                          {update.man_hour_context.manpower_utilization_percentage != null
                            ? `${Number(update.man_hour_context.manpower_utilization_percentage).toFixed(0)}%`
                            : "—"}
                        </strong>
                      </div>
                    </div>
                    <div className="daily-update-board__manpower-grid">
                      <div>
                        <span>Required Workers</span>
                        <strong>{update.man_hour_context.required_workers}</strong>
                      </div>
                      <div>
                        <span>Planned Man Hours</span>
                        <strong>{update.man_hour_context.planned_man_hours ?? "—"}</strong>
                      </div>
                      <div>
                        <span>Actual Man Hours</span>
                        <strong>{update.man_hour_context.actual_man_hours}</strong>
                      </div>
                      <div>
                        <span>Worker Hours (Date)</span>
                        <strong>{update.man_hour_context.worker_man_hours_for_date}</strong>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="daily-update-board__hours-note">
                    Man-hours (date): {update.man_hour_context.worker_man_hours_for_date} hrs
                  </p>
                )
              ) : null}

              {update.concern_text ? (
                <div className="daily-update-board__concern">
                  Concern: {update.concern_text}
                </div>
              ) : null}

              {update.incomplete_reason ? (
                <div className="daily-update-board__concern">
                  Incomplete reason:{" "}
                  {update.incomplete_reason.replace(/_/g, " ")}
                  {update.incomplete_reason_detail
                    ? ` — ${update.incomplete_reason_detail}`
                    : ""}
                </div>
              ) : null}

              <div className="daily-update-board__meta">
                {update.supervisor_reviewed_at ? (
                  <span>
                    Supervisor {update.supervisor_review_status}:{" "}
                    {new Date(update.supervisor_reviewed_at).toLocaleString()}
                  </span>
                ) : null}
                {update.engineer_reviewed_at ? (
                  <span>
                    Engineer {update.engineer_review_status}:{" "}
                    {new Date(update.engineer_reviewed_at).toLocaleString()}
                  </span>
                ) : null}
                {update.supervisor_review_note ? (
                  <span>Supervisor note: {update.supervisor_review_note}</span>
                ) : null}
              </div>

              {mode !== "readonly" && onReview ? (
                <div className="daily-update-board__review-panel">
                  <textarea
                    className="form-control"
                    rows={2}
                    value={notesByUpdateId[update.update_id] ?? ""}
                    onChange={(event) => {
                      setNotesByUpdateId((currentState) => ({
                        ...currentState,
                        [update.update_id]: event.target.value,
                      }));
                      setReviewErrorsById((current) => {
                        const next = { ...current };
                        delete next[update.update_id];
                        return next;
                      });
                    }}
                    placeholder={
                      mode === "supervisor"
                        ? "Verification notes (required when rejecting)."
                        : "Site engineer notes (required when rejecting)."
                    }
                  />
                  {reviewErrorsById[update.update_id] ? (
                    <div className="alert alert-danger mb-0" role="alert">
                      {reviewErrorsById[update.update_id]}
                    </div>
                  ) : null}
                  <div className="daily-update-board__actions">
                    <button
                      type="button"
                      className="btn daily-update-board__secondary-action"
                      disabled={processingUpdateId === update.update_id}
                      onClick={() => void handleReview(update.update_id, "rejected")}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className="btn daily-update-board__primary-action"
                      disabled={processingUpdateId === update.update_id}
                      onClick={() => void handleReview(update.update_id, "approved")}
                    >
                      {processingUpdateId === update.update_id
                        ? "Saving..."
                        : mode === "site-engineer"
                          ? "Verify completion"
                          : "Approve completion"}
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default DailyUpdateBoard;
