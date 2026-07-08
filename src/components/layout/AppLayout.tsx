import { useState, useEffect } from "react";
import {
  Users, UserCheck, Sprout, Calendar, UserPlus, Fuel,
  ChevronLeft, ChevronRight, ChevronDown,
  Layers, Box, FileText, Map, AlertCircle, User,
  ClipboardCheck, Activity, FolderKanban, Landmark,
  Link2, LayoutDashboard, BookOpen, CreditCard, Receipt,
  Car, Mail, Package, Scale, Truck, CheckSquare, PieChart,
  Settings,
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
  Car, Mail, Package, Scale, Truck, CheckSquare, PieChart,
};

/* ---------------- NAV ITEM COMPONENT ---------------- */

interface NavItemProps {
  to: string;
  icon: React.ElementType;
  label: string;
  notificationStatus?: "warning" | "success" | "none";
  isSidebarCollapsed: boolean;
  budgetCard?: boolean;
}

const NavItem = ({
  to,
  icon: Icon,
  label,
  notificationStatus = "none",
  isSidebarCollapsed,
  budgetCard = false,
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
          {notificationStatus === "warning" ? (
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
  label: string;
  children: React.ReactNode;
  isSidebarCollapsed: boolean;
}

const NavGroup = ({
  label,
  children,
  isSidebarCollapsed,
}: NavGroupProps) => {
  const [isOpen, setIsOpen] = useState(true);

  if (isSidebarCollapsed) {
    return (
      <div className="space-y-1 py-1 border-t border-white/10 first:border-0">
        {children}
      </div>
    );
  }

  return (
    <div className="space-y-1 py-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-bold text-white/50 uppercase tracking-[0.08em] hover:text-white"
      >
        <span>{label}</span>
        <ChevronDown
          className={cn(
            "w-3 h-3 transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      <div
        className={cn(
          "space-y-1 pl-1 overflow-hidden transition-all duration-300 ease-in-out",
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

interface AppSidebarProps {
  leadsComplete: boolean;
}

const AppSidebar = ({ leadsComplete }: AppSidebarProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user } = useAuth();
  const isSuperAdmin = user?.id === 'sbr-admin';

  useEffect(() => {
    document.title = "SBR | Farm-connect";
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
        <div className={cn("flex gap-3", isCollapsed ? "items-center" : "min-w-0 flex-1 items-start")}>
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
              <h1 className="truncate font-semibold text-[20px] tracking-[-0.01em] text-white leading-none">
                SaiBioresources
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
                item.enabled && (isSuperAdmin || allowedModules.includes(item.key))
              ),
            }))
            .filter(g => g.visibleItems.length > 0);

          // Hide the entire superset if nothing is accessible
          if (visibleGroups.length === 0) return null;

          const SupersetIcon = ICON_MAP[superset.icon] ?? FileText;

          return (
            <div key={superset.key} className={cn("space-y-2 py-1", !isCollapsed && "border-t border-white/10 mt-2 pt-3")}>
              {!isCollapsed && (
                <div className="mx-1 mb-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <SupersetIcon className="h-4 w-4 text-white/70" />
                    <span className="text-[12px] font-extrabold text-white uppercase tracking-[0.1em]">
                      {superset.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] font-medium text-white/60">
                    {superset.description}
                  </p>
                </div>
              )}

              {visibleGroups.map(group => (
                <NavGroup key={group.key} label={group.label} isSidebarCollapsed={isCollapsed}>
                  {group.visibleItems.map(item => {
                    const ItemIcon = ICON_MAP[item.icon] ?? FileText;
                    const notif = item.key === 'leads'
                      ? (leadsComplete ? 'success' : 'warning')
                      : ((item as any).notificationStatus ?? 'none');
                    return (
                      <NavItem
                        key={item.key}
                        to={item.path}
                        icon={ItemIcon}
                        label={item.label}
                        isSidebarCollapsed={isCollapsed}
                        notificationStatus={notif as 'warning' | 'success' | 'none'}
                      />
                    );
                  })}
                </NavGroup>
              ))}
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
  const [leadsComplete] = useState(false);
  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9fb]">
      <AppSidebar leadsComplete={leadsComplete} />
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
