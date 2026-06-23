import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import AuthLanding from "./pages/AuthLanding";
import Login from "./pages/Login";
import Index from "./pages/Index";
import Leads from "./pages/Leads";
import Farmers from "./pages/Farmers";
import FarmerProfile from "./pages/FarmerProfile";
import HarvestPlanning from "./pages/HarvestPlanning";
import NotFound from "./pages/NotFound";
import Inventory from "./pages/Inventory";
import InventoryIndent from "./pages/InventoryIndent";
import CultivationMaster from "./pages/CultivationMaster";
import CultivationPlan from "./pages/CultivationPlan";
import CreateCultivationPlan from "./pages/CreateCultivationPlan";
import CultivationCalendar from "./pages/CultivationCalendar";
import FieldVisitAnalytics from "./pages/FieldVisitAnalytics";
import HarvestOrders from "./pages/HarvestOrders";
import HarvestCards from "./pages/HarvestCards";
import StaffOnboarding from "./pages/StaffOnboarding";
import ManPowerRequisition from "./pages/ManPowerRequisition";
import AdminMrfApproval from "./pages/adminmrfapproval";
import LogisticsManagement from "./pages/LogisticsManagement";
import AdminRequestPage from "./pages/AdminRequestPage";
import Blocks from "./pages/Blocks";
import TasksBeta from "./pages/TasksBeta";
import VehicleManagement from "./pages/VehicleManagement";
import WeighmentQC from "./pages/WeighmentQC";
import RentalRateCard from "./pages/RentalRateCard";
import ServiceRequest from "./pages/ServiceRequest";
import FleetChart from "./pages/FleetChart";
import KhasraFinder from "./pages/khasra_finder";
import FieldMonitoring from "./pages/FieldMonitoring";
import LandAcquisition from "./pages/LandAcquisition";
import AdminOpsIndent from "./pages/AdminOpsIndent";
import FinanceAdminOpsIndent from "./pages/FinanceAdminOpsIndent";
import PurchaseRequisition from "./pages/PurchaseRequisition";
import VendorDirectory from "./pages/VendorDirectory";
import QuotationComparative from "./pages/QuotationComparative";
import SprQuotationComparative from "./pages/SprQuotationComparative";
import HOInbox from "@/pages/HOInbox";
import HO from "@/pages/HO";
import PurchaseFlow from "@/pages/PurchaseFlow";
import ProjectConfig from "@/pages/ProjectConfig";
import DirectorCapex from "./pages/DirectorCapex";
import DirectorOpex from "./pages/DirectorOpex";
import DirectorAmortization from "./pages/DirectorAmortization";
import DirectorCashFlow from "./pages/DirectorCashFlow";
import DirectorCostMonitoring from "./pages/DirectorCostMonitoring";
import DirectorEmisInvestments from "./pages/DirectorEmisInvestments";
import DirectorAssetsLiabilities from "./pages/DirectorAssetsLiabilities";
import HRMS from "./pages/HRMS";
import OnDemandTask from "./pages/OnDemandTask";
import FarmDirectory from "./pages/FarmDirectory";
import FuelsAndConsumables from "./pages/FuelsAndConsumables";
import AdminOpsFuelRequest from "./pages/AdminOpsFuelRequest";
import DirectorFuelRequest from "./pages/DirectorFuelRequest";
import WorkOrder from "./pages/WorkOrder";
import ScopeOfWork from "./pages/ScopeOfWork";
import WebApp from "./pages/webapp/WebApp";
import Inbox from "./pages/Inbox";
import LabourManagement from "./pages/LabourManagement";
import UserManagement from "./pages/UserManagement";
import AccountsDashboard from "./pages/AccountsDashboard";
import AccountsLedger from "./pages/AccountsLedger";
import AccountsPayments from "./pages/AccountsPayments";
import AccountsPurchaseFlow from "./pages/AccountsPurchaseFlow";
import Budget from "./pages/Budget";
import BudgetDashboard from "./pages/BudgetDashboard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<AuthLanding />} />
          <Route path="/index" element={<Index />} />
          
          <Route path="/leads" element={<AppLayout><Leads /></AppLayout>} />
          <Route path="/tasks-beta" element={<AppLayout><TasksBeta /></AppLayout>} />
          <Route path="/farmers" element={<AppLayout><Farmers /></AppLayout>} />
          <Route path="/farmers/:farmer_id" element={<AppLayout><FarmerProfile /></AppLayout>} />
          <Route path="/land-acquisition" element={<AppLayout><LandAcquisition /></AppLayout>} />
          <Route path="/farm-directory" element={<AppLayout><FarmDirectory /></AppLayout>} />
          
          {/* Operations */}
          <Route path="/cultivation-calendar" element={<AppLayout><CultivationCalendar /></AppLayout>} />
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
          <Route path="/scope-of-work" element={<AppLayout><ScopeOfWork /></AppLayout>} />
          <Route path="/inventory" element={<AppLayout><Inventory /></AppLayout>} />
          <Route path="/inventory-indents" element={<AppLayout><InventoryIndent /></AppLayout>} />
          <Route path="/fuels-and-consumables" element={<AppLayout><FuelsAndConsumables /></AppLayout>} />
          <Route path="/admin-ops-fuel-requests" element={<AppLayout><AdminOpsFuelRequest /></AppLayout>} />
          <Route path="/director-fuel-requests" element={<AppLayout><DirectorFuelRequest /></AppLayout>} />
          <Route path="/admin-ops-indents" element={<AppLayout><AdminOpsIndent /></AppLayout>} />
          <Route path="/on-demand-task" element={<AppLayout><OnDemandTask /></AppLayout>} />
          <Route path="/finance-admin-ops-indents" element={<AppLayout><FinanceAdminOpsIndent /></AppLayout>} />
          <Route
            path="/purchase-requisition"
            element={
              <AppLayout>
                <PurchaseRequisition />
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
          <Route path="/admin-request" element={<AppLayout><AdminRequestPage /></AppLayout>} /> {/* [NEW ROUTE] */}
          <Route path="/resource-management" element={<AppLayout><FleetChart /></AppLayout>} />
          <Route path="/vehicle-management" element={<AppLayout><VehicleManagement /></AppLayout>} />
          <Route path="/fleet-chart" element={<AppLayout><FleetChart /></AppLayout>} />
          <Route path="/staff-onboarding" element={<AppLayout><StaffOnboarding /></AppLayout>} />
          <Route path="/user-management" element={<AppLayout><UserManagement /></AppLayout>} />
          <Route path="/man-power-requisition" element={<AppLayout><ManPowerRequisition /></AppLayout>} />
          <Route path="/admin-mrf-approvals" element={<AppLayout><AdminMrfApproval /></AppLayout>} />
                    {/* Human Resources */}
                    <Route path="/hrms/*" element={<AppLayout><HRMS /></AppLayout>} />
          
          {/* Blocks */}
          <Route path="/blocks" element={<AppLayout><Blocks /></AppLayout>} />

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

          {/* Accounts */}
          <Route path="/accounts/dashboard"    element={<AppLayout><AccountsDashboard /></AppLayout>} />
          <Route path="/accounts/ledger"       element={<AppLayout><AccountsLedger /></AppLayout>} />
          <Route path="/accounts/payments"     element={<AppLayout><AccountsPayments /></AppLayout>} />
          <Route path="/accounts/purchase-flow" element={<AppLayout><AccountsPurchaseFlow /></AppLayout>} />
          <Route path="/budget"                element={<AppLayout><BudgetDashboard /></AppLayout>} />
          <Route path="/budget/:budgetId"      element={<AppLayout><Budget /></AppLayout>} />

          {/* Standalone Webapp — no ERP sidebar */}
          <Route path="/approval/webapp/*" element={<WebApp />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
