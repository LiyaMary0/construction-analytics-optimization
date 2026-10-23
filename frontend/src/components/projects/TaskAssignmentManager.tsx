import { useEffect, useMemo, useState, type FormEvent } from "react";

import { useLiveFieldValidation } from "../../hooks/useLiveFieldValidation";
import type {
  MilestoneTask,
  ProjectLookupUser,
  TaskAssignment,
  TaskWorkerAssignmentPayload,
} from "../../types/project";
import { validateAssignmentFormFields } from "../../utils/formValidation";

import "./TaskAssignmentManager.css";

interface TaskAssignmentManagerProps {
  tasks: MilestoneTask[];
  workers: ProjectLookupUser[];
  selectedTaskId: number | null;
  onSelectTask: (taskId: number) => void;
  onCreateAssignment: (payload: TaskWorkerAssignmentPayload) => Promise<void>;
  onUpdateAssignment: (
    assignmentId: number,
    payload: Partial<TaskWorkerAssignmentPayload>,
  ) => Promise<void>;
  onDeleteAssignment: (assignmentId: number) => Promise<void>;
}

type AssignmentFormState = {
  worker_id: string;
  duty_instructions: string;
  is_active: boolean;
};

type AssignmentLiveOverrides = Partial<{
  taskSelected: boolean;
  workerId: string;
  dutyInstructions: string;
}>;

const defaultAssignmentFormState: AssignmentFormState = {
  worker_id: "",
  duty_instructions: "",
  is_active: true,
};

export const TaskAssignmentManager = ({
  tasks,
  workers,
  selectedTaskId,
  onSelectTask,
  onCreateAssignment,
  onUpdateAssignment,
  onDeleteAssignment,
}: TaskAssignmentManagerProps) => {
  const [editingAssignment, setEditingAssignment] = useState<TaskAssignment | null>(null);
  const [formState, setFormState] = useState<AssignmentFormState>(defaultAssignmentFormState);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [processingAssignmentId, setProcessingAssignmentId] = useState<number | null>(null);
  const { fieldErrors, touchAndValidate, validateSubmit, resetFieldValidation } =
    useLiveFieldValidation();

  const selectedTask = useMemo(() => {
    return tasks.find((task) => task.task_id === selectedTaskId) ?? null;
  }, [selectedTaskId, tasks]);

  const availableWorkers = useMemo(() => {
    const assignedIds = new Set(
      (selectedTask?.active_assignments ?? [])
        .map((assignment) => assignment.worker?.user_id)
        .filter((userId): userId is number => typeof userId === "number"),
    );
    const editingWorkerId = editingAssignment?.worker?.user_id ?? null;

    return workers.filter((worker) => {
      if (editingWorkerId !== null && worker.user_id === editingWorkerId) {
        return true;
      }
      return !assignedIds.has(worker.user_id);
    });
  }, [editingAssignment, selectedTask, workers]);

  const validateWith = (overrides: AssignmentLiveOverrides = {}) =>
    validateAssignmentFormFields({
      taskSelected: overrides.taskSelected ?? Boolean(selectedTaskId),
      workerId: overrides.workerId ?? formState.worker_id,
      dutyInstructions: overrides.dutyInstructions ?? formState.duty_instructions,
    });

  useEffect(() => {
    resetFieldValidation();
    setErrorMessage(null);

    if (!editingAssignment) {
      setFormState(defaultAssignmentFormState);
      return;
    }

    setFormState({
      worker_id: editingAssignment.worker?.user_id
        ? String(editingAssignment.worker.user_id)
        : "",
      duty_instructions: editingAssignment.duty_instructions,
      is_active: editingAssignment.is_active,
    });
  }, [editingAssignment, resetFieldValidation]);

  const updateField = <K extends keyof AssignmentFormState>(
    field: K,
    value: AssignmentFormState[K],
    live?: { fields: string | string[]; overrides?: AssignmentLiveOverrides },
  ) => {
    setFormState((currentState) => ({
      ...currentState,
      [field]: value,
    }));
    if (live) {
      touchAndValidate(live.fields, () => validateWith(live.overrides ?? {}));
    }
  };

  const resetForm = () => {
    setEditingAssignment(null);
    setFormState(defaultAssignmentFormState);
    setErrorMessage(null);
    resetFieldValidation();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    const nextErrors = validateSubmit(() => validateWith());
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    if (!selectedTaskId) {
      return;
    }

    const payload: TaskWorkerAssignmentPayload = {
      worker_id: Number(formState.worker_id),
      duty_instructions: formState.duty_instructions.trim(),
      is_active: formState.is_active,
    };

    setProcessingAssignmentId(editingAssignment?.assignment_id ?? -1);

    try {
      if (editingAssignment) {
        await onUpdateAssignment(editingAssignment.assignment_id, payload);
      } else {
        await onCreateAssignment(payload);
      }
      resetForm();
    } finally {
      setProcessingAssignmentId(null);
    }
  };

  const handleDelete = async (assignmentId: number) => {
    const confirmed = window.confirm("Remove this worker from the selected task?");
    if (!confirmed) {
      return;
    }

    setProcessingAssignmentId(assignmentId);
    try {
      await onDeleteAssignment(assignmentId);
      if (editingAssignment?.assignment_id === assignmentId) {
        resetForm();
      }
    } finally {
      setProcessingAssignmentId(null);
    }
  };

  return (
    <section className="task-assignment-manager">
      <label className="task-assignment-manager__field">
        <span className="task-assignment-manager__label">Task</span>
        <select
          className={`form-select admin-control${fieldErrors.task_id ? " is-invalid" : ""}`}
          value={selectedTaskId ?? ""}
          onChange={(event) => {
            onSelectTask(event.target.value ? Number(event.target.value) : 0);
            touchAndValidate("task_id", () =>
              validateWith({
                taskSelected: Boolean(event.target.value),
              }),
            );
          }}
          onBlur={() => touchAndValidate("task_id", () => validateWith())}
        >
          <option value="">Select a task</option>
          {tasks.map((task) => (
            <option key={task.task_id} value={task.task_id}>
              {task.title}
            </option>
          ))}
        </select>
        {fieldErrors.task_id ? (
          <span className="task-assignment-manager__field-error">{fieldErrors.task_id}</span>
        ) : null}
      </label>

      {selectedTask ? (
        <div className="task-assignment-manager__task-meta">
          <span>Required Workers: {selectedTask.required_worker_count}</span>
          <span>
            Assigned: {selectedTask.active_assignment_count} / {selectedTask.required_worker_count}
          </span>
          <span>{selectedTask.is_approved ? "Approved Task" : "Awaiting Approval"}</span>
          {selectedTask.active_assignment_count < selectedTask.required_worker_count ? (
            <span className="task-assignment-manager__warning">
              {selectedTask.required_worker_count - selectedTask.active_assignment_count}{" "}
              additional worker
              {selectedTask.required_worker_count - selectedTask.active_assignment_count === 1
                ? ""
                : "s"}{" "}
              required.
            </span>
          ) : null}
        </div>
      ) : null}

      {selectedTask?.expected_work || selectedTask?.completion_requirement ? (
        <div className="task-assignment-manager__task-brief">
          {selectedTask.expected_work ? (
            <p>
              <strong>Expected work:</strong> {selectedTask.expected_work}
            </p>
          ) : null}
          {selectedTask.completion_requirement ? (
            <p>
              <strong>Completion:</strong> {selectedTask.completion_requirement}
            </p>
          ) : null}
        </div>
      ) : null}

      {selectedTask ? (
        <form
          className="task-assignment-manager__form"
          onSubmit={(event) => void handleSubmit(event)}
        >
          {errorMessage ? <div className="alert alert-danger mb-0">{errorMessage}</div> : null}

          <div className="task-assignment-manager__grid">
            <label className="task-assignment-manager__field">
              <span className="task-assignment-manager__label">Worker</span>
              <select
                className={`form-select admin-control${fieldErrors.worker_id ? " is-invalid" : ""}`}
                value={formState.worker_id}
                onChange={(event) => {
                  const value = event.target.value;
                  updateField("worker_id", value, {
                    fields: "worker_id",
                    overrides: { workerId: value },
                  });
                }}
                onBlur={() => touchAndValidate("worker_id", () => validateWith())}
              >
                <option value="">Select a worker</option>
                {availableWorkers.map((worker) => (
                  <option key={worker.user_id} value={worker.user_id}>
                    {worker.name} ({worker.email})
                  </option>
                ))}
              </select>
              {fieldErrors.worker_id ? (
                <span className="task-assignment-manager__field-error">
                  {fieldErrors.worker_id}
                </span>
              ) : null}
              {selectedTask && availableWorkers.length === 0 && !editingAssignment ? (
                <span className="task-assignment-manager__field-error">
                  All available workers are already assigned to this task.
                </span>
              ) : null}
            </label>

            <label className="task-assignment-manager__field task-assignment-manager__field--full">
              <span className="task-assignment-manager__label">Duty Instructions</span>
              <textarea
                className={`form-control${fieldErrors.duty_instructions ? " is-invalid" : ""}`}
                rows={2}
                value={formState.duty_instructions}
                onChange={(event) => {
                  const value = event.target.value;
                  updateField("duty_instructions", value, {
                    fields: "duty_instructions",
                    overrides: { dutyInstructions: value },
                  });
                }}
                onBlur={() => touchAndValidate("duty_instructions", () => validateWith())}
                placeholder="Duty instructions"
              />
              {fieldErrors.duty_instructions ? (
                <span className="task-assignment-manager__field-error">
                  {fieldErrors.duty_instructions}
                </span>
              ) : null}
            </label>
          </div>

          <label className="task-assignment-manager__checkbox">
            <input
              type="checkbox"
              checked={formState.is_active}
              onChange={(event) => updateField("is_active", event.target.checked)}
            />
            <span>Keep this assignment active</span>
          </label>

          <div className="task-assignment-manager__actions">
            {editingAssignment ? (
              <button
                type="button"
                className="btn task-assignment-manager__secondary-action"
                onClick={resetForm}
              >
                Cancel Edit
              </button>
            ) : null}
            <button
              type="submit"
              className="btn task-assignment-manager__primary-action"
              disabled={
                processingAssignmentId !== null ||
                !selectedTask.is_approved ||
                (availableWorkers.length === 0 && !editingAssignment)
              }
            >
              {processingAssignmentId !== null
                ? "Saving..."
                : editingAssignment
                  ? "Update Assignment"
                  : "Assign Worker"}
            </button>
          </div>
        </form>
      ) : null}

      {!selectedTask ? (
        <div className="task-assignment-manager__empty">
          Select a task to assign workers and manage duty instructions.
        </div>
      ) : selectedTask.active_assignments.length === 0 ? (
        <div className="task-assignment-manager__empty">
          No workers assigned.
        </div>
      ) : (
        <div className="task-assignment-manager__list">
          {selectedTask.active_assignments.map((assignment) => (
            <article key={assignment.assignment_id} className="task-assignment-manager__card">
              <div>
                <h3>{assignment.worker?.name ?? "Worker not available"}</h3>
                <p>{assignment.duty_instructions || "No instructions"}</p>
                <small>
                  Latest update:{" "}
                  {assignment.latest_update
                    ? `${assignment.latest_update.completion_percentage}% ${assignment.latest_update.status.replace(/_/g, " ")}`
                    : "No daily update yet"}
                </small>
              </div>
              <div className="task-assignment-manager__inline-actions">
                <button
                  type="button"
                  className="btn task-assignment-manager__text-action"
                  onClick={() => setEditingAssignment(assignment)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn task-assignment-manager__text-action task-assignment-manager__text-action--danger"
                  onClick={() => void handleDelete(assignment.assignment_id)}
                  disabled={processingAssignmentId === assignment.assignment_id}
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default TaskAssignmentManager;
