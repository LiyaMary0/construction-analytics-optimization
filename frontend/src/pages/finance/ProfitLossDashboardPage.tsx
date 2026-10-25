import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { useParams } from "react-router-dom";

import { DetailModal } from "../../components/ui/DetailModal";
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
import { formatDisplayTitle } from "../../utils/formatDisplayTitle";

import "../../components/projects/ProjectEntityModal.css";
import "./ProfitLossDashboard.css";

const OTHER_CATEGORIES = [
  { value: "equipment_rental", label: "Equipment rental" },
  { value: "transportation", label: "Transportation" },
  { value: "machinery", label: "Machinery charges" },
  { value: "subcontractor", label: "Subcontractor" },
  { value: "miscellaneous", label: "Miscellaneous" },
];

type SideTab = "values" | "materials" | "expenses" | "labour" | "wages";
type ModalKind = "values" | "materials" | "expenses" | null;

const SECTION_TABS: Record<string, SideTab> = {
  values: "values",
  materials: "materials",
  expenses: "expenses",
  labour: "labour",
  wages: "wages",
};

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

const emptyMaterialForm = () => ({
  material_name: "",
  quantity: "",
  unit: "bags",
  unit_cost: "",
  expense_date: todayIso(),
  invoice_reference: "",
  remarks: "",
});

const emptyOtherForm = () => ({
  category: "miscellaneous",
  title: "",
  amount: "",
  expense_date: todayIso(),
  remarks: "",
});

export const ProfitLossDashboardPage = () => {
  const chrome = useOptionalAdminChrome();
  const { section } = useParams();
  const sideTab: SideTab | null = section && SECTION_TABS[section] ? SECTION_TABS[section] : null;
  const [projects, setProjects] = useState<ProfitLossProjectOption[]>([]);
  const [projectId, setProjectId] = useState<number | "">("");
  const [selectedMilestoneIds, setSelectedMilestoneIds] = useState<number[]>([]);
  const [data, setData] = useState<ProfitLossDashboardData | null>(null);
  const [wages, setWages] = useState<WorkerWageRow[]>([]);
  const [activeMilestoneId, setActiveMilestoneId] = useState<number | null>(null);
  const [openModal, setOpenModal] = useState<ModalKind>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [contractValue, setContractValue] = useState("");
  const [plannedCost, setPlannedCost] = useState("");
  const [materialForm, setMaterialForm] = useState(emptyMaterialForm);
  const [otherForm, setOtherForm] = useState(emptyOtherForm);

  useEffect(() => {
    const titles: Record<SideTab, string> = {
      values: "Milestone values",
      materials: "Materials",
      expenses: "Expenses",
      labour: "Labour",
      wages: "Wage rates",
    };
    chrome?.setPageTitle(sideTab ? titles[sideTab] : "Profit & Loss");
    return () => chrome?.setPageTitle(null);
  }, [chrome, sideTab]);

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

  const closeModal = () => setOpenModal(null);

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
      closeModal();
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
      setMaterialForm(emptyMaterialForm());
      setNotice("Material expense recorded.");
      closeModal();
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
      setOtherForm(emptyOtherForm());
      setNotice("Other expense recorded.");
      closeModal();
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

  const expenseRows = [
    ...(activeMilestone?.other_expense_rows ?? []),
    ...(data?.unassigned_other_expenses ?? []),
  ];

  const milestoneTitle = activeMilestone
    ? formatDisplayTitle(activeMilestone.title) || activeMilestone.title
    : "Select a milestone";

  const sideMeta: Record<SideTab, { title: string; action?: string; modal?: ModalKind }> = {
    values: { title: "Milestone values", action: "Set values", modal: "values" },
    materials: { title: "Materials", action: "Add material", modal: "materials" },
    expenses: { title: "Expenses", action: "Add expense", modal: "expenses" },
    labour: { title: "Labour" },
    wages: { title: "Wage rates" },
  };

  const projectSelect = (
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
            {formatDisplayTitle(project.project_name) || project.project_name}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="pnl-page">
      {errorMessage ? <div className="pnl-page__alert pnl-page__alert--error">{errorMessage}</div> : null}
      {notice ? <div className="pnl-page__alert pnl-page__alert--ok">{notice}</div> : null}

      {!sideTab ? (
        <>
          <p className="pnl-page__lede">
            Labour uses verified attendance hours. Material and other costs are recorded against the
            selected milestone.
          </p>

          <section className="pnl-page__toolbar">
            {projectSelect}
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
            <StatCardRow className="stat-card-row--kpis pnl-page__kpis">
              <StatCard label="Contract value" icon={StatIcons.budget} value={formatCurrencyINR(summary.contract_value)} />
              <StatCard label="Actual cost" icon={StatIcons.budget} value={formatCurrencyINR(summary.actual_cost)} />
              <StatCard label="Profit" icon={StatIcons.budget} value={formatCurrencyINR(summary.profit)} />
              <StatCard label="Loss" icon={StatIcons.budget} value={formatCurrencyINR(summary.loss)} />
              <StatCard
                label="Margin"
                icon={StatIcons.budget}
                value={`${Number(summary.profit_margin_percent).toFixed(1)}%`}
              />
              <StatCard label="Man-hours" icon={StatIcons.clock} value={totalManHours} />
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
              <p className="pnl-page__muted">Tick milestones to report on a subset.</p>
              <div className="pnl-page__table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th className="pnl-page__check">Report</th>
                      <th>Milestone</th>
                      <th className="pnl-page__num">Value</th>
                      <th className="pnl-page__num">Labour</th>
                      <th className="pnl-page__num">Material</th>
                      <th className="pnl-page__num">Other</th>
                      <th className="pnl-page__num">Actual</th>
                      <th className="pnl-page__num">P/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.milestones.map((row) => (
                      <tr key={row.milestone_id}>
                        <td className="pnl-page__check">
                          <input
                            type="checkbox"
                            checked={selectedMilestoneIds.includes(row.milestone_id)}
                            onChange={() => toggleMilestoneFilter(row.milestone_id)}
                          />
                        </td>
                        <td>
                          <span className="pnl-page__milestone-name">
                            {formatDisplayTitle(row.title) || row.title}
                            {row.over_budget ? <span className="pnl-page__flag">Over budget</span> : null}
                            {row.spend_rising_while_behind ? (
                              <span className="pnl-page__flag">Behind + spend</span>
                            ) : null}
                          </span>
                        </td>
                        <td className="pnl-page__num">{formatCurrencyINR(row.contract_value)}</td>
                        <td className="pnl-page__num">{formatCurrencyINR(row.labour_cost)}</td>
                        <td className="pnl-page__num">{formatCurrencyINR(row.material_cost)}</td>
                        <td className="pnl-page__num">{formatCurrencyINR(row.other_expenses)}</td>
                        <td className="pnl-page__num">{formatCurrencyINR(row.actual_cost)}</td>
                        <td className="pnl-page__num">
                          {Number(row.result) >= 0
                            ? formatCurrencyINR(row.profit)
                            : `−${formatCurrencyINR(row.loss)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <>
          <header className="pnl-page__header">
            <h1 className="pnl-page__title">{sideMeta[sideTab].title}</h1>
            <p className="pnl-page__lede">
              {sideTab === "wages"
                ? "Set daily wage rates used in labour cost."
                : "Choose a project and milestone to review this section."}
            </p>
          </header>

          <section className="pnl-page__toolbar">
            {projectSelect}
            {sideTab !== "wages" ? (
              <div className="pnl-page__field pnl-page__toolbar-project">
                <label htmlFor="pnl-milestone">Milestone</label>
                <select
                  id="pnl-milestone"
                  value={activeMilestoneId ?? ""}
                  onChange={(event) =>
                    setActiveMilestoneId(event.target.value ? Number(event.target.value) : null)
                  }
                >
                  <option value="">Select a milestone</option>
                  {data?.milestones.map((row) => (
                    <option key={row.milestone_id} value={row.milestone_id}>
                      {formatDisplayTitle(row.title) || row.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="pnl-page__actions">
              {sideMeta[sideTab].action && activeMilestone ? (
                <button
                  type="button"
                  className="pnl-page__btn"
                  onClick={() => setOpenModal(sideMeta[sideTab].modal ?? null)}
                >
                  {sideMeta[sideTab].action}
                </button>
              ) : null}
            </div>
          </section>

          {isLoading ? <p className="pnl-page__muted">Loading financial performance…</p> : null}

          <section className="pnl-page__table-wrap pnl-page__section">
              {!activeMilestone && sideTab !== "wages" ? (
                <p className="pnl-page__empty">Select a milestone to view this page.</p>
              ) : null}

              {sideTab === "values" && activeMilestone ? (
                <dl className="pnl-page__facts">
                  <div>
                    <dt>Contract / allocated value</dt>
                    <dd>{formatCurrencyINR(activeMilestone.contract_value)}</dd>
                  </div>
                  <div>
                    <dt>Planned cost</dt>
                    <dd>{formatCurrencyINR(activeMilestone.planned_cost)}</dd>
                  </div>
                  <div>
                    <dt>Labour</dt>
                    <dd>{formatCurrencyINR(activeMilestone.labour_cost)}</dd>
                  </div>
                  <div>
                    <dt>Man-hours</dt>
                    <dd>
                      {sumHoursWorked(activeMilestone.workers.map((worker) => worker.hours_worked))}
                    </dd>
                  </div>
                  <div>
                    <dt>Material</dt>
                    <dd>{formatCurrencyINR(activeMilestone.material_cost)}</dd>
                  </div>
                  <div>
                    <dt>Other expenses</dt>
                    <dd>{formatCurrencyINR(activeMilestone.other_expenses)}</dd>
                  </div>
                  <div className="pnl-page__facts-row--total">
                    <dt>Total actual cost</dt>
                    <dd>{formatCurrencyINR(activeMilestone.actual_cost)}</dd>
                  </div>
                  <div>
                    <dt>Cost variance</dt>
                    <dd>{formatCurrencyINR(activeMilestone.cost_variance)}</dd>
                  </div>
                  <div className="pnl-page__facts-row--total">
                    <dt>Profit / Loss</dt>
                    <dd>
                      {formatCurrencyINR(activeMilestone.profit)} /{" "}
                      {formatCurrencyINR(activeMilestone.loss)}
                    </dd>
                  </div>
                </dl>
              ) : null}

              {sideTab === "materials" && activeMilestone ? (
                activeMilestone.materials.length === 0 ? (
                  <p className="pnl-page__empty">No material costs recorded for this milestone.</p>
                ) : (
                  <div className="pnl-page__table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Material</th>
                          <th className="pnl-page__num">Qty</th>
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
                            <td className="pnl-page__num">{formatCurrencyINR(item.total_cost)}</td>
                            <td>{item.expense_date}</td>
                            <td>
                              {projectId ? (
                                <button
                                  type="button"
                                  className="pnl-page__ghost"
                                  onClick={() =>
                                    void deleteMaterialExpense(Number(projectId), item.expense_id).then(
                                      () => loadDashboard(),
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
                )
              ) : null}

              {sideTab === "expenses" && activeMilestone ? (
                expenseRows.length === 0 ? (
                  <p className="pnl-page__empty">No expenses recorded for this milestone.</p>
                ) : (
                  <div className="pnl-page__table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Expense</th>
                          <th>Category</th>
                          <th className="pnl-page__num">Amount</th>
                          <th>Date</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenseRows.map((item) => (
                          <tr key={`${item.expense_id}-${item.milestone_id ?? "project"}`}>
                            <td>{item.title}</td>
                            <td>{item.category_label}</td>
                            <td className="pnl-page__num">{formatCurrencyINR(item.amount)}</td>
                            <td>{item.expense_date}</td>
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
                  </div>
                )
              ) : null}

              {sideTab === "labour" && activeMilestone ? (
                <div className="pnl-page__side-stack">
                  <div className="pnl-page__table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Worker</th>
                          <th className="pnl-page__num">Days</th>
                          <th className="pnl-page__num">Hours</th>
                          <th className="pnl-page__num">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeMilestone.workers.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="pnl-page__muted">
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
                              <td className="pnl-page__num">{formatCurrencyINR(worker.labour_cost)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {sideTab === "wages" ? (
                wages.length === 0 ? (
                  <p className="pnl-page__empty">No worker wage rates for this project.</p>
                ) : (
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
                )
              ) : null}
          </section>
        </>
      )}

      <DetailModal
        className="project-entity-modal project-entity-modal--form"
        isOpen={openModal === "values"}
        title="Set milestone values"
        description={activeMilestone ? milestoneTitle : null}
        onClose={closeModal}
        size="sm"
      >
        <form className="project-entity-modal__form" onSubmit={(event) => void handleSaveFinance(event)}>
          <label className="project-entity-modal__field">
            <span className="project-entity-modal__label">Contract value</span>
            <input
              className="form-control"
              value={contractValue}
              onChange={(event) => setContractValue(event.target.value)}
            />
          </label>
          <label className="project-entity-modal__field">
            <span className="project-entity-modal__label">Planned cost</span>
            <input
              className="form-control"
              value={plannedCost}
              onChange={(event) => setPlannedCost(event.target.value)}
            />
          </label>
          <div className="project-entity-modal__actions">
            <button className="pnl-page__btn pnl-page__btn--secondary" type="button" onClick={closeModal}>
              Cancel
            </button>
            <button className="pnl-page__btn" type="submit">
              Save values
            </button>
          </div>
        </form>
      </DetailModal>

      <DetailModal
        className="project-entity-modal project-entity-modal--form"
        isOpen={openModal === "materials"}
        title="Add material"
        description={activeMilestone ? milestoneTitle : null}
        onClose={closeModal}
        size="sm"
      >
        <form className="project-entity-modal__form" onSubmit={(event) => void handleAddMaterial(event)}>
          <label className="project-entity-modal__field">
            <span className="project-entity-modal__label">Material name</span>
            <input
              className="form-control"
              value={materialForm.material_name}
              onChange={(event) =>
                setMaterialForm((current) => ({ ...current, material_name: event.target.value }))
              }
              required
            />
          </label>
          <div className="project-entity-modal__row">
            <label className="project-entity-modal__field">
              <span className="project-entity-modal__label">Quantity</span>
              <input
                className="form-control"
                value={materialForm.quantity}
                onChange={(event) =>
                  setMaterialForm((current) => ({ ...current, quantity: event.target.value }))
                }
                required
              />
            </label>
            <label className="project-entity-modal__field">
              <span className="project-entity-modal__label">Unit</span>
              <input
                className="form-control"
                value={materialForm.unit}
                onChange={(event) =>
                  setMaterialForm((current) => ({ ...current, unit: event.target.value }))
                }
              />
            </label>
          </div>
          <div className="project-entity-modal__row">
            <label className="project-entity-modal__field">
              <span className="project-entity-modal__label">Unit cost</span>
              <input
                className="form-control"
                value={materialForm.unit_cost}
                onChange={(event) =>
                  setMaterialForm((current) => ({ ...current, unit_cost: event.target.value }))
                }
                required
              />
            </label>
            <label className="project-entity-modal__field">
              <span className="project-entity-modal__label">Date</span>
              <input
                className="form-control"
                type="date"
                value={materialForm.expense_date}
                onChange={(event) =>
                  setMaterialForm((current) => ({ ...current, expense_date: event.target.value }))
                }
              />
            </label>
          </div>
          <label className="project-entity-modal__field">
            <span className="project-entity-modal__label">
              Invoice / reference <span className="project-entity-modal__optional">(optional)</span>
            </span>
            <input
              className="form-control"
              value={materialForm.invoice_reference}
              onChange={(event) =>
                setMaterialForm((current) => ({ ...current, invoice_reference: event.target.value }))
              }
            />
          </label>
          <div className="project-entity-modal__actions">
            <button className="pnl-page__btn pnl-page__btn--secondary" type="button" onClick={closeModal}>
              Cancel
            </button>
            <button className="pnl-page__btn" type="submit">
              Add material
            </button>
          </div>
        </form>
      </DetailModal>

      <DetailModal
        className="project-entity-modal project-entity-modal--form"
        isOpen={openModal === "expenses"}
        title="Add expense"
        description={activeMilestone ? milestoneTitle : null}
        onClose={closeModal}
        size="sm"
      >
        <form className="project-entity-modal__form" onSubmit={(event) => void handleAddOther(event)}>
          <label className="project-entity-modal__field">
            <span className="project-entity-modal__label">Category</span>
            <select
              className="form-select"
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
          </label>
          <label className="project-entity-modal__field">
            <span className="project-entity-modal__label">Title</span>
            <input
              className="form-control"
              value={otherForm.title}
              onChange={(event) => setOtherForm((current) => ({ ...current, title: event.target.value }))}
              required
            />
          </label>
          <div className="project-entity-modal__row">
            <label className="project-entity-modal__field">
              <span className="project-entity-modal__label">Amount</span>
              <input
                className="form-control"
                value={otherForm.amount}
                onChange={(event) =>
                  setOtherForm((current) => ({ ...current, amount: event.target.value }))
                }
                required
              />
            </label>
            <label className="project-entity-modal__field">
              <span className="project-entity-modal__label">Date</span>
              <input
                className="form-control"
                type="date"
                value={otherForm.expense_date}
                onChange={(event) =>
                  setOtherForm((current) => ({ ...current, expense_date: event.target.value }))
                }
              />
            </label>
          </div>
          <div className="project-entity-modal__actions">
            <button className="pnl-page__btn pnl-page__btn--secondary" type="button" onClick={closeModal}>
              Cancel
            </button>
            <button className="pnl-page__btn" type="submit">
              Add expense
            </button>
          </div>
        </form>
      </DetailModal>
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
