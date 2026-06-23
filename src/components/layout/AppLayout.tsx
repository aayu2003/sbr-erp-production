import { useState, useEffect } from "react";
import {
  Users, UserCheck, Sprout, Calendar, UserPlus, Fuel,
  ChevronLeft, ChevronRight, ChevronDown,
  Layers, Box, FileText, Map, AlertCircle, User, LogOut,
  ClipboardCheck, Activity, FolderKanban, Landmark,
  Link2, LayoutDashboard, BookOpen, CreditCard, Receipt,
  Car, Mail, Package, Scale, Truck, CheckSquare, PieChart,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
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
          budgetCard && "rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm hover:border-slate-300 hover:bg-slate-50",
          isActive
            ? budgetCard
              ? "border-slate-300 bg-slate-50 text-[#1e293b] font-semibold"
              : "bg-gray-100 text-[#1e293b] font-semibold"
            : "text-gray-500 hover:bg-gray-50 hover:text-[#1e293b] font-medium",
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
                ? "text-[#1e293b]"
                : "text-gray-400 group-hover:text-[#1e293b]"
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
                "w-2 h-2 rounded-full bg-green-500 ring-1 ring-white shrink-0",
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
      <div className="space-y-1 py-1 border-t border-gray-100 first:border-0">
        {children}
      </div>
    );
  }

  return (
    <div className="space-y-1 py-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em] hover:text-[#1e293b]"
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
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isSuperAdmin = user?.id === 'sbr-admin';

  useEffect(() => {
    document.title = "SBR | Farm-connect";
  }, []);

  return (
    <aside
      className={cn(
        "sticky top-0 h-screen bg-white flex flex-col border-r border-gray-200 transition-all z-50",
        isCollapsed ? "w-[80px]" : "w-72"
      )}
    >
      {/* Header with Logo */}
      <div
        className={cn(
          "h-16 shrink-0 border-b border-slate-200 bg-gradient-to-b from-white via-slate-50/70 to-white px-4",
          isCollapsed ? "flex items-center justify-center" : "flex items-center justify-between gap-2"
        )}
      >
        <div className={cn("flex gap-3", isCollapsed ? "items-center" : "min-w-0 flex-1 items-start")}>
          {/* Logo Container */}
          <div className="h-11 w-11 rounded-2xl bg-white/95 flex items-center justify-center shadow-[0_8px_24px_rgba(15,23,42,0.09)] border border-slate-200 overflow-hidden relative ring-1 ring-white">
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
              <h1 className="truncate font-semibold text-[20px] tracking-[-0.01em] text-slate-900 leading-none">
                SaiBioresources
              </h1>
              <p className="mt-0.5 truncate text-[12px] text-slate-500 font-medium leading-tight">
                Private Limited
              </p>

            </div>
          )}
        </div>

        {/* Collapse Button */}
        {!isCollapsed && (
          <button
            onClick={() => setIsCollapsed(true)}
            className="mt-0.5 shrink-0 p-1.5 rounded-md text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Expand Button */}
      {isCollapsed && (
        <div className="flex justify-center py-3 border-b border-gray-50">
          <button
            onClick={() => setIsCollapsed(false)}
            className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Navigation Links — fully driven by src/config/modules.json */}
      <nav className="min-h-0 flex-1 p-3 space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200">
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
            <div key={superset.key} className={cn("space-y-2 py-1", !isCollapsed && "border-t border-gray-100 mt-2 pt-3")}>
              {!isCollapsed && (
                <div className="mx-1 mb-1 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <SupersetIcon className="h-4 w-4 text-slate-700" />
                    <span className="text-[12px] font-extrabold text-slate-800 uppercase tracking-[0.1em]">
                      {superset.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] font-medium text-slate-600">
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

      {/* Footer (User Details + More button) */}
      <div
        className={cn(
          "shrink-0 border-t border-gray-100",
          isCollapsed ? "p-2" : "p-3"
        )}
      >
        <div
          className={cn(
            "flex items-center gap-3",
            isCollapsed ? "justify-center" : ""
          )}
        >
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
            <User className="w-4 h-4 text-gray-600" />
          </div>

          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {user?.name || 'SBR User'}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {user?.designation || '—'}
              </p>
            </div>
          )}
        </div>

        <button
          onClick={() => { logout(); navigate('/login'); }}
          title="Logout"
          className={cn(
            "mt-3 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors",
            isCollapsed && "justify-center px-2"
          )}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span>Logout</span>}
        </button>

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
