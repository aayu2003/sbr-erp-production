import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive, ArrowLeft, Bell, Bold, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock3,
  Download, File, FileText, Filter, Flag, Forward, Inbox, Info, Italic,
  Link2, List, Mail, MailOpen, Megaphone, MoreHorizontal, Paperclip, PenLine,
  Plus, RefreshCw, Reply, ReplyAll, Search, Send, Star, Trash2, Underline,
  UserRound, Users, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

type Folder = "inbox" | "sent" | "drafts" | "starred" | "archived" | "announcements";
type MessageType = "Information" | "Action Required" | "Approval Required" | "Query" | "Reminder" | "Announcement";
type Priority = "Low" | "Normal" | "High" | "Urgent";
type ActionStatus = "Open" | "In Progress" | "Completed" | "Overdue";

type Attachment = { name: string; size: string; source: "Upload" | "ERP Document" };
type Reference = { type: string; number: string; title: string; details: string[]; path?: string };
type MailMessage = {
  id: string;
  threadId: string;
  sender: string;
  senderDesignation: string;
  senderDepartment: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  preview: string;
  type: MessageType;
  priority: Priority;
  sentAt: string;
  read: boolean;
  starred: boolean;
  archived: boolean;
  direction: "received" | "sent";
  attachments: Attachment[];
  reference?: Reference;
  action?: { owner: string; dueDate: string; status: ActionStatus };
  queryStatus?: "Open" | "Answered" | "Closed";
  readBy?: string;
};

type Draft = Partial<MailMessage> & { id: string; updatedAt: string };

const STORE_KEY = "erp_communication_messages_v1";
const DRAFT_KEY = "erp_communication_drafts_v1";

const recipients = [
  { name: "Sharan Kumar", designation: "Purchase Manager", department: "Procurement" },
  { name: "Rajendra Singh", designation: "Director", department: "Management" },
  { name: "Megha Patel", designation: "Accounts Executive", department: "Accounts" },
  { name: "Vikram Sahu", designation: "Field Manager", department: "Operations" },
  { name: "Priya Sharma", designation: "HR Manager", department: "HR" },
  { name: "Accounts", designation: "Department group", department: "Accounts" },
  { name: "Procurement", designation: "Department group", department: "Procurement" },
  { name: "Operations", designation: "Department group", department: "Operations" },
  { name: "Durg Field Team", designation: "Cluster group", department: "Operations" },
];

const seedMessages: MailMessage[] = [
  {
    id: "m-1001", threadId: "t-1001", sender: "Sukhdeep Singh", senderDesignation: "Lead Operations", senderDepartment: "Operations",
    to: ["SBR Admin"], cc: ["Rajendra Singh"], subject: "Process PO for HDPE Pipes",
    body: "Please process the Purchase Order based on the approved commercial and technical comparison.\n\nThe vendor confirmation and relevant documents are attached. Please update the action once the PO has been issued.",
    preview: "Please process the PO based on the approved commercial and technical comparison…", type: "Action Required", priority: "High",
    sentAt: "2026-08-17T10:32:00+05:30", read: false, starred: true, archived: false, direction: "received",
    attachments: [{ name: "Technical Comparison.pdf", size: "1.8 MB", source: "ERP Document" }, { name: "Vendor Confirmation.pdf", size: "620 KB", source: "Upload" }],
    reference: { type: "Purchase Order", number: "PO-2026-00428", title: "Prem Industries", details: ["Project: Napier Cultivation", "Cluster: Durg"], path: "/po-creation" },
    action: { owner: "SBR Admin", dueDate: "2026-08-20", status: "Open" }, readBy: "Seen by 1 of 2",
  },
  {
    id: "m-1002", threadId: "t-1002", sender: "Accounts", senderDesignation: "Department Group", senderDepartment: "Accounts",
    to: ["SBR Admin"], cc: [], subject: "Clarification required against bill",
    body: "Please confirm the GRN quantity against the vendor invoice. We found a variance of 12 units while verifying the bill inward entry.",
    preview: "Please confirm GRN quantity against the vendor invoice…", type: "Query", priority: "Normal",
    sentAt: "2026-08-17T09:48:00+05:30", read: false, starred: false, archived: false, direction: "received", attachments: [],
    reference: { type: "Bill Inward", number: "BI-2026-00184", title: "Prem Industries", details: ["Invoice: PI/884/26", "Amount: ₹4,82,700"] }, queryStatus: "Open",
  },
  {
    id: "m-1003", threadId: "t-1003", sender: "Priya Sharma", senderDesignation: "HR Manager", senderDepartment: "Human Resources",
    to: ["All Employees"], cc: [], subject: "Revised leave policy from September",
    body: "The revised leave policy will be applicable from 1 September 2026. Please review the attached circular and acknowledge it before 25 August.",
    preview: "The revised leave policy will be applicable from 1 September…", type: "Information", priority: "Normal",
    sentAt: "2026-08-16T15:20:00+05:30", read: true, starred: false, archived: false, direction: "received",
    attachments: [{ name: "Leave Policy 2026.pdf", size: "890 KB", source: "ERP Document" }],
  },
  {
    id: "m-1004", threadId: "t-1004", sender: "SBR Admin", senderDesignation: "Super Admin", senderDepartment: "Administration",
    to: ["Vikram Sahu"], cc: [], subject: "Durg field inspection schedule", body: "Please confirm team availability for the field inspection scheduled this Friday.",
    preview: "Please confirm team availability for the field inspection…", type: "Reminder", priority: "Normal",
    sentAt: "2026-08-15T11:05:00+05:30", read: true, starred: false, archived: false, direction: "sent", attachments: [], readBy: "Read 15 Aug, 11:42 AM",
    reference: { type: "Project", number: "PRJ-NAP-DURG", title: "Napier Cultivation", details: ["Cluster: Durg"] },
  },
  {
    id: "m-1005", threadId: "t-1005", sender: "Rajendra Singh", senderDesignation: "Director", senderDepartment: "Management",
    to: ["SBR Admin"], cc: ["Accounts"], subject: "Approval required for PRR",
    body: "The payment release request is ready for review. Please verify the supporting documents before proceeding to the formal approval workflow.",
    preview: "The payment release request is ready for review…", type: "Approval Required", priority: "Urgent",
    sentAt: "2026-08-14T16:10:00+05:30", read: true, starred: false, archived: true, direction: "received", attachments: [],
    reference: { type: "Payment Release Request", number: "PRR-2026-00214", title: "Prem Industries", details: ["Amount: ₹12,40,000", "Stage: Director Approval"], path: "/director/prr-approval" },
    action: { owner: "SBR Admin", dueDate: "2026-08-18", status: "In Progress" },
  },
  {
    id: "a-1001", threadId: "a-1001", sender: "System Administration", senderDesignation: "Communication Admin", senderDepartment: "Administration",
    to: ["All Employees"], cc: [], subject: "ERP maintenance window — Sunday",
    body: "The ERP will be unavailable on Sunday, 23 August, from 8:00 PM to 9:30 PM for scheduled maintenance. Please save all work before the window begins.",
    preview: "Scheduled maintenance on Sunday from 8:00 PM…", type: "Announcement", priority: "High",
    sentAt: "2026-08-17T08:00:00+05:30", read: false, starred: false, archived: false, direction: "received", attachments: [],
  },
];

const folderIcons: Record<Folder, typeof Inbox> = { inbox: Inbox, sent: Send, drafts: FileText, starred: Star, archived: Archive, announcements: Megaphone };
const folderLabels: Record<Folder, string> = { inbox: "Inbox", sent: "Sent", drafts: "Drafts", starred: "Starred", archived: "Archived", announcements: "Announcements" };

const typeClass: Record<MessageType, string> = {
  Information: "bg-slate-100 text-slate-600", "Action Required": "bg-amber-50 text-amber-700 border-amber-200",
  "Approval Required": "bg-violet-50 text-violet-700 border-violet-200", Query: "bg-sky-50 text-sky-700 border-sky-200",
  Reminder: "bg-orange-50 text-orange-700 border-orange-200", Announcement: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const formatTime = (value: string) => {
  const date = new Date(value);
  const now = new Date("2026-08-17T13:00:00+05:30");
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

const initials = (name: string) => name.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase();

const getDefaultRecipients = (mode: "new" | "reply" | "replyAll" | "forward", source: MailMessage | undefined, currentUser: string) =>
  mode === "reply" && source
    ? [source.sender]
    : mode === "replyAll" && source
      ? Array.from(new Set([source.sender, ...source.to, ...source.cc].filter(name => name !== currentUser)))
      : [];

const IconButton = ({ label, children, onClick, active = false }: { label: string; children: React.ReactNode; onClick?: () => void; active?: boolean }) => (
  <Tooltip>
    <TooltipTrigger asChild><button type="button" aria-label={label} onClick={onClick} className={cn("grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900", active && "bg-amber-50 text-amber-500")}>{children}</button></TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
);

function ComposeDialog({ open, onOpenChange, mode, source, draft, onSend, onSaveDraft, currentUser }: {
  open: boolean; onOpenChange: (open: boolean) => void; mode: "new" | "reply" | "replyAll" | "forward";
  source?: MailMessage; draft?: Draft; onSend: (message: MailMessage) => void; onSaveDraft: (draft: Draft) => void; currentUser: string;
}) {
  const [to, setTo] = useState<string[]>(() => draft?.to || getDefaultRecipients(mode, source, currentUser));
  const [cc, setCc] = useState<string[]>(draft?.cc || (mode === "replyAll" && source ? source.cc.filter(n => n !== currentUser) : []));
  const [subject, setSubject] = useState(draft?.subject || (source ? `${mode === "forward" ? "Fwd: " : mode !== "new" && !source.subject.startsWith("Re:") ? "Re: " : ""}${source.subject}` : ""));
  const [body, setBody] = useState(draft?.body || (mode === "forward" && source ? `\n\n--- Forwarded internal message ---\nFrom: ${source.sender}\nSent: ${new Date(source.sentAt).toLocaleString("en-IN")}\n\n${source.body}` : ""));
  const [type, setType] = useState<MessageType>(source?.type === "Announcement" ? "Information" : source?.type || "Information");
  const [priority, setPriority] = useState<Priority>(source?.priority || "Normal");
  const [referenceType, setReferenceType] = useState(source?.reference?.type || "");
  const [referenceNumber, setReferenceNumber] = useState(source?.reference?.number || "");
  const [dueDate, setDueDate] = useState(source?.action?.dueDate || "");
  const [actionOwner, setActionOwner] = useState(source?.action?.owner || "");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTo(draft?.to || getDefaultRecipients(mode, source, currentUser)); setCc(draft?.cc || (mode === "replyAll" && source ? source.cc.filter(n => n !== currentUser) : []));
    setSubject(draft?.subject || (source ? `${mode === "forward" ? "Fwd: " : mode !== "new" && !source.subject.startsWith("Re:") ? "Re: " : ""}${source.subject}` : ""));
    setBody(draft?.body || (mode === "forward" && source ? `\n\n--- Forwarded internal message ---\nFrom: ${source.sender}\nSent: ${new Date(source.sentAt).toLocaleString("en-IN")}\n\n${source.body}` : ""));
    setType(draft?.type || (source?.type === "Announcement" ? "Information" : source?.type || "Information")); setPriority(draft?.priority || source?.priority || "Normal");
    setReferenceType(draft?.reference?.type || source?.reference?.type || ""); setReferenceNumber(draft?.reference?.number || source?.reference?.number || ""); setAttachments(draft?.attachments || []);
  }, [open, mode, source, currentUser, draft]);

  const addRecipient = (value: string, target: "to" | "cc") => {
    if (!value) return;
    const setter = target === "to" ? setTo : setCc;
    setter(list => list.includes(value) ? list : [...list, value]);
  };
  const submit = () => {
    if (!to.length) return toast.error("Add at least one recipient");
    if (!subject.trim()) return toast.error("Subject is required");
    if (!body.trim() && !attachments.length) return toast.error("Write a message or add an attachment");
    const now = new Date().toISOString();
    onSend({
      id: `m-${Date.now()}`, threadId: source?.threadId || `t-${Date.now()}`, sender: currentUser, senderDesignation: "ERP User", senderDepartment: "Administration",
      to, cc, subject: subject.trim(), body: body.trim(), preview: body.trim().replace(/\n/g, " ").slice(0, 100), type, priority, sentAt: now,
      read: true, starred: false, archived: false, direction: "sent", attachments,
      reference: referenceType && referenceNumber ? { type: referenceType, number: referenceNumber, title: "Linked ERP record", details: [] } : source?.reference,
      action: ["Action Required", "Approval Required"].includes(type) ? { owner: actionOwner || to[0], dueDate, status: "Open" } : undefined,
      queryStatus: type === "Query" ? "Open" : undefined, readBy: "Delivered",
    });
    toast.success("Internal message sent", { description: `Delivered inside ERP to ${to.join(", ")}` }); onOpenChange(false);
  };
  const saveDraft = () => {
    if (!subject && !body && !to.length) return onOpenChange(false);
    onSaveDraft({ id: draft?.id || `d-${Date.now()}`, updatedAt: new Date().toISOString(), to, cc, subject, body, type, priority, attachments,
      reference: referenceType && referenceNumber ? { type: referenceType, number: referenceNumber, title: "Linked ERP record", details: [] } : undefined });
    toast.success("Draft saved"); onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => next ? onOpenChange(true) : saveDraft()}>
      <DialogContent className="h-[94vh] max-h-[94vh] !w-[96vw] !max-w-[1600px] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4"><DialogTitle className="flex items-center gap-2 text-base"><PenLine className="h-4 w-4 text-[var(--brand-primary)]" />{mode === "new" ? "New internal message" : mode === "forward" ? "Forward message" : "Reply"}</DialogTitle></DialogHeader>
        <div className="flex h-full min-h-0 flex-col overflow-y-auto">
          <div className="grid grid-cols-[72px_1fr] items-center border-b px-5 py-2.5 text-sm"><span className="text-xs font-semibold uppercase tracking-wide text-slate-400">From</span><span className="font-medium">{currentUser} <span className="ml-2 text-xs font-normal text-slate-400">ERP identity</span></span></div>
          {(["to", "cc"] as const).map(target => <div key={target} className="grid grid-cols-[72px_1fr] items-start border-b px-5 py-2.5 text-sm"><span className="pt-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{target}</span><div className="flex flex-wrap gap-1.5">{(target === "to" ? to : cc).map(name => <span key={name} className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">{name}<button onClick={() => target === "to" ? setTo(to.filter(n => n !== name)) : setCc(cc.filter(n => n !== name))}><X className="h-3 w-3" /></button></span>)}<select aria-label={`Add ${target} recipient`} value="" onChange={e => addRecipient(e.target.value, target)} className="min-w-44 border-0 bg-transparent py-1 text-sm outline-none"><option value="">Add user or group…</option>{recipients.map(r => <option key={r.name} value={r.name}>{r.name} · {r.department}</option>)}</select></div></div>)}
          <div className="grid grid-cols-[72px_1fr] items-center border-b px-5 py-2.5"><label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Subject</label><input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Message subject" className="w-full border-0 text-sm font-medium outline-none placeholder:font-normal" /></div>
          <div className="grid gap-3 border-b bg-slate-50/70 px-5 py-3 sm:grid-cols-4">
            <label className="text-[11px] font-semibold text-slate-500">MESSAGE TYPE<select value={type} onChange={e => setType(e.target.value as MessageType)} className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm font-normal text-slate-700"><option>Information</option><option>Action Required</option><option>Approval Required</option><option>Query</option><option>Reminder</option></select></label>
            <label className="text-[11px] font-semibold text-slate-500">PRIORITY<select value={priority} onChange={e => setPriority(e.target.value as Priority)} className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm font-normal text-slate-700"><option>Low</option><option>Normal</option><option>High</option><option>Urgent</option></select></label>
            <label className="text-[11px] font-semibold text-slate-500">REGARDING<select value={referenceType} onChange={e => setReferenceType(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm font-normal text-slate-700"><option value="">No ERP record</option><option>Purchase Order</option><option>Purchase Request</option><option>Bill Inward</option><option>GRN</option><option>Payment</option><option>Project</option><option>Task</option><option>Employee</option></select></label>
            <label className="text-[11px] font-semibold text-slate-500">REFERENCE ID<input value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)} disabled={!referenceType} placeholder="Search record…" className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm font-normal text-slate-700 disabled:bg-slate-100" /></label>
          </div>
          {["Action Required", "Approval Required"].includes(type) && <div className="grid gap-3 border-b bg-amber-50/50 px-5 py-3 sm:grid-cols-2"><label className="text-[11px] font-semibold text-slate-500">ACTION OWNER<select value={actionOwner} onChange={e => setActionOwner(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm font-normal"><option value="">Primary recipient</option>{to.map(name => <option key={name}>{name}</option>)}</select></label><label className="text-[11px] font-semibold text-slate-500">DUE DATE<input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm font-normal" /></label></div>}
          <div className="flex items-center gap-0.5 border-b px-5 py-2"><IconButton label="Bold"><Bold className="h-4 w-4" /></IconButton><IconButton label="Italic"><Italic className="h-4 w-4" /></IconButton><IconButton label="Underline"><Underline className="h-4 w-4" /></IconButton><span className="mx-2 h-5 border-l" /><IconButton label="Bulleted list"><List className="h-4 w-4" /></IconButton><IconButton label="Insert link"><Link2 className="h-4 w-4" /></IconButton></div>
          <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Write your internal message…" className="min-h-[280px] w-full flex-1 resize-none border-0 px-5 py-4 text-sm leading-6 outline-none" />
          {!!attachments.length && <div className="flex flex-wrap gap-2 border-t px-5 py-3">{attachments.map(file => <span key={file.name} className="inline-flex items-center gap-2 rounded-md border bg-slate-50 px-2.5 py-1.5 text-xs"><Paperclip className="h-3.5 w-3.5" />{file.name}<button onClick={() => setAttachments(attachments.filter(a => a.name !== file.name))}><X className="h-3 w-3" /></button></span>)}</div>}
        </div>
        <div className="flex items-center justify-between border-t bg-slate-50 px-5 py-3"><div className="flex gap-1"><input ref={fileRef} type="file" multiple className="hidden" onChange={e => setAttachments([...attachments, ...Array.from(e.target.files || []).map(f => ({ name: f.name, size: `${Math.max(1, Math.round(f.size / 1024))} KB`, source: "Upload" as const }))])} /><Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}><Paperclip className="mr-1.5 h-4 w-4" />Upload file</Button><Button variant="ghost" size="sm" onClick={() => setAttachments([...attachments, { name: "ERP Document.pdf", size: "Stored in ERP", source: "ERP Document" }])}><FileText className="mr-1.5 h-4 w-4" />ERP document</Button></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={saveDraft}>Save draft</Button><Button size="sm" onClick={submit} className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)]"><Send className="mr-1.5 h-4 w-4" />Send internally</Button></div></div>
      </DialogContent>
    </Dialog>
  );
}

export default function Communication() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const currentUser = user?.name || "SBR Admin";
  const [messages, setMessages] = useState<MailMessage[]>(() => { try { const saved = localStorage.getItem(STORE_KEY); return saved ? JSON.parse(saved) : seedMessages; } catch { return seedMessages; } });
  const [drafts, setDrafts] = useState<Draft[]>(() => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "[]"); } catch { return []; } });
  const [folder, setFolder] = useState<Folder>("inbox");
  const [selectedId, setSelectedId] = useState<string>("m-1001");
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState("All");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<"new" | "reply" | "replyAll" | "forward">("new");
  const [selectedDraft, setSelectedDraft] = useState<Draft | undefined>();
  const [mobileReading, setMobileReading] = useState(false);
  const [mailboxCollapsed, setMailboxCollapsed] = useState(false);

  useEffect(() => { localStorage.setItem(STORE_KEY, JSON.stringify(messages)); window.dispatchEvent(new Event("erp-mail-updated")); }, [messages]);
  useEffect(() => { localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts)); }, [drafts]);

  const unreadCount = messages.filter(m => m.direction === "received" && !m.read && m.type !== "Announcement" && !m.archived).length;
  const actionCount = messages.filter(m => m.direction === "received" && m.action && !["Completed"].includes(m.action.status)).length;
  const visible = useMemo(() => messages.filter(m => {
    if (folder === "inbox" && (m.direction !== "received" || m.archived || m.type === "Announcement")) return false;
    if (folder === "sent" && m.direction !== "sent") return false;
    if (folder === "starred" && !m.starred) return false;
    if (folder === "archived" && !m.archived) return false;
    if (folder === "announcements" && m.type !== "Announcement") return false;
    if (folder === "drafts") return false;
    const haystack = [m.sender, m.to.join(" "), m.subject, m.body, m.reference?.number, m.reference?.title, ...m.attachments.map(a => a.name)].join(" ").toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;
    if (quickFilter === "Unread" && m.read) return false;
    if (quickFilter === "Action Required" && m.type !== "Action Required") return false;
    if (quickFilter === "Approval" && m.type !== "Approval Required") return false;
    if (quickFilter === "Queries" && m.type !== "Query") return false;
    if (quickFilter === "Attachments" && !m.attachments.length) return false;
    if (quickFilter === "High Priority" && !["High", "Urgent"].includes(m.priority)) return false;
    if (quickFilter === "Mentions" && !m.body.includes(`@${currentUser}`)) return false;
    return true;
  }).sort((a, b) => +new Date(b.sentAt) - +new Date(a.sentAt)), [messages, folder, search, quickFilter, currentUser]);
  const selected = messages.find(m => m.id === selectedId) || visible[0];

  const updateMessage = (id: string, patch: Partial<MailMessage>) => setMessages(items => items.map(m => m.id === id ? { ...m, ...patch } : m));
  const openMessage = (message: MailMessage) => {
    const threadRoot = messages.filter(item => item.threadId === message.threadId).sort((first, second) => +new Date(first.sentAt) - +new Date(second.sentAt))[0];
    setSelectedId(threadRoot?.id || message.id);
    setMobileReading(true);
    if (!message.read) updateMessage(message.id, { read: true });
  };
  const beginCompose = (mode: typeof composeMode = "new") => { setSelectedDraft(undefined); setComposeMode(mode); setComposeOpen(true); };
  const changeFolder = (next: Folder) => { setFolder(next); setMobileReading(false); setQuickFilter("All"); setSearch(""); };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#fbfcfc] text-[#14213d]">
      <header className="shrink-0 border-b border-slate-200 bg-white px-5 py-4 lg:px-6">
        <div className="flex items-center gap-4"><div className="min-w-52"><h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-950">Mail</h1><p className="mt-0.5 text-xs font-medium text-slate-500">Internal ERP communication</p></div><div className="relative ml-auto hidden w-full max-w-[560px] md:block"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search messages, people, ERP references…" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/80 pl-10 pr-16 text-sm shadow-sm outline-none transition focus:border-emerald-700 focus:bg-white focus:ring-2 focus:ring-emerald-700/10" /><span className="absolute right-3 top-1/2 -translate-y-1/2 rounded border bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">⌘ K</span></div><Button onClick={() => beginCompose()} className="h-10 rounded-xl bg-[var(--brand-primary)] px-4 shadow-sm hover:bg-[var(--brand-primary-hover)]"><Plus className="mr-2 h-4 w-4" />New message<ChevronDown className="ml-3 h-3.5 w-3.5 border-l border-white/20 pl-1" /></Button></div>
        <div className="relative mt-3 md:hidden"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search messages…" className="h-9 w-full rounded-lg border bg-slate-50 pl-9 pr-3 text-sm" /></div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className={cn("shrink-0 border-r border-slate-200 bg-white p-3 transition-[width] duration-200", mailboxCollapsed ? "w-[68px]" : "w-[260px] p-4", mobileReading && "hidden xl:block")}>
          <div className={cn("mb-3 flex h-7 items-center", mailboxCollapsed ? "justify-center" : "px-2")}>
            {!mailboxCollapsed && <p className="text-xs font-bold text-slate-800">Mailbox</p>}
            <button type="button" title={mailboxCollapsed ? "Expand mailbox" : "Collapse mailbox"} onClick={() => setMailboxCollapsed(value => !value)} className={cn("grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700", !mailboxCollapsed && "ml-auto")}>
              {mailboxCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>
          <nav className="space-y-1">{(Object.keys(folderLabels) as Folder[]).map(key => { const Icon = folderIcons[key]; const count = key === "inbox" ? unreadCount : key === "drafts" ? drafts.length : key === "announcements" ? messages.filter(m => m.type === "Announcement" && !m.read).length : 0; return <button key={key} title={mailboxCollapsed ? folderLabels[key] : undefined} onClick={() => changeFolder(key)} className={cn("relative flex h-10 w-full items-center whitespace-nowrap rounded-xl text-[13px] font-semibold transition-colors", mailboxCollapsed ? "justify-center px-0" : "gap-3 px-3", folder === key ? "bg-gradient-to-r from-emerald-50 to-emerald-100/70 text-emerald-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900")}><Icon className="h-4 w-4 shrink-0" />{!mailboxCollapsed && <span className="min-w-0 flex-1 text-left">{folderLabels[key]}</span>}{count > 0 && <span className={cn("grid shrink-0 place-items-center rounded-full text-[10px] font-bold", mailboxCollapsed ? "absolute right-0.5 top-0.5 h-4 min-w-4 bg-emerald-600 px-1 text-white" : "h-6 min-w-6 px-1.5", !mailboxCollapsed && (folder === key ? "bg-emerald-200 text-emerald-900" : "bg-slate-100 text-slate-500"))}>{count}</span>}</button>; })}</nav>
          <div className="my-4 border-t border-slate-100" />{!mailboxCollapsed && <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Smart views</p>}{[{ label: "All", count: messages.filter(m => m.direction === "received" && !m.archived).length, icon: Inbox }, { label: "Unread", count: unreadCount, icon: MailOpen }, { label: "Action Required", count: actionCount, icon: CheckCircle2 }, { label: "Approval Required", count: messages.filter(m => m.type === "Approval Required").length, icon: ClipboardCheckIcon }, { label: "Queries", count: messages.filter(m => m.type === "Query").length, icon: Info }, { label: "High Priority", count: 2, icon: Flag }, { label: "Mentions", count: 0, icon: UserRound }].map(item => <button key={item.label} title={mailboxCollapsed ? item.label : undefined} onClick={() => { setFolder("inbox"); setQuickFilter(item.label === "Approval Required" ? "Approval" : item.label); }} className={cn("relative flex h-9 w-full items-center whitespace-nowrap rounded-lg text-xs font-medium transition-colors hover:bg-slate-50", mailboxCollapsed ? "justify-center px-0" : "gap-3 px-3", quickFilter === item.label || (item.label === "Approval Required" && quickFilter === "Approval") ? "bg-emerald-50 text-emerald-800" : "text-slate-600")}><item.icon className="h-3.5 w-3.5 shrink-0" />{!mailboxCollapsed && <span className="min-w-0 flex-1 text-left">{item.label}</span>}{item.count > 0 && <span className={cn("grid shrink-0 place-items-center rounded-full border font-semibold", mailboxCollapsed ? "absolute right-0 top-0 h-4 min-w-4 border-white bg-slate-500 px-1 text-[9px] text-white" : "h-5 min-w-5 border-slate-200 bg-white px-1 text-[10px] text-slate-500")}>{item.count}</span>}</button>)}
          {mailboxCollapsed ? <button title={`Attention: ${unreadCount} unread, ${actionCount} actions`} className="mt-5 grid h-10 w-full place-items-center rounded-xl border border-slate-200 text-emerald-700 hover:bg-slate-50"><Bell className="h-4 w-4" /></button> : <div className="mt-5 rounded-xl border border-slate-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,.03)]"><div className="flex items-center gap-2 text-xs font-bold text-slate-800"><Bell className="h-3.5 w-3.5 text-emerald-700" />Attention</div><div className="mt-3 grid grid-cols-2 divide-x text-center"><div><p className="text-xl font-semibold text-slate-900">{unreadCount}</p><p className="mt-0.5 text-[10px] text-slate-500">Unread</p></div><div><p className="text-xl font-semibold text-slate-900">{actionCount}</p><p className="mt-0.5 text-[10px] text-slate-500">Actions</p></div></div></div>}
        </aside>

        <section className={cn("flex min-w-[330px] flex-1 flex-col border-r border-slate-200 bg-white lg:max-w-[425px]", mobileReading && "hidden lg:flex")}>
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 px-4"><h2 className="text-sm font-bold text-slate-900">{folderLabels[folder]}</h2><span className="text-xs font-medium text-slate-400">{folder === "drafts" ? drafts.length : visible.length}</span><div className="ml-auto flex items-center gap-1"><DropdownMenu><DropdownMenuTrigger asChild><button className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 shadow-sm"><Filter className="h-3.5 w-3.5" />{quickFilter}<ChevronDown className="h-3 w-3" /></button></DropdownMenuTrigger><DropdownMenuContent align="end">{["All", "Unread", "Action Required", "Approval", "Queries", "Attachments"].map(f => <DropdownMenuItem key={f} onClick={() => setQuickFilter(f)}>{f}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu><button className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600">Latest<ChevronDown className="h-3 w-3" /></button><IconButton label="Refresh" onClick={() => toast.success("Inbox is up to date")}><RefreshCw className="h-4 w-4" /></IconButton></div></div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {folder === "drafts" ? drafts.length ? drafts.map(d => <button key={d.id} onClick={() => { setSelectedDraft(d); setComposeMode("new"); setComposeOpen(true); }} className="block w-full border-b border-slate-100 px-5 py-4 text-left transition hover:bg-slate-50"><div className="flex items-center"><span className="text-sm font-semibold text-amber-700">Draft</span><span className="ml-auto text-[11px] text-slate-400">{formatTime(d.updatedAt)}</span></div><p className="mt-1 truncate text-sm font-semibold text-slate-900">{d.subject || "No subject"}</p><p className="mt-1 truncate text-xs text-slate-500">{d.body || "Empty draft"}</p></button>) : <EmptyState title="No saved drafts" text="Messages you save will appear here." /> : visible.length ? visible.map(message => (
              <button key={message.id} onClick={() => openMessage(message)} className={cn("group block w-full border-b border-slate-100 px-4 py-4 text-left transition-colors hover:bg-slate-50/80", selected?.id === message.id && "bg-gradient-to-r from-emerald-50/80 to-emerald-50/30 hover:bg-emerald-50", !message.read && selected?.id !== message.id && "bg-sky-50/20")}>
                <div className="flex items-start gap-3">
                  <div className={cn("relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold", message.senderDepartment === "Accounts" ? "bg-emerald-100 text-emerald-800" : message.senderDepartment === "Human Resources" ? "bg-pink-100 text-pink-700" : message.senderDepartment === "Management" ? "bg-orange-100 text-orange-700" : "bg-indigo-100 text-indigo-700")}>
                    {initials(folder === "sent" ? message.to[0] || "To" : message.sender)}
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className={cn("truncate text-[13px] text-slate-900", !message.read ? "font-bold" : "font-semibold")}>{folder === "sent" ? `To: ${message.to.join(", ")}` : message.sender}</span><span className="ml-auto shrink-0 text-[10px] font-medium text-slate-400">{formatTime(message.sentAt)}</span></div>
                    <p className={cn("mt-1 truncate text-[13px] text-slate-900", !message.read ? "font-bold" : "font-semibold")}>{message.subject}</p>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-slate-500">{message.preview}</p>
                    <div className="mt-2.5 flex items-center gap-1.5">{message.reference && <span className="max-w-32 truncate rounded-md border border-slate-200 bg-white px-2 py-1 text-[9px] font-semibold text-slate-600">{message.reference.number}</span>}<span className={cn("rounded-md border border-transparent px-2 py-1 text-[9px] font-bold uppercase tracking-wide", typeClass[message.type])}>{message.type}</span>{["High", "Urgent"].includes(message.priority) && <Flag className={cn("h-3 w-3", message.priority === "Urgent" ? "fill-orange-500 text-orange-500" : "text-orange-500")} />}{!!message.attachments.length && <Paperclip className="h-3 w-3 text-slate-400" />}<button aria-label="Star message" onClick={e => { e.stopPropagation(); updateMessage(message.id, { starred: !message.starred }); }} className="ml-auto p-1"><Star className={cn("h-4 w-4 text-slate-300", message.starred && "fill-amber-400 text-amber-400")} /></button></div>
                  </div>
                </div>
              </button>
            )) : <EmptyState title={search ? "No matching messages found" : `No ${folderLabels[folder].toLowerCase()}`} text={search ? "Try changing your search or filters." : "Internal communication will appear here."} />}
          </div>
        </section>

        <main className={cn("min-w-0 flex-1 overflow-y-auto bg-white", !mobileReading && "hidden lg:block")}>
          {selected ? <CorporateMessagePane message={selected} threadMessages={messages.filter(item => item.threadId === selected.threadId)} currentUser={currentUser} onBack={() => setMobileReading(false)} onUpdate={patch => updateMessage(selected.id, patch)} onSendReply={reply => setMessages(items => [...items, reply])} onOpenReference={() => selected.reference?.path ? navigate(selected.reference.path) : toast.info("Record lookup is ready for backend integration")} onCreateTask={() => navigate(`/on-demand-task/new?source=communication&message=${selected.id}`)} /> : <EmptyState title="Select a message" text="Choose a message from the list to read it." />}
        </main>
      </div>
      <ComposeDialog open={composeOpen} onOpenChange={setComposeOpen} mode={composeMode} source={composeMode === "new" ? undefined : selected} draft={selectedDraft} currentUser={currentUser} onSend={message => { setMessages(items => [message, ...items]); if (selectedDraft) setDrafts(items => items.filter(d => d.id !== selectedDraft.id)); }} onSaveDraft={draft => setDrafts(items => [draft, ...items.filter(d => d.id !== draft.id)])} />
    </div>
  );
}

const ClipboardCheckIcon = CheckCircle2;

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="grid min-h-56 place-items-center p-6 text-center"><div><Mail className="mx-auto h-8 w-8 text-slate-300" /><h3 className="mt-3 text-sm font-semibold">{title}</h3><p className="mt-1 text-xs text-slate-500">{text}</p></div></div>;
}

function MessagePane({ message, onBack, onUpdate, onReply, onOpenReference, onCreateTask }: { message: MailMessage; onBack: () => void; onUpdate: (patch: Partial<MailMessage>) => void; onReply: (mode: "reply" | "replyAll" | "forward") => void; onOpenReference: () => void; onCreateTask: () => void }) {
  return <div className="mx-auto max-w-4xl">
    <div className="sticky top-0 z-10 flex h-12 items-center gap-1 border-b bg-white/95 px-4 backdrop-blur"><button onClick={onBack} className="mr-1 grid h-8 w-8 place-items-center rounded-md hover:bg-slate-100 lg:hidden"><ArrowLeft className="h-4 w-4" /></button><IconButton label="Reply" onClick={() => onReply("reply")}><Reply className="h-4 w-4" /></IconButton><IconButton label="Reply all" onClick={() => onReply("replyAll")}><ReplyAll className="h-4 w-4" /></IconButton><IconButton label="Forward" onClick={() => onReply("forward")}><Forward className="h-4 w-4" /></IconButton><span className="mx-1 h-5 border-l" /><IconButton label={message.archived ? "Move to inbox" : "Archive"} onClick={() => { onUpdate({ archived: !message.archived }); toast.success(message.archived ? "Moved to inbox" : "Message archived"); }}><Archive className="h-4 w-4" /></IconButton><IconButton label="Mark unread" onClick={() => onUpdate({ read: false })}><MailOpen className="h-4 w-4" /></IconButton><IconButton label="Star" active={message.starred} onClick={() => onUpdate({ starred: !message.starred })}><Star className={cn("h-4 w-4", message.starred && "fill-current")} /></IconButton><DropdownMenu><DropdownMenuTrigger asChild><button className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100"><MoreHorizontal className="h-4 w-4" /></button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem onClick={() => window.print()}>Print</DropdownMenuItem><DropdownMenuItem onClick={() => { navigator.clipboard?.writeText(`${location.origin}/communication?message=${message.id}`); toast.success("Message link copied"); }}>Copy link</DropdownMenuItem><DropdownMenuItem onClick={() => toast.info("Escalation recorded for review")}>Report / escalate</DropdownMenuItem></DropdownMenuContent></DropdownMenu><span className="ml-auto text-[11px] text-slate-400">{message.readBy || (message.read ? "Read" : "Unread")}</span></div>
    <article className="p-5 md:p-7"><div className="flex flex-wrap items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">{initials(message.sender)}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline gap-x-2"><h2 className="font-semibold text-slate-900">{message.sender}</h2><span className="text-xs text-slate-500">{message.senderDesignation} · {message.senderDepartment}</span></div><p className="mt-0.5 text-xs text-slate-500">To: {message.to.join(", ")}{message.cc.length ? ` · CC: ${message.cc.join(", ")}` : ""}</p></div><time className="text-xs text-slate-500">{new Date(message.sentAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>
      <h1 className="mt-6 text-xl font-semibold tracking-tight text-slate-950">{message.subject}</h1><div className="mt-2 flex flex-wrap gap-2"><span className={cn("rounded border border-transparent px-2 py-1 text-[10px] font-bold uppercase tracking-wide", typeClass[message.type])}>{message.type}</span>{message.priority !== "Normal" && <span className={cn("rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-wide", message.priority === "Urgent" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-700")}>{message.priority} priority</span>}</div>
      {message.reference && <section className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Regarding</p><div className="mt-2 flex flex-wrap items-start gap-4"><div className="grid h-9 w-9 place-items-center rounded-md bg-white text-emerald-700 shadow-sm"><FileText className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="text-xs text-slate-500">{message.reference.type}</p><p className="font-semibold text-slate-900">{message.reference.number}</p><p className="mt-1 text-xs font-medium text-slate-700">{message.reference.title}</p>{message.reference.details.map(line => <span key={line} className="mr-3 text-xs text-slate-500">{line}</span>)}</div><Button variant="outline" size="sm" onClick={onOpenReference} className="bg-white"><Link2 className="mr-1.5 h-3.5 w-3.5" />Open record</Button></div></section>}
      <div className="whitespace-pre-wrap py-6 text-sm leading-7 text-slate-700">{message.body}</div>
      {!!message.attachments.length && <section className="border-t py-4"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Attachments · {message.attachments.length}</h3><div className="flex flex-wrap gap-2">{message.attachments.map(file => <button key={file.name} onClick={() => toast.info(`Previewing ${file.name}`)} className="flex min-w-52 items-center gap-3 rounded-lg border p-2.5 text-left hover:bg-slate-50"><span className="grid h-8 w-8 place-items-center rounded bg-slate-100"><File className="h-4 w-4 text-slate-500" /></span><span className="min-w-0"><span className="block truncate text-xs font-semibold">{file.name}</span><span className="text-[10px] text-slate-400">{file.size} · {file.source}</span></span><Download className="ml-auto h-3.5 w-3.5 text-slate-400" /></button>)}</div></section>}
      {message.action && <section className="border-t py-4"><div className="rounded-lg border bg-slate-50 p-4"><div className="flex flex-wrap items-center gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Action</p><p className="mt-1 text-sm font-semibold">Assigned to {message.action.owner}</p><p className="text-xs text-slate-500">Due {new Date(message.action.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p></div><span className={cn("ml-auto rounded-full px-2.5 py-1 text-xs font-semibold", message.action.status === "Completed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{message.action.status}</span></div><div className="mt-3 flex flex-wrap gap-2">{message.action.status === "Open" && <Button variant="outline" size="sm" onClick={() => onUpdate({ action: { ...message.action!, status: "In Progress" } })}><Clock3 className="mr-1.5 h-3.5 w-3.5" />Start action</Button>}<Button size="sm" disabled={message.action.status === "Completed"} onClick={() => { onUpdate({ action: { ...message.action!, status: "Completed" } }); toast.success("Action marked complete"); }} className="bg-emerald-700 hover:bg-emerald-800"><Check className="mr-1.5 h-3.5 w-3.5" />Mark complete</Button><Button variant="outline" size="sm" onClick={onCreateTask}>Create task</Button></div></div></section>}
      {message.type === "Approval Required" && <section className="border-t py-4"><div className="flex flex-wrap gap-2"><Button size="sm" onClick={onOpenReference} className="bg-violet-700 hover:bg-violet-800">Open approval</Button><Button variant="outline" size="sm" onClick={() => toast.success("Approval action passed to the linked workflow")}>Approve</Button><Button variant="outline" size="sm" onClick={() => toast.info("Opened Send Back in the approval workflow")}>Send back</Button></div><p className="mt-2 text-[11px] text-slate-500">Approval decisions use the linked ERP workflow and are not duplicated in Mail.</p></section>}
      {message.type === "Query" && <section className="border-t py-4"><div className="flex items-center gap-3"><span className="text-xs font-medium text-slate-600">Query status: {message.queryStatus}</span><Button variant="outline" size="sm" disabled={message.queryStatus === "Closed"} onClick={() => { onUpdate({ queryStatus: "Closed" }); toast.success("Query closed"); }}>Close query</Button></div></section>}
      <div className="flex flex-wrap gap-2 border-t py-5"><Button variant="outline" size="sm" onClick={() => onReply("reply")}><Reply className="mr-1.5 h-4 w-4" />Reply</Button><Button variant="outline" size="sm" onClick={() => onReply("replyAll")}><ReplyAll className="mr-1.5 h-4 w-4" />Reply all</Button><Button variant="outline" size="sm" onClick={() => onReply("forward")}><Forward className="mr-1.5 h-4 w-4" />Forward</Button></div>
    </article>
  </div>;
}

type MessagePaneProps = {
  message: MailMessage;
  threadMessages: MailMessage[];
  currentUser: string;
  onBack: () => void;
  onUpdate: (patch: Partial<MailMessage>) => void;
  onSendReply: (message: MailMessage) => void;
  onOpenReference: () => void;
  onCreateTask: () => void;
};

function CorporateMessagePane({ message, threadMessages, currentUser, onBack, onUpdate, onSendReply, onOpenReference, onCreateTask }: MessagePaneProps) {
  const [inlineMode, setInlineMode] = useState<"reply" | "replyAll" | "forward" | null>(null);
  const [inlineBody, setInlineBody] = useState("");
  const [inlineAttachments, setInlineAttachments] = useState<Attachment[]>([]);
  const [forwardTo, setForwardTo] = useState<string[]>([]);
  const inlineReplyRef = useRef<HTMLDivElement>(null);
  const inlineFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInlineMode(null);
    setInlineBody("");
    setInlineAttachments([]);
    setForwardTo([]);
  }, [message.id]);

  const openInlineReply = (mode: "reply" | "replyAll" | "forward") => {
    setInlineMode(mode);
    setInlineBody("");
    setInlineAttachments([]);
    setForwardTo([]);
    window.setTimeout(() => inlineReplyRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 0);
  };

  const replyRecipients = inlineMode === "forward"
    ? forwardTo
    : inlineMode === "replyAll"
      ? Array.from(new Set([message.sender, ...message.to, ...message.cc].filter(name => name !== currentUser)))
      : [message.sender];

  const conversationReplies = threadMessages
    .filter(item => item.id !== message.id)
    .sort((first, second) => +new Date(first.sentAt) - +new Date(second.sentAt));
  const printableThread = [...threadMessages].sort((first, second) => +new Date(first.sentAt) - +new Date(second.sentAt));

  const sendInlineReply = () => {
    if (!replyRecipients.length) return toast.error("Add a recipient before forwarding");
    if (!inlineBody.trim() && !inlineAttachments.length) return toast.error("Write a reply or add an attachment");
    onSendReply({
      id: `m-${Date.now()}`,
      threadId: message.threadId,
      sender: currentUser,
      senderDesignation: "ERP User",
      senderDepartment: "Administration",
      to: replyRecipients,
      cc: inlineMode === "replyAll" ? message.cc.filter(name => name !== currentUser) : [],
      subject: `${inlineMode === "forward" ? "Fwd" : "Re"}: ${message.subject.replace(/^(Re|Fwd):\s*/i, "")}`,
      body: inlineBody.trim(),
      preview: inlineBody.trim().replace(/\n/g, " ").slice(0, 100),
      type: message.type === "Announcement" ? "Information" : message.type,
      priority: message.priority,
      sentAt: new Date().toISOString(),
      read: true,
      starred: false,
      archived: false,
      direction: "sent",
      attachments: inlineAttachments,
      reference: message.reference,
      readBy: "Delivered",
    });
    toast.success(inlineMode === "forward" ? "Message forwarded" : "Reply sent");
    setInlineMode(null);
    setInlineBody("");
    setInlineAttachments([]);
    setForwardTo([]);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-slate-200 px-4">
        <button onClick={onBack} className="mr-1 grid h-8 w-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"><ArrowLeft className="h-4 w-4" /></button>
        <IconButton label="Back"><ArrowLeft className="h-4 w-4" /></IconButton>
        <span className="mx-1 h-5 border-l border-slate-200" />
        <IconButton label="Reply" onClick={() => openInlineReply("reply")}><Reply className="h-4 w-4" /></IconButton>
        <IconButton label="Reply all" onClick={() => openInlineReply("replyAll")}><ReplyAll className="h-4 w-4" /></IconButton>
        <IconButton label="Forward" onClick={() => openInlineReply("forward")}><Forward className="h-4 w-4" /></IconButton>
        <IconButton label={message.archived ? "Move to inbox" : "Archive"} onClick={() => { onUpdate({ archived: !message.archived }); toast.success(message.archived ? "Moved to inbox" : "Message archived"); }}><Archive className="h-4 w-4" /></IconButton>
        <IconButton label="Delete"><Trash2 className="h-4 w-4" /></IconButton>
        <IconButton label="Star" active={message.starred} onClick={() => onUpdate({ starred: !message.starred })}><Star className={cn("h-4 w-4", message.starred && "fill-current")} /></IconButton>
        <DropdownMenu><DropdownMenuTrigger asChild><button className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><MoreHorizontal className="h-4 w-4" /></button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem onClick={() => window.print()}>Print conversation</DropdownMenuItem><DropdownMenuItem onClick={() => { navigator.clipboard?.writeText(`${location.origin}/communication?message=${message.id}`); toast.success("Message link copied"); }}>Copy link</DropdownMenuItem><DropdownMenuItem onClick={() => toast.info("Escalation recorded for review")}>Report / escalate</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        <button onClick={() => onUpdate({ read: !message.read })} className="ml-auto flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"><MailOpen className="h-3.5 w-3.5" />{message.read ? "Mark as unread" : "Mark as read"}<ChevronDown className="h-3 w-3" /></button>
        <span className="ml-2 text-[10px] font-semibold text-emerald-700">{message.read ? "Read" : "Unread"}</span>
      </div>

      <PrintThreadView subject={message.subject} reference={message.reference} messages={printableThread} />

      <div className="min-h-0 flex-1">
        <article className="h-full min-w-0 overflow-y-auto px-5 py-5 lg:px-7">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">{initials(message.sender)}</div>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline gap-x-2"><h2 className="text-[15px] font-bold text-slate-950">{message.sender}</h2><span className="text-[11px] font-medium text-slate-500">{message.senderDesignation} · {message.senderDepartment}</span></div><p className="mt-1 text-xs text-slate-500">To: {message.to.join(", ")}</p>{message.cc.length > 0 && <p className="mt-1 text-xs text-slate-500">CC: {message.cc.join(", ")}</p>}</div>
            <div className="text-right"><time className="whitespace-nowrap text-[10px] font-medium text-slate-500">{new Date(message.sentAt).toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time><div className="mt-3 flex justify-end gap-2"><span className={cn("rounded-md border border-transparent px-2 py-1 text-[9px] font-bold uppercase tracking-wide", typeClass[message.type])}>{message.type}</span>{message.starred && <Star className="h-5 w-5 fill-amber-400 text-amber-400" />}</div></div>
          </div>

          <h1 className="mt-8 text-[21px] font-semibold tracking-[-0.02em] text-slate-950">{message.subject}</h1>
          {message.reference && <section className="mt-5 rounded-xl border border-emerald-200/80 bg-emerald-50/20 px-3.5 py-3"><div className="flex items-center gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-emerald-100 bg-white text-emerald-700"><FileText className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2"><span className="text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-700">Regarding</span><span className="text-[11px] text-slate-400">·</span><span className="text-[11px] text-slate-500">{message.reference.type}</span><strong className="text-[14px] font-bold text-slate-950">{message.reference.number}</strong></div><div className="mt-1 flex flex-wrap items-center gap-x-3"><span className="text-xs font-semibold text-slate-700">{message.reference.title}</span>{message.reference.details.map(line => <span key={line} className="text-[11px] text-slate-500">{line}</span>)}</div></div><Button variant="outline" size="sm" onClick={onOpenReference} className="h-8 shrink-0 rounded-lg bg-white px-3 text-xs"><Link2 className="mr-1.5 h-3.5 w-3.5" />Open record</Button></div></section>}

          <div className="whitespace-pre-wrap py-7 text-[13px] leading-7 text-slate-700">{message.body}</div>

          {message.type === "Query" && <div className="flex items-center gap-3 border-y border-slate-100 py-4"><span className="text-xs text-slate-500">Query status: <strong className="font-semibold text-slate-700">{message.queryStatus}</strong></span><Button variant="outline" size="sm" disabled={message.queryStatus === "Closed"} onClick={() => { onUpdate({ queryStatus: "Closed" }); toast.success("Query closed"); }} className="rounded-lg text-xs">Close query</Button></div>}

          {!!message.attachments.length && <section className="border-b border-slate-100 py-5"><h3 className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-800"><Paperclip className="h-3.5 w-3.5" />Attachments <span className="font-medium text-slate-400">({message.attachments.length})</span></h3><div className="space-y-2">{message.attachments.map(file => <button key={file.name} onClick={() => toast.info(`Previewing ${file.name}`)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:bg-slate-50"><span className="grid h-9 w-9 place-items-center rounded-lg bg-rose-50 text-rose-500"><File className="h-4 w-4" /></span><span className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-800">{file.name}</span><span className="text-[10px] text-slate-400">{file.size}</span></span><Download className="ml-auto h-4 w-4 text-slate-500" /><Info className="h-4 w-4 text-slate-500" /><MoreHorizontal className="h-4 w-4 text-slate-500" /></button>)}</div></section>}

          {message.action && <section className="py-5"><div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4"><div className="flex items-center gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Action required</p><p className="mt-1 text-sm font-semibold text-slate-800">Assigned to {message.action.owner}</p><p className="mt-0.5 text-xs text-slate-500">Due {new Date(message.action.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p></div><span className="ml-auto rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">{message.action.status}</span></div><div className="mt-3 flex gap-2">{message.action.status === "Open" && <Button variant="outline" size="sm" onClick={() => onUpdate({ action: { ...message.action!, status: "In Progress" } })} className="text-xs">Start action</Button>}<Button size="sm" disabled={message.action.status === "Completed"} onClick={() => onUpdate({ action: { ...message.action!, status: "Completed" } })} className="bg-emerald-700 text-xs hover:bg-emerald-800">Mark complete</Button><Button variant="outline" size="sm" onClick={onCreateTask} className="text-xs">Create task</Button></div></div></section>}

          {message.type === "Approval Required" && <section className="border-t border-slate-100 py-4"><div className="flex flex-wrap gap-2"><Button size="sm" onClick={onOpenReference} className="bg-violet-700 text-xs hover:bg-violet-800">Open approval</Button><Button variant="outline" size="sm" onClick={() => toast.success("Approval action passed to the linked workflow")} className="text-xs">Approve</Button><Button variant="outline" size="sm" onClick={() => toast.info("Opened Send Back in the approval workflow")} className="text-xs">Send back</Button></div></section>}

          {conversationReplies.length > 0 && <section className="mt-5 border-t border-slate-200 pt-5">
            <div className="mb-3 flex items-center gap-2"><div className="h-px flex-1 bg-slate-100" /><span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Conversation · {conversationReplies.length + 1} messages</span><div className="h-px flex-1 bg-slate-100" /></div>
            <div className="space-y-3">{conversationReplies.map(reply => <ThreadMessageCard key={reply.id} message={reply} onReply={() => openInlineReply("reply")} onForward={() => openInlineReply("forward")} />)}</div>
          </section>}

          {!inlineMode && <div className="flex gap-2 py-6"><Button variant="outline" size="sm" onClick={() => openInlineReply("reply")} className="rounded-lg"><Reply className="mr-2 h-4 w-4" />Reply</Button><Button variant="outline" size="sm" onClick={() => openInlineReply("replyAll")} className="rounded-lg"><ReplyAll className="mr-2 h-4 w-4" />Reply all</Button><Button variant="outline" size="sm" onClick={() => openInlineReply("forward")} className="rounded-lg"><Forward className="mr-2 h-4 w-4" />Forward</Button></div>}

          {inlineMode && <div ref={inlineReplyRef} className="my-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_4px_18px_rgba(15,23,42,0.08)]">
            <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-100 text-emerald-800">{inlineMode === "replyAll" ? <ReplyAll className="h-4 w-4" /> : inlineMode === "forward" ? <Forward className="h-4 w-4" /> : <Reply className="h-4 w-4" />}</span>
              <div><p className="text-xs font-bold text-slate-900">{inlineMode === "replyAll" ? "Reply all" : inlineMode === "forward" ? "Forward" : "Reply"}</p><p className="text-[10px] text-slate-500">Replying in this conversation</p></div>
              <button onClick={() => setInlineMode(null)} className="ml-auto grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-200"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex min-h-12 items-start gap-3 border-b border-slate-100 px-4 py-3"><span className="pt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">To</span><div className="flex flex-wrap gap-1.5">{replyRecipients.map(name => <span key={name} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{name}{inlineMode === "forward" && <button onClick={() => setForwardTo(list => list.filter(item => item !== name))}><X className="h-3 w-3" /></button>}</span>)}{inlineMode === "forward" && <select value="" onChange={event => { const name = event.target.value; if (name) setForwardTo(list => list.includes(name) ? list : [...list, name]); }} className="border-0 bg-transparent py-1 text-xs outline-none"><option value="">Add user or group…</option>{recipients.map(person => <option key={person.name} value={person.name}>{person.name} · {person.department}</option>)}</select>}</div></div>
            <div className="flex items-center gap-0.5 border-b border-slate-100 px-3 py-1.5"><IconButton label="Bold"><Bold className="h-4 w-4" /></IconButton><IconButton label="Italic"><Italic className="h-4 w-4" /></IconButton><IconButton label="Underline"><Underline className="h-4 w-4" /></IconButton><span className="mx-2 h-5 border-l" /><IconButton label="Bulleted list"><List className="h-4 w-4" /></IconButton><IconButton label="Insert link"><Link2 className="h-4 w-4" /></IconButton></div>
            <textarea autoFocus value={inlineBody} onChange={event => setInlineBody(event.target.value)} placeholder={inlineMode === "forward" ? "Add a message…" : "Write your reply…"} className="min-h-[190px] w-full resize-y border-0 px-4 py-4 text-sm leading-6 outline-none" />
            {!!inlineAttachments.length && <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-2">{inlineAttachments.map(file => <span key={file.name} className="inline-flex items-center gap-2 rounded-lg border bg-slate-50 px-2.5 py-1.5 text-[11px]"><Paperclip className="h-3.5 w-3.5" />{file.name}<button onClick={() => setInlineAttachments(files => files.filter(item => item.name !== file.name))}><X className="h-3 w-3" /></button></span>)}</div>}
            <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50/60 px-4 py-3"><input ref={inlineFileRef} type="file" multiple className="hidden" onChange={event => setInlineAttachments(files => [...files, ...Array.from(event.target.files || []).map(file => ({ name: file.name, size: `${Math.max(1, Math.round(file.size / 1024))} KB`, source: "Upload" as const }))])} /><Button size="sm" onClick={sendInlineReply} className="rounded-lg bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)]"><Send className="mr-2 h-4 w-4" />Send</Button><IconButton label="Attach file" onClick={() => inlineFileRef.current?.click()}><Paperclip className="h-4 w-4" /></IconButton><button onClick={() => { setInlineMode(null); setInlineBody(""); setInlineAttachments([]); setForwardTo([]); }} className="ml-auto flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-500 hover:bg-slate-100"><Trash2 className="h-3.5 w-3.5" />Discard</button></div>
          </div>}
        </article>

      </div>
    </div>
  );
}

function PrintThreadView({ subject, reference, messages }: { subject: string; reference?: Reference; messages: MailMessage[] }) {
  return <section id="communication-print-area" className="hidden bg-white text-slate-950">
    <header className="border-b-2 border-slate-900 pb-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Internal ERP communication</p>
      <h1 className="mt-2 text-2xl font-bold">{subject}</h1>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-500"><span>Conversation trail · {messages.length} {messages.length === 1 ? "message" : "messages"}</span><span>Printed {new Date().toLocaleString("en-IN")}</span></div>
    </header>
    {reference && <div className="mt-4 border border-slate-300 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Regarding</p><div className="mt-1 flex flex-wrap items-baseline gap-x-3"><strong className="text-sm">{reference.type} · {reference.number}</strong><span className="text-xs">{reference.title}</span>{reference.details.map(detail => <span key={detail} className="text-xs text-slate-600">{detail}</span>)}</div></div>}
    <div className="mt-5 space-y-5">{messages.map((item, index) => <article key={item.id} className="break-inside-avoid border-b border-slate-300 pb-5"><div className="flex items-start justify-between gap-6"><div><div className="flex items-baseline gap-2"><strong className="text-sm">{item.sender}</strong><span className="text-[11px] text-slate-500">{item.senderDesignation} · {item.senderDepartment}</span></div><p className="mt-1 text-[11px] text-slate-500">To: {item.to.join(", ")}{item.cc.length ? ` · CC: ${item.cc.join(", ")}` : ""}</p></div><div className="shrink-0 text-right"><span className="block text-[10px] font-bold uppercase text-slate-500">Message {index + 1}</span><time className="mt-1 block text-[11px] text-slate-500">{new Date(item.sentAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div></div><div className="mt-4 whitespace-pre-wrap text-[12px] leading-6 text-slate-800">{item.body}</div>{item.attachments.length > 0 && <div className="mt-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Attachments</p><ul className="mt-1 list-inside list-disc text-[11px] text-slate-600">{item.attachments.map(file => <li key={file.name}>{file.name} ({file.size})</li>)}</ul></div>}</article>)}</div>
    <footer className="mt-6 border-t border-slate-300 pt-3 text-[10px] text-slate-500">Generated from SBR ERP · Internal communication record</footer>
  </section>;
}

function ThreadMessageCard({ message, onReply, onForward }: { message: MailMessage; onReply: () => void; onForward: () => void }) {
  const [expanded, setExpanded] = useState(true);
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
    <button onClick={() => setExpanded(value => !value)} className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50/70">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">{initials(message.sender)}</span>
      <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="truncate text-[13px] font-bold text-slate-900">{message.sender}</strong><span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700">Reply</span></span><span className="mt-1 block truncate text-[11px] text-slate-500">To: {message.to.join(", ")}{message.cc.length ? ` · CC: ${message.cc.join(", ")}` : ""}</span></span>
      <span className="shrink-0 text-right"><time className="block text-[10px] font-medium text-slate-400">{new Date(message.sentAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time><ChevronDown className={cn("ml-auto mt-2 h-3.5 w-3.5 text-slate-400 transition-transform", expanded && "rotate-180")} /></span>
    </button>
    {expanded && <div className="border-t border-slate-100 px-4 pb-4 pt-3 pl-16"><div className="whitespace-pre-wrap text-[13px] leading-6 text-slate-700">{message.body}</div>{message.attachments.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{message.attachments.map(file => <span key={file.name} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-medium text-slate-600"><Paperclip className="h-3.5 w-3.5" />{file.name}<span className="text-slate-400">{file.size}</span></span>)}</div>}<div className="mt-4 flex gap-2"><button onClick={onReply} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 hover:text-emerald-700"><Reply className="h-3.5 w-3.5" />Reply</button><button onClick={onForward} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 hover:text-emerald-700"><Forward className="h-3.5 w-3.5" />Forward</button></div></div>}
  </div>;
}
