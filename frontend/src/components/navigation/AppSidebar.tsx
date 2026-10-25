import { NavLink, useLocation } from "react-router-dom";

import { getWorkspaceBrandTo, getWorkspaceNav } from "../../config/workspaceNav";
import { useAuth } from "../../hooks/useAuth";
import { BrandLogo } from "../branding/BrandLogo";
import { LogoutNavIcon, WorkspaceNavIconMark } from "./navIcons";

import "./AppSidebar.css";

type AppSidebarProps = {
  onLogout?: () => Promise<void> | void;
  isMobileOpen?: boolean;
  onNavigate?: () => void;
};

export const AppSidebar = ({ onLogout, isMobileOpen = false, onNavigate }: AppSidebarProps) => {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const roleName = user?.role.role_name;
  const sections = getWorkspaceNav(roleName);
  const brandTo = getWorkspaceBrandTo(roleName);
  const initials = (user?.name?.trim()?.charAt(0) || "U").toUpperCase();

  return (
    <aside
      className={`app-sidebar${isMobileOpen ? " app-sidebar--open" : ""}`.trim()}
      data-role={roleName ?? undefined}
    >
      <NavLink className="app-sidebar__brand" to={brandTo} onClick={onNavigate}>
        <BrandLogo theme="light" />
      </NavLink>

      <div className="app-sidebar__scroll">
        {sections.map((section) => (
          <div key={section.title} className="app-sidebar__section">
            <div className="app-sidebar__section-title">{section.title}</div>
            <nav className="app-sidebar__nav" aria-label={section.title}>
              {section.links.map((link) => {
                const childActive = link.children?.some((child) => child.matches(pathname)) ?? false;
                const isActive = childActive ? false : link.matches(pathname);
                const showChildren = Boolean(
                  link.children?.length && (link.matches(pathname) || childActive),
                );

                return (
                  <div key={link.to} className="app-sidebar__link-group">
                    <NavLink
                      className={`app-sidebar__link${isActive ? " app-sidebar__link--active" : ""}`.trim()}
                      to={link.to}
                      end={link.end}
                      aria-current={isActive ? "page" : undefined}
                      onClick={onNavigate}
                    >
                      <span className="app-sidebar__icon">
                        <WorkspaceNavIconMark name={link.icon} />
                      </span>
                      <span>{link.label}</span>
                    </NavLink>
                    {showChildren ? (
                      <div className="app-sidebar__subnav">
                        {link.children?.map((child) => {
                          const isChildActive = child.matches(pathname);
                          return (
                            <NavLink
                              key={child.to}
                              className={`app-sidebar__sublink${isChildActive ? " app-sidebar__sublink--active" : ""}`.trim()}
                              to={child.to}
                              aria-current={isChildActive ? "page" : undefined}
                              onClick={onNavigate}
                            >
                              {child.label}
                            </NavLink>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      <div className="app-sidebar__footer">
        <div className="app-sidebar__profile">
          <span className="app-sidebar__avatar" aria-hidden="true">
            {initials}
          </span>
          <span className="app-sidebar__profile-copy">
            <span className="app-sidebar__profile-name">{user?.name ?? "User"}</span>
            <span className="app-sidebar__profile-role">{roleName ?? "Workspace"}</span>
          </span>
        </div>

        {onLogout ? (
          <nav className="app-sidebar__footer-nav" aria-label="Account actions">
            <button
              type="button"
              className="app-sidebar__link app-sidebar__footer-link"
              onClick={() => void onLogout()}
            >
              <span className="app-sidebar__icon">
                <LogoutNavIcon />
              </span>
              <span>Logout</span>
            </button>
          </nav>
        ) : null}
      </div>
    </aside>
  );
};

export default AppSidebar;
