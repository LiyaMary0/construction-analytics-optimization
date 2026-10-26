import { useEffect, useMemo, useState, type FormEvent } from "react";

import { DetailModal } from "../ui/DetailModal";
import { useLiveFieldValidation } from "../../hooks/useLiveFieldValidation";
import {
  MILESTONE_TASK_STATUS_OPTIONS,
  type Milestone,
  type MilestoneTaskPayload,
  type MilestoneTaskStatus,
} from "../../types/project";
import { validateTaskFormFields } from "../../utils/formValidation";

import "./ProjectEntityModal.css";

type AddTaskModalProps = {
  isOpen: boolean;
  milestone: Milestone | null;
  onClose: () => void;
  onSubmit: (payload: MilestoneTaskPayload) => Promise<void>;
};

const suggestDailyTarget = (startDate: string, endDate: string): string => {
  if (!startDate || !endDate) {
    return "";
  }
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  return (100 / days).toFixed(2);
};

export const AddTaskModal = ({ isOpen, milestone, onClose, onSubmit }: AddTaskModalProps) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [expectedWork, setExpectedWork] = useState("");
  const [completionRequirement, setCompletionRequirement] = useState("");
  const [plannedStartDate, setPlannedStartDate] = useState("");
  const [plannedEndDate, setPlannedEndDate] = useState("");
  const [requiredWorkerCount, setRequiredWorkerCount] = useState("1");
  const [plannedDurationDays, setPlannedDurationDays] = useState("");
  const [plannedHoursPerDay, setPlannedHoursPerDay] = useState("8");
  const [dailyTargetPercentage, setDailyTargetPercentage] = useState("");
  const [status, setStatus] = useState<MilestoneTaskStatus>("planned");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { fieldErrors, touchAndValidate, validateSubmit, resetFieldValidation } =
    useLiveFieldValidation();

  const nextSortOrder = useMemo(() => (milestone?.sort_order ?? 0) + 1, [milestone]);

  const milestoneStartDate = milestone?.planned_start_date ?? null;
  const milestoneEndDate = milestone?.effective_end_date ?? milestone?.planned_end_date ?? null;

  const validateWith = (overrides: Partial<{
    title: string;
    expectedWork: string;
    completionRequirement: string;
    plannedStartDate: string;
    plannedEndDate: string;
    requiredWorkerCount: string;
    plannedDurationDays: string;
    plannedHoursPerDay: string;
    dailyTargetPercentage: string;
  }> = {}) =>
    validateTaskFormFields({
      title: overrides.title ?? title,
      expectedWork: overrides.expectedWork ?? expectedWork,
      completionRequirement: overrides.completionRequirement ?? completionRequirement,
      plannedStartDate: overrides.plannedStartDate ?? plannedStartDate,
      plannedEndDate: overrides.plannedEndDate ?? plannedEndDate,
      requiredWorkerCount: overrides.requiredWorkerCount ?? requiredWorkerCount,
      plannedDurationDays: overrides.plannedDurationDays ?? plannedDurationDays,
      plannedHoursPerDay: overrides.plannedHoursPerDay ?? plannedHoursPerDay,
      dailyTargetPercentage: overrides.dailyTargetPercentage ?? dailyTargetPercentage,
      milestoneStartDate,
      milestoneEndDate,
    });

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setTitle("");
    setDescription("");
    setExpectedWork("");
    setCompletionRequirement("");
    setPlannedStartDate(milestone?.planned_start_date ?? "");
    setPlannedEndDate(milestone?.effective_end_date ?? milestone?.planned_end_date ?? "");
    setRequiredWorkerCount("1");
    setPlannedDurationDays("");
    setPlannedHoursPerDay("8");
    setDailyTargetPercentage("");
    setStatus("planned");
    setErrorMessage(null);
    resetFieldValidation();
  }, [isOpen, milestone, resetFieldValidation]);

  useEffect(() => {
    if (!isOpen || dailyTargetPercentage) {
      return;
    }
    const suggested = suggestDailyTarget(plannedStartDate, plannedEndDate);
    if (suggested) {
      setDailyTargetPercentage(suggested);
    }
  }, [dailyTargetPercentage, isOpen, plannedEndDate, plannedStartDate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateSubmit(() => validateWith());
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        expected_work: expectedWork.trim(),
        completion_requirement: completionRequirement.trim(),
        planned_start_date: plannedStartDate || null,
        planned_end_date: plannedEndDate || null,
        required_worker_count: Number(requiredWorkerCount || "1"),
        planned_duration_days: plannedDurationDays ? Number(plannedDurationDays) : null,
        planned_hours_per_day: plannedHoursPerDay || null,
        daily_target_percentage: dailyTargetPercentage ? Number(dailyTargetPercentage) : null,
        status,
        sort_order: nextSortOrder,
      });
      onClose();
    } catch {
      setErrorMessage("Unable to save the task right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DetailModal
      className="project-entity-modal project-entity-modal--form project-entity-modal--task"
      isOpen={isOpen}
      title="Add Task"
      description={milestone ? `Add a task to ${milestone.title}.` : null}
      onClose={onClose}
      size="md"
    >
      <form className="project-entity-modal__form" onSubmit={(event) => void handleSubmit(event)}>
        {errorMessage ? <div className="alert alert-danger mb-0">{errorMessage}</div> : null}

        <label className="project-entity-modal__field">
          <span className="project-entity-modal__label">Task Title</span>
          <input
            className={`form-control${fieldErrors.title ? " is-invalid" : ""}`}
            value={title}
            onChange={(event) => {
              const value = event.target.value;
              setTitle(value);
              touchAndValidate("title", () => validateWith({ title: value }));
            }}
            onBlur={() => touchAndValidate("title", () => validateWith())}
            placeholder="Task title"
          />
          {fieldErrors.title ? (
            <span className="project-entity-modal__error">{fieldErrors.title}</span>
          ) : null}
        </label>

        <label className="project-entity-modal__field">
          <span className="project-entity-modal__label">
            Description <span className="project-entity-modal__optional">(optional)</span>
          </span>
          <textarea
            className="form-control project-entity-modal__textarea"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional notes"
          />
        </label>

        <label className="project-entity-modal__field">
          <span className="project-entity-modal__label">Expected Work</span>
          <textarea
            className={`form-control project-entity-modal__textarea${fieldErrors.expected_work ? " is-invalid" : ""}`}
            rows={2}
            value={expectedWork}
            onChange={(event) => {
              const value = event.target.value;
              setExpectedWork(value);
              touchAndValidate("expected_work", () => validateWith({ expectedWork: value }));
            }}
            onBlur={() => touchAndValidate("expected_work", () => validateWith())}
            placeholder="What workers are expected to complete"
          />
          {fieldErrors.expected_work ? (
            <span className="project-entity-modal__error">{fieldErrors.expected_work}</span>
          ) : null}
        </label>

        <label className="project-entity-modal__field">
          <span className="project-entity-modal__label">Completion Requirement</span>
          <textarea
            className={`form-control project-entity-modal__textarea${fieldErrors.completion_requirement ? " is-invalid" : ""}`}
            rows={2}
            value={completionRequirement}
            onChange={(event) => {
              const value = event.target.value;
              setCompletionRequirement(value);
              touchAndValidate("completion_requirement", () =>
                validateWith({ completionRequirement: value }),
              );
            }}
            onBlur={() => touchAndValidate("completion_requirement", () => validateWith())}
            placeholder="What counts as complete"
          />
          {fieldErrors.completion_requirement ? (
            <span className="project-entity-modal__error">
              {fieldErrors.completion_requirement}
            </span>
          ) : null}
        </label>

        <div className="project-entity-modal__row">
          <label className="project-entity-modal__field">
            <span className="project-entity-modal__label">Start Date</span>
            <input
              className={`form-control${fieldErrors.planned_start_date ? " is-invalid" : ""}`}
              type="date"
              value={plannedStartDate}
              onChange={(event) => {
                const value = event.target.value;
                setPlannedStartDate(value);
                touchAndValidate(["planned_start_date", "planned_end_date"], () =>
                  validateWith({ plannedStartDate: value }),
                );
              }}
              onBlur={() =>
                touchAndValidate(["planned_start_date", "planned_end_date"], () => validateWith())
              }
            />
            {fieldErrors.planned_start_date ? (
              <span className="project-entity-modal__error">{fieldErrors.planned_start_date}</span>
            ) : null}
          </label>
          <label className="project-entity-modal__field">
            <span className="project-entity-modal__label">Due Date</span>
            <input
              className={`form-control${fieldErrors.planned_end_date ? " is-invalid" : ""}`}
              type="date"
              value={plannedEndDate}
              onChange={(event) => {
                const value = event.target.value;
                setPlannedEndDate(value);
                touchAndValidate(["planned_start_date", "planned_end_date"], () =>
                  validateWith({ plannedEndDate: value }),
                );
              }}
              onBlur={() =>
                touchAndValidate(["planned_start_date", "planned_end_date"], () => validateWith())
              }
            />
            {fieldErrors.planned_end_date ? (
              <span className="project-entity-modal__error">{fieldErrors.planned_end_date}</span>
            ) : null}
          </label>
        </div>

        <div className="project-entity-modal__row">
          <label className="project-entity-modal__field">
            <span className="project-entity-modal__label">Workers Needed</span>
            <input
              className={`form-control${fieldErrors.required_worker_count ? " is-invalid" : ""}`}
              inputMode="numeric"
              value={requiredWorkerCount}
              onChange={(event) => {
                const value = event.target.value;
                setRequiredWorkerCount(value);
                touchAndValidate("required_worker_count", () =>
                  validateWith({ requiredWorkerCount: value }),
                );
              }}
              onBlur={() => touchAndValidate("required_worker_count", () => validateWith())}
            />
            {fieldErrors.required_worker_count ? (
              <span className="project-entity-modal__error">
                {fieldErrors.required_worker_count}
              </span>
            ) : null}
          </label>
          <label className="project-entity-modal__field">
            <span className="project-entity-modal__label">Daily Target %</span>
            <input
              className={`form-control${fieldErrors.daily_target_percentage ? " is-invalid" : ""}`}
              inputMode="decimal"
              value={dailyTargetPercentage}
              onChange={(event) => {
                const value = event.target.value;
                setDailyTargetPercentage(value);
                touchAndValidate("daily_target_percentage", () =>
                  validateWith({ dailyTargetPercentage: value }),
                );
              }}
              onBlur={() => touchAndValidate("daily_target_percentage", () => validateWith())}
              placeholder="Auto from dates"
            />
            {fieldErrors.daily_target_percentage ? (
              <span className="project-entity-modal__error">
                {fieldErrors.daily_target_percentage}
              </span>
            ) : null}
          </label>
        </div>

        <div className="project-entity-modal__row">
          <label className="project-entity-modal__field">
            <span className="project-entity-modal__label">
              Planned Duration (Days){" "}
              <span className="project-entity-modal__optional">(optional)</span>
            </span>
            <input
              className={`form-control${fieldErrors.planned_duration_days ? " is-invalid" : ""}`}
              inputMode="numeric"
              value={plannedDurationDays}
              onChange={(event) => {
                const value = event.target.value;
                setPlannedDurationDays(value);
                touchAndValidate("planned_duration_days", () =>
                  validateWith({ plannedDurationDays: value }),
                );
              }}
              onBlur={() => touchAndValidate("planned_duration_days", () => validateWith())}
            />
            {fieldErrors.planned_duration_days ? (
              <span className="project-entity-modal__error">
                {fieldErrors.planned_duration_days}
              </span>
            ) : null}
          </label>
          <label className="project-entity-modal__field">
            <span className="project-entity-modal__label">Hours / Day</span>
            <input
              className={`form-control${fieldErrors.planned_hours_per_day ? " is-invalid" : ""}`}
              inputMode="decimal"
              value={plannedHoursPerDay}
              onChange={(event) => {
                const value = event.target.value;
                setPlannedHoursPerDay(value);
                touchAndValidate("planned_hours_per_day", () =>
                  validateWith({ plannedHoursPerDay: value }),
                );
              }}
              onBlur={() => touchAndValidate("planned_hours_per_day", () => validateWith())}
            />
            {fieldErrors.planned_hours_per_day ? (
              <span className="project-entity-modal__error">
                {fieldErrors.planned_hours_per_day}
              </span>
            ) : null}
          </label>
        </div>

        <label className="project-entity-modal__field">
          <span className="project-entity-modal__label">Status</span>
          <div className="project-entity-modal__select-wrap">
            <select
              className="form-select project-entity-modal__select"
              value={status}
              onChange={(event) => setStatus(event.target.value as MilestoneTaskStatus)}
            >
              {MILESTONE_TASK_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </label>

        <div className="project-entity-modal__actions">
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button type="submit" className="admin-btn admin-btn--primary" disabled={isSubmitting}>
            {isSubmitting ? "Adding..." : "Add Task"}
          </button>
        </div>
      </form>
    </DetailModal>
  );
};

export default AddTaskModal;
