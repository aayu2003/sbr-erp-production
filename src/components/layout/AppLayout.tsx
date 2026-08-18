import { useState, useEffect } from "react";
import {
  Users, UserCheck, Sprout, Calendar, UserPlus, Fuel,
  ChevronLeft, ChevronRight, ChevronDown,
  Layers, Box, FileText, Map, AlertCircle, User,
  ClipboardCheck, Activity, FolderKanban, Landmark,
  Link2, LayoutDashboard, BookOpen, CreditCard, Receipt,
  Car, Mail, Package, Scale, Truck, CheckSquare, PieChart,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import modulesConfig from "@/config/modules.json";

// Map JSON icon name strings → Lucide components
const ICON_MAP: Record<string, React.ElementType> = {
  Users, UserCheck, Sprout, Calendar, UserPlus, Fuel,
  Layers, Box, FileText, Map, AlertCircle, User,
  ClipboardCheck, Activity, FolderKanban, Landmark,
  Link2, LayoutDashboard, BookOpen, CreditCard, Receipt,
  Car, Mail, Package, Scale, Truck, CheckSquare, PieChart, ShieldCheck, Settings,
};

/* ---------------- NAV ITEM COMPONENT ---------------- */

interface NavItemProps {
  to: string;
  icon: React.ElementType;
  label: string;
  notificationStatus?: "warning" | "success" | "none";
  isSidebarCollapsed: boolean;
  budgetCard?: boolean;
  notificationCount?: number;
}

const NavItem = ({
  to,
  icon: Icon,
  label,
  notificationStatus = "none",
  isSidebarCollapsed,
  budgetCard = false,
  notificationCount = 0,
}: NavItemProps) => {
  return (
    <NavLink
      to={to}
      title={isSidebarCollapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group text-sm relative",
          budgetCard && "rounded-xl border border-white/10 bg-white/5 px-3 py-3 shadow-sm hover:border-white/20 hover:bg-white/10",
          isActive
            ? budgetCard
              ? "border-white/20 bg-white/10 text-white font-semibold"
              : "bg-white/15 text-white font-semibold"
            : "text-white/60 hover:bg-white/10 hover:text-white font-medium",
          isSidebarCollapsed && "justify-center px-2"
        )
      }
      end
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              "shrink-0 transition-transform group-hover:scale-105",
              isSidebarCollapsed ? "w-6 h-6" : budgetCard ? "w-5 h-5" : "w-5 h-5",
              isActive
                ? "text-white"
                : "text-white/40 group-hover:text-white"
            )}
          />

          {!isSidebarCollapsed && <span className="truncate">{label}</span>}
          {!isSidebarCollapsed && <span className="ml-auto" />}

          {/* Updated notification logic to render AlertCircle icon for warnings */}
          {notificationCount > 0 ? (
            <span
              className={cn(
                "flex min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-slate-900",
                isSidebarCollapsed && "absolute right-1 top-1 h-4 min-w-4 px-1"
              )}
            >
              {notificationCount > 99 ? "99+" : notificationCount}
            </span>
          ) : notificationStatus === "warning" ? (
            <AlertCircle
              className={cn(
                "text-orange-500 fill-orange-50 shrink-0",
                isSidebarCollapsed
                  ? "absolute top-1 right-1 w-3 h-3"
                  : "w-4 h-4"
              )}
            />
          ) : notificationStatus === "success" ? (
            <span
              className={cn(
                "w-2 h-2 rounded-full bg-green-500 ring-1 ring-[var(--brand-primary)] shrink-0",
                isSidebarCollapsed
                  ? "absolute top-2 right-2"
                  : ""
              )}
            />
          ) : null}
        </>
      )}
    </NavLink>
  );
};

/* ---------------- NAV GROUP COMPONENT ---------------- */

interface NavGroupProps {
  label?: string;
  count?: number;
  renderHeader?: (isOpen: boolean, toggle: () => void) => React.ReactNode;
  children: React.ReactNode;
  isSidebarCollapsed: boolean;
}

const NavGroup = ({
  label,
  count,
  renderHeader,
  children,
  isSidebarCollapsed,
}: NavGroupProps) => {
  const [isOpen, setIsOpen] = useState(false);

  if (isSidebarCollapsed) {
    return (
      <div className="space-y-1 py-1 border-t border-white/10 first:border-0">
        {children}
      </div>
    );
  }

  return (
    <div className="space-y-1 py-1">
      {renderHeader ? (
        renderHeader(isOpen, () => setIsOpen(!isOpen))
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-bold text-white/50 uppercase tracking-[0.08em] hover:text-white"
        >
          <span className="flex items-center gap-1.5">
            {label}
            {typeof count === 'number' && (
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold normal-case tracking-normal text-white/70">
                {count}
              </span>
            )}
          </span>
          <ChevronDown
            className={cn(
              "w-3 h-3 transition-transform",
              isOpen && "rotate-180"
            )}
          />
        </button>
      )}

      <div
        className={cn(
          "space-y-1 px-1 overflow-hidden transition-all duration-300 ease-in-out",
          isOpen
            ? "max-h-[2000px] opacity-100"
            : "max-h-0 opacity-0"
        )}
      >
        {children}
      </div>
    </div>
  );
};

/* ---------------- MAIN SIDEBAR COMPONENT ---------------- */

const AppSidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mailUnread, setMailUnread] = useState(0);
  const { user } = useAuth();
  const isSuperAdmin = user?.id === 'sbr-admin';

  useEffect(() => {
    document.title = "SBR | Farm-connect";
  }, []);

  useEffect(() => {
    const updateMailUnread = () => {
      try {
        const raw = localStorage.getItem('erp_communication_messages_v1');
        if (!raw) return setMailUnread(2);
        const items: Array<{ direction?: string; read?: boolean; archived?: boolean; type?: string }> = JSON.parse(raw);
        setMailUnread(items.filter(message =>
          message.direction === 'received' && !message.read && !message.archived && message.type !== 'Announcement'
        ).length);
      } catch {
        setMailUnread(0);
      }
    };
    updateMailUnread();
    window.addEventListener('storage', updateMailUnread);
    window.addEventListener('erp-mail-updated', updateMailUnread);
    return () => {
      window.removeEventListener('storage', updateMailUnread);
      window.removeEventListener('erp-mail-updated', updateMailUnread);
    };
  }, []);

  return (
    <aside
      className={cn(
        "sticky top-0 h-screen bg-[var(--brand-primary)] flex flex-col border-r border-[var(--brand-primary-hover)] transition-all z-50",
        isCollapsed ? "w-[80px]" : "w-72"
      )}
    >
      {/* Header with Logo */}
      <div
        className={cn(
          "h-16 shrink-0 border-b border-white/10 bg-[var(--brand-primary)] px-4",
          isCollapsed ? "flex items-center justify-center" : "flex items-center justify-between gap-2"
        )}
      >
        <div className={cn("flex gap-3 items-center", isCollapsed ? "" : "min-w-0 flex-1")}>
          {/* Logo Container */}
          <div className="h-11 w-11 rounded-2xl bg-white/95 flex items-center justify-center shadow-[0_8px_24px_rgba(15,23,42,0.09)] border border-white/10 overflow-hidden relative ring-1 ring-white/20">
            <img
              src="/3f-logo.png" 
              alt="Logo"
              className="w-full h-full object-contain p-1"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                if(e.currentTarget.parentElement) {
                    const fallbackSpan = document.createElement('span');
                    fallbackSpan.innerText = 'FC';
                    fallbackSpan.className = 'text-green-700 font-bold text-sm';
                    e.currentTarget.parentElement.appendChild(fallbackSpan);
                }
              }}
            />
          </div>

          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-semibold text-[16px] tracking-[-0.01em] text-white leading-none">
                SAI BIORESOURCES
              </h1>
              <p className="mt-0.5 truncate text-[12px] text-white/60 font-medium leading-tight">
                Private Limited
              </p>

            </div>
          )}
        </div>

        {/* Collapse Button */}
        {!isCollapsed && (
          <button
            onClick={() => setIsCollapsed(true)}
            className="mt-0.5 shrink-0 p-1.5 rounded-md text-white/50 hover:bg-white/10 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Expand Button */}
      {isCollapsed && (
        <div className="flex justify-center py-3 border-b border-white/10">
          <button
            onClick={() => setIsCollapsed(false)}
            className="p-1.5 rounded-md text-white/50 hover:bg-white/10 hover:text-white transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Navigation Links — fully driven by src/config/modules.json */}
      <nav className="min-h-0 flex-1 p-3 space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
        {modulesConfig.supersets.filter(s => isSuperAdmin || s.enabled).map(superset => {
          const allowedModules = user?.module_access ?? [];

          // Pre-compute which groups have at least one accessible item
          const visibleGroups = superset.groups
            .filter(g => isSuperAdmin || g.enabled)
            .map(g => ({
              ...g,
              visibleItems: g.items.filter(item =>
                item.enabled && (
                  isSuperAdmin ||
                  allowedModules.includes(item.key) ||
                  item.key === 'communication' ||
                  (item.key === 'purchase-comparative' && allowedModules.includes('purchase-req')) ||
                  (item.key === 'work-comparative' && (allowedModules.includes('work-order') || allowedModules.includes('purchase-req'))) ||
                  (item.key === 'work-requisition-approver' && (allowedModules.includes('work-order') || allowedModules.includes('finance-admin-ops'))) ||
                  (['wo-creation', 'work-verifier', 'work-approver', 'work-flow'].includes(item.key) && allowedModules.includes('work-order')) ||
                  (item.key === 'purchase-verifier' && ['admin-ops-indents', 'admin-wcc-approval', 'admin-grn-approval', 'admin-inspection-approval'].some(key => allowedModules.includes(key))) ||
                  (item.key === 'inspection-report' && allowedModules.includes('grn-module')) ||
                  (item.key === 'admin-inspection-approval' && (allowedModules.includes('admin-grn-approval') || allowedModules.includes('admin-ops-indents'))) ||
                  (item.key === 'finance-inspection-approval' && allowedModules.includes('finance-admin-ops')) ||
                  (item.key.startsWith('finance-') && ['accounts-dashboard', 'accounts-ledger', 'accounts-payments', 'budget'].some(key => allowedModules.includes(key)))
                )
              ),
            }))
            .filter(g => g.visibleItems.length > 0);

          // Hide the entire superset if nothing is accessible
          if (visibleGroups.length === 0) return null;

          const SupersetIcon = ICON_MAP[superset.icon] ?? FileText;

          const renderItems = (items: typeof visibleGroups[number]['visibleItems']) =>
            items.map(item => {
              const ItemIcon = ICON_MAP[item.icon] ?? FileText;
              const notif: NavItemProps['notificationStatus'] = 'notificationStatus' in item
                ? item.notificationStatus as NavItemProps['notificationStatus']
                : 'none';
              return (
                <NavItem
                  key={item.key}
                  to={item.path}
                  icon={ItemIcon}
                  label={item.label}
                  isSidebarCollapsed={isCollapsed}
                  notificationStatus={notif as 'warning' | 'success' | 'none'}
                  notificationCount={item.key === 'communication' ? mailUnread : 0}
                />
              );
            });

          // Supersets with a single group don't need a separate group-label row —
          // the section header itself becomes the collapse toggle.
          const isSingleGroup = visibleGroups.length === 1;
          const supersetItemCount = visibleGroups.reduce((sum, g) => sum + g.visibleItems.length, 0);

          return (
            <div key={superset.key} className={cn("space-y-2 py-1", !isCollapsed && "border-t border-white/10 mt-2 pt-3")}>
              {isSingleGroup ? (
                <NavGroup
                  isSidebarCollapsed={isCollapsed}
                  renderHeader={(isOpen, toggle) => (
                    <button
                      type="button"
                      onClick={toggle}
                      className="w-full mx-1 mb-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <SupersetIcon className="h-4 w-4 text-white/70 shrink-0" />
                        <span className="flex-1 text-[12px] font-extrabold text-white uppercase tracking-[0.1em]">
                          {superset.label}
                        </span>
                        <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/70 shrink-0">
                          {supersetItemCount}
                        </span>
                        <ChevronDown
                          className={cn(
                            "w-3.5 h-3.5 text-white/50 transition-transform shrink-0",
                            isOpen && "rotate-180"
                          )}
                        />
                      </div>
                      {superset.description && (
                        <p className="mt-1 text-[11px] font-medium text-white/60">
                          {superset.description}
                        </p>
                      )}
                    </button>
                  )}
                >
                  {renderItems(visibleGroups[0].visibleItems)}
                </NavGroup>
              ) : (
                <NavGroup
                  isSidebarCollapsed={isCollapsed}
                  renderHeader={(isOpen, toggle) => (
                    <button
                      type="button"
                      onClick={toggle}
                      className="w-full mx-1 mb-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <SupersetIcon className="h-4 w-4 text-white/70 shrink-0" />
                        <span className="flex-1 text-[12px] font-extrabold text-white uppercase tracking-[0.1em]">
                          {superset.label}
                        </span>
                        <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/70 shrink-0">
                          {supersetItemCount}
                        </span>
                        <ChevronDown
                          className={cn(
                            "w-3.5 h-3.5 text-white/50 transition-transform shrink-0",
                            isOpen && "rotate-180"
                          )}
                        />
                      </div>
                      {superset.description && (
                        <p className="mt-1 text-[11px] font-medium text-white/60">
                          {superset.description}
                        </p>
                      )}
                    </button>
                  )}
                >
                  {visibleGroups.map(group => group.key === 'procurement-common' ? (
                    <div key={group.key} className="space-y-1 px-1 py-1">
                      {renderItems(group.visibleItems)}
                    </div>
                  ) : (
                    <NavGroup key={group.key} label={group.label} count={group.visibleItems.length} isSidebarCollapsed={isCollapsed}>
                      {renderItems(group.visibleItems)}
                    </NavGroup>
                  ))}
                </NavGroup>
              )}
            </div>
          );
        })}

      </nav>

      {/* Footer (User Details) */}
      <div
        className={cn(
          "shrink-0 border-t border-white/10",
          isCollapsed ? "p-2" : "p-3"
        )}
      >
        <div
          className={cn(
            "flex items-center gap-3",
            isCollapsed ? "justify-center" : ""
          )}
        >
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
            <User className="w-4 h-4 text-white/70" />
          </div>

          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">
                {user?.name || 'SBR User'}
              </p>
              <p className="text-xs text-white/60 truncate">
                {user?.designation || '—'}
              </p>
            </div>
          )}

          {!isCollapsed && (
            <NavLink
              to="/settings"
              title="Settings"
              className={({ isActive }) =>
                cn(
                  "shrink-0 flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                  isActive ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
                )
              }
            >
              <Settings className="w-4 h-4" />
            </NavLink>
          )}
        </div>
      </div>
    </aside>
  );
};

/* ---------------- LAYOUT WRAPPER ---------------- */

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9fb]">
      <AppSidebar />
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
