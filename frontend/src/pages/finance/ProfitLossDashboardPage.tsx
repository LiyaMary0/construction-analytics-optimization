import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";

import { StatCard, StatCardRow, StatIcons } from "../../components/ui/StatCard";
import { useOptionalAdminChrome } from "../../contexts/AdminChromeContext";
import {
  createMaterialExpense,
  createOtherExpense,
  deleteMaterialExpense,
  deleteOtherExpense,
  fetchProfitLossDashboard,
  listFinanceProjects,
  listWorkerWages,
  saveWorkerWage,
  updateMilestoneFinance,
} from "../../services/profitLossApi";
import type { ApiErrorResponse } from "../../types/auth";
import type {
  ProfitLossDashboardData,
  ProfitLossMilestoneRow,
  ProfitLossProjectOption,
  WorkerWageRow,
} from "../../types/profitLoss";
import { formatCurrencyINR } from "../../utils/formatCurrency";

import "./ProfitLossDashboard.css";

const OTHER_CATEGORIES = [
  { value: "equipment_rental", label: "Equipment rental" },
  { value: "transportation", label: "Transportation" },
  { value: "machinery", label: "Machinery charges" },
  { value: "subcontractor", label: "Subcontractor" },
  { value: "miscellaneous", label: "Miscellaneous" },
];

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const sumHoursWorked = (hours: Array<string | number | null | undefined>): string => {
  const total = hours.reduce<number>((sum, value) => {
    const amount = Number(value);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);
  return total.toFixed(2);
};

const readError = (error: unknown, fallback: string): string => {
  if (isAxiosError<ApiErrorResponse>(error)) {
    return error.response?.data?.message ?? fallback;
  }
  return fallback;
};

export const ProfitLossDashboardPage = () => {
  const chrome = useOptionalAdminChrome();
  const [projects, setProjects] = useState<ProfitLossProjectOption[]>([]);
  const [projectId, setProjectId] = useState<number | "">("");
  const [selectedMilestoneIds, setSelectedMilestoneIds] = useState<number[]>([]);
  const [data, setData] = useState<ProfitLossDashboardData | null>(null);
  const [wages, setWages] = useState<WorkerWageRow[]>([]);
  const [activeMilestoneId, setActiveMilestoneId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [contractValue, setContractValue] = useState("");
  const [plannedCost, setPlannedCost] = useState("");
  const [materialForm, setMaterialForm] = useState({
    material_name: "",
    quantity: "",
    unit: "bags",
    unit_cost: "",
    expense_date: todayIso(),
    invoice_reference: "",
    remarks: "",
  });
  const [otherForm, setOtherForm] = useState({
    category: "miscellaneous",
    title: "",
    amount: "",
    expense_date: todayIso(),
    remarks: "",
  });

  useEffect(() => {
    chrome?.setPageTitle("Profit & Loss");
    return () => chrome?.setPageTitle(null);
  }, [chrome]);

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const rows = await listFinanceProjects();
        setProjects(rows);
        if (rows[0]) {
          setProjectId(rows[0].project_id);
        }
      } catch (error) {
        setErrorMessage(readError(error, "Unable to load finance projects."));
      }
    };
    void loadProjects();
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!projectId) {
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const report = await fetchProfitLossDashboard(
        Number(projectId),
        selectedMilestoneIds.length > 0 ? selectedMilestoneIds : undefined,
      );
      const wageData = await listWorkerWages(Number(projectId));
      setData(report);
      setWages(wageData.results);
      setActiveMilestoneId((current) => {
        if (current && report.milestones.some((row) => row.milestone_id === current)) {
          return current;
        }
        return report.milestones[0]?.milestone_id ?? null;
      });
    } catch (error) {
      setErrorMessage(readError(error, "Unable to load profit and loss data."));
    } finally {
      setIsLoading(false);
    }
  }, [projectId, selectedMilestoneIds]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const activeMilestone: ProfitLossMilestoneRow | null = useMemo(() => {
    if (!data) {
      return null;
    }
    return data.milestones.find((row) => row.milestone_id === activeMilestoneId) ?? null;
  }, [activeMilestoneId, data]);

  useEffect(() => {
    if (!activeMilestone) {
      return;
    }
    setContractValue(activeMilestone.contract_value);
    setPlannedCost(activeMilestone.planned_cost);
  }, [activeMilestone]);

  const handleSaveFinance = async (event: FormEvent) => {
    event.preventDefault();
    if (!projectId || !activeMilestone) {
      return;
    }
    try {
      await updateMilestoneFinance(Number(projectId), activeMilestone.milestone_id, {
        contract_value: contractValue,
        planned_cost: plannedCost,
      });
      setNotice("Milestone financial values saved.");
      await loadDashboard();
    } catch (error) {
      setErrorMessage(readError(error, "Unable to save milestone values."));
    }
  };

  const handleAddMaterial = async (event: FormEvent) => {
    event.preventDefault();
    if (!projectId || !activeMilestone) {
      return;
    }
    try {
      await createMaterialExpense(Number(projectId), {
        milestone_id: activeMilestone.milestone_id,
        ...materialForm,
      });
      setMaterialForm({
        material_name: "",
        quantity: "",
        unit: "bags",
        unit_cost: "",
        expense_date: todayIso(),
        invoice_reference: "",
        remarks: "",
      });
      setNotice("Material expense recorded.");
      await loadDashboard();
    } catch (error) {
      setErrorMessage(readError(error, "Unable to record material expense."));
    }
  };

  const handleAddOther = async (event: FormEvent) => {
    event.preventDefault();
    if (!projectId) {
      return;
    }
    try {
      await createOtherExpense(Number(projectId), {
        ...otherForm,
        milestone_id: activeMilestone?.milestone_id ?? null,
      });
      setOtherForm({
        category: "miscellaneous",
        title: "",
        amount: "",
        expense_date: todayIso(),
        remarks: "",
      });
      setNotice("Other expense recorded.");
      await loadDashboard();
    } catch (error) {
      setErrorMessage(readError(error, "Unable to record other expense."));
    }
  };

  const handleSaveWage = async (worker: WorkerWageRow, dailyWage: string) => {
    if (!projectId) {
      return;
    }
    try {
      await saveWorkerWage(Number(projectId), {
        worker_id: worker.worker_id,
        daily_wage: dailyWage,
      });
      setNotice(`Wage saved for ${worker.worker_name}.`);
      await loadDashboard();
    } catch (error) {
      setErrorMessage(readError(error, "Unable to save wage rate."));
    }
  };

  const toggleMilestoneFilter = (milestoneId: number) => {
    setSelectedMilestoneIds((current) =>
      current.includes(milestoneId)
        ? current.filter((id) => id !== milestoneId)
        : [...current, milestoneId],
    );
  };

  const summary = data?.summary;
  const totalManHours = useMemo(() => {
    if (!data) {
      return "0.00";
    }
    return sumHoursWorked(
      data.milestones.flatMap((milestone) =>
        milestone.workers.map((worker) => worker.hours_worked),
      ),
    );
  }, [data]);

  return (
    <div className="pnl-page">
      <header className="pnl-page__header">
        <p className="pnl-page__lede">
          Labour uses verified attendance hours. Completion uses Supervisor and Site Engineer
          approved daily updates. Material and other costs are entered here until material
          management is available.
        </p>
      </header>

      {errorMessage ? <div className="pnl-page__alert pnl-page__alert--error">{errorMessage}</div> : null}
      {notice ? <div className="pnl-page__alert pnl-page__alert--ok">{notice}</div> : null}

      <section className="pnl-page__toolbar">
        <div className="pnl-page__field pnl-page__toolbar-project">
          <label htmlFor="pnl-project">Project</label>
          <select
            id="pnl-project"
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value ? Number(event.target.value) : "");
              setSelectedMilestoneIds([]);
            }}
          >
            <option value="">Select a project</option>
            {projects.map((project) => (
              <option key={project.project_id} value={project.project_id}>
                {project.project_name}
              </option>
            ))}
          </select>
        </div>
        <div className="pnl-page__actions">
          <button className="pnl-page__btn" type="button" onClick={() => setSelectedMilestoneIds([])}>
            Entire project
          </button>
          <button className="pnl-page__btn pnl-page__btn--secondary" type="button" onClick={() => window.print()}>
            Print / save report
          </button>
        </div>
      </section>

      {isLoading ? <p className="pnl-page__muted">Loading financial performance…</p> : null}

      {summary ? (
        <StatCardRow className="stat-card-row--kpis">
          <StatCard label="Contract value" icon={StatIcons.budget} value={formatCurrencyINR(summary.contract_value)} />
          <StatCard label="Actual cost" icon={StatIcons.budget} value={formatCurrencyINR(summary.actual_cost)} />
          <StatCard label="Profit" icon={StatIcons.budget} value={formatCurrencyINR(summary.profit)} />
          <StatCard label="Loss" icon={StatIcons.budget} value={formatCurrencyINR(summary.loss)} />
          <StatCard
            label="Margin"
            icon={StatIcons.budget}
            value={`${Number(summary.profit_margin_percent).toFixed(1)}%`}
          />
          <StatCard
            label="Man-hours"
            icon={StatIcons.clock}
            value={totalManHours}
            meta="From verified attendance used in labour cost"
          />
        </StatCardRow>
      ) : null}

      {data?.alerts.over_budget_milestones.length ? (
        <div className="pnl-page__alert pnl-page__alert--warn">
          Over budget: {data.alerts.over_budget_milestones.map((item) => item.title).join(", ")}
        </div>
      ) : null}
      {data?.alerts.behind_with_rising_spend.length ? (
        <div className="pnl-page__alert pnl-page__alert--warn">
          Behind plan with rising spend:{" "}
          {data.alerts.behind_with_rising_spend.map((item) => item.title).join(", ")}
        </div>
      ) : null}

      {data ? (
        <section className="pnl-page__table-wrap">
          <h3>Milestones</h3>
          <p className="pnl-page__muted">
            Tick milestones to report on a subset. Click a row for source calculations.
          </p>
          <div className="pnl-page__table-scroll">
            <table>
              <thead>
                <tr>
                  <th className="pnl-page__check">Report</th>
                  <th>Milestone</th>
                  <th className="pnl-page__num">Value</th>
                  <th className="pnl-page__num">Labour</th>
                  <th className="pnl-page__num">Man-hours</th>
                  <th className="pnl-page__num">Material</th>
                  <th className="pnl-page__num">Other</th>
                  <th className="pnl-page__num">Actual</th>
                  <th className="pnl-page__num">P/L</th>
                  <th>Verified %</th>
                </tr>
              </thead>
              <tbody>
                {data.milestones.map((row) => (
                  <tr
                    key={row.milestone_id}
                    className={row.milestone_id === activeMilestoneId ? "pnl-page__row--active" : ""}
                    onClick={() => setActiveMilestoneId(row.milestone_id)}
                  >
                    <td className="pnl-page__check">
                      <input
                        type="checkbox"
                        checked={selectedMilestoneIds.includes(row.milestone_id)}
                        onChange={() => toggleMilestoneFilter(row.milestone_id)}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </td>
                    <td>
                      <span className="pnl-page__milestone-name">
                        {row.title}
                        {row.over_budget ? <span className="pnl-page__flag">Over budget</span> : null}
                        {row.spend_rising_while_behind ? (
                          <span className="pnl-page__flag">Behind + spend</span>
                        ) : null}
                      </span>
                    </td>
                    <td className="pnl-page__num">{formatCurrencyINR(row.contract_value)}</td>
                    <td className="pnl-page__num">{formatCurrencyINR(row.labour_cost)}</td>
                    <td className="pnl-page__num">
                      {sumHoursWorked(row.workers.map((worker) => worker.hours_worked))}
                    </td>
                    <td className="pnl-page__num">{formatCurrencyINR(row.material_cost)}</td>
                    <td className="pnl-page__num">{formatCurrencyINR(row.other_expenses)}</td>
                    <td className="pnl-page__num">{formatCurrencyINR(row.actual_cost)}</td>
                    <td className="pnl-page__num">
                      {Number(row.result) >= 0
                        ? formatCurrencyINR(row.profit)
                        : `−${formatCurrencyINR(row.loss)}`}
                    </td>
                    <td>
                      {row.verified_completion_percent}% / plan {row.planned_completion_percent}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeMilestone ? (
        <div className="row g-4 pnl-page__details-row">
          <section className="col-xl-7">
            <div className="pnl-page__panel">
            <h3>{activeMilestone.title}</h3>
            <p className="pnl-page__muted">
              Original deadline {activeMilestone.original_deadline || "—"}. Current deadline{" "}
              {activeMilestone.current_deadline || "—"}. Extension {activeMilestone.extension_days}{" "}
              day(s).
            </p>
            <table className="pnl-page__breakdown">
              <tbody>
                <tr>
                  <td>Contract / allocated value</td>
                  <td>{formatCurrencyINR(activeMilestone.contract_value)}</td>
                </tr>
                <tr>
                  <td>Planned cost</td>
                  <td>{formatCurrencyINR(activeMilestone.planned_cost)}</td>
                </tr>
                <tr>
                  <td>Labour</td>
                  <td>{formatCurrencyINR(activeMilestone.labour_cost)}</td>
                </tr>
                <tr>
                  <td>Man-hours (attendance)</td>
                  <td>
                    {sumHoursWorked(
                      activeMilestone.workers.map((worker) => worker.hours_worked),
                    )}
                  </td>
                </tr>
                <tr>
                  <td>Material</td>
                  <td>{formatCurrencyINR(activeMilestone.material_cost)}</td>
                </tr>
                <tr>
                  <td>Other expenses</td>
                  <td>{formatCurrencyINR(activeMilestone.other_expenses)}</td>
                </tr>
                <tr className="pnl-page__total">
                  <td>Total actual cost</td>
                  <td>{formatCurrencyINR(activeMilestone.actual_cost)}</td>
                </tr>
                <tr>
                  <td>Cost variance</td>
                  <td>{formatCurrencyINR(activeMilestone.cost_variance)}</td>
                </tr>
                <tr className="pnl-page__total">
                  <td>Profit / Loss</td>
                  <td>
                    {formatCurrencyINR(activeMilestone.profit)} / {formatCurrencyINR(activeMilestone.loss)}
                  </td>
                </tr>
                <tr>
                  <td>Cost before extension labour</td>
                  <td>{formatCurrencyINR(activeMilestone.cost_before_extension)}</td>
                </tr>
                <tr>
                  <td>Additional labour from extension</td>
                  <td>{formatCurrencyINR(activeMilestone.extension_labour_cost)}</td>
                </tr>
              </tbody>
            </table>
            <details className="pnl-page__calcs-toggle">
              <summary>How these figures are calculated</summary>
              <ul className="pnl-page__calcs">
                {Object.values(activeMilestone.calculations).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>

            <form className="pnl-page__form" onSubmit={(event) => void handleSaveFinance(event)}>
              <div className="pnl-page__field">
                <label htmlFor="contract-value">Contract value</label>
                <input
                  id="contract-value"
                  value={contractValue}
                  onChange={(event) => setContractValue(event.target.value)}
                />
              </div>
              <div className="pnl-page__field">
                <label htmlFor="planned-cost">Planned cost</label>
                <input
                  id="planned-cost"
                  value={plannedCost}
                  onChange={(event) => setPlannedCost(event.target.value)}
                />
              </div>
              <div className="pnl-page__form-actions">
                <button className="pnl-page__btn" type="submit">Save milestone values</button>
              </div>
            </form>
            </div>
          </section>

          <section className="col-xl-5">
            <div className="pnl-page__panel">
            <div className="pnl-page__form-card">
            <h3>Add material cost</h3>
            <form className="pnl-page__form" onSubmit={(event) => void handleAddMaterial(event)}>
              <div className="pnl-page__field">
                <label>Material name</label>
                <input
                  value={materialForm.material_name}
                  onChange={(event) =>
                    setMaterialForm((current) => ({ ...current, material_name: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="pnl-page__field">
                <label>Quantity</label>
                <input
                  value={materialForm.quantity}
                  onChange={(event) =>
                    setMaterialForm((current) => ({ ...current, quantity: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="pnl-page__field">
                <label>Unit</label>
                <input
                  value={materialForm.unit}
                  onChange={(event) =>
                    setMaterialForm((current) => ({ ...current, unit: event.target.value }))
                  }
                />
              </div>
              <div className="pnl-page__field">
                <label>Unit cost</label>
                <input
                  value={materialForm.unit_cost}
                  onChange={(event) =>
                    setMaterialForm((current) => ({ ...current, unit_cost: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="pnl-page__field">
                <label>Date</label>
                <input
                  type="date"
                  value={materialForm.expense_date}
                  onChange={(event) =>
                    setMaterialForm((current) => ({ ...current, expense_date: event.target.value }))
                  }
                />
              </div>
              <div className="pnl-page__field">
                <label>Invoice / reference</label>
                <input
                  value={materialForm.invoice_reference}
                  onChange={(event) =>
                    setMaterialForm((current) => ({
                      ...current,
                      invoice_reference: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="pnl-page__form-actions">
                <button className="pnl-page__btn" type="submit">Add material</button>
              </div>
            </form>
            </div>

            <div className="pnl-page__form-card">
            <h3>Add other expense</h3>
            <form className="pnl-page__form" onSubmit={(event) => void handleAddOther(event)}>
              <div className="pnl-page__field">
                <label>Category</label>
                <select
                  value={otherForm.category}
                  onChange={(event) =>
                    setOtherForm((current) => ({ ...current, category: event.target.value }))
                  }
                >
                  {OTHER_CATEGORIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="pnl-page__field">
                <label>Title</label>
                <input
                  value={otherForm.title}
                  onChange={(event) =>
                    setOtherForm((current) => ({ ...current, title: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="pnl-page__field">
                <label>Amount</label>
                <input
                  value={otherForm.amount}
                  onChange={(event) =>
                    setOtherForm((current) => ({ ...current, amount: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="pnl-page__field">
                <label>Date</label>
                <input
                  type="date"
                  value={otherForm.expense_date}
                  onChange={(event) =>
                    setOtherForm((current) => ({ ...current, expense_date: event.target.value }))
                  }
                />
              </div>
              <div className="pnl-page__form-actions">
                <button className="pnl-page__btn" type="submit">Add expense</button>
              </div>
            </form>
            </div>
            </div>
          </section>
        </div>
      ) : null}

      {activeMilestone ? (
        <section className="pnl-page__table-wrap">
          <h3>Labour from attendance</h3>
          <div className="pnl-page__table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Worker</th>
                  <th className="pnl-page__num">Days</th>
                  <th className="pnl-page__num">Hours</th>
                  <th className="pnl-page__num">Rate</th>
                  <th className="pnl-page__num">Cost</th>
                </tr>
              </thead>
              <tbody>
                {activeMilestone.workers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="pnl-page__muted">
                      No clocked-out attendance linked to this milestone yet.
                    </td>
                  </tr>
                ) : (
                  activeMilestone.workers.map((worker) => (
                    <tr key={worker.worker_id}>
                      <td>
                        {worker.worker_name}
                        {worker.using_default_wage ? " (default wage)" : ""}
                      </td>
                      <td className="pnl-page__num">{worker.days_worked}</td>
                      <td className="pnl-page__num">{worker.hours_worked}</td>
                      <td className="pnl-page__num">{formatCurrencyINR(worker.hourly_rate)}/hr</td>
                      <td className="pnl-page__num">{formatCurrencyINR(worker.labour_cost)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeMilestone ? (
        <section className="pnl-page__table-wrap">
          <h3>Man-hour source</h3>
          <p className="pnl-page__muted">
            Clocked-out attendance already included in labour cost. Open shifts and clock-ins
            without a task are not billed.
          </p>
          <div className="pnl-page__table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Worker</th>
                  <th>Task</th>
                  <th className="pnl-page__num">Hours</th>
                  <th className="pnl-page__num">Rate</th>
                  <th className="pnl-page__num">Cost</th>
                </tr>
              </thead>
              <tbody>
                {activeMilestone.labour_source.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="pnl-page__muted">
                      No man-hour source rows for this milestone.
                    </td>
                  </tr>
                ) : (
                  activeMilestone.labour_source.map((entry, index) => (
                    <tr key={`${entry.date ?? "none"}-${entry.worker_name}-${index}`}>
                      <td>
                        {entry.date || "—"}
                        {entry.after_original_deadline ? " (after deadline)" : ""}
                      </td>
                      <td>
                        {entry.worker_name}
                        {entry.using_default_wage ? " (default wage)" : ""}
                      </td>
                      <td>{entry.task_title || "—"}</td>
                      <td className="pnl-page__num">{entry.hours}</td>
                      <td className="pnl-page__num">{formatCurrencyINR(entry.hourly_rate)}/hr</td>
                      <td className="pnl-page__num">{formatCurrencyINR(entry.cost)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeMilestone ? (
        <section className="pnl-page__table-wrap">
          <h3>Manual materials</h3>
          {activeMilestone.materials.length === 0 ? (
            <p className="pnl-page__empty">No material costs recorded for this milestone.</p>
          ) : (
            <div className="pnl-page__table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Material</th>
                    <th className="pnl-page__num">Qty</th>
                    <th className="pnl-page__num">Unit cost</th>
                    <th className="pnl-page__num">Total</th>
                    <th>Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {activeMilestone.materials.map((item) => (
                    <tr key={item.expense_id}>
                      <td>{item.material_name}</td>
                      <td className="pnl-page__num">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="pnl-page__num">{formatCurrencyINR(item.unit_cost)}</td>
                      <td className="pnl-page__num">{formatCurrencyINR(item.total_cost)}</td>
                      <td>{item.expense_date}</td>
                      <td>
                        {projectId ? (
                          <button
                            type="button"
                            className="pnl-page__ghost"
                            onClick={() =>
                              void deleteMaterialExpense(Number(projectId), item.expense_id).then(() =>
                                loadDashboard(),
                              )
                            }
                          >
                            Remove
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {wages.length > 0 ? (
        <section className="pnl-page__table-wrap">
          <h3>Worker wage rates</h3>
          <p className="pnl-page__muted">
            Default daily wage is {formatCurrencyINR(data?.default_daily_wage)} until a custom rate
            is saved. Labour cost = hours × (daily wage ÷ 8).
          </p>
          <div className="pnl-page__table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Daily wage</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {wages.map((worker) => (
                  <WageEditorRow key={worker.worker_id} worker={worker} onSave={handleSaveWage} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data?.unassigned_other_expenses.length ? (
        <section className="pnl-page__table-wrap">
          <h3>Project-level other expenses</h3>
          <table>
            <tbody>
              {data.unassigned_other_expenses.map((item) => (
                <tr key={item.expense_id}>
                  <td>{item.title}</td>
                  <td>{formatCurrencyINR(item.amount)}</td>
                  <td>
                    {projectId ? (
                      <button
                        type="button"
                        className="pnl-page__ghost"
                        onClick={() =>
                          void deleteOtherExpense(Number(projectId), item.expense_id).then(() =>
                            loadDashboard(),
                          )
                        }
                      >
                        Remove
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
};

const WageEditorRow = ({
  worker,
  onSave,
}: {
  worker: WorkerWageRow;
  onSave: (worker: WorkerWageRow, dailyWage: string) => Promise<void>;
}) => {
  const [dailyWage, setDailyWage] = useState(worker.daily_wage);
  return (
    <tr className="pnl-page__wage-row">
      <td>
        {worker.worker_name}
        {worker.using_default_wage ? " (default)" : ""}
      </td>
      <td>
        <input value={dailyWage} onChange={(event) => setDailyWage(event.target.value)} />
      </td>
      <td>
        <button className="pnl-page__btn" type="button" onClick={() => void onSave(worker, dailyWage)}>
          Save
        </button>
      </td>
    </tr>
  );
};

export default ProfitLossDashboardPage;
