import { Link, Navigate, Route, Routes } from "react-router-dom";

import { BrandLogo } from "./components/branding/BrandLogo";
import { ROLE_NAMES } from "./types/auth";
import { AuthProvider } from "./context/AuthContext";
import LoginPage from "./pages/auth/LoginPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import AccessDeniedPage from "./pages/access/AccessDeniedPage";
import AdminLayout from "./layouts/admin/AdminLayout";
import UserWorkspaceLayout from "./layouts/user/UserWorkspaceLayout";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import AdminProjectsPage from "./pages/admin/AdminProjectsPage";
import ProfitLossDashboardPage from "./pages/finance/ProfitLossDashboardPage";
import AdminUserCreatePage from "./pages/admin/AdminUserCreatePage";
import AdminUserEditPage from "./pages/admin/AdminUserEditPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import ProjectDetailLayout from "./components/projects/ProjectDetailLayout";
import CreateDocumentPage from "./pages/projects/CreateDocumentPage";
import CreateExtensionPage from "./pages/projects/CreateExtensionPage";
import CreateMilestonePage from "./pages/projects/CreateMilestonePage";
import CreateTaskPage from "./pages/projects/CreateTaskPage";
import EditExtensionPage from "./pages/projects/EditExtensionPage";
import EditTaskPage from "./pages/projects/EditTaskPage";
import ProjectDocumentsPage from "./pages/projects/ProjectDocumentsPage";
import ProjectMilestoneDetailPage from "./pages/projects/ProjectMilestoneDetailPage";
import ProjectMilestonesPage from "./pages/projects/ProjectMilestonesPage";
import ProjectOverviewPage from "./pages/projects/ProjectOverviewPage";
import ViewExtensionPage from "./pages/projects/ViewExtensionPage";
import ViewTaskPage from "./pages/projects/ViewTaskPage";
import ClientProjectsPage from "./pages/client/ClientProjectsPage";
import LandingPage from "./pages/marketing/LandingPage";
import ProjectManagerDashboardPage from "./pages/projectManager/ProjectManagerDashboardPage";
import ProjectManagerPickerPage from "./pages/projectManager/ProjectManagerPickerPage";
import ProjectManagerProjectsPage from "./pages/projectManager/ProjectManagerProjectsPage";
import ProjectManagerWorkplaceNeedsPage from "./pages/projectManager/ProjectManagerWorkplaceNeedsPage";
import SiteEngineerDashboardPage from "./pages/siteEngineer/SiteEngineerDashboardPage";
import SiteEngineerProjectDetailPage from "./pages/siteEngineer/SiteEngineerProjectDetailPage";
import SiteEngineerProjectsPage from "./pages/siteEngineer/SiteEngineerProjectsPage";
import SiteEngineerTasksPage from "./pages/siteEngineer/SiteEngineerTasksPage";
import SiteEngineerVerificationsPage from "./pages/siteEngineer/SiteEngineerVerificationsPage";
import SupervisorDashboardPage from "./pages/supervisor/SupervisorDashboardPage";
import SupervisorVerificationsPage from "./pages/supervisor/SupervisorVerificationsPage";
import SupervisorProjectsPage from "./pages/supervisor/SupervisorProjectsPage";
import SupervisorAssignmentsPage from "./pages/supervisor/SupervisorAssignmentsPage";
import WorkerDashboardPage from "./pages/worker/WorkerDashboardPage";
import WorkerTasksPage from "./pages/worker/WorkerTasksPage";
import WorkerAttendancePage from "./pages/worker/WorkerAttendancePage";
import WorkerWorkplaceNeedsPage from "./pages/worker/WorkerWorkplaceNeedsPage";
import DashboardRedirect from "./routes/DashboardRedirect";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { RoleProtectedRoute } from "./routes/RoleProtectedRoute";

interface MessageScreenProps {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  actionTo: string;
}

const MessageScreen = ({
  eyebrow,
  title,
  description,
  actionLabel,
  actionTo,
}: MessageScreenProps) => {
  return (
    <main className="app-placeholder">
      <section className="app-placeholder__card">
        <BrandLogo theme="light" />
        <span className="app-placeholder__eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
        <Link className="app-placeholder__action" to={actionTo}>
          {actionLabel}
        </Link>
      </section>
    </main>
  );
};

const sessionCheckFallback = (
  <MessageScreen
    eyebrow="Session"
    title="Checking session"
    description="Validating your access."
    actionLabel="Return to Login"
    actionTo="/login"
  />
);

const roleGuardFallback = (
  <MessageScreen
    eyebrow="Access"
    title="Checking permissions"
    description="Verifying your role access."
    actionLabel="Return to Login"
    actionTo="/login"
  />
);

export const App = () => {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<LandingPage />} path="/" />
        <Route element={<LoginPage />} path="/login" />
        <Route element={<ForgotPasswordPage />} path="/forgot-password" />
        <Route element={<ResetPasswordPage />} path="/reset-password" />

        <Route element={<ProtectedRoute fallback={sessionCheckFallback} />}>
          <Route element={<DashboardRedirect />} path="/dashboard" />
          <Route element={<AccessDeniedPage />} path="/access-denied" />

          <Route
            element={
              <RoleProtectedRoute
                allowedRoles={[ROLE_NAMES.COMPANY_ADMINISTRATOR]}
                fallback={roleGuardFallback}
              />
            }
          >
            <Route element={<AdminLayout />} path="/admin">
              <Route element={<Navigate replace to="projects" />} index />
              <Route element={<AdminDashboardPage />} path="dashboard" />
              <Route element={<ProfitLossDashboardPage />} path="profit-loss" />
              <Route element={<ProfitLossDashboardPage />} path="profit-loss/:section" />
              <Route element={<AdminProjectsPage />} path="projects" />
              <Route
                element={<CreateMilestonePage />}
                path="projects/view/milestones/new"
              />
              <Route
                element={<CreateDocumentPage />}
                path="projects/view/documents/new"
              />
              <Route
                element={<CreateTaskPage />}
                path="projects/view/milestones/:milestoneId/tasks/new"
              />
              <Route
                element={<EditTaskPage />}
                path="projects/view/milestones/:milestoneId/tasks/:taskId/edit"
              />
              <Route
                element={<ViewTaskPage />}
                path="projects/view/milestones/:milestoneId/tasks/:taskId"
              />
              <Route
                element={<CreateExtensionPage />}
                path="projects/view/milestones/:milestoneId/extensions/new"
              />
              <Route
                element={<EditExtensionPage />}
                path="projects/view/milestones/:milestoneId/extensions/:extensionId/edit"
              />
              <Route
                element={<ViewExtensionPage />}
                path="projects/view/milestones/:milestoneId/extensions/:extensionId"
              />
              <Route element={<ProjectDetailLayout />} path="projects/view">
                <Route element={<Navigate replace to="overview" />} index />
                <Route element={<ProjectOverviewPage />} path="overview" />
                <Route element={<ProjectMilestonesPage />} path="milestones" />
                <Route
                  element={<ProjectMilestoneDetailPage />}
                  path="milestones/:milestoneId"
                />
                <Route element={<ProjectDocumentsPage />} path="documents" />
              </Route>
              <Route
                element={<Navigate replace to="/admin/dashboard" />}
                path="people/administrators"
              />
              <Route element={<AdminUsersPage />} path="people/:roleSlug" />
              <Route
                element={<Navigate replace to="/admin/people/project-managers" />}
                path="users"
              />
              <Route element={<AdminUserCreatePage />} path="users/create" />
              <Route element={<AdminUserEditPage />} path="users/:userId/edit" />
            </Route>
          </Route>

          <Route
            element={
              <RoleProtectedRoute
                allowedRoles={[ROLE_NAMES.PROJECT_MANAGER]}
                fallback={roleGuardFallback}
              />
            }
          >
            <Route element={<UserWorkspaceLayout />} path="/project-manager">
              <Route element={<Navigate replace to="dashboard" />} index />
              <Route element={<ProjectManagerDashboardPage />} path="dashboard" />
              <Route element={<ProjectManagerProjectsPage />} path="projects" />
              <Route element={<ProjectManagerPickerPage tab="milestones" />} path="milestones" />
              <Route element={<ProjectManagerPickerPage tab="documents" />} path="documents" />
              <Route element={<ProjectManagerWorkplaceNeedsPage />} path="workplace-needs" />
              <Route element={<ProfitLossDashboardPage />} path="profit-loss" />
              <Route element={<ProfitLossDashboardPage />} path="profit-loss/:section" />
              <Route
                element={<CreateMilestonePage />}
                path="projects/view/milestones/new"
              />
              <Route
                element={<CreateDocumentPage />}
                path="projects/view/documents/new"
              />
              <Route
                element={<CreateTaskPage />}
                path="projects/view/milestones/:milestoneId/tasks/new"
              />
              <Route
                element={<EditTaskPage />}
                path="projects/view/milestones/:milestoneId/tasks/:taskId/edit"
              />
              <Route
                element={<ViewTaskPage />}
                path="projects/view/milestones/:milestoneId/tasks/:taskId"
              />
              <Route
                element={<CreateExtensionPage />}
                path="projects/view/milestones/:milestoneId/extensions/new"
              />
              <Route
                element={<EditExtensionPage />}
                path="projects/view/milestones/:milestoneId/extensions/:extensionId/edit"
              />
              <Route
                element={<ViewExtensionPage />}
                path="projects/view/milestones/:milestoneId/extensions/:extensionId"
              />
              <Route element={<ProjectDetailLayout />} path="projects/view">
                <Route element={<Navigate replace to="overview" />} index />
                <Route element={<ProjectOverviewPage />} path="overview" />
                <Route element={<ProjectMilestonesPage />} path="milestones" />
                <Route
                  element={<ProjectMilestoneDetailPage />}
                  path="milestones/:milestoneId"
                />
                <Route element={<ProjectDocumentsPage />} path="documents" />
              </Route>
            </Route>
          </Route>

          <Route
            element={
              <RoleProtectedRoute
                allowedRoles={[ROLE_NAMES.SITE_ENGINEER]}
                fallback={roleGuardFallback}
              />
            }
          >
            <Route element={<UserWorkspaceLayout />} path="/site-engineer">
              <Route element={<Navigate replace to="dashboard" />} index />
              <Route element={<SiteEngineerDashboardPage />} path="dashboard" />
              <Route element={<SiteEngineerProjectsPage />} path="projects" />
              <Route element={<SiteEngineerProjectDetailPage />} path="projects/:projectId" />
              <Route element={<SiteEngineerTasksPage />} path="tasks" />
              <Route element={<SiteEngineerVerificationsPage />} path="verifications" />
            </Route>
          </Route>

          <Route
            element={
              <RoleProtectedRoute
                allowedRoles={[ROLE_NAMES.SUPERVISOR]}
                fallback={roleGuardFallback}
              />
            }
          >
            <Route element={<UserWorkspaceLayout />} path="/supervisor">
              <Route element={<Navigate replace to="dashboard" />} index />
              <Route element={<SupervisorDashboardPage />} path="dashboard" />
              <Route element={<SupervisorProjectsPage />} path="projects" />
              <Route element={<SupervisorAssignmentsPage />} path="assignments" />
              <Route element={<SupervisorAssignmentsPage />} path="assignments/:projectId" />
              <Route
                element={<SupervisorAssignmentsPage />}
                path="assignments/:projectId/assign"
              />
              <Route element={<Navigate replace to="verifications/tasks" />} path="verifications" />
              <Route element={<SupervisorVerificationsPage />} path="verifications/tasks" />
              <Route element={<SupervisorVerificationsPage />} path="verifications/needs" />
              <Route
                element={<Navigate replace to="/supervisor/verifications/needs" />}
                path="workplace-needs"
              />
            </Route>
          </Route>

          <Route
            element={
              <RoleProtectedRoute
                allowedRoles={[ROLE_NAMES.WORKER]}
                fallback={roleGuardFallback}
              />
            }
          >
            <Route element={<UserWorkspaceLayout />} path="/worker">
              <Route element={<Navigate replace to="dashboard" />} index />
              <Route element={<WorkerDashboardPage />} path="dashboard" />
              <Route element={<WorkerTasksPage />} path="tasks" />
              <Route element={<WorkerAttendancePage />} path="attendance" />
              <Route element={<WorkerWorkplaceNeedsPage />} path="workplace-needs" />
            </Route>
          </Route>

          <Route
            element={
              <RoleProtectedRoute
                allowedRoles={[ROLE_NAMES.CLIENT]}
                fallback={roleGuardFallback}
              />
            }
          >
            <Route element={<UserWorkspaceLayout />} path="/client">
              <Route element={<Navigate replace to="dashboard" />} index />
              <Route element={<ClientProjectsPage />} path="dashboard" />
              <Route element={<ClientProjectsPage />} path="projects" />
            </Route>
          </Route>
        </Route>

        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </AuthProvider>
  );
};

export default App;
