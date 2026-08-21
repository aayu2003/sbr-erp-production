import { useEffect, useMemo, useRef, useState, type ElementType } from "react";
import {
  Banknote, BookOpen, Building2, CalendarDays, CheckCircle2, ChevronRight,
  Download, Edit3, FileClock, FileKey, FileSpreadsheet, Filter, FolderTree,
  History, Landmark, LayoutList, Link2, LockKeyhole, Network, Plus, Receipt,
  Search, ShieldCheck, Target, Upload, Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CostAccountingSetup from "@/components/accounting/CostAccountingSetup";
import getBaseUrl from "@/lib/config";
import { SBR_GL_SEED, mergeSbrGlSeed } from "@/data/sbrGlSeed";

type Tab = "Chart of Accounts" | "Sub Ledgers" | "Cost Centre" | "Cost Attribution" | "Tax & Statutory" | "Banks & Cash" | "Voucher Setup" | "Financial Setup" | "Mapping & Controls";
type Status = "Active" | "Inactive";
type GL = { id:string; code:string; name:string; parent:string; category:string; type:string; normal:string; control:boolean; slType?:string; direct:boolean; balance:number; status:Status };
type SL = { id:string; code:string; name:string; type:string; source:string; entity:string; control:string; terms:string; balance:number; drcr:"Dr"|"Cr"; status:Status };
type Tax = { id:string; code:string; name:string; section:string; rate:number; nature:string; input:string; output:string; effective:string; status:Status };
type Bank = { id:string; code:string; name:string; account:string; ifsc:string; branch:string; gl:string; balance:number; status:Status };
type Cash = { id:string; code:string; location:string; custodian:string; centre:string; gl:string; limit:number; status:Status };
type Voucher = { id:string; code:string; name:string; prefix:string; numbering:string; approval:boolean; posting:string; status:Status };
type Term = { id:string; code:string; name:string; days:number; description:string; status:Status };
type FY = { id:string; name:string; start:string; end:string; status:"Open"|"Soft Locked"|"Hard Locked"; current:boolean; lock:string };
type Opening = { id:string; type:string; ledger:string; date:string; debit:number; credit:number; reference:string };
type Mapping = { id:string; scope:string; source:string; target:string; gl:string; auto:boolean; status:Status };
type Audit = { id:string; action:string; detail:string; at:string; user:string };
type Data = { gl:GL[]; sl:SL[]; taxes:Tax[]; banks:Bank[]; cash:Cash[]; vouchers:Voucher[]; terms:Term[]; years:FY[]; openings:Opening[]; mappings:Mapping[]; audit:Audit[] };
type Kind = "GL Account"|"Sub Ledger"|"Tax Master"|"Bank Account"|"Cash Master"|"Voucher Type"|"Payment Term"|"Financial Year"|"Opening Balance"|"Mapping Rule";

const LEGACY = "sbr-accounting-master-v1";
const money = (n:number) => new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n);
const input = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-[#278b76] focus:ring-2 focus:ring-[#278b76]/10";
const label = "space-y-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500";

const EMPTY_DATA:Data = { gl:[], sl:[], taxes:[], banks:[], cash:[], vouchers:[], terms:[], years:[], openings:[], mappings:[], audit:[] };

// Every Kind the Creator dialog can produce maps onto one master_type partition in the
// shared admin_accounting_masters table, and onto the Data key its rows live under here.
const MASTER_TYPE_BY_KIND: Record<Kind, string> = {
  "GL Account":"GL_ACCOUNT", "Sub Ledger":"SUB_LEDGER", "Tax Master":"TAX_MASTER", "Bank Account":"BANK_ACCOUNT",
  "Cash Master":"CASH_MASTER", "Voucher Type":"VOUCHER_TYPE", "Payment Term":"PAYMENT_TERM",
  "Financial Year":"FINANCIAL_YEAR", "Opening Balance":"OPENING_BALANCE", "Mapping Rule":"MAPPING_RULE",
};
const DATA_KEY_BY_KIND: Record<Kind, keyof Data> = {
  "GL Account":"gl", "Sub Ledger":"sl", "Tax Master":"taxes", "Bank Account":"banks", "Cash Master":"cash",
  "Voucher Type":"vouchers", "Payment Term":"terms", "Financial Year":"years", "Opening Balance":"openings", "Mapping Rule":"mappings",
};

// Builds one typed row for a kind from a flat field bag — used both for a freshly created
// row (source = the Creator dialog's form state) and for a row just loaded from the API
// (source = the raw saved item), so the two paths can't drift out of shape.
const buildRow = (kind:Kind, id:string, v:Record<string,unknown>): GL|SL|Tax|Bank|Cash|Voucher|Term|FY|Opening|Mapping => {
  const s = (k:string, fallback="") => String(v[k] ?? fallback);
  const n = (k:string) => Number(v[k] ?? 0) || 0;
  const b = (k:string) => Boolean(v[k]);
  if (kind==="GL Account") return {id,code:s("code"),name:s("name"),parent:s("parent","—"),category:s("category"),type:s("type"),normal:s("normal"),control:v.type==="Control Account"||b("control"),slType:s("slType"),direct:v.direct!==undefined?b("direct"):(v.type!=="Header"&&v.type!=="Control Account"),balance:n("balance"),status:(s("status","Active")) as Status} as GL;
  if (kind==="Sub Ledger") return {id,code:s("code"),name:s("name"),type:s("type"),source:s("source"),entity:s("entity"),control:s("control"),terms:s("terms","Immediate"),balance:n("balance"),drcr:(v.drcr as "Dr"|"Cr")||"Dr",status:(s("status","Active")) as Status} as SL;
  if (kind==="Tax Master") return {id,code:s("code"),name:s("name"),section:s("section"),rate:n("rate"),nature:s("nature"),input:s("input"),output:s("output"),effective:s("effective"),status:(s("status","Active")) as Status} as Tax;
  if (kind==="Bank Account") return {id,code:s("code"),name:s("name"),account:s("account").startsWith("••••")?s("account"):`•••• ${s("account").slice(-4)}`,ifsc:s("ifsc"),branch:s("branch"),gl:s("gl"),balance:n("balance"),status:(s("status","Active")) as Status} as Bank;
  if (kind==="Cash Master") return {id,code:s("code"),location:s("location"),custodian:s("custodian"),centre:s("centre"),gl:s("gl"),limit:n("limit"),status:(s("status","Active")) as Status} as Cash;
  if (kind==="Voucher Type") return {id,code:s("code"),name:s("name"),prefix:s("prefix"),numbering:s("numbering"),approval:b("approval"),posting:s("posting"),status:(s("status","Active")) as Status} as Voucher;
  if (kind==="Payment Term") return {id,code:s("code"),name:s("name"),days:n("days"),description:s("description"),status:(s("status","Active")) as Status} as Term;
  if (kind==="Financial Year") return {id,name:s("name"),start:s("start"),end:s("end"),status:(s("fyStatus")||s("status","Open")) as FY["status"],current:b("current"),lock:s("lock")} as FY;
  if (kind==="Opening Balance") return {id,type:s("ledgerType")||s("type"),ledger:s("ledger"),date:s("date"),debit:n("debit"),credit:n("credit"),reference:s("reference")} as Opening;
  return {id,scope:s("scope"),source:s("source"),target:s("target"),gl:s("gl"),auto:b("auto"),status:(s("status","Active")) as Status} as Mapping;
};

const costContext=()=>{try{const v=JSON.parse(localStorage.getItem(LEGACY)||"{}");return{projects:v?.costing?.projects||[],departments:v?.costing?.departments||[],legalEntity:v?.organisation?.legalEntity||"SAI BIORESOURCES PRIVATE LIMITED"}}catch{return{projects:[],departments:[],legalEntity:"SAI BIORESOURCES PRIVATE LIMITED"}}};
const tabs:Array<{label:Tab;icon:ElementType}>=[{label:"Chart of Accounts",icon:FolderTree},{label:"Sub Ledgers",icon:Users},{label:"Cost Centre",icon:Building2},{label:"Cost Attribution",icon:Target},{label:"Tax & Statutory",icon:Receipt},{label:"Banks & Cash",icon:Landmark},{label:"Voucher Setup",icon:FileKey},{label:"Financial Setup",icon:CalendarDays},{label:"Mapping & Controls",icon:Network}];

function Badge({value}:{value:string}){return <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold",["Active","Open","Auto"].includes(value)?"bg-emerald-50 text-emerald-700":value.includes("Lock")||value==="Manual"?"bg-amber-50 text-amber-700":"bg-slate-100 text-slate-500")}>{value}</span>}
function Stat({label,value,detail,icon:Icon}:{label:string;value:string|number;detail:string;icon:ElementType}){return <div className="rounded-xl border bg-white p-4"><div className="flex"><div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-2 text-xl font-bold">{value}</p><p className="mt-1 text-[11px] text-slate-500">{detail}</p></div><span className="ml-auto grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-[#0d5c4d]"><Icon className="h-4 w-4"/></span></div></div>}
function Shell({title,count,actions,children}:{title:string;count:number;actions?:React.ReactNode;children:React.ReactNode}){return <section className="overflow-hidden rounded-xl border bg-white shadow-sm"><div className="flex items-center border-b px-4 py-3"><div><h2 className="text-sm font-bold">{title}</h2><p className="text-[11px] text-slate-400">{count} configured records</p></div><div className="ml-auto flex gap-2">{actions}</div></div>{children}</section>}
function Empty(){return <div className="py-14 text-center"><FileSpreadsheet className="mx-auto h-8 w-8 text-slate-300"/><p className="mt-3 text-sm font-bold">No matching records</p></div>}

function Creator({open,kind,data,onClose,onCreate}:{open:boolean;kind:Kind;data:Data;onClose:()=>void;onCreate:(v:Record<string,string|number|boolean>)=>void}){
  const [v,setV]=useState<Record<string,string|number|boolean>>({status:"Active",category:"Asset",type:"Posting Account",normal:"Debit",section:"GST",posting:"Manual",scope:"Entity",drcr:"Dr"});
  const set=(k:string,x:string|number|boolean)=>setV(c=>({...c,[k]:x}));
  const field=(name:string,key:string,opts?:string[],type="text")=><label className={label}>{name}{opts?<select className={input} value={String(v[key]??opts[0])} onChange={e=>set(key,e.target.value)}>{opts.map(x=><option key={x}>{x}</option>)}</select>:<input className={input} type={type} value={String(v[key]??"")} onChange={e=>set(key,type==="number"?Number(e.target.value):e.target.value)}/>}</label>;
  const save=()=>{if(!String(v.code||v.name||v.source||v.ledger||"").trim())return toast.error("Complete required fields");onCreate(v);setV({status:"Active",category:"Asset",type:"Posting Account",normal:"Debit",section:"GST",posting:"Manual",scope:"Entity",drcr:"Dr"});onClose()};
  return <Dialog open={open} onOpenChange={x=>!x&&onClose()}><DialogContent className="max-h-[90vh] max-w-3xl gap-0 overflow-hidden p-0"><DialogHeader className="bg-[#0d473f] px-6 py-5 text-white"><DialogTitle>Create {kind}</DialogTitle></DialogHeader><div className="max-h-[70vh] overflow-y-auto p-6"><div className="grid gap-4 sm:grid-cols-2">
    {kind==="GL Account"&&<>{field("GL Code *","code")}{field("GL Name *","name")}{field("Parent Group","parent",["Assets","Current Assets","Liabilities","Current Liabilities","Equity","Income","Expenses"])}{field("Category","category",["Asset","Liability","Equity","Income","Expense"])}{field("Account Type","type",["Posting Account","Control Account","Header","Bank","Cash","Tax","Inventory","Fixed Asset","Revenue","Expense"])}{field("Normal Balance","normal",["Debit","Credit"])}{field("Allowed SL Type","slType",["None","Vendor","Contractor","Customer","Employee","Landowner","Farmer"])}{field("Opening Balance","balance",undefined,"number")}</>}
    {kind==="Sub Ledger"&&<>{field("SL Code *","code")}{field("SL Name *","name")}{field("SL Type","type",["Vendor","Contractor","Customer","Employee","Landowner","Farmer","Other Party"])}{field("Linked ERP Master","source",["Vendor Master","Contractor Master","Employee Master","Landowner Master","Customer Master"])}{field("Linked Entity","entity")}{field("Control GL","control",data.gl.filter(x=>x.control).map(x=>x.name))}{field("Opening Balance","balance",undefined,"number")}{field("Dr / Cr","drcr",["Dr","Cr"])}{field("Payment Terms","terms",data.terms.map(x=>x.name))}</>}
    {kind==="Tax Master"&&<>{field("Tax Code *","code")}{field("Tax Name *","name")}{field("Section","section",["GST","TDS","RCM"])}{field("Type / Section","nature")}{field("Rate %","rate",undefined,"number")}{field("Input / Expense GL","input")}{field("Output / Payable GL","output")}{field("Effective From","effective",undefined,"date")}</>}
    {kind==="Bank Account"&&<>{field("Bank Code *","code")}{field("Bank Name *","name")}{field("Account Number","account")}{field("IFSC","ifsc")}{field("Branch","branch")}{field("Linked GL","gl")}{field("Opening Balance","balance",undefined,"number")}</>}
    {kind==="Cash Master"&&<>{field("Cash Code *","code")}{field("Cash Location *","location")}{field("Custodian","custodian")}{field("Cost Centre","centre")}{field("Linked GL","gl")}{field("Cash Limit","limit",undefined,"number")}</>}
    {kind==="Voucher Type"&&<>{field("Voucher Code *","code")}{field("Voucher Name *","name")}{field("Prefix","prefix")}{field("Numbering","numbering",["Sequential","Manual","System Generated"])}{field("Posting","posting",["Auto","Manual"])}</>}
    {kind==="Payment Term"&&<>{field("Code *","code")}{field("Name *","name")}{field("Days","days",undefined,"number")}{field("Description","description")}</>}
    {kind==="Financial Year"&&<>{field("Financial Year *","name")}{field("Start Date","start",undefined,"date")}{field("End Date","end",undefined,"date")}{field("Books Status","fyStatus",["Open","Soft Locked","Hard Locked"])}{field("Lock Date","lock",undefined,"date")}</>}
    {kind==="Opening Balance"&&<>{field("Ledger Type","ledgerType",["GL Account","Sub Ledger","Bank","Cash","Vendor Outstanding","Customer Outstanding"])}{field("Ledger *","ledger")}{field("Date","date",undefined,"date")}{field("Debit","debit",undefined,"number")}{field("Credit","credit",undefined,"number")}{field("Reference","reference")}</>}
    {kind==="Mapping Rule"&&<>{field("Scope","scope",["Entity","Transaction","Tax"])}{field("Source Category *","source")}{field("Target Type","target")}{field("Control / Posting GL","gl")}</>}
  </div></div><div className="flex justify-end gap-2 border-t bg-slate-50 p-4"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} className="bg-[#0d5c4d]">Create Master</Button></div></DialogContent></Dialog>
}

export default function AccountingMaster(){
  const [tab,setTab]=useState<Tab>("Chart of Accounts"),[data,setData]=useState<Data>(EMPTY_DATA),[search,setSearch]=useState(""),[status,setStatus]=useState("All"),[group,setGroup]=useState("All"),[tree,setTree]=useState(false),[kind,setKind]=useState<Kind>("GL Account"),[create,setCreate]=useState(false),[audit,setAudit]=useState(false);
  const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState("");
  const importRef=useRef<HTMLInputElement>(null),glSeedSyncRef=useRef(false),cost=useMemo(costContext,[]),q=search.toLowerCase();
  const baseUrl=String(getBaseUrl()??"").replace(/\/$/,"");

  const syncMissingGlAccounts=async(existing:Array<Record<string,unknown>>)=>{
    if(glSeedSyncRef.current)return;
    const codes=new Set(existing.map(item=>String(item.code??"")));
    const missing=SBR_GL_SEED.filter(item=>!codes.has(item.code));
    if(!missing.length)return;
    glSeedSyncRef.current=true;
    let created=0;
    for(let index=0;index<missing.length;index+=8){
      const batch=missing.slice(index,index+8);
      const results=await Promise.all(batch.map(async item=>{
        const {item_id:_itemId,seeded:_seeded,...payload}=item;
        try{const response=await fetch(`${baseUrl}/admin_accounting_masters/save`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({master_type:"GL_ACCOUNT",data:payload})});return response.ok}catch{return false}
      }));
      created+=results.filter(Boolean).length;
    }
    if(created)toast.success(`${created} SBR GL account${created===1?"":"s"} created`);
    if(created<missing.length)toast.warning(`${missing.length-created} GL accounts could not be synced; they remain available in the seeded master.`);
  };

  const fetchAll=()=>{
    setLoading(true);setLoadError("");
    fetch(`${baseUrl}/admin_accounting_masters/list_all`).then(r=>r.json()).then(res=>{
      if(!res?.success)throw new Error(res?.detail||"Failed to load accounting masters");
      const grouped=res.data as Record<string,Array<Record<string,unknown>>>;
      const next:Data={...EMPTY_DATA};
      (Object.keys(MASTER_TYPE_BY_KIND) as Kind[]).forEach(k=>{
        const apiItems=grouped[MASTER_TYPE_BY_KIND[k]]??[];
        const items=k==="GL Account"?mergeSbrGlSeed(apiItems):apiItems;
        (next[DATA_KEY_BY_KIND[k]] as unknown[])=items.map(it=>buildRow(k,String(it.item_id),it));
      });
      next.audit=(grouped.AUDIT_LOG??[]).map(it=>({id:String(it.item_id),action:String(it.action??""),detail:String(it.detail??""),at:String(it.at??""),user:String(it.user??"")})).reverse();
      setData(next);
      void syncMissingGlAccounts(grouped.GL_ACCOUNT??[]);
    }).catch(e=>{setData(current=>({...current,gl:SBR_GL_SEED.map(item=>buildRow("GL Account",item.item_id,item) as GL)}));setLoadError(e instanceof Error?e.message:"Failed to load accounting masters")}).finally(()=>setLoading(false));
  };
  useEffect(fetchAll,[]);

  const postAudit=async(action:string,detail:string)=>{
    const at=new Date().toLocaleString("en-IN"),user="SBR Admin";
    setData(current=>({...current,audit:[{id:`pending-${Date.now()}`,action,detail,at,user},...current.audit]}));
    try{await fetch(`${baseUrl}/admin_accounting_masters/save`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({master_type:"AUDIT_LOG",data:{action,detail,at,user}})})}catch{/* best-effort log */}
  };
  const match=(...x:unknown[])=>!q||x.some(v=>String(v??"").toLowerCase().includes(q));
  const open=(k?:Kind)=>{const map:Partial<Record<Tab,Kind>>={"Chart of Accounts":"GL Account","Sub Ledgers":"Sub Ledger","Tax & Statutory":"Tax Master","Banks & Cash":"Bank Account","Voucher Setup":"Voucher Type","Financial Setup":"Financial Year","Mapping & Controls":"Mapping Rule"};setKind(k||map[tab]||"GL Account");setCreate(true)};
  const add=async(v:Record<string,string|number|boolean>)=>{
    try{
      const response=await fetch(`${baseUrl}/admin_accounting_masters/save`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({master_type:MASTER_TYPE_BY_KIND[kind],data:v})});
      const result=await response.json().catch(()=>null);
      if(!response.ok||!result?.success)throw new Error(result?.detail||result?.message||"Failed to save");
      const dataKey=DATA_KEY_BY_KIND[kind];
      const row=buildRow(kind,String(result.data.item_id),v);
      setData(current=>({...current,[dataKey]:[...(current[dataKey] as unknown[]),row]} as Data));
      toast.success(`${kind} created`);
      void postAudit(`${kind} created`,String(v.name||v.source||v.ledger||v.code||""));
    }catch(error){toast.error(error instanceof Error?error.message:"Failed to save")}
  };
  const exp=()=>{const b=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="accounting-masters.json";a.click();URL.revokeObjectURL(u)};
  const imp=async(f?:File)=>{
    if(!f)return;
    try{
      const parsed=JSON.parse(await f.text()) as Partial<Data>;
      for(const k of Object.keys(MASTER_TYPE_BY_KIND) as Kind[]){
        const rows=(parsed[DATA_KEY_BY_KIND[k]] as Array<Record<string,unknown>> | undefined)??[];
        for(const row of rows){
          await fetch(`${baseUrl}/admin_accounting_masters/save`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({master_type:MASTER_TYPE_BY_KIND[k],data:row})});
        }
      }
      await postAudit("Masters imported",f.name);
      fetchAll();
      toast.success("Masters imported");
    }catch{toast.error("Invalid file")}
  };
  const readiness=[data.gl.some(x=>x.control),data.sl.length>0,data.taxes.length>0,data.banks.length>0,data.vouchers.length>0,data.mappings.length>0].filter(Boolean).length;

  return <div className="min-h-full bg-[#f6f8fa] p-5 lg:p-8"><div className="mx-auto max-w-[1700px] space-y-5">
    <header className="flex flex-col gap-4 xl:flex-row xl:items-center"><div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#18765f]">Accounts · Master Creations</p><h1 className="mt-1 text-2xl font-bold">Master Creations{loading&&<span className="ml-2 align-middle text-xs font-semibold text-slate-400">Loading…</span>}</h1><p className="mt-1 text-sm text-slate-500">Configure accounting structure, ledgers, taxes, banks and posting controls.</p></div><div className="ml-auto flex flex-wrap gap-2"><input ref={importRef} type="file" className="hidden" accept="application/json" onChange={e=>imp(e.target.files?.[0])}/><Button variant="outline" onClick={()=>importRef.current?.click()}><Upload className="mr-2 h-4 w-4"/>Import</Button><Button variant="outline" onClick={exp}><Download className="mr-2 h-4 w-4"/>Export</Button><Button variant="outline" onClick={()=>setAudit(true)}><History className="mr-2 h-4 w-4"/>Audit Log</Button><Button onClick={()=>open()} className="bg-[#0d5c4d]"><Plus className="mr-2 h-4 w-4"/>Create Master</Button></div></header>
    {loadError&&<div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800">{loadError}</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat label="General Ledgers" value={data.gl.length} detail={`${data.gl.filter(x=>x.control).length} control accounts`} icon={BookOpen}/><Stat label="Sub Ledgers" value={data.sl.length} detail={`${new Set(data.sl.map(x=>x.entity)).size} linked ERP entities`} icon={Users}/><Stat label="Active Financial Year" value={data.years.find(x=>x.current)?.name||"—"} detail={data.years.find(x=>x.current)?.status||"Not configured"} icon={CalendarDays}/><Stat label="Posting Readiness" value={`${readiness} / 6`} detail={readiness===6?"Core setup complete":"Configuration required"} icon={CheckCircle2}/></div>
    <nav className="overflow-x-auto rounded-xl border bg-white p-1"><div className="flex min-w-max gap-1">{tabs.map(({label,icon:Icon})=><button key={label} onClick={()=>{setTab(label);setSearch("");setStatus("All");setGroup("All")}} className={cn("inline-flex h-10 items-center gap-2 rounded-lg px-3 text-xs font-bold",tab===label?"bg-[#0d5c4d] text-white":"text-slate-500 hover:bg-slate-100")}><Icon className="h-3.5 w-3.5"/>{label}</button>)}</div></nav>
    {!(["Cost Centre","Cost Attribution"] as Tab[]).includes(tab)&&<div className="flex flex-col gap-2 rounded-xl border bg-white p-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input className="h-10 w-full rounded-lg border bg-slate-50 pl-9 text-sm outline-none" placeholder="Search ledger, code, entity, category..." value={search} onChange={e=>setSearch(e.target.value)}/></div><select className={cn(input,"sm:w-36")} value={status} onChange={e=>setStatus(e.target.value)}><option>All</option><option>Active</option><option>Inactive</option></select><select className={cn(input,"sm:w-44")} value={group} onChange={e=>setGroup(e.target.value)}><option>All</option>{tab==="Chart of Accounts"&&["Asset","Liability","Equity","Income","Expense"].map(x=><option key={x}>{x}</option>)}{tab==="Sub Ledgers"&&["Vendor","Contractor","Customer","Employee","Landowner"].map(x=><option key={x}>{x}</option>)}{tab==="Tax & Statutory"&&["GST","TDS","RCM"].map(x=><option key={x}>{x}</option>)}</select><Button variant="outline" onClick={()=>{setSearch("");setStatus("All");setGroup("All")}}><Filter className="mr-2 h-4 w-4"/>Clear</Button></div>}

    {tab==="Chart of Accounts"&&(()=>{const rows=data.gl.filter(x=>match(x.code,x.name,x.parent,x.category,x.type)&&(status==="All"||x.status===status)&&(group==="All"||x.category===group));return <Shell title="Chart of Accounts" count={rows.length} actions={<><div className="flex rounded-lg border p-0.5"><button onClick={()=>setTree(true)} className={cn("p-1.5",tree&&"bg-slate-100")}><FolderTree className="h-4 w-4"/></button><button onClick={()=>setTree(false)} className={cn("p-1.5",!tree&&"bg-slate-100")}><LayoutList className="h-4 w-4"/></button></div><Button size="sm" onClick={()=>open("GL Account")} className="bg-[#0d5c4d]"><Plus className="mr-1 h-4 w-4"/>Create GL</Button></>}>{rows.length?<div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr>{["GL Code","Account Name","Parent Group","Category","Account Type","Normal Balance","Balance","Status",""] .map(x=><th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody className="divide-y">{rows.map(x=><tr key={x.id} className="hover:bg-emerald-50/20"><td className="px-4 py-3 font-mono font-bold text-[#0d5c4d]">{x.code}</td><td className="px-4 py-3"><div className="flex" style={{paddingLeft:tree&&x.parent!=="—"?20:0}}>{tree&&x.parent!=="—"&&<ChevronRight className="mr-1 h-3 w-3"/>}<b>{x.name}</b>{x.control&&<span className="ml-2 rounded bg-violet-50 px-1.5 text-[9px] font-bold text-violet-700">CONTROL</span>}</div></td><td className="px-4 py-3 text-slate-500">{x.parent}</td><td className="px-4 py-3">{x.category}</td><td className="px-4 py-3">{x.type}</td><td className="px-4 py-3">{x.normal}</td><td className="px-4 py-3 font-semibold">{money(x.balance)}</td><td className="px-4 py-3"><Badge value={x.status}/></td><td><Edit3 className="h-4 w-4 text-slate-400"/></td></tr>)}</tbody></table></div>:<Empty/>}</Shell>})()}
    {tab==="Sub Ledgers"&&(()=>{const rows=data.sl.filter(x=>match(x.code,x.name,x.entity,x.control)&&(status==="All"||x.status===status)&&(group==="All"||x.type===group));return <Shell title="Sub Ledger Register" count={rows.length} actions={<Button size="sm" onClick={()=>open("Sub Ledger")} className="bg-[#0d5c4d]"><Plus className="mr-1 h-4 w-4"/>Create Sub Ledger</Button>}>{rows.length?<div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr>{["SL Code","Sub Ledger","Type","Linked ERP Master","Control GL","Payment Terms","Outstanding","Status"].map(x=><th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody className="divide-y">{rows.map(x=><tr key={x.id}><td className="px-4 py-3 font-mono font-bold text-[#0d5c4d]">{x.code}</td><td className="px-4 py-3"><b>{x.name}</b><p className="text-[10px] text-slate-400">{x.entity}</p></td><td className="px-4 py-3">{x.type}</td><td className="px-4 py-3"><span className="flex gap-1"><Link2 className="h-3 w-3"/>{x.source}</span></td><td className="px-4 py-3 font-semibold">{x.control}</td><td className="px-4 py-3">{x.terms}</td><td className="px-4 py-3 font-bold">{money(x.balance)} {x.drcr}</td><td className="px-4 py-3"><Badge value={x.status}/></td></tr>)}</tbody></table></div>:<Empty/>}</Shell>})()}
    {tab==="Cost Centre"&&<CostAccountingSetup mode="Cost Centre" projects={cost.projects} departments={cost.departments} legalEntity={cost.legalEntity}/>}
    {tab==="Cost Attribution"&&<CostAccountingSetup mode="Cost Attribution" projects={cost.projects} legalEntity={cost.legalEntity}/>}
    {tab==="Tax & Statutory"&&<Shell title="GST, TDS & RCM Masters" count={data.taxes.length} actions={<Button size="sm" onClick={()=>open("Tax Master")} className="bg-[#0d5c4d]"><Plus className="mr-1 h-4 w-4"/>Create Tax Master</Button>}><div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr>{["Code","Tax / Nature","Section","Rate","Input / Expense GL","Output / Payable GL","Effective","Status"].map(x=><th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody className="divide-y">{data.taxes.filter(x=>match(x.code,x.name,x.section)&&(status==="All"||x.status===status)&&(group==="All"||x.section===group)).map(x=><tr key={x.id}><td className="px-4 py-3 font-mono font-bold text-[#0d5c4d]">{x.code}</td><td className="px-4 py-3"><b>{x.name}</b><p className="text-[10px] text-slate-400">{x.nature}</p></td><td className="px-4 py-3">{x.section}</td><td className="px-4 py-3 font-bold">{x.rate}%</td><td className="px-4 py-3">{x.input}</td><td className="px-4 py-3">{x.output}</td><td className="px-4 py-3">{x.effective}</td><td className="px-4 py-3"><Badge value={x.status}/></td></tr>)}</tbody></table></div></Shell>}
    {tab==="Banks & Cash"&&<div className="space-y-4"><Shell title="Bank Master" count={data.banks.length} actions={<Button size="sm" onClick={()=>open("Bank Account")} className="bg-[#0d5c4d]"><Plus className="mr-1 h-4 w-4"/>Add Bank</Button>}><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr>{["Code","Bank","Account","IFSC / Branch","Linked GL","Opening Balance","Status"].map(x=><th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody className="divide-y">{data.banks.map(x=><tr key={x.id}><td className="px-4 py-3 font-mono font-bold text-[#0d5c4d]">{x.code}</td><td className="px-4 py-3 font-bold">{x.name}</td><td className="px-4 py-3">{x.account}</td><td className="px-4 py-3">{x.ifsc} · {x.branch}</td><td className="px-4 py-3">{x.gl}</td><td className="px-4 py-3 font-bold">{money(x.balance)}</td><td className="px-4 py-3"><Badge value={x.status}/></td></tr>)}</tbody></table></div></Shell><Shell title="Cash Locations" count={data.cash.length} actions={<Button variant="outline" size="sm" onClick={()=>open("Cash Master")}><Plus className="mr-1 h-4 w-4"/>Add Cash Location</Button>}><div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{data.cash.map(x=><div key={x.id} className="rounded-xl border p-4"><Banknote className="h-5 w-5 text-emerald-700"/><p className="mt-3 font-bold">{x.location}</p><p className="font-mono text-[10px] text-[#0d5c4d]">{x.code}</p><p className="mt-3 text-[11px] text-slate-500">Custodian: {x.custodian}<br/>Cost Centre: {x.centre}<br/>Limit: {money(x.limit)}</p></div>)}</div></Shell></div>}
    {tab==="Voucher Setup"&&<div className="space-y-4"><Shell title="Voucher Types" count={data.vouchers.length} actions={<Button size="sm" onClick={()=>open("Voucher Type")} className="bg-[#0d5c4d]"><Plus className="mr-1 h-4 w-4"/>Create Voucher Type</Button>}><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr>{["Code","Voucher Type","Prefix","Numbering","Approval","Posting","Status"].map(x=><th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody className="divide-y">{data.vouchers.map(x=><tr key={x.id}><td className="px-4 py-3 font-mono font-bold text-[#0d5c4d]">{x.code}</td><td className="px-4 py-3 font-bold">{x.name}</td><td className="px-4 py-3 font-mono">{x.prefix}000001</td><td className="px-4 py-3">{x.numbering}</td><td className="px-4 py-3">{x.approval?"Required":"Not required"}</td><td className="px-4 py-3"><Badge value={x.posting}/></td><td className="px-4 py-3"><Badge value={x.status}/></td></tr>)}</tbody></table></div></Shell><Shell title="Payment Terms" count={data.terms.length} actions={<Button variant="outline" size="sm" onClick={()=>open("Payment Term")}><Plus className="mr-1 h-4 w-4"/>Add Payment Term</Button>}><div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">{data.terms.map(x=><div key={x.id} className="rounded-xl border p-4"><span className="font-mono text-xs font-bold text-[#0d5c4d]">{x.code}</span><p className="mt-3 font-bold">{x.name}</p><p className="mt-1 text-xs text-slate-500">{x.days} days · {x.description}</p></div>)}</div></Shell></div>}
    {tab==="Financial Setup"&&<div className="space-y-4"><Shell title="Financial Years & Period Locks" count={data.years.length} actions={<Button size="sm" onClick={()=>open("Financial Year")} className="bg-[#0d5c4d]"><Plus className="mr-1 h-4 w-4"/>Add Financial Year</Button>}><div className="grid gap-3 p-4 md:grid-cols-2">{data.years.map(x=><div key={x.id} className={cn("rounded-xl border p-4",x.current&&"border-emerald-200 bg-emerald-50/30")}><div className="flex"><div><p className="text-lg font-bold">{x.name}</p><p className="text-xs text-slate-500">{x.start} → {x.end}</p></div><div className="ml-auto"><Badge value={x.status}/></div></div><p className="mt-4 flex gap-2 text-[11px] text-slate-500"><LockKeyhole className="h-3.5 w-3.5"/>Lock date: {x.lock||"Not locked"}</p></div>)}</div></Shell><Shell title="Opening Balances" count={data.openings.length} actions={<Button variant="outline" size="sm" onClick={()=>open("Opening Balance")}><Plus className="mr-1 h-4 w-4"/>Add Opening Balance</Button>}><div className="overflow-x-auto"><table className="w-full min-w-[750px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr>{["Ledger Type","Ledger","Date","Debit","Credit","Reference"].map(x=><th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody className="divide-y">{data.openings.map(x=><tr key={x.id}><td className="px-4 py-3">{x.type}</td><td className="px-4 py-3 font-bold">{x.ledger}</td><td className="px-4 py-3">{x.date}</td><td className="px-4 py-3">{x.debit?money(x.debit):"—"}</td><td className="px-4 py-3">{x.credit?money(x.credit):"—"}</td><td className="px-4 py-3">{x.reference}</td></tr>)}</tbody></table></div></Shell></div>}
    {tab==="Mapping & Controls"&&<div className="space-y-4"><div className="grid gap-3 md:grid-cols-3"><Stat label="Entity Mappings" value={data.mappings.filter(x=>x.scope==="Entity").length} detail="ERP master to control GL" icon={Users}/><Stat label="Transaction Mappings" value={data.mappings.filter(x=>x.scope==="Transaction").length} detail="Category to posting GL" icon={Network}/><Stat label="Tax Mappings" value={data.mappings.filter(x=>x.scope==="Tax").length} detail="Tax code to statutory GL" icon={Receipt}/></div><Shell title="Entity, Transaction & Tax Mappings" count={data.mappings.length} actions={<Button size="sm" onClick={()=>open("Mapping Rule")} className="bg-[#0d5c4d]"><Plus className="mr-1 h-4 w-4"/>Create Mapping</Button>}><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr>{["Scope","Source","Target","Control / Posting GL","Auto-create SL","Status"].map(x=><th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody className="divide-y">{data.mappings.map(x=><tr key={x.id}><td className="px-4 py-3">{x.scope}</td><td className="px-4 py-3 font-bold">{x.source}</td><td className="px-4 py-3">{x.target}</td><td className="px-4 py-3 font-semibold text-[#0d5c4d]">{x.gl}</td><td className="px-4 py-3">{x.auto?"Yes":"No"}</td><td className="px-4 py-3"><Badge value={x.status}/></td></tr>)}</tbody></table></div></Shell><div className="grid gap-4 xl:grid-cols-2"><Shell title="Posting Controls" count={4}><div className="divide-y">{[["Maker–Checker","Creator cannot approve the same entry"],["Prevent direct posting to control GL","Posting must identify a sub ledger"],["Hard-lock closed periods","Normal users cannot backdate"],["Require balanced journal","Debits must equal credits"]].map(([a,b])=><div key={a} className="flex items-center gap-3 p-4"><CheckCircle2 className="h-5 w-5 text-emerald-600"/><div><p className="text-xs font-bold">{a}</p><p className="text-[11px] text-slate-400">{b}</p></div><span className="ml-auto h-5 w-9 rounded-full bg-[#0d5c4d] p-0.5"><span className="ml-auto block h-4 w-4 rounded-full bg-white"/></span></div>)}</div></Shell><Shell title="Posting Readiness" count={readiness}><div className="p-5"><div className="h-2 rounded bg-slate-100"><div className="h-full rounded bg-[#0d5c4d]" style={{width:`${readiness/6*100}%`}}/></div><p className="mt-4 font-bold">{readiness===6?"Ready for transaction posting":`${6-readiness} areas remaining`}</p><div className="mt-4 grid grid-cols-2 gap-2">{["Control GLs","Sub Ledgers","GST / TDS","Banks","Voucher Types","Mappings"].map((x,i)=><p key={x} className="flex gap-2 text-xs text-slate-600">{i<readiness?<CheckCircle2 className="h-4 w-4 text-emerald-600"/>:<FileClock className="h-4 w-4 text-amber-500"/>}{x}</p>)}</div></div></Shell></div></div>}
  </div><Creator open={create} kind={kind} data={data} onClose={()=>setCreate(false)} onCreate={add}/><Dialog open={audit} onOpenChange={setAudit}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Accounting Master Audit Log</DialogTitle></DialogHeader><div className="max-h-[60vh] divide-y overflow-auto">{data.audit.map(x=><div key={x.id} className="py-3"><div className="flex"><b>{x.action}</b><time className="ml-auto text-[10px] text-slate-400">{x.at}</time></div><p className="text-xs text-slate-500">{x.detail}</p><p className="text-[10px] font-bold text-[#0d5c4d]">{x.user}</p></div>)}</div></DialogContent></Dialog></div>
}
