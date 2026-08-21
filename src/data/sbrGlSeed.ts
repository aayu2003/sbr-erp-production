export type SbrGlSeedRecord = {
  item_id: string;
  code: string;
  name: string;
  parent: string;
  category: "Asset" | "Liability" | "Equity" | "Income" | "Expense";
  type: "Header" | "Posting Account" | "Control Account" | "Bank" | "Cash" | "Tax" | "Inventory" | "Fixed Asset" | "Revenue" | "Expense";
  normal: "Debit" | "Credit";
  control: boolean;
  direct: boolean;
  slType: string;
  balance: number;
  status: "Active";
  seeded: true;
};

type Category = SbrGlSeedRecord["category"];
type AccountType = SbrGlSeedRecord["type"];

type GroupDefinition = {
  code: number;
  name: string;
  category: Category;
  accounts: string[];
  type?: AccountType;
};

const groups: GroupDefinition[] = [
  { code: 110000, name: "Cash & Bank", category: "Asset", accounts: ["Cash in Hand", "Petty Cash", "Bank Current Account", "Bank Savings Account", "Bank Collection Account", "Bank Payment Account", "Fixed Deposits", "Margin Money / Bank Deposits"] },
  { code: 120000, name: "Receivables", category: "Asset", accounts: ["Trade Receivables", "Customer Advances Recoverable", "Other Receivables", "Employee Recoverables", "Vendor Recoverables", "Claims Receivable", "Insurance Claims Receivable"] },
  { code: 125000, name: "Advances & Deposits", category: "Asset", accounts: ["Advance to Vendors", "Advance to Farmers / Landowners", "Advance to Employees", "Travel Advance", "Imprest Advance", "Security Deposits", "Electricity Security Deposit", "Rental / Lease Deposit", "Other Deposits"] },
  { code: 130000, name: "Inventory", category: "Asset", type: "Inventory", accounts: ["Raw Material Inventory", "Paddy Straw Inventory", "Napier / Green Feedstock Inventory", "Silage Inventory", "Fertilizer Inventory", "Agrochemical Inventory", "Seeds / Planting Material Inventory", "Irrigation Material Inventory", "Fencing Material Inventory", "Pipes & Fittings Inventory", "Spares & Consumables Inventory", "Diesel / Fuel Inventory", "Packing Material Inventory", "Stores & Consumables Inventory", "Goods in Transit"] },
  { code: 140000, name: "Input Tax / Statutory Assets", category: "Asset", type: "Tax", accounts: ["Input CGST", "Input SGST", "Input IGST", "Input GST under RCM", "TDS Receivable", "TCS Receivable", "GST Refund Receivable", "Advance Income Tax", "Self Assessment Tax", "MAT Credit"] },
  { code: 150000, name: "Prepaid & Deferred Expenses", category: "Asset", accounts: ["Prepaid Insurance", "Prepaid Rent", "Prepaid AMC", "Prepaid Software Subscription", "Other Prepaid Expenses"] },
  { code: 160000, name: "Fixed Assets", category: "Asset", type: "Fixed Asset", accounts: ["Land", "Building", "Office Equipment", "Computers & IT Equipment", "Furniture & Fixtures", "Vehicles", "Tractors", "Farm Machinery", "Harvesting Equipment", "Irrigation Equipment", "Pumps & Motors", "Borewell Infrastructure", "Fencing Infrastructure", "Electrical Installations", "Storage Infrastructure", "Tools & Equipment", "Capital Work in Progress"] },
  { code: 170000, name: "Accumulated Depreciation", category: "Asset", accounts: ["Accumulated Depreciation - Building", "Accumulated Depreciation - Office Equipment", "Accumulated Depreciation - Computers", "Accumulated Depreciation - Furniture", "Accumulated Depreciation - Vehicles", "Accumulated Depreciation - Tractors", "Accumulated Depreciation - Farm Machinery", "Accumulated Depreciation - Harvesting Equipment", "Accumulated Depreciation - Irrigation Equipment", "Accumulated Depreciation - Pumps & Motors", "Accumulated Depreciation - Borewell Infrastructure", "Accumulated Depreciation - Fencing Infrastructure", "Accumulated Depreciation - Electrical Installations", "Accumulated Depreciation - Storage Infrastructure", "Accumulated Depreciation - Tools & Equipment"] },

  { code: 210000, name: "Trade Payables", category: "Liability", accounts: ["Trade Payables - Vendors", "Trade Payables - Service Vendors", "Trade Payables - Material Suppliers", "Trade Payables - Farmers / Aggregators", "Unbilled Payables", "GRN / Service Receipt Accrual"] },
  { code: 220000, name: "Statutory Liabilities", category: "Liability", type: "Tax", accounts: ["Output CGST", "Output SGST", "Output IGST", "GST Payable under RCM", "TDS Payable", "TCS Payable", "PF Payable", "ESIC Payable", "Professional Tax Payable", "Labour Welfare Fund Payable", "Other Statutory Dues"] },
  { code: 230000, name: "Employee Liabilities", category: "Liability", accounts: ["Salary Payable", "Wages Payable", "Reimbursement Payable", "Bonus Payable", "Leave Encashment Payable", "Gratuity Payable"] },
  { code: 240000, name: "Other Payables", category: "Liability", accounts: ["Expense Payable", "Contractor Payable", "Land Lease Payable", "Freight Payable", "Electricity Payable", "Rent Payable", "Audit Fee Payable", "Professional Fee Payable", "Interest Payable"] },
  { code: 250000, name: "Customer / Other Advances", category: "Liability", accounts: ["Advance from Customers", "Security Deposit Received", "Other Advances Received"] },
  { code: 260000, name: "Borrowings", category: "Liability", accounts: ["Term Loan", "Working Capital Loan", "Cash Credit", "Overdraft", "Vehicle Loan", "Equipment Loan", "Loan from Related Parties", "Interest Accrued but Not Due"] },

  { code: 310000, name: "Share Capital", category: "Equity", accounts: ["Equity Share Capital", "Preference Share Capital", "Securities Premium"] },
  { code: 320000, name: "Reserves & Surplus", category: "Equity", accounts: ["General Reserve", "Retained Earnings", "Surplus / Deficit in P&L", "Current Year Profit / Loss"] },

  { code: 410000, name: "Feedstock Revenue", category: "Income", type: "Revenue", accounts: ["Sale of Napier Feedstock", "Sale of Napier Silage", "Sale of Paddy Straw", "Sale of Other Biomass", "Sale of Agricultural Produce"] },
  { code: 420000, name: "Service Revenue", category: "Income", type: "Revenue", accounts: ["Feedstock Handling Income", "Transportation Recovery", "Baling Service Income", "Storage / Handling Recovery", "Other Operating Income"] },
  { code: 430000, name: "Other Income", category: "Income", type: "Revenue", accounts: ["Scrap Sales", "Sale of Used Materials", "Interest Income", "Discount Received", "Insurance Claim Income", "Miscellaneous Income", "Profit on Sale of Assets"] },

  { code: 510000, name: "Cultivation Costs", category: "Expense", type: "Expense", accounts: ["Land Lease Expense", "Land Preparation Expense", "Ploughing Expense", "Rotavator Expense", "Leveling Expense", "Bed Making Expense", "Sowing / Planting Expense", "Seed / Planting Material Consumption", "Organic Manure Consumption", "Fertilizer Consumption", "Urea Consumption", "SSP Consumption", "Agrochemical Consumption", "Herbicide Expense", "Insecticide Expense", "Pesticide Expense", "Farm Labour Expense", "Farm Contractor Charges", "Irrigation Expense", "Borewell Operating Expense", "Pumping Expense", "Electricity for Irrigation", "Diesel for Farm Operations", "Farm Equipment Hire Charges", "Tractor Hire Charges", "Crop Maintenance Expense", "Weeding Expense", "Inter-Cultivation Expense", "Spraying Expense"] },
  { code: 520000, name: "Harvesting Costs", category: "Expense", type: "Expense", accounts: ["Harvesting Charges", "Forage Harvester Charges", "Cutting Charges", "Chopping Charges", "Baling Charges", "Harvest Labour", "Harvest Equipment Hire"] },
  { code: 530000, name: "Collection & Aggregation Costs", category: "Expense", type: "Expense", accounts: ["Biomass Collection Charges", "Paddy Straw Collection Expense", "Aggregation Charges", "Loading Charges", "Unloading Charges", "Handling Charges", "Weighment Charges"] },
  { code: 540000, name: "Transportation Costs", category: "Expense", type: "Expense", accounts: ["Feedstock Transportation Expense", "Farm to Storage Transportation", "Storage to Customer Transportation", "Internal Material Transportation", "Freight Inward", "Freight Outward", "Vehicle Hire Charges", "Trolley Hire Charges"] },
  { code: 550000, name: "Storage Costs", category: "Expense", type: "Expense", accounts: ["Biomass Storage Expense", "Paddy Straw Storage Expense", "Silage Storage Expense", "Tarpaulin Expense", "Storage Yard Rent", "Storage Labour", "Stock Handling Expense", "Stock Preservation Expense", "Fumigation / Pest Control Expense"] },
  { code: 560000, name: "Farm Infrastructure Operating Costs", category: "Expense", type: "Expense", accounts: ["Fencing Repair & Maintenance", "Irrigation Repair & Maintenance", "Borewell Repair & Maintenance", "Pump Repair & Maintenance", "Pipeline Repair & Maintenance"] },

  { code: 610000, name: "Employee Costs", category: "Expense", type: "Expense", accounts: ["Salaries", "Wages", "Bonus", "Incentives", "Overtime", "Employer PF Contribution", "Employer ESIC Contribution", "Gratuity Expense", "Leave Encashment Expense", "Staff Welfare", "Recruitment Expense", "Training Expense", "Uniform Expense", "Employee Insurance", "Food & Refreshment", "Accommodation Expense", "Staff Transportation"] },
  { code: 620000, name: "Procurement Expenses", category: "Expense", type: "Expense", accounts: ["Procurement Staff Salary", "Vendor Development Expense", "Vendor Visit Expense", "Procurement Travel Expense", "Inspection Expense", "Material Testing Expense", "Sample Testing Expense", "Purchase Documentation Expense", "Procurement Communication Expense"] },
  { code: 630000, name: "Vehicle & Equipment Expenses", category: "Expense", type: "Expense", accounts: ["Diesel Expense", "Petrol Expense", "Lubricants", "Vehicle Repair & Maintenance", "Tractor Repair & Maintenance", "Farm Machinery Repair & Maintenance", "Harvesting Equipment Repair", "Tyres & Tubes", "Spare Parts Consumption", "Vehicle Insurance", "Vehicle Registration Charges", "Pollution Certificate Expense", "Equipment AMC", "GPS / Tracking Expense"] },

  { code: 710000, name: "Administrative Expenses", category: "Expense", type: "Expense", accounts: ["Office Rent", "Electricity Expense", "Water Charges", "Telephone Expense", "Internet Expense", "Mobile Expense", "Printing & Stationery", "Courier & Postage", "Office Maintenance", "Housekeeping Expense", "Security Expense", "Pantry Expense", "Meeting Expense", "Subscription Expense", "Membership Fee", "Software Subscription", "ERP Expense", "Cloud / Hosting Expense", "IT Support Expense", "Computer Repair Expense", "Office Equipment Repair"] },
  { code: 720000, name: "Travel & Conveyance", category: "Expense", type: "Expense", accounts: ["Local Conveyance", "Employee Travel Expense", "Director Travel Expense", "Airfare", "Railway Fare", "Hotel Expense", "Boarding & Lodging", "Vehicle Running Expense", "Fuel Expense", "Toll Expense", "Parking Expense", "Driver Expense"] },
  { code: 730000, name: "Professional & Legal Expenses", category: "Expense", type: "Expense", accounts: ["Audit Fees", "Accounting Fees", "Legal Fees", "Consultancy Fees", "Professional Fees", "Technical Consultancy", "Tax Consultancy", "GST Consultancy", "Secretarial Fees", "ROC Filing Fees", "Certification Charges", "Valuation Fees", "Survey Charges", "Land Legal Expense", "Documentation Charges"] },

  { code: 810000, name: "Finance Costs", category: "Expense", type: "Expense", accounts: ["Bank Charges", "Payment Gateway Charges", "Loan Processing Charges", "Interest on Term Loan", "Interest on Working Capital", "Interest on Vehicle Loan", "Interest on Equipment Loan", "Penal Interest", "LC / BG Charges", "Bank Guarantee Commission", "Cheque Bounce Charges", "Forex Gain / Loss"] },
  { code: 820000, name: "Depreciation", category: "Expense", type: "Expense", accounts: ["Depreciation - Vehicles", "Depreciation - Farm Machinery", "Depreciation - Harvesting Equipment", "Depreciation - Irrigation Equipment", "Depreciation - Computers", "Depreciation - Furniture", "Depreciation - Office Equipment", "Depreciation - Building", "Depreciation - Electrical Installations"] },
  { code: 830000, name: "Miscellaneous / Exceptional Expenses", category: "Expense", type: "Expense", accounts: ["Insurance Expense", "Loss of Inventory", "Stock Shortage", "Damage / Spoilage Loss", "Paddy Straw Fire Loss", "Crop Loss", "Bad Debts", "Provision for Doubtful Debts", "Penalty & Late Fee", "CSR Expense", "Donation", "Loss on Sale of Asset", "Miscellaneous Expense"] },
];

const roots: Array<[number, string, Category]> = [
  [100000, "Assets", "Asset"],
  [200000, "Liabilities", "Liability"],
  [300000, "Equity", "Equity"],
  [400000, "Revenue", "Income"],
  [500000, "Direct Costs / Cost of Feedstock", "Expense"],
  [600000, "Employee & Operating Expenses", "Expense"],
  [700000, "Administrative & Corporate Expenses", "Expense"],
  [800000, "Finance / Other Expenses", "Expense"],
  [900000, "Control / Temporary Accounts", "Asset"],
];

const rootForCode = (code: number) => roots.find(([start]) => Math.floor(code / 100000) === Math.floor(start / 100000))?.[1] || "—";
const normalFor = (category: Category): "Debit" | "Credit" => ["Liability", "Equity", "Income"].includes(category) ? "Credit" : "Debit";

const record = (code: number | string, name: string, parent: string, category: Category, type: AccountType, slType = "None"): SbrGlSeedRecord => ({
  item_id: `sbr-gl-${code}`,
  code: String(code),
  name,
  parent,
  category,
  type,
  normal: name.startsWith("Accumulated Depreciation") ? "Credit" : normalFor(category),
  control: type === "Control Account",
  direct: !["Header", "Control Account"].includes(type),
  slType,
  balance: 0,
  status: "Active",
  seeded: true,
});

const accountType = (group: GroupDefinition, name: string): AccountType => {
  if (name === "Cash in Hand" || name === "Petty Cash") return "Cash";
  if (/^Bank (Current|Savings|Collection|Payment) Account$/.test(name)) return "Bank";
  if (subLedgerType(name) !== "None") return "Control Account";
  return group.type || "Posting Account";
};

const subLedgerType = (name: string) => {
  if (["Trade Receivables", "Customer Advances Recoverable", "Advance from Customers"].includes(name)) return "Customer";
  if (["Employee Recoverables", "Advance to Employees", "Travel Advance", "Imprest Advance", "Salary Payable", "Wages Payable", "Reimbursement Payable", "Bonus Payable", "Leave Encashment Payable", "Gratuity Payable"].includes(name)) return "Employee";
  if (["Advance to Farmers / Landowners", "Trade Payables - Farmers / Aggregators"].includes(name)) return "Farmer";
  if (name === "Land Lease Payable") return "Landowner";
  if (name === "Contractor Payable") return "Contractor";
  if (["Vendor Recoverables", "Advance to Vendors"].includes(name) || /^Trade Payables - /.test(name)) return "Vendor";
  return "None";
};

export const SBR_GL_SEED: SbrGlSeedRecord[] = [
  ...roots.map(([code, name, category]) => record(code, name, "—", category, "Header")),
  ...groups.flatMap((group) => [
    record(group.code, group.name, rootForCode(group.code), group.category, "Header"),
    ...group.accounts.map((name, index) => record(group.code + index + 1, name, group.name, group.category, accountType(group, name), subLedgerType(name))),
  ]),
];

export const mergeSbrGlSeed = <T extends { code?: unknown }>(records: T[]): Array<T | SbrGlSeedRecord> => {
  const byCode = new Map<string, T | SbrGlSeedRecord>(SBR_GL_SEED.map((item) => [item.code, item]));
  records.forEach((item) => byCode.set(String(item.code || ""), item));
  return Array.from(byCode.values()).sort((a, b) => String(a.code || "").localeCompare(String(b.code || "")));
};
