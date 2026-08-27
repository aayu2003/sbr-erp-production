import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";

// Every page below is route-level code-split via React.lazy — previously all ~90 pages (plus
// recharts/xlsx/leaflet etc. pulled in by some of them) were bundled into one ~8.3MB JS chunk
// that had to be downloaded and parsed before ANY route could render, CEO's Desk included. Now
// each route only pulls its own chunk (+ whatever shared vendor chunk Vite factors out) on demand.
const AuthLanding = lazy(() => import("./pages/AuthLanding"));
const Login = lazy(() => import("./pages/Login"));
const Index = lazy(() => import("./pages/Index"));
const CeosDesk = lazy(() => import("./pages/CeosDesk"));
const Leads = lazy(() => import("./pages/Leads"));
const Farmers = lazy(() => import("./pages/Farmers"));
const FarmerProfile = lazy(() => import("./pages/FarmerProfile"));
const HarvestPlanning = lazy(() => import("./pages/HarvestPlanning"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Inventory = lazy(() => import("./pages/Inventory"));
const InventoryIndent = lazy(() => import("./pages/InventoryIndent"));
const InventoryApprovals = lazy(() => import("./pages/InventoryApprovals"));
const CultivationMaster = lazy(() => import("./pages/CultivationMaster"));
const CultivationPlan = lazy(() => import("./pages/CultivationPlan"));
const CreateCultivationPlan = lazy(() => import("./pages/CreateCultivationPlan"));
const CultivationCalendar = lazy(() => import("./pages/CultivationCalendar"));
const OperationalCalendar = lazy(() => import("./pages/OperationalCalendar"));
const FieldVisitAnalytics = lazy(() => import("./pages/FieldVisitAnalytics"));
const HarvestOrders = lazy(() => import("./pages/HarvestOrders"));
const HarvestCards = lazy(() => import("./pages/HarvestCards"));
const StaffOnboarding = lazy(() => import("./pages/StaffOnboarding"));
const ManPowerRequisition = lazy(() => import("./pages/ManPowerRequisition"));
const AdminMrfApproval = lazy(() => import("./pages/adminmrfapproval"));
const LogisticsManagement = lazy(() => import("./pages/LogisticsManagement"));
const LogisticsRequest = lazy(() => import("./pages/LogisticsRequest"));
const AdminRequestPage = lazy(() => import("./pages/AdminRequestPage"));
const TasksBeta = lazy(() => import("./pages/TasksBeta"));
const VehicleManagement = lazy(() => import("./pages/VehicleManagement"));
const WeighmentQC = lazy(() => import("./pages/WeighmentQC"));
const RentalRateCard = lazy(() => import("./pages/RentalRateCard"));
const ServiceRequest = lazy(() => import("./pages/ServiceRequest"));
const FleetChart = lazy(() => import("./pages/FleetChart"));
const KhasraFinder = lazy(() => import("./pages/khasra_finder"));
const FieldMonitoring = lazy(() => import("./pages/FieldMonitoring"));
const LandAcquisition = lazy(() => import("./pages/LandAcquisition"));
const LeaseMaster = lazy(() => import("./pages/LeaseMaster"));
const Legal = lazy(() => import("./pages/Legal"));
const FinanceAdminOpsIndent = lazy(() => import("./pages/FinanceAdminOpsIndent"));
const PurchaseVerifier = lazy(() => import("./pages/PurchaseVerifier"));
const WorkOrderVerifier = lazy(() => import("./pages/WorkOrderVerifier"));
const PurchaseRequisition = lazy(() => import("./pages/PurchaseRequisition"));
const PurchaseRequisitionEntry = lazy(() => import("./pages/PurchaseRequisitionEntry"));
const VendorDirectory = lazy(() => import("./pages/VendorDirectory"));
const QuotationComparative = lazy(() => import("./pages/QuotationComparative"));
const SprQuotationComparative = lazy(() => import("./pages/SprQuotationComparative"));
const HOInbox = lazy(() => import("@/pages/HOInbox"));
const WorkOrderCommunication = lazy(() => import("@/pages/WorkOrderCommunication"));
const HO = lazy(() => import("@/pages/HO"));
const POCreation = lazy(() => import("@/pages/POCreation"));
const WOCreation = lazy(() => import("@/pages/WOCreation"));
const PurchaseFlow = lazy(() => import("@/pages/PurchaseFlow"));
const WorkOrderFlow = lazy(() => import("@/pages/WorkOrderFlow"));
const ProjectConfig = lazy(() => import("@/pages/ProjectConfig"));
const ProjectOnboarding = lazy(() => import("@/pages/ProjectOnboarding"));
const DepartmentOnboarding = lazy(() => import("@/pages/DepartmentOnboarding"));
const ImportantMapMarkings = lazy(() => import("@/pages/ImportantMapMarkings"));
const DirectorCapex = lazy(() => import("./pages/DirectorCapex"));
const DirectorOpex = lazy(() => import("./pages/DirectorOpex"));
const DirectorAmortization = lazy(() => import("./pages/DirectorAmortization"));
const DirectorCashFlow = lazy(() => import("./pages/DirectorCashFlow"));
const DirectorCostMonitoring = lazy(() => import("./pages/DirectorCostMonitoring"));
const DirectorEmisInvestments = lazy(() => import("./pages/DirectorEmisInvestments"));
const DirectorAssetsLiabilities = lazy(() => import("./pages/DirectorAssetsLiabilities"));
const HRManagement = lazy(() => import("./pages/HRManagement"));
const Settings = lazy(() => import("./pages/Settings"));

const TaskCalendarPage = lazy(() => import("./features/on-demand-tasks/on_demand_task_new").then((m) => ({ default: m.TaskCalendarPage })));
const TaskDetailPage = lazy(() => import("./features/on-demand-tasks/on_demand_task_new").then((m) => ({ default: m.TaskDetailPage })));
const TaskFormPage = lazy(() => import("./features/on-demand-tasks/on_demand_task_new").then((m) => ({ default: m.TaskFormPage })));
const TaskInboxPage = lazy(() => import("./features/on-demand-tasks/on_demand_task_new").then((m) => ({ default: m.TaskInboxPage })));
const TaskSettingsPage = lazy(() => import("./features/on-demand-tasks/on_demand_task_new").then((m) => ({ default: m.TaskSettingsPage })));
const TaskTemplatesPage = lazy(() => import("./features/on-demand-tasks/on_demand_task_new").then((m) => ({ default: m.TaskTemplatesPage })));
const TaskWorkspacePage = lazy(() => import("./features/on-demand-tasks/on_demand_task_new").then((m) => ({ default: m.TaskWorkspacePage })));

const OnDemandTask = lazy(() => import("./pages/OnDemandTask"));
const FarmDirectory = lazy(() => import("./pages/FarmDirectory"));
const FuelsAndConsumables = lazy(() => import("./pages/FuelsAndConsumables"));
const AdminOpsFuelRequest = lazy(() => import("./pages/AdminOpsFuelRequest"));
const DirectorFuelRequest = lazy(() => import("./pages/DirectorFuelRequest"));
const WorkOrder = lazy(() => import("./pages/WorkOrder"));
const ScopeOfWork = lazy(() => import("./pages/ScopeOfWork"));
const WccModule = lazy(() => import("./pages/WccModule"));
const WebApp = lazy(() => import("./pages/webapp/WebApp"));
const Inbox = lazy(() => import("./pages/Inbox"));
const WccApprovalInbox = lazy(() => import("./pages/WccApprovalInbox"));
const GRNModule = lazy(() => import("./pages/GRNModule"));
const InspectionReport = lazy(() => import("./pages/InspectionReport"));
const InspectionReportApprovals = lazy(() => import("./pages/InspectionReportApprovals"));
const GrnApprovalInbox = lazy(() => import("./pages/GrnApprovalInbox"));
const GateEntryModule = lazy(() => import("./pages/GateEntryModule"));
const LabourManagement = lazy(() => import("./pages/LabourManagement"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const AccountsDashboard = lazy(() => import("./pages/AccountsDashboard"));
const AccountsLedger = lazy(() => import("./pages/AccountsLedger"));
const AccountsPayments = lazy(() => import("./pages/AccountsPayments"));
const PRRApprovalInbox = lazy(() => import("./pages/PRRApprovalInbox"));
const AccountsPurchaseFlow = lazy(() => import("./pages/AccountsPurchaseFlow"));
const Budget = lazy(() => import("./pages/Budget"));
const BudgetDashboard = lazy(() => import("./pages/BudgetDashboard"));

const Banking = lazy(() => import("./pages/FinanceAccounts").then((m) => ({ default: m.Banking })));
const BillsPayables = lazy(() => import("./pages/FinanceAccounts").then((m) => ({ default: m.BillsPayables })));
const FinanceAccountsDashboard = lazy(() => import("./pages/FinanceAccounts").then((m) => ({ default: m.FinanceAccountsDashboard })));
const LedgersReports = lazy(() => import("./pages/FinanceAccounts").then((m) => ({ default: m.LedgersReports })));
const MastersControls = lazy(() => import("./pages/FinanceAccounts").then((m) => ({ default: m.MastersControls })));

const PRRModule = lazy(() => import("./pages/PRRModule"));
const Vouchers = lazy(() => import("./pages/Vouchers"));
const AccountingMaster = lazy(() => import("./pages/AccountingMaster"));
const ChartOfAccounts = lazy(() => import("./pages/ChartOfAccounts"));
const Communication = lazy(() => import("./pages/Communication"));
const InvoiceDirectory = lazy(() => import("./pages/InvoiceDirectory"));

const queryClient = new QueryClient();

// Shown while a route's own chunk is downloading — full-viewport so it doesn't flash oddly inside
// AppLayout's chrome (AppLayout itself isn't lazy, but this Suspense boundary sits above it, so a
// suspending route replaces the whole screen until its chunk resolves, then swaps in for real).
const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-500" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<AuthLanding />} />
          <Route path="/index" element={<Index />} />

          <Route path="/ceos-desk" element={<AppLayout><CeosDesk /></AppLayout>} />
          <Route path="/communication" element={<AppLayout><Communication /></AppLayout>} />

          <Route path="/legal" element={<AppLayout><Legal /></AppLayout>} />

          <Route path="/leads" element={<AppLayout><Leads /></AppLayout>} />
          <Route path="/tasks-beta" element={<AppLayout><TasksBeta /></AppLayout>} />
          <Route path="/farmers" element={<AppLayout><Farmers /></AppLayout>} />
          <Route path="/farmers/:farmer_id" element={<AppLayout><FarmerProfile /></AppLayout>} />
          <Route path="/land-acquisition" element={<AppLayout><LandAcquisition /></AppLayout>} />
          <Route path="/lease-master" element={<AppLayout><LeaseMaster /></AppLayout>} />
          <Route path="/farm-directory" element={<AppLayout><FarmDirectory /></AppLayout>} />

          {/* Operations */}
          <Route path="/cultivation-calendar" element={<AppLayout><CultivationCalendar /></AppLayout>} />
          <Route path="/operational-calendar" element={<AppLayout><OperationalCalendar /></AppLayout>} />
          <Route path="/cultivation-master/*" element={<AppLayout><CultivationMaster /></AppLayout>} />
          <Route path="/cultivation-plan" element={<AppLayout><CultivationPlan /></AppLayout>} />
          <Route path="/cultivation-plan/create" element={<AppLayout><CreateCultivationPlan /></AppLayout>} />
          <Route path="/field-monitoring" element={<AppLayout><FieldMonitoring /></AppLayout>} />
          <Route path="/labour-management" element={<AppLayout><LabourManagement /></AppLayout>} />
          <Route path="/field-visit-analytics" element={<AppLayout><FieldVisitAnalytics /></AppLayout>} />

          {/* Harvest & Weighment */}
          <Route path="/harvest-planning" element={<AppLayout><HarvestPlanning /></AppLayout>} />
          <Route path="/harvest-orders" element={<AppLayout><HarvestOrders /></AppLayout>} />
          <Route path="/harvest-cards" element={<AppLayout><HarvestCards /></AppLayout>} />
          <Route path="/weighment" element={<AppLayout><WeighmentQC /></AppLayout>} />

          {/* Management */}
          <Route path="/work-order" element={<AppLayout><WorkOrder /></AppLayout>} />
          <Route path="/work-requisition" element={<AppLayout><WorkOrder /></AppLayout>} />
          <Route path="/wo-creation" element={<AppLayout><WOCreation /></AppLayout>} />
          <Route path="/work-verifier" element={<AppLayout><WorkOrderVerifier /></AppLayout>} />
          <Route path="/work-approver" element={<AppLayout><WorkOrderCommunication title="WO - Order Approval Flow" /></AppLayout>} />
          <Route path="/work-flow" element={<AppLayout><WorkOrderFlow /></AppLayout>} />
          <Route path="/scope-of-work" element={<AppLayout><ScopeOfWork /></AppLayout>} />
          <Route path="/wcc-module" element={<AppLayout><WccModule /></AppLayout>} />
          <Route path="/inventory" element={<AppLayout><Inventory /></AppLayout>} />
          <Route path="/inventory-indents" element={<AppLayout><InventoryIndent /></AppLayout>} />
          <Route path="/inventory-approvals" element={<AppLayout><InventoryApprovals /></AppLayout>} />
          <Route path="/fuels-and-consumables" element={<AppLayout><FuelsAndConsumables /></AppLayout>} />
          <Route path="/admin-ops-fuel-requests" element={<AppLayout><AdminOpsFuelRequest /></AppLayout>} />
          <Route path="/director-fuel-requests" element={<AppLayout><DirectorFuelRequest /></AppLayout>} />
          <Route path="/purchase-verifier" element={<AppLayout><PurchaseVerifier /></AppLayout>} />
          <Route path="/admin-ops-indents" element={<Navigate to="/purchase-verifier?tab=indents" replace />} />
          <Route path="/on-demand-task" element={<AppLayout><TaskWorkspacePage /></AppLayout>} />
          <Route path="/on-demand-task/new" element={<AppLayout><TaskFormPage /></AppLayout>} />
          <Route path="/on-demand-task/inbox" element={<AppLayout><TaskInboxPage /></AppLayout>} />
          <Route path="/on-demand-task/calendar" element={<AppLayout><TaskCalendarPage /></AppLayout>} />
          <Route path="/on-demand-task/templates" element={<AppLayout><TaskTemplatesPage /></AppLayout>} />
          <Route path="/on-demand-task/settings" element={<AppLayout><TaskSettingsPage /></AppLayout>} />
          <Route path="/on-demand-task/:taskId/edit" element={<AppLayout><TaskFormPage /></AppLayout>} />
          <Route path="/on-demand-task/:taskId" element={<AppLayout><TaskDetailPage /></AppLayout>} />
          <Route path="/on-demand-task-legacy" element={<AppLayout><OnDemandTask /></AppLayout>} />
          <Route path="/finance-admin-ops-indents" element={<AppLayout><FinanceAdminOpsIndent orderTypeFilter="PR" /></AppLayout>} />
          <Route path="/work-requisition-approver" element={<AppLayout><FinanceAdminOpsIndent orderTypeFilter="SPR" /></AppLayout>} />
          <Route path="/finance/inspection-report-approvals" element={<AppLayout><InspectionReportApprovals stage="finance_admin_ops" /></AppLayout>} />
          <Route
            path="/purchase-requisition"
            element={<Navigate to="/purchase-comparative-statement" replace />}
          />
          <Route
            path="/purchase-comparative-statement"
            element={
              <AppLayout>
                <PurchaseRequisition indentTypeFilter="PR" />
              </AppLayout>
            }
          />
          <Route
            path="/work-comparative-statement"
            element={
              <AppLayout>
                <PurchaseRequisition indentTypeFilter="SPR" />
              </AppLayout>
            }
          />
          <Route
            path="/purchase-requisition-entry"
            element={
              <AppLayout>
                <PurchaseRequisitionEntry />
              </AppLayout>
            }
          />
          <Route
            path="/vendor-directory"
            element={
              <AppLayout>
                <VendorDirectory />
              </AppLayout>
            }
          />
          <Route path="/logistics" element={<AppLayout><LogisticsManagement /></AppLayout>} />
          <Route path="/logistics-request" element={<AppLayout><LogisticsRequest /></AppLayout>} />
          <Route path="/admin-request" element={<AppLayout><AdminRequestPage /></AppLayout>} /> {/* [NEW ROUTE] */}
          <Route path="/resource-management" element={<AppLayout><FleetChart /></AppLayout>} />
          <Route path="/vehicle-management" element={<AppLayout><VehicleManagement /></AppLayout>} />
          <Route path="/fleet-chart" element={<AppLayout><FleetChart /></AppLayout>} />
          <Route path="/staff-onboarding" element={<AppLayout><StaffOnboarding /></AppLayout>} />
          <Route path="/user-management" element={<AppLayout><UserManagement /></AppLayout>} />
          <Route path="/man-power-requisition" element={<AppLayout><ManPowerRequisition /></AppLayout>} />
          <Route path="/admin-mrf-approvals" element={<AppLayout><AdminMrfApproval /></AppLayout>} />
          {/* Human Resources */}
          <Route path="/hr-management" element={<AppLayout><HRManagement /></AppLayout>} />
          <Route path="/settings" element={<AppLayout><Settings /></AppLayout>} />

          {/* Lease & Asset Management */}
          <Route path="/rental-rate-card" element={<AppLayout><RentalRateCard /></AppLayout>} />
          <Route path="/service-requests" element={<AppLayout><ServiceRequest /></AppLayout>} />

          {/* Tools (not in sidebar nav) */}
          <Route path="/tools/khasra_records" element={<KhasraFinder />} />
          <Route path="/khasra-finder" element={<Navigate to="/tools/khasra_records" replace />} />

          {/* PR quotation */}
          <Route
            path="/purchase-requisition/PR/:indentId/quotation"
            element={
              <AppLayout>
                <QuotationComparative />
              </AppLayout>
            }
          />
          {/* SPR quotation — separate page with Service/Qty/StartDate/Duration/OEM columns */}
          <Route
            path="/purchase-requisition/SPR/:indentId/quotation"
            element={
              <AppLayout>
                <SprQuotationComparative />
              </AppLayout>
            }
          />

          {/* HO Routes */}
          <Route
            path="/ho"
            element={
              <AppLayout>
                <HOInbox />
              </AppLayout>
            }
          />
          <Route
            path="/ho/:indentId"
            element={
              <AppLayout>
                <HO />
              </AppLayout>
            }
          />
          <Route
            path="/po-creation"
            element={
              <AppLayout>
                <POCreation />
              </AppLayout>
            }
          />
          <Route
            path="/purchase-flow"
            element={
              <AppLayout>
                <PurchaseFlow />
              </AppLayout>
            }
          />
          <Route
            path="/project-config"
            element={
              <AppLayout>
                <ProjectConfig />
              </AppLayout>
            }
          />

          {/* PROJECT superset */}
          <Route path="/project-onboarding" element={<AppLayout><ProjectOnboarding /></AppLayout>} />
          <Route path="/department-onboarding" element={<AppLayout><DepartmentOnboarding /></AppLayout>} />
          <Route path="/project-map-markings" element={<AppLayout><ImportantMapMarkings /></AppLayout>} />

          {/* Director */}
          <Route path="/director/capex" element={<AppLayout><DirectorCapex /></AppLayout>} />
          <Route path="/director/opex" element={<AppLayout><DirectorOpex /></AppLayout>} />
          <Route path="/director/amortization" element={<AppLayout><DirectorAmortization /></AppLayout>} />
          <Route path="/director/cash-flow" element={<AppLayout><DirectorCashFlow /></AppLayout>} />
          <Route path="/director/cost-monitoring" element={<AppLayout><DirectorCostMonitoring /></AppLayout>} />
          <Route path="/director/emis-investments" element={<AppLayout><DirectorEmisInvestments /></AppLayout>} />
          <Route path="/director/assets-liabilities" element={<AppLayout><DirectorAssetsLiabilities /></AppLayout>} />

          {/* Inbox — per department */}
          <Route path="/admin/inbox"     element={<AppLayout><Inbox department="Admin" /></AppLayout>} />
          <Route path="/inventory/inbox" element={<AppLayout><Inbox department="Inventory" /></AppLayout>} />
          <Route path="/purchase/inbox"  element={<AppLayout><Inbox department="Purchase" /></AppLayout>} />
          <Route path="/hrms/inbox"      element={<AppLayout><Inbox department="HRMS" /></AppLayout>} />
          <Route path="/director/inbox"  element={<AppLayout><Inbox department="Director" /></AppLayout>} />

          {/* WCC Approval workflow */}
          <Route path="/admin/wcc-approval"    element={<Navigate to="/work-verifier?tab=wcc" replace />} />
          <Route path="/director/wcc-approval" element={<AppLayout><WccApprovalInbox stage="approval" /></AppLayout>} />

          {/* GRN Module + GRN Approval workflow */}
          <Route path="/grn-module"            element={<AppLayout><GRNModule /></AppLayout>} />
          <Route path="/inspection-report"     element={<AppLayout><InspectionReport /></AppLayout>} />
          <Route path="/admin/inspection-report-approvals" element={<Navigate to="/purchase-verifier?tab=inspection" replace />} />
          <Route path="/admin/grn-approval"    element={<Navigate to="/purchase-verifier?tab=grn" replace />} />
          <Route path="/director/grn-approval" element={<AppLayout><GrnApprovalInbox stage="approval" /></AppLayout>} />

          {/* Gate Entry */}
          <Route path="/gate-entry" element={<AppLayout><GateEntryModule /></AppLayout>} />

          {/* Accounts */}
          <Route path="/accounts/dashboard"    element={<AppLayout><AccountsDashboard /></AppLayout>} />
          <Route path="/accounts/ledger"       element={<AppLayout><AccountsLedger /></AppLayout>} />
          <Route path="/accounts/payments"     element={<AppLayout><AccountsPayments /></AppLayout>} />
          <Route path="/director/prr-approval" element={<AppLayout><PRRApprovalInbox /></AppLayout>} />
          <Route path="/accounts/purchase-flow" element={<AppLayout><AccountsPurchaseFlow /></AppLayout>} />
          <Route path="/budget"                element={<AppLayout><BudgetDashboard /></AppLayout>} />
          <Route path="/budget/:budgetId"      element={<AppLayout><Budget /></AppLayout>} />

          {/* Finance & Accounts — new workspace; legacy Accounts routes remain intact */}
          <Route path="/finance-accounts" element={<Navigate to="/finance-accounts/dashboard" replace />} />
          <Route path="/finance-accounts/dashboard" element={<AppLayout><FinanceAccountsDashboard /></AppLayout>} />
          <Route path="/finance-accounts/bills-payables" element={<AppLayout><BillsPayables /></AppLayout>} />
          <Route path="/finance-accounts/invoice-directory" element={<AppLayout><InvoiceDirectory /></AppLayout>} />
          <Route path="/finance-accounts/payments-receipts" element={<AppLayout><PRRModule /></AppLayout>} />
          <Route path="/finance-accounts/vouchers" element={<AppLayout><Vouchers /></AppLayout>} />
          <Route path="/finance-accounts/banking" element={<AppLayout><Banking /></AppLayout>} />
          <Route path="/finance-accounts/ledgers-reports" element={<AppLayout><LedgersReports /></AppLayout>} />
          <Route path="/finance-accounts/masters-controls" element={<AppLayout><MastersControls /></AppLayout>} />
          <Route path="/finance-accounts/accounting-master" element={<AppLayout><AccountingMaster /></AppLayout>} />
          <Route path="/finance-accounts/chart-of-accounts" element={<AppLayout><ChartOfAccounts /></AppLayout>} />

          {/* Standalone Webapp — no ERP sidebar */}
          <Route path="/approval/webapp/*" element={<WebApp />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
