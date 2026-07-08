import { useState, useEffect, Fragment } from "react";
import { useParams } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  Plus, TrendingUp, TrendingDown, DollarSign, Filter,
  Lock, Unlock, X, Edit3, Trash2, FileSpreadsheet, Info, Sparkles, ArrowUpDown,
} from "lucide-react";
import getBaseUrl from "@/lib/config";
import { useAuth } from "@/context/AuthContext";
import Playground from "./Playground";
import DisbursementSequence, { type DisbursementSequenceLineItem } from "./DisbursementSequence";

type BudgetType = "Capex" | "Opex";

type BudgetItem = {
  id: string;
  type: BudgetType;
  category: string;
  lineItem: string;
  uom: string;
  qtyPerAcre: number;      // numeric; 0 when value is a cell ref
  qtyRaw: string;           // original string — may be "<A5>" or "2.85"
  acres: number;
  ratePerUnit: number;     // numeric; 0 when value is a cell ref
  rateRaw: string;          // original string — may be "<D8>" or "400"
  utilizedQty: number;
  savings: number;
  workingXlsxUrl: string;
  amountInPipeline: number;
  remainingAmount: number;
};

type BudgetAllocationEntry = {
  flow_id: string;
  order_number: string;
  allocation: {
    row_number: number;
    line_item: string;
    category: string;
    type: string;
    budgeted: number;
    allocated: number;
  };
};

type FarmRecord = {
  farm_id: string;
  farmer_id: string;
  owner_name: string;
  area: number;
  crop_type: string | null;
};

type MappingField = "uom" | "qtyPerAcre" | "ratePerUnit";

type CellStyle = {
  backgroundColor?: string;
  color?: string;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
  fontSize?: string;
  textAlign?: string;
  whiteSpace?: string;
  borderTop?: string;
  borderBottom?: string;
  borderLeft?: string;
  borderRight?: string;
};

type CellData = {
  value: string;
  formula?: string;
  style: CellStyle;
  rowSpan?: number;
  colSpan?: number;
  skip?: boolean;
};

type SheetData = {
  grid: CellData[][];
  colWidths: number[];
  rowHeights: number[];
  rangeOffset: { r: number; c: number };
};

// ── xlsx style helpers ────────────────────────────────────────────────────────

// Standard Excel indexed color palette (64 entries)
const INDEXED_COLORS = [
  "000000","FFFFFF","FF0000","00FF00","0000FF","FFFF00","FF00FF","00FFFF",
  "000000","FFFFFF","FF0000","00FF00","0000FF","FFFF00","FF00FF","00FFFF",
  "800000","008000","000080","808000","800080","008080","C0C0C0","808080",
  "9999FF","993366","FFFFCC","CCFFFF","660066","FF8080","0066CC","CCCCFF",
  "000080","FF00FF","FFFF00","00FFFF","800080","800000","008080","0000FF",
  "00CCFF","CCFFFF","CCFFCC","FFFF99","99CCFF","FF99CC","CC99FF","FFCC99",
  "3366FF","33CCCC","99CC00","FFCC00","FF9900","FF6600","666699","969696",
  "003366","339966","003300","333300","993300","993366","333399","333333",
];

// Default Office theme colors (theme 0–9)
const THEME_COLORS = [
  "FFFFFF","000000","EEECE1","1F497D","4F81BD","C0504D","9BBB59","8064A2",
  "4BACC6","F79646",
];

function applyTint(hex: string, tint: number): string {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const blend = (ch: number) =>
    tint > 0 ? Math.round(ch + (255 - ch) * tint) : Math.round(ch * (1 + tint));
  return [blend(r), blend(g), blend(b)]
    .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0"))
    .join("");
}

type ColorObj = { rgb?: string; indexed?: number; theme?: number; tint?: number };

function resolveColor(c?: ColorObj): string | undefined {
  if (!c) return undefined;
  let hex: string | undefined;
  if (c.rgb) {
    hex = c.rgb.length === 8 ? c.rgb.slice(2) : c.rgb;
  } else if (c.indexed !== undefined && c.indexed < INDEXED_COLORS.length) {
    hex = INDEXED_COLORS[c.indexed];
  } else if (c.theme !== undefined && c.theme < THEME_COLORS.length) {
    hex = THEME_COLORS[c.theme];
    if (c.tint !== undefined) hex = applyTint(hex, c.tint);
  }
  if (!hex || hex.toUpperCase() === "FFFFFF") return undefined;
  return `#${hex}`;
}

const borderCss = (b?: { style?: string; color?: ColorObj }): string | undefined => {
  if (!b?.style || b.style === "none") return undefined;
  const w = b.style === "thick" ? "2.5px" : b.style === "medium" ? "1.5px" : "1px";
  const t = b.style === "dashed" ? "dashed" : b.style === "dotted" ? "dotted" : b.style === "double" ? "double" : "solid";
  const c = b.color?.rgb ? `#${b.color.rgb.slice(-6)}` : "#9ca3af";
  return `${w} ${t} ${c}`;
};

// Built-in Excel table style color presets (Office default theme)
// Each entry: [headerBg, headerText, oddRowBg, evenRowBg]
const TABLE_STYLE_COLORS: Record<string, [string, string, string, string]> = {
  TableStyleLight1:    ["#4472C4","#FFFFFF","#D9E1F2","#FFFFFF"],
  TableStyleLight2:    ["#ED7D31","#FFFFFF","#FCE4D6","#FFFFFF"],
  TableStyleLight3:    ["#A9D18E","#FFFFFF","#E2EFDA","#FFFFFF"],
  TableStyleLight4:    ["#FFC000","#000000","#FFF2CC","#FFFFFF"],
  TableStyleLight5:    ["#FF0000","#FFFFFF","#FFE0E0","#FFFFFF"],
  TableStyleLight6:    ["#7030A0","#FFFFFF","#E6D0F0","#FFFFFF"],
  TableStyleLight7:    ["#4472C4","#FFFFFF","#D9E1F2","#FFFFFF"],
  TableStyleLight8:    ["#ED7D31","#FFFFFF","#FCE4D6","#FFFFFF"],
  TableStyleLight9:    ["#A9D18E","#FFFFFF","#E2EFDA","#FFFFFF"],
  TableStyleLight10:   ["#FFC000","#000000","#FFF2CC","#FFFFFF"],
  TableStyleLight11:   ["#FF0000","#FFFFFF","#FFE0E0","#FFFFFF"],
  TableStyleLight12:   ["#7030A0","#FFFFFF","#E6D0F0","#FFFFFF"],
  TableStyleLight13:   ["#4472C4","#FFFFFF","#D9E1F2","#FFFFFF"],
  TableStyleLight14:   ["#ED7D31","#FFFFFF","#FCE4D6","#FFFFFF"],
  TableStyleLight15:   ["#A9D18E","#FFFFFF","#E2EFDA","#FFFFFF"],
  TableStyleLight16:   ["#FFC000","#000000","#FFF2CC","#FFFFFF"],
  TableStyleLight17:   ["#FF0000","#FFFFFF","#FFE0E0","#FFFFFF"],
  TableStyleLight18:   ["#7030A0","#FFFFFF","#E6D0F0","#FFFFFF"],
  TableStyleLight19:   ["#4472C4","#FFFFFF","#D9E1F2","#FFFFFF"],
  TableStyleLight20:   ["#ED7D31","#FFFFFF","#FCE4D6","#FFFFFF"],
  TableStyleLight21:   ["#A9D18E","#FFFFFF","#E2EFDA","#FFFFFF"],
  TableStyleMedium1:   ["#4472C4","#FFFFFF","#DCE6F1","#FFFFFF"],
  TableStyleMedium2:   ["#4472C4","#FFFFFF","#D9E1F2","#FFFFFF"],
  TableStyleMedium3:   ["#ED7D31","#FFFFFF","#FCE4D6","#FFFFFF"],
  TableStyleMedium4:   ["#FFC000","#000000","#FFF2CC","#FFFFFF"],
  TableStyleMedium5:   ["#4472C4","#FFFFFF","#E2EFDA","#FFFFFF"],
  TableStyleMedium6:   ["#9BBB59","#FFFFFF","#EAF1DD","#FFFFFF"],
  TableStyleMedium7:   ["#8064A2","#FFFFFF","#CCC0DA","#FFFFFF"],
  TableStyleMedium8:   ["#4BACC6","#FFFFFF","#DAEEF3","#FFFFFF"],
  TableStyleMedium9:   ["#F79646","#FFFFFF","#FDEADA","#FFFFFF"],
  TableStyleMedium10:  ["#4472C4","#FFFFFF","#D9E1F2","#FFFFFF"],
  TableStyleMedium11:  ["#ED7D31","#FFFFFF","#FCE4D6","#FFFFFF"],
  TableStyleMedium12:  ["#FFC000","#000000","#FFF2CC","#FFFFFF"],
  TableStyleMedium13:  ["#9BBB59","#FFFFFF","#EAF1DD","#FFFFFF"],
  TableStyleMedium14:  ["#8064A2","#FFFFFF","#CCC0DA","#FFFFFF"],
  TableStyleMedium15:  ["#4BACC6","#FFFFFF","#DAEEF3","#FFFFFF"],
  TableStyleMedium16:  ["#F79646","#FFFFFF","#FDEADA","#FFFFFF"],
  TableStyleMedium17:  ["#4472C4","#FFFFFF","#D9E1F2","#FFFFFF"],
  TableStyleMedium18:  ["#ED7D31","#FFFFFF","#FCE4D6","#FFFFFF"],
  TableStyleMedium19:  ["#FFC000","#000000","#FFF2CC","#FFFFFF"],
  TableStyleMedium20:  ["#9BBB59","#FFFFFF","#EAF1DD","#FFFFFF"],
  TableStyleMedium21:  ["#8064A2","#FFFFFF","#CCC0DA","#FFFFFF"],
  TableStyleMedium22:  ["#4BACC6","#FFFFFF","#DAEEF3","#FFFFFF"],
  TableStyleMedium23:  ["#F79646","#FFFFFF","#FDEADA","#FFFFFF"],
  TableStyleMedium24:  ["#4472C4","#FFFFFF","#D9E1F2","#FFFFFF"],
  TableStyleMedium25:  ["#ED7D31","#FFFFFF","#FCE4D6","#FFFFFF"],
  TableStyleMedium26:  ["#FFC000","#000000","#FFF2CC","#FFFFFF"],
  TableStyleMedium27:  ["#9BBB59","#FFFFFF","#EAF1DD","#FFFFFF"],
  TableStyleMedium28:  ["#8064A2","#FFFFFF","#CCC0DA","#FFFFFF"],
  TableStyleDark1:     ["#1F1F1F","#FFFFFF","#595959","#3F3F3F"],
  TableStyleDark2:     ["#1F4E79","#FFFFFF","#BDD7EE","#DDEBF7"],
  TableStyleDark3:     ["#375623","#FFFFFF","#C6EFCE","#E2EFDA"],
  TableStyleDark4:     ["#7F6000","#FFFFFF","#FFEB9C","#FFFF99"],
  TableStyleDark5:     ["#833C00","#FFFFFF","#FFC7CE","#FFE0E0"],
  TableStyleDark6:     ["#3F0751","#FFFFFF","#D9D2E9","#EAD1DC"],
  TableStyleDark7:     ["#17375E","#FFFFFF","#BDD7EE","#DDEBF7"],
  TableStyleDark8:     ["#4F3B69","#FFFFFF","#CCC0DA","#E0D5ED"],
  TableStyleDark9:     ["#17375E","#FFFFFF","#DAEEF3","#EAF6F9"],
  TableStyleDark10:    ["#7F3F00","#FFFFFF","#FDEADA","#FEF1E5"],
  TableStyleDark11:    ["#1F1F1F","#FFFFFF","#D8D8D8","#EBEBEB"],
};

function parseXlsxWithStyles(
  data: Uint8Array,
  sheetName?: string
): { grid: CellData[][]; colWidths: number[]; rowHeights: number[]; rangeOffset: { r: number; c: number } } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wb = (XLSX as any).read(data, {
    type: "array",
    cellStyles: true,
    cellNF: true,
    cellDates: true,
    cellFormula: true,
    cellText: false, // Get numeric values, not formatted text
  });
  const ws = sheetName !== undefined ? wb.Sheets[sheetName] : wb.Sheets[wb.SheetNames[0]];
  if (!ws || !ws["!ref"]) return { grid: [], colWidths: [], rowHeights: [], rangeOffset: { r: 0, c: 0 } };

  const range = XLSX.utils.decode_range(ws["!ref"]);
  const R = range.e.r - range.s.r + 1;
  const C = range.e.c - range.s.c + 1;

  const grid: CellData[][] = Array.from({ length: R }, () =>
    Array.from({ length: C }, () => ({ value: "", style: {} }))
  );

  // merged cells
  const skipSet = new Set<string>();
  (ws["!merges"] || []).forEach((m: { s: { r: number; c: number }; e: { r: number; c: number } }) => {
    const ri = m.s.r - range.s.r;
    const ci = m.s.c - range.s.c;
    if (grid[ri]?.[ci]) {
      grid[ri][ci].rowSpan = m.e.r - m.s.r + 1;
      grid[ri][ci].colSpan = m.e.c - m.s.c + 1;
    }
    for (let r = m.s.r; r <= m.e.r; r++)
      for (let c = m.s.c; c <= m.e.c; c++)
        if (r !== m.s.r || c !== m.s.c) skipSet.add(`${r},${c}`);
  });

  // cells — read all style properties
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const ri = r - range.s.r;
      const ci = c - range.s.c;
      if (skipSet.has(`${r},${c}`)) { grid[ri][ci].skip = true; continue; }

      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (!cell) continue;

      // For formula cells, prioritize cached value (cell.w), otherwise use raw value
      if (cell.f) {
        grid[ri][ci].formula = cell.f;
        // cell.w is the formatted/cached result from Excel
        grid[ri][ci].value = cell.w ?? String(cell.v ?? "");
      } else {
        grid[ri][ci].value = cell.w ?? String(cell.v ?? "");
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s: any = cell.s;
      if (!s) continue;

      const style: CellStyle = {};

      // fill — no patternType restriction; try every possible property path
      const bg =
        resolveColor(s.fill?.fgColor) ??
        resolveColor(s.fill?.bgColor) ??
        resolveColor(s.fgColor) ??
        resolveColor(s.bgColor);
      if (bg) style.backgroundColor = bg;

      // font
      if (s.font) {
        if (s.font.bold)      style.fontWeight     = "bold";
        if (s.font.italic)    style.fontStyle      = "italic";
        if (s.font.underline) style.textDecoration = "underline";
        const fc = resolveColor(s.font.color);
        if (fc) style.color = fc;
        if (s.font.sz) style.fontSize = `${Math.round(s.font.sz * 0.9)}px`;
      }

      // alignment
      if (s.alignment?.horizontal && s.alignment.horizontal !== "general")
        style.textAlign = s.alignment.horizontal;
      if (s.alignment?.wrapText) style.whiteSpace = "pre-wrap";

      // borders
      if (s.border?.top)    style.borderTop    = borderCss(s.border.top);
      if (s.border?.bottom) style.borderBottom = borderCss(s.border.bottom);
      if (s.border?.left)   style.borderLeft   = borderCss(s.border.left);
      if (s.border?.right)  style.borderRight  = borderCss(s.border.right);

      grid[ri][ci].style = style;
    }
  }

  // ── Second pass: evaluate formulas without cached values ────────────────────
  // If Excel file wasn't saved with calculated values cached, evaluate formulas now
  // ── Table banded-row colors ──────────────────────────────────────────────
  // SheetJS CE parses ws["!tables"] which includes tableStyleInfo.name.
  // Excel stores row colors in the table definition, NOT in individual cell.s,
  // so we apply them here as a post-pass (only where cell has no own fill).
  const tables: Array<{
    ref: string;
    tableStyleInfo?: { name?: string; showRowStripes?: boolean; showColumnStripes?: boolean; showFirstColumn?: boolean; showLastColumn?: boolean };
    headerRowCount?: number;
  }> = ws["!tables"] || [];

  for (const table of tables) {
    const tRange = XLSX.utils.decode_range(table.ref);
    const styleName = table.tableStyleInfo?.name ?? "";
    const palette   = TABLE_STYLE_COLORS[styleName];
    if (!palette) continue;

    const [headerBg, headerText, oddBg] = palette;
    const hasStripes = table.tableStyleInfo?.showRowStripes !== false;
    const headerRows = table.headerRowCount ?? 1;

    for (let r = tRange.s.r; r <= tRange.e.r; r++) {
      const ri = r - range.s.r;
      if (ri < 0 || ri >= R) continue;

      const isHeaderRow = r < tRange.s.r + headerRows;
      // "odd" data rows get the band color; even stay white
      const dataRowIndex = r - tRange.s.r - headerRows;
      const isBandedRow  = hasStripes && !isHeaderRow && dataRowIndex % 2 === 0;

      for (let c = tRange.s.c; c <= tRange.e.c; c++) {
        const ci = c - range.s.c;
        if (ci < 0 || ci >= C) continue;
        const cellData = grid[ri]?.[ci];
        if (!cellData || cellData.skip) continue;

        if (isHeaderRow && !cellData.style.backgroundColor) {
          cellData.style.backgroundColor = headerBg;
          if (!cellData.style.color) cellData.style.color = headerText;
          if (!cellData.style.fontWeight) cellData.style.fontWeight = "bold";
        } else if (isBandedRow && !cellData.style.backgroundColor) {
          cellData.style.backgroundColor = oddBg;
        }
      }
    }
  }

  // column widths (px)
  const colWidths: number[] = Array.from({ length: C }, (_, i) => {
    const col = (ws["!cols"] || [])[range.s.c + i];
    return col?.wpx ?? (col?.wch ? Math.round(col.wch * 7) : 72);
  });

  // row heights (px)
  const rowHeights: number[] = Array.from({ length: R }, (_, i) => {
    const row = (ws["!rows"] || [])[range.s.r + i];
    return row?.hpx ?? 22;
  });

  return { grid, colWidths, rowHeights, rangeOffset: { r: range.s.r, c: range.s.c } };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapXlsxRow = (d: any): BudgetItem => ({
  id:          String(d.line_item_id ?? ""),
  type:        (d.budget_type as BudgetType) ?? "Opex",
  category:    String(d.category ?? ""),
  lineItem:    String(d.line_item ?? ""),
  uom:         String(d.UoM ?? ""),
  qtyRaw:      String(d.quantity_per_acre ?? "0"),
  qtyPerAcre:  parseFloat(d.quantity_per_acre) || 0,
  acres:       parseFloat(d.total_acres) || 0,
  rateRaw:     String(d.rate_per_unit ?? "0"),
  ratePerUnit: parseFloat(d.rate_per_unit) || 0,
  utilizedQty:       parseFloat(d.utilized_amount) || 0,
  savings:           parseFloat(d.savings) || 0,
  workingXlsxUrl:    String(d.working_range ?? ""),
  amountInPipeline:  parseFloat(d.amount_in_pipeline) || 0,
  remainingAmount:   parseFloat(d.remaining_amount) || 0,
});


// ── Formula evaluation ────────────────────────────────────────────────────────
function cellAddrToGridIdx(addr: string, offset: { r: number; c: number }): [number, number] {
  const m = addr.toUpperCase().match(/^\$?([A-Z]+)\$?(\d+)$/);
  if (!m) return [-1, -1];
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  col -= 1;
  return [parseInt(m[2]) - 1 - offset.r, col - offset.c];
}

class ExcelFormulaEval {
  private pos = 0;
  constructor(
    private readonly src: string,
    private readonly offset: { r: number; c: number },
    private readonly getVal: (ri: number, ci: number) => number,
    private readonly allSheets?: Record<string, { grid: CellData[][]; rangeOffset: { r: number; c: number } }>,
    private readonly getSheetVal?: (sheetName: string, ri: number, ci: number) => number
  ) {}
  eval(): number { const v = this.comparison(); return isNaN(v) ? 0 : v; }
  private ws() { while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) this.pos++; }
  private comparison(): number {
    const value = this.addSub();
    this.ws();
    const operator = ['<=', '>=', '<>', '=', '<', '>'].find((candidate) =>
      this.src.startsWith(candidate, this.pos)
    );
    if (!operator) return value;
    this.pos += operator.length;
    const right = this.addSub();
    switch (operator) {
      case '<=': return value <= right ? 1 : 0;
      case '>=': return value >= right ? 1 : 0;
      case '<>': return value !== right ? 1 : 0;
      case '=':  return value === right ? 1 : 0;
      case '<':  return value < right ? 1 : 0;
      case '>':  return value > right ? 1 : 0;
      default:   return 0;
    }
  }
  private addSub(): number {
    let v = this.mulDiv(); this.ws();
    while (this.src[this.pos] === '+' || this.src[this.pos] === '-') {
      const op = this.src[this.pos++]; v = op === '+' ? v + this.mulDiv() : v - this.mulDiv(); this.ws();
    }
    return v;
  }
  private mulDiv(): number {
    let v = this.pow(); this.ws();
    while (this.src[this.pos] === '*' || this.src[this.pos] === '/') {
      const op = this.src[this.pos++]; const r = this.pow();
      v = op === '*' ? v * r : r !== 0 ? v / r : 0; this.ws();
    }
    return v;
  }
  private pow(): number {
    let v = this.unary(); this.ws();
    while (this.src[this.pos] === '^') { this.pos++; v = Math.pow(v, this.unary()); this.ws(); }
    return v;
  }
  private unary(): number {
    this.ws();
    if (this.src[this.pos] === '-') { this.pos++; return -this.atom(); }
    if (this.src[this.pos] === '+') { this.pos++; }
    return this.atom();
  }
  private atom(): number {
    this.ws();
    if (this.src[this.pos] === '(') {
      this.pos++; const v = this.comparison(); this.ws();
      if (this.src[this.pos] === ')') this.pos++;
      return v;
    }
    // Handle sheet references like 'Sheet Name'!E17
    if (this.src[this.pos] === "'") {
      return this.parseSheetRef();
    }
    if (/[\d.]/.test(this.src[this.pos])) return this.num();
    if (/[A-Za-z]/.test(this.src[this.pos])) return this.funcOrRef();
    return 0;
  }
  private parseSheetRef(): number {
    const startPos = this.pos;
    this.pos++; // skip opening quote
    let sheetName = '';
    while (this.pos < this.src.length && this.src[this.pos] !== "'") {
      sheetName += this.src[this.pos++];
    }
    this.pos++; // skip closing quote
    if (this.src[this.pos] === '!' && this.allSheets && sheetName) {
      this.pos++; // skip !
      let cellRef = '';
      while (this.pos < this.src.length && /[A-Z0-9$]/.test(this.src[this.pos])) {
        cellRef += this.src[this.pos++];
      }
      const targetSheet = this.allSheets[sheetName];
      if (targetSheet && cellRef) {
        const [ri, ci] = cellAddrToGridIdx(cellRef, targetSheet.rangeOffset);
        if (ri >= 0 && ci >= 0 && targetSheet.grid[ri]?.[ci]) {
          if (this.getSheetVal) return this.getSheetVal(sheetName, ri, ci);
          const val = targetSheet.grid[ri][ci].value;
          return parseFloat(val) || 0;
        }
      }
      return 0;
    }
    this.pos = startPos; // reset if parsing failed
    return 0;
  }
  private num(): number {
    let s = '';
    while (this.pos < this.src.length && /[\d.]/.test(this.src[this.pos])) s += this.src[this.pos++];
    return parseFloat(s) || 0;
  }
  private funcOrRef(): number {
    let name = '';
    while (this.pos < this.src.length && /[A-Za-z_$]/.test(this.src[this.pos])) name += this.src[this.pos++];
    let digits = '';
    while (this.pos < this.src.length && /\d/.test(this.src[this.pos])) digits += this.src[this.pos++];
    this.ws();
    if (this.src[this.pos] === '(') return this.fnCall(name.toUpperCase());
    if (digits) {
      const [ri, ci] = cellAddrToGridIdx(name.toUpperCase() + digits, this.offset);
      return ri >= 0 && ci >= 0 ? this.getVal(ri, ci) : 0;
    }
    return 0;
  }
  private fnCall(name: string): number {
    this.pos++;
    const args: number[] = [];
    let depth = 1, argStart = this.pos;
    while (this.pos < this.src.length && depth > 0) {
      const ch = this.src[this.pos];
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) { this.expandArg(this.src.slice(argStart, this.pos).trim(), args); this.pos++; break; }
      } else if (ch === ',' && depth === 1) {
        this.expandArg(this.src.slice(argStart, this.pos).trim(), args); argStart = this.pos + 1;
      }
      this.pos++;
    }
    const s = args.reduce((a, b) => a + b, 0);
    switch (name) {
      case 'SUM':     return s;
      case 'PRODUCT': return args.reduce((a, b) => a * b, 1);
      case 'AVERAGE': return args.length ? s / args.length : 0;
      case 'MIN':     return args.length ? Math.min(...args) : 0;
      case 'MAX':     return args.length ? Math.max(...args) : 0;
      case 'ABS':     return Math.abs(args[0] ?? 0);
      case 'SQRT':    return Math.sqrt(Math.max(0, args[0] ?? 0));
      case 'ROUND':   { const dp = args[1] ?? 0; const m = 10 ** dp; return Math.round((args[0] ?? 0) * m) / m; }
      case 'ROUNDUP': {
        const value = args[0] ?? 0;
        const multiplier = 10 ** (args[1] ?? 0);
        return Math.sign(value) * Math.ceil(Math.abs(value) * multiplier) / multiplier;
      }
      case 'ROUNDDOWN': {
        const value = args[0] ?? 0;
        const multiplier = 10 ** (args[1] ?? 0);
        return Math.sign(value) * Math.floor(Math.abs(value) * multiplier) / multiplier;
      }
      case 'PMT': {
        const [rate = 0, periods = 0, presentValue = 0, futureValue = 0, paymentType = 0] = args;
        if (periods === 0) return 0;
        if (rate === 0) return -(presentValue + futureValue) / periods;
        const growth = (1 + rate) ** periods;
        return -(rate * (futureValue + growth * presentValue)) / ((1 + rate * paymentType) * (growth - 1));
      }
      case 'IF':      return (args[0] ?? 0) !== 0 ? (args[1] ?? 0) : (args[2] ?? 0);
      default:        return 0;
    }
  }
  private expandArg(argStr: string, out: number[]) {
    const rng = argStr.match(/^(\$?[A-Z]+\$?\d+):(\$?[A-Z]+\$?\d+)$/i);
    if (rng) {
      const [r1, c1] = cellAddrToGridIdx(rng[1].toUpperCase(), this.offset);
      const [r2, c2] = cellAddrToGridIdx(rng[2].toUpperCase(), this.offset);
      for (let r = Math.min(r1,r2); r <= Math.max(r1,r2); r++)
        for (let c = Math.min(c1,c2); c <= Math.max(c1,c2); c++)
          if (r >= 0 && c >= 0) out.push(this.getVal(r, c));
    } else if (argStr) {
      out.push(evalFormula(argStr, this.offset, this.getVal, this.allSheets, this.getSheetVal));
    } else {
      out.push(0);
    }
  }
}

function evalFormula(
  formula: string,
  offset: { r: number; c: number },
  getVal: (ri: number, ci: number) => number,
  allSheets?: Record<string, { grid: CellData[][]; rangeOffset: { r: number; c: number } }>,
  getSheetVal?: (sheetName: string, ri: number, ci: number) => number
): number {
  try { return new ExcelFormulaEval(formula.trim(), offset, getVal, allSheets, getSheetVal).eval(); }
  catch { return 0; }
}

function evaluateMissingFormulaValues(sheetsMap: Record<string, SheetData>): void {
  const candidates = Object.entries(sheetsMap).flatMap(([sheetName, { grid }]) =>
    grid.flatMap((row, ri) =>
      row.flatMap((cell, ci) =>
        cell.formula && (cell.value === "" || cell.value === "0")
          ? [{ sheetName, ri, ci }]
          : []
      )
    )
  );

  for (let pass = 0; pass < 30; pass++) {
    let changed = false;
    const getSheetVal = (sheetName: string, ri: number, ci: number): number =>
      parseFloat(sheetsMap[sheetName]?.grid[ri]?.[ci]?.value ?? "") || 0;

    for (const { sheetName, ri, ci } of candidates) {
      const { grid, rangeOffset } = sheetsMap[sheetName];
      const getVal = (ri: number, ci: number): number => getSheetVal(sheetName, ri, ci);
      const cell = grid[ri][ci];
      const value = evalFormula(cell.formula!, rangeOffset, getVal, sheetsMap, getSheetVal);
      const next = String(Math.round(value * 100) / 100);
      if (cell.value !== next) {
        cell.value = next;
        changed = true;
      }
    }
    if (!changed) break;
  }
}

function computeEffectiveValues(
  cellEdits: Record<string, number>,
  sheetsMap: Record<string, SheetData>
): Record<string, number> {
  const effective: Record<string, number> = { ...cellEdits };

  for (const [sheetName, { grid, rangeOffset }] of Object.entries(sheetsMap)) {
    const getVal = (ri: number, ci: number): number => {
      const k = `${sheetName}:${ri},${ci}`;
      return effective[k] !== undefined ? effective[k] : parseFloat(grid[ri]?.[ci]?.value ?? '') || 0;
    };
    for (let pass = 0; pass < 30; pass++) {
      let changed = false;
      for (let ri = 0; ri < grid.length; ri++) {
        for (let ci = 0; ci < (grid[ri]?.length ?? 0); ci++) {
          const k = `${sheetName}:${ri},${ci}`;
          if (cellEdits[k] !== undefined) continue;
          const f = grid[ri]?.[ci]?.formula;
          if (!f) continue;
          const getSheetVal = (targetSheet: string, targetRi: number, targetCi: number): number => {
            const targetKey = `${targetSheet}:${targetRi},${targetCi}`;
            return effective[targetKey] !== undefined
              ? effective[targetKey]
              : parseFloat(sheetsMap[targetSheet]?.grid[targetRi]?.[targetCi]?.value ?? '') || 0;
          };
          const v = evalFormula(f, rangeOffset, getVal, sheetsMap, getSheetVal);
          if (effective[k] !== v) { effective[k] = v; changed = true; }
        }
      }
      if (!changed) break;
    }
  }
  return effective;
}

function syncBudgetFromOverrides(
  items: BudgetItem[],
  effective: Record<string, number>,
  sheetsMap: Record<string, SheetData>
): BudgetItem[] {
  const getVal = (sheetName: string, ri: number, ci: number): number => {
    const k = `${sheetName}:${ri},${ci}`;
    return effective[k] !== undefined
      ? effective[k]
      : parseFloat(sheetsMap[sheetName]?.grid[ri]?.[ci]?.value ?? '') || 0;
  };
  return items.map(item => {
    const updated = { ...item };
    const qtyM = item.qtyRaw.match(/^='([^']+)'!(\$?[A-Z]+\$?\d+)$/i);
    if (qtyM) {
      const sheet = qtyM[1];
      const sd = sheetsMap[sheet];
      if (sd) { const [ri, ci] = cellAddrToGridIdx(qtyM[2], sd.rangeOffset); if (ri >= 0) updated.qtyPerAcre = getVal(sheet, ri, ci); }
    }
    const rateM = item.rateRaw.match(/^='([^']+)'!(\$?[A-Z]+\$?\d+)$/i);
    if (rateM) {
      const sheet = rateM[1];
      const sd = sheetsMap[sheet];
      if (sd) { const [ri, ci] = cellAddrToGridIdx(rateM[2], sd.rangeOffset); if (ri >= 0) updated.ratePerUnit = getVal(sheet, ri, ci); }
    }
    return updated;
  });
}

const fmt    = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const fmtNum = (n: number) => n % 1 === 0 ? n.toLocaleString("en-IN") : n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

const typeColors: Record<BudgetType, string> = {
  Capex: "bg-violet-100 text-violet-700",
  Opex:  "bg-sky-100 text-sky-700",
};

function barColor(pct: number)     { return pct >= 90 ? "bg-red-500" : pct >= 65 ? "bg-amber-400" : "bg-emerald-500"; }
function barTextColor(pct: number) { return pct >= 90 ? "text-red-600" : pct >= 65 ? "text-amber-600" : "text-emerald-600"; }

function UtilizationBar({ pct }: { pct: number }) {
  const clamped = Math.min(pct, 100);
  return (
    <div className="flex min-w-[140px] items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full transition-all ${barColor(pct)}`} style={{ width: `${clamped}%` }} />
      </div>
      <span className={`w-9 text-right text-xs font-extrabold tabular-nums ${barTextColor(pct)}`}>
        {Math.round(clamped)}%
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-extrabold text-slate-600">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#173f70] focus:ring-1 focus:ring-[#173f70]/20";

// ── Add Line Item Modal ───────────────────────────────────────────────────────
const MAPPING_LABELS: Record<MappingField, string> = {
  uom:         "UoM",
  qtyPerAcre:  "Qty / Acre",
  ratePerUnit: "Rate / Unit",
};

const MAPPING_COLORS: Record<MappingField, { chip: string; outline: string; bg: string }> = {
  uom:         { chip: "bg-violet-100 text-violet-700", outline: "2px solid #a855f7", bg: "rgba(168,85,247,0.13)" },
  qtyPerAcre:  { chip: "bg-amber-100 text-amber-700",   outline: "2px solid #f59e0b", bg: "rgba(245,158,11,0.13)"  },
  ratePerUnit: { chip: "bg-emerald-100 text-emerald-700",outline: "2px solid #10b981", bg: "rgba(16,185,129,0.13)" },
};

function AddLineItemModal({
  onClose,
  onSaved,
  onBulkSaved,
  sheetsMap,
  sheetNames,
  onLoadSheet,
  defaultAcres = 0,
}: {
  onClose: () => void;
  onSaved: (item: BudgetItem) => void;
  onBulkSaved: (items: BudgetItem[]) => void;
  sheetsMap: Record<string, SheetData>;
  sheetNames: string[];
  onLoadSheet: (name: string) => void;
  defaultAcres?: number;
}) {
  const hasSheets = sheetNames.length > 0;

  // ── mode ──────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<"working" | "manual" | "bulk">(hasSheets ? "working" : "manual");

  // ── selected sheet ────────────────────────────────────────────────────────
  const [selectedSheet, setSelectedSheet] = useState<string>(sheetNames[0] ?? "");

  // Lazy-load the current sheet the first time it's needed
  useEffect(() => { if (selectedSheet) onLoadSheet(selectedSheet); }, [selectedSheet]); // eslint-disable-line react-hooks/exhaustive-deps

  const sheetData      = sheetsMap[selectedSheet];
  const workingGrid    = sheetData?.grid       ?? [];
  const workingColWidths  = sheetData?.colWidths  ?? [];
  const workingRowHeights = sheetData?.rowHeights ?? [];

  // ── form fields ────────────────────────────────────────────────────────────
  const [lineItemId,  setLineItemId]  = useState("");
  const [budgetType,  setBudgetType]  = useState<BudgetType>("Opex");
  const [category,    setCategory]    = useState("");
  const [lineItem,    setLineItem]    = useState("");
  const [uom,         setUom]         = useState("");
  const [qtyPerAcre,  setQtyPerAcre]  = useState("");
  const [acres,       setAcres]       = useState(defaultAcres > 0 ? String(defaultAcres) : "");
  const [ratePerUnit, setRatePerUnit] = useState("");
  const [error,       setError]       = useState("");

  // ── bulk upload ────────────────────────────────────────────────────────────
  const [bulkRows,     setBulkRows]     = useState<{ item: BudgetItem; errors: string[] }[]>([]);
  const [bulkFileName, setBulkFileName] = useState("");

  // ── crop type / farms ──────────────────────────────────────────────────────
  const [cropType, setCropType] = useState("");
  const [allFarms, setAllFarms] = useState<FarmRecord[]>([]);

  useEffect(() => {
    fetch(`${getBaseUrl()}/admin_ops_requests/get_farm_and_farmer`)
      .then((r) => r.json())
      .then((d) => { if (d.farm_farmer_mapping) setAllFarms(d.farm_farmer_mapping); })
      .catch(() => {});
  }, []);

  const cropTypes    = [...new Set(allFarms.map((f) => f.crop_type).filter(Boolean))] as string[];
  const matchedFarms = cropType ? allFarms.filter((f) => f.crop_type === cropType) : [];
  const totalAcres   = matchedFarms.reduce((s, f) => s + (f.area ?? 0), 0);

  useEffect(() => {
    if (cropType && totalAcres > 0) setAcres(String(totalAcres));
  }, [cropType, totalAcres]);

  // ── single-cell mapping (UoM / Qty / Rate) ────────────────────────────────
  const [mappingField, setMappingField] = useState<MappingField | null>(null);
  const [mappedCells,  setMappedCells]  = useState<Partial<Record<MappingField, [number, number]>>>({});

  // ── drag-to-select for working range ──────────────────────────────────────
  const [dragStart,  setDragStart]  = useState<[number, number] | null>(null);
  const [dragEnd,    setDragEnd]    = useState<[number, number] | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [finalRange, setFinalRange] = useState<{ r1: number; c1: number; r2: number; c2: number } | null>(null);

  // finalize drag on global mouseup (handles release outside the table)
  useEffect(() => {
    if (!isDragging) return;
    const handleUp = () => {
      if (dragStart && dragEnd) {
        setFinalRange({
          r1: Math.min(dragStart[0], dragEnd[0]), c1: Math.min(dragStart[1], dragEnd[1]),
          r2: Math.max(dragStart[0], dragEnd[0]), c2: Math.max(dragStart[1], dragEnd[1]),
        });
      }
      setIsDragging(false);
    };
    window.addEventListener("mouseup", handleUp);
    return () => window.removeEventListener("mouseup", handleUp);
  }, [isDragging, dragStart, dragEnd]);

  // ── helpers ────────────────────────────────────────────────────────────────
  const columnLabel = (ci: number): string => {
    let col = ci + (sheetData?.rangeOffset.c ?? 0) + 1;
    let letters = "";
    while (col > 0) {
      letters = String.fromCharCode(65 + ((col - 1) % 26)) + letters;
      col = Math.floor((col - 1) / 26);
    }
    return letters;
  };

  const cellAddress = (ri: number, ci: number): string =>
    `${columnLabel(ci)}${ri + (sheetData?.rangeOffset.r ?? 0) + 1}`;

  const rangeStr = finalRange
    ? `${cellAddress(finalRange.r1, finalRange.c1)}:${cellAddress(finalRange.r2, finalRange.c2)}`
    : "";

  // live highlight rect while dragging
  const liveRect = isDragging && dragStart && dragEnd ? {
    r1: Math.min(dragStart[0], dragEnd[0]), c1: Math.min(dragStart[1], dragEnd[1]),
    r2: Math.max(dragStart[0], dragEnd[0]), c2: Math.max(dragStart[1], dragEnd[1]),
  } : null;

  const inRect = (ri: number, ci: number, rect: typeof liveRect) =>
    rect ? ri >= rect.r1 && ri <= rect.r2 && ci >= rect.c1 && ci <= rect.c2 : false;

  const getMappedField = (ri: number, ci: number): MappingField | null => {
    for (const [f, [r, c]] of Object.entries(mappedCells) as [MappingField, [number, number]][]) {
      if (r === ri && c === ci) return f;
    }
    return null;
  };

  // ── cell interaction ───────────────────────────────────────────────────────
  const handleCellMouseDown = (ri: number, ci: number, val: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (mappingField) {
      if (mappingField === "uom")         setUom(val.trim());
      if (mappingField === "qtyPerAcre")  setQtyPerAcre(val.trim());
      if (mappingField === "ratePerUnit") setRatePerUnit(val.trim());
      setMappedCells((prev) => ({ ...prev, [mappingField]: [ri, ci] }));
      setMappingField(null);
    } else {
      setDragStart([ri, ci]);
      setDragEnd([ri, ci]);
      setIsDragging(true);
      setFinalRange(null);
    }
  };

  const handleCellMouseEnter = (ri: number, ci: number) => {
    if (isDragging) setDragEnd([ri, ci]);
  };

  // ── bulk upload handlers ───────────────────────────────────────────────────
  const handleBulkFile = (file: File) => {
    setBulkFileName(file.name);
    setBulkRows([]);
    const reader = new FileReader();
    reader.onload = (e) => {
      const bytes = new Uint8Array(e.target!.result as ArrayBuffer);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wb = (XLSX as any).read(bytes, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws);
      const parsed = rawRows.map((row, i) => {
        const item = mapXlsxRow(row);
        if (!item.id) item.id = `temp_bulk_${Date.now()}_${i}`;
        const errors: string[] = [];
        if (!item.category)    errors.push("category");
        if (!item.lineItem)    errors.push("line_item");
        if (!item.uom)         errors.push("UoM");
        if (!item.qtyPerAcre)  errors.push("quantity_per_acre");
        if (!item.acres)       errors.push("total_acres");
        if (!item.ratePerUnit) errors.push("rate_per_unit");
        return { item, errors };
      });
      setBulkRows(parsed);
    };
    reader.readAsArrayBuffer(file);
  };

  const bulkValidCount = bulkRows.filter((r) => r.errors.length === 0).length;

  const handleBulkImport = () => {
    const valid = bulkRows.filter((r) => r.errors.length === 0).map((r) => r.item);
    onBulkSaved(valid);
    onClose();
  };

  // ── computed ───────────────────────────────────────────────────────────────
  const qtyNum     = parseFloat(qtyPerAcre)  || 0;
  const acresNum   = parseFloat(acres)        || 0;
  const rateNum    = parseFloat(ratePerUnit)  || 0;
  const totalQty   = qtyNum * acresNum;
  const totalValue = totalQty * rateNum;

  // ── submit ─────────────────────────────────────────────────────────────────
  const handleAdd = () => {
    if (!lineItemId.trim() && (!category.trim() || !lineItem.trim() || !uom.trim() || !qtyPerAcre || !acres || !ratePerUnit)) {
      setError("All fields are required.");
      return;
    }

    // Store a cross-sheet formula reference using the selected sheet name.
    const escapedSheetName = selectedSheet.replace(/'/g, "''");
    const cellRef = (ri: number, ci: number) => `='${escapedSheetName}'!${cellAddress(ri, ci)}`;
    const qtyRaw  = mode === "working" && mappedCells.qtyPerAcre
      ? cellRef(...mappedCells.qtyPerAcre)
      : String(qtyNum);
    const rateRaw = mode === "working" && mappedCells.ratePerUnit
      ? cellRef(...mappedCells.ratePerUnit)
      : String(rateNum);

    const newItem: BudgetItem = {
      id:             lineItemId.trim() || `temp_${Date.now()}`,
      type:           budgetType,
      category:       category.trim(),
      lineItem:       lineItem.trim(),
      uom:            uom.trim(),
      qtyRaw,
      qtyPerAcre:     qtyNum,
      acres:          acresNum,
      rateRaw,
      ratePerUnit:    rateNum,
      utilizedQty:      0,
      savings:          0,
      workingXlsxUrl:   rangeStr && selectedSheet ? `${selectedSheet}!${rangeStr}` : rangeStr,
      amountInPipeline: 0,
      remainingAmount:  0,
    };

    onSaved(newItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-950/45 p-4">
      <div className={`w-full rounded-xl bg-white shadow-2xl ${
        mode === "working" && hasSheets
          ? "flex h-[calc(100vh-2rem)] max-w-[1500px] flex-col overflow-hidden"
          : mode === "bulk"
          ? "flex max-h-[calc(100vh-2rem)] max-w-4xl flex-col overflow-hidden"
          : "max-w-xl"
      }`}>

        {/* ── Header ── */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Add Budget Line Item</h2>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">
              {mode === "working"
                ? "Activate a mapping button then click a cell · drag to mark the working range"
                : mode === "bulk"
                ? "Upload an .xlsx file — each row becomes a budget line item"
                : "Enter values manually"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Mode toggle */}
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
              {hasSheets && (
                <button
                  type="button"
                  onClick={() => setMode("working")}
                  className={[
                    "h-7 rounded-md px-3 text-xs font-extrabold transition-all",
                    mode === "working" ? "bg-[#173f70] text-white shadow-sm" : "text-slate-500 hover:text-slate-700",
                  ].join(" ")}
                >
                  Working Sheet
                </button>
              )}
              <button
                type="button"
                onClick={() => setMode("manual")}
                className={[
                  "h-7 rounded-md px-3 text-xs font-extrabold transition-all",
                  mode === "manual" ? "bg-[#173f70] text-white shadow-sm" : "text-slate-500 hover:text-slate-700",
                ].join(" ")}
              >
                Manual
              </button>
              <button
                type="button"
                onClick={() => setMode("bulk")}
                className={[
                  "h-7 rounded-md px-3 text-xs font-extrabold transition-all",
                  mode === "bulk" ? "bg-[#173f70] text-white shadow-sm" : "text-slate-500 hover:text-slate-700",
                ].join(" ")}
              >
                Bulk Upload
              </button>
            </div>
            <button onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className={`p-6 ${
          mode === "working" && hasSheets
            ? "grid min-h-0 flex-1 grid-cols-[minmax(300px,340px)_minmax(0,1fr)] gap-6 overflow-hidden max-lg:grid-cols-1 max-lg:overflow-y-auto"
            : mode === "bulk"
            ? "min-h-0 flex-1 overflow-y-auto"
            : ""
        }`}>

          {/* ── Left / form column ── */}
          <div className={`space-y-4 ${mode === "working" && hasSheets ? "min-h-0 overflow-y-auto pr-2" : ""}`}>
            {mode !== "bulk" ? (<>
            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}

            {/* Line Item ID */}
            <Field label="Line Item ID">
              <input
                value={lineItemId}
                onChange={(e) => setLineItemId(e.target.value)}
                placeholder="e.g. LI-001 (optional — auto-assigned if blank)"
                className={inputCls}
              />
            </Field>

            {/* Budget Type */}
            <Field label="Budget Type *">
              <div className="flex gap-2">
                {(["Capex", "Opex"] as BudgetType[]).map((t) => (
                  <button key={t} type="button" onClick={() => setBudgetType(t)}
                    className={["flex-1 h-10 rounded-md border text-sm font-extrabold transition-all",
                      budgetType === t
                        ? t === "Capex" ? "border-violet-300 bg-violet-100 text-violet-700" : "border-sky-300 bg-sky-100 text-sky-700"
                        : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"].join(" ")}>
                    {t}
                  </button>
                ))}
              </div>
            </Field>

            {/* Category + Line Item */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Category *">
                <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Fertilizers" className={inputCls} />
              </Field>
              <Field label="Line Item *">
                <input value={lineItem} onChange={(e) => setLineItem(e.target.value)} placeholder="e.g. DAP Fertilizer" className={inputCls} />
              </Field>
            </div>

            {/* Crop Type */}
            <Field label="Crop Type">
              <select value={cropType} onChange={(e) => setCropType(e.target.value)} className={inputCls}>
                <option value="">Select crop type (optional)…</option>
                {cropTypes.map((ct) => (
                  <option key={ct} value={ct}>{ct.charAt(0).toUpperCase() + ct.slice(1)}</option>
                ))}
              </select>
            </Field>

            {cropType && matchedFarms.length > 0 && (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 flex items-center justify-between">
                  <p className="text-xs font-extrabold text-slate-600">{matchedFarms.length} farm(s) · "{cropType}"</p>
                  <p className="text-xs font-extrabold text-[#173f70]">{fmtNum(totalAcres)} acres</p>
                </div>
                <div className="max-h-24 overflow-y-auto divide-y divide-slate-100">
                  {matchedFarms.map((f) => (
                    <div key={f.farm_id} className="flex items-center justify-between px-3 py-1.5">
                      <span className="text-xs font-semibold text-slate-700">{f.owner_name}</span>
                      <span className="text-xs font-extrabold text-slate-500">{fmtNum(f.area)} ac</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Acres */}
            <Field label="Acres *">
              <input type="number" min="0" value={acres} onChange={(e) => setAcres(e.target.value)} placeholder="0"
                className={`${inputCls} ${cropType ? "bg-blue-50/40 font-extrabold text-[#173f70]" : ""}`} />
            </Field>

            {/* Working sheet mode — mapped value tiles */}
            {mode === "working" ? (
              <div className="space-y-2">
                {(["uom", "qtyPerAcre", "ratePerUnit"] as MappingField[]).map((f) => {
                  const mapped = mappedCells[f];
                  const val    = f === "uom" ? uom : f === "qtyPerAcre" ? qtyPerAcre : ratePerUnit;
                  const colors = MAPPING_COLORS[f];
                  return (
                    <div key={f} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-slate-500 w-20">{MAPPING_LABELS[f]}</span>
                        {mapped && (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${colors.chip}`}>
                            {cellAddress(mapped[0], mapped[1])}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {val
                          ? <span className="text-xs font-extrabold text-slate-800">{val}</span>
                          : <span className="text-[10px] font-semibold italic text-slate-400">not mapped</span>
                        }
                        {mapped && (
                          <button type="button" onClick={() => {
                            if (f === "uom") setUom("");
                            if (f === "qtyPerAcre") setQtyPerAcre("");
                            if (f === "ratePerUnit") setRatePerUnit("");
                            setMappedCells((prev) => { const n = { ...prev }; delete n[f]; return n; });
                          }} className="text-slate-300 hover:text-red-400">
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Working range tile */}
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="text-xs font-extrabold text-slate-500 w-20">Working Range</span>
                  <div className="flex items-center gap-2">
                    {rangeStr
                      ? <>
                          <code className="rounded bg-[#173f70]/10 px-2 py-0.5 text-[10px] font-extrabold text-[#173f70]">{rangeStr}</code>
                          <button type="button" onClick={() => setFinalRange(null)} className="text-slate-300 hover:text-red-400">
                            <X className="h-3 w-3" />
                          </button>
                        </>
                      : <span className="text-[10px] font-semibold italic text-slate-400">drag to select</span>
                    }
                  </div>
                </div>
              </div>
            ) : (
              /* Manual mode — plain inputs */
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="UoM *">
                    <input value={uom} onChange={(e) => setUom(e.target.value)} placeholder="Kg" className={inputCls} />
                  </Field>
                  <Field label="Qty / Acre *">
                    <input type="number" min="0" value={qtyPerAcre} onChange={(e) => setQtyPerAcre(e.target.value)} placeholder="0" className={inputCls} />
                  </Field>
                  <Field label="Rate / Unit (₹) *">
                    <input type="number" min="0" value={ratePerUnit} onChange={(e) => setRatePerUnit(e.target.value)} placeholder="0" className={inputCls} />
                  </Field>
                </div>
              </>
            )}

            {/* Computed preview */}
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Total Qty</p>
                <p className="mt-0.5 text-base font-extrabold text-amber-700">{fmtNum(totalQty)}</p>
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Total Value</p>
                <p className="mt-0.5 text-base font-extrabold text-emerald-700">{fmt(totalValue)}</p>
              </div>
            </div>
            </>) : (
            /* ── Bulk Upload UI ── */
            <div className="flex flex-col gap-4">
              {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}
              <Field label="Line Item ID">
                <input
                  value={lineItemId}
                  onChange={(e) => setLineItemId(e.target.value)}
                  placeholder="e.g. LI-001 (optional — enables import button)"
                  className={inputCls}
                />
              </Field>
              <label
                className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 transition-all hover:border-[#173f70]/40 hover:bg-slate-100/60"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleBulkFile(f); }}
              >
                <FileSpreadsheet className="h-8 w-8 text-slate-400" />
                <div className="text-center">
                  <p className="text-sm font-extrabold text-slate-700">
                    {bulkFileName || "Drop .xlsx here, or click to browse"}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Required columns: budget_type · category · line_item · UoM · quantity_per_acre · total_acres · rate_per_unit
                  </p>
                </div>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => { if (e.target.files?.[0]) handleBulkFile(e.target.files[0]); }}
                />
              </label>

              {bulkRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-extrabold text-slate-600">
                      {bulkRows.length} row{bulkRows.length !== 1 ? "s" : ""} found
                      {bulkRows.some((r) => r.errors.length > 0) && (
                        <span className="ml-2 text-red-500">· {bulkRows.filter((r) => r.errors.length > 0).length} with errors</span>
                      )}
                    </p>
                    <p className="text-xs font-extrabold text-[#173f70]">{bulkValidCount} ready to import</p>
                  </div>
                  <div className="max-h-[340px] overflow-auto rounded-lg border border-slate-200">
                    <table className="w-full border-collapse text-xs">
                      <thead className="sticky top-0 z-10 bg-slate-50">
                        <tr>
                          <th className="border-b border-slate-200 px-2 py-2 text-left font-extrabold text-slate-500">#</th>
                          <th className="border-b border-slate-200 px-2 py-2 text-left font-extrabold text-slate-500">Type</th>
                          <th className="border-b border-slate-200 px-2 py-2 text-left font-extrabold text-slate-500">Category</th>
                          <th className="border-b border-slate-200 px-2 py-2 text-left font-extrabold text-slate-500">Line Item</th>
                          <th className="border-b border-slate-200 px-2 py-2 text-left font-extrabold text-slate-500">UoM</th>
                          <th className="border-b border-slate-200 px-2 py-2 text-right font-extrabold text-slate-500">Qty/Ac</th>
                          <th className="border-b border-slate-200 px-2 py-2 text-right font-extrabold text-slate-500">Acres</th>
                          <th className="border-b border-slate-200 px-2 py-2 text-right font-extrabold text-slate-500">Rate</th>
                          <th className="border-b border-slate-200 px-2 py-2 text-right font-extrabold text-slate-500 bg-emerald-50/60">Total Value</th>
                          <th className="border-b border-slate-200 px-2 py-2 text-left font-extrabold text-red-400">Issues</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkRows.map(({ item, errors }, i) => (
                          <tr key={i} className={errors.length > 0 ? "bg-red-50/60" : "hover:bg-slate-50"}>
                            <td className="border-b border-slate-100 px-2 py-1.5 font-semibold text-slate-400">{i + 1}</td>
                            <td className="border-b border-slate-100 px-2 py-1.5">
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${typeColors[item.type]}`}>{item.type}</span>
                            </td>
                            <td className="border-b border-slate-100 px-2 py-1.5 font-semibold text-slate-700">
                              {item.category || <span className="text-red-400 italic">missing</span>}
                            </td>
                            <td className="border-b border-slate-100 px-2 py-1.5 font-extrabold text-slate-900">
                              {item.lineItem || <span className="text-red-400 italic">missing</span>}
                            </td>
                            <td className="border-b border-slate-100 px-2 py-1.5 text-slate-500">
                              {item.uom || <span className="text-red-400 italic">—</span>}
                            </td>
                            <td className="border-b border-slate-100 px-2 py-1.5 text-right text-slate-700">{fmtNum(item.qtyPerAcre)}</td>
                            <td className="border-b border-slate-100 px-2 py-1.5 text-right text-slate-700">{fmtNum(item.acres)}</td>
                            <td className="border-b border-slate-100 px-2 py-1.5 text-right text-slate-700">{fmt(item.ratePerUnit)}</td>
                            <td className="border-b border-slate-100 bg-emerald-50/30 px-2 py-1.5 text-right font-extrabold text-emerald-700">
                              {fmt(item.qtyPerAcre * item.acres * item.ratePerUnit)}
                            </td>
                            <td className="border-b border-slate-100 px-2 py-1.5">
                              {errors.length > 0 ? (
                                <span className="text-[10px] font-semibold text-red-500">Missing: {errors.join(", ")}</span>
                              ) : (
                                <span className="text-[10px] font-semibold text-emerald-500">✓ OK</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            )}
          </div>

          {/* ── Right / working sheet grid ── */}
          {mode === "working" && hasSheets && (
            <div className="flex min-h-0 min-w-0 flex-col gap-3 max-lg:min-h-[500px]">

              {/* Sheet selector tabs */}
              {sheetNames.length > 1 && (
                <div className="flex max-w-full min-w-0 items-center gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-1">
                  {sheetNames.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        setSelectedSheet(name);
                        setMappedCells({});
                        setFinalRange(null);
                        setMappingField(null);
                      }}
                      className={[
                        "shrink-0 h-7 rounded-md px-3 text-xs font-extrabold transition-all",
                        selectedSheet === name
                          ? "bg-[#173f70] text-white"
                          : "text-slate-500 hover:text-slate-700",
                      ].join(" ")}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}

              {/* Mapping buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {(["uom", "qtyPerAcre", "ratePerUnit"] as MappingField[]).map((f) => {
                  const mapped   = !!mappedCells[f];
                  const isActive = mappingField === f;
                  const colors   = MAPPING_COLORS[f];
                  return (
                    <button key={f} type="button"
                      onClick={() => setMappingField(isActive ? null : f)}
                      className={["h-8 rounded-lg border px-3 text-xs font-extrabold transition-all",
                        isActive
                          ? "border-[#173f70] bg-[#173f70] text-white"
                          : mapped
                          ? `${colors.chip} border-transparent`
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                      ].join(" ")}>
                      {mapped ? "✓ " : ""}{MAPPING_LABELS[f]}
                    </button>
                  );
                })}
                <span className="ml-auto text-[10px] font-semibold text-slate-400">
                  {mappingField
                    ? `↓ click a cell · mapping ${MAPPING_LABELS[mappingField]}`
                    : isDragging ? "dragging…" : "drag to select working range"}
                </span>
              </div>

              {/* Sheet grid */}
              <div
                className="min-h-0 min-w-0 flex-1 overflow-auto rounded-lg border border-slate-200"
                style={{ userSelect: "none" }}
              >
                <table className="border-collapse text-xs" style={{ tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: 28 }} />
                    {workingGrid[0]?.map((_, ci) => (
                      <col key={ci} style={{ width: workingColWidths[ci] ?? 80 }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr className="sticky top-0 z-10 bg-slate-100">
                      <th className="border border-slate-200 px-1 py-1 text-center text-slate-400" />
                      {workingGrid[0]?.map((_, ci) => (
                        <th key={ci} className="border border-slate-200 px-1 py-1 text-center text-xs font-extrabold text-slate-500">
                          {columnLabel(ci)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {workingGrid.map((row, ri) => (
                      <tr key={ri} style={{ height: workingRowHeights[ri] ?? 22 }}>
                        <td className="border border-slate-200 bg-slate-50 px-1 text-center text-[10px] font-semibold text-slate-400 select-none">
                          {ri + (sheetData?.rangeOffset.r ?? 0) + 1}
                        </td>
                        {row.map((cell, ci) => {
                          if (cell.skip) return null;

                          const mf       = getMappedField(ri, ci);
                          const inLive   = inRect(ri, ci, liveRect);
                          const inFinal  = inRect(ri, ci, finalRange);
                          const isMaping = mappingField !== null;

                          const style: React.CSSProperties = {
                            ...(cell.style as React.CSSProperties),
                            height:        workingRowHeights[ri] ?? 22,
                            overflow:      "hidden",
                            textOverflow:  "ellipsis",
                            whiteSpace:    cell.style.whiteSpace ?? "nowrap",
                            padding:       "0 4px",
                            maxWidth:      workingColWidths[ci] ?? 80,
                            cursor:        isMaping ? "cell" : "crosshair",
                          };

                          if (mf) {
                            style.backgroundColor = MAPPING_COLORS[mf].bg;
                            style.outline         = MAPPING_COLORS[mf].outline;
                          } else if (inLive) {
                            style.backgroundColor = "rgba(23,63,112,0.13)";
                            style.outline         = "1px solid rgba(23,63,112,0.35)";
                          } else if (inFinal) {
                            style.backgroundColor = "rgba(16,185,129,0.10)";
                            style.outline         = "1.5px solid #10b981";
                          }

                          return (
                            <td
                              key={ci}
                              rowSpan={cell.rowSpan}
                              colSpan={cell.colSpan}
                              style={style}
                              className={[
                                "border border-slate-200",
                                isMaping && !mf ? "hover:bg-[#173f70]/10" : "",
                              ].join(" ")}
                              onMouseDown={(e) => handleCellMouseDown(ri, ci, cell.value, e)}
                              onMouseEnter={() => handleCellMouseEnter(ri, ci)}
                              title={cell.value}
                            >
                              {cell.value}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button onClick={onClose} className="h-10 rounded-lg border border-slate-200 px-5 text-sm font-semibold hover:bg-slate-50">
            Cancel
          </button>
          {mode === "bulk" ? (
            <button
              type="button"
              onClick={handleBulkImport}
              className="h-10 rounded-lg bg-[#173f70] px-5 text-sm font-semibold text-white hover:bg-[#12345e]"
            >
              Import {bulkValidCount > 0 ? `${bulkValidCount} ` : ""}Item{bulkValidCount !== 1 ? "s" : ""}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleAdd}
              disabled={!lineItemId.trim() && (!category.trim() || !lineItem.trim() || !uom.trim() || !qtyPerAcre || !acres || !ratePerUnit)}
              className="h-10 rounded-lg bg-[#173f70] px-5 text-sm font-semibold text-white hover:bg-[#12345e] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add Line Item
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Edit Line Item Modal ──────────────────────────────────────────────────────
function EditLineItemModal({
  item, onClose, onSave,
}: {
  item: BudgetItem;
  onClose: () => void;
  onSave: (updated: BudgetItem) => void;
}) {
  const [type,        setType]        = useState<BudgetType>(item.type);
  const [category,    setCategory]    = useState(item.category);
  const [lineItem,    setLineItem]    = useState(item.lineItem);
  const [uom,         setUom]         = useState(item.uom);
  const [qtyPerAcre,  setQtyPerAcre]  = useState(String(item.qtyPerAcre));
  const [acres,       setAcres]       = useState(String(item.acres));
  const [ratePerUnit, setRatePerUnit] = useState(String(item.ratePerUnit));
  const [utilizedQty, setUtilizedQty] = useState(String(item.utilizedQty));
  const [error,       setError]       = useState("");

  const qtyNum      = parseFloat(qtyPerAcre)  || 0;
  const acresNum    = parseFloat(acres)        || 0;
  const rateNum     = parseFloat(ratePerUnit)  || 0;
  const totalQty    = qtyNum * acresNum;
  const totalValue  = totalQty * rateNum;
  const utilizedNum = Math.max(0, parseFloat(utilizedQty) || 0);
  const utilizedPct = totalQty > 0 ? Math.min(100, (utilizedNum / totalQty) * 100) : 0;

  const handleSave = () => {
    if (!category.trim() || !lineItem.trim() || !uom.trim() || !qtyPerAcre || !acres || !ratePerUnit) {
      setError("All fields are required.");
      return;
    }
    onSave({ ...item, type, category: category.trim(), lineItem: lineItem.trim(), uom: uom.trim(), qtyPerAcre: qtyNum, acres: acresNum, ratePerUnit: rateNum, utilizedQty: utilizedNum, savings: item.savings });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Edit Budget Line Item</h2>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">Update the values — computed fields refresh automatically</p>
          </div>
          <button onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}

          <Field label="Budget Type *">
            <div className="flex gap-2">
              {(["Capex", "Opex"] as BudgetType[]).map((t) => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={["flex-1 h-10 rounded-md border text-sm font-extrabold transition-all",
                    type === t ? (t === "Capex" ? "border-violet-300 bg-violet-100 text-violet-700" : "border-sky-300 bg-sky-100 text-sky-700") : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  ].join(" ")}>{t}</button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Category *"><input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Fertilizers" className={inputCls} /></Field>
            <Field label="Line Item *"><input value={lineItem} onChange={(e) => setLineItem(e.target.value)} placeholder="e.g. DAP Fertilizer" className={inputCls} /></Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="UoM *"><input value={uom} onChange={(e) => setUom(e.target.value)} placeholder="e.g. Kg" className={inputCls} /></Field>
            <Field label="Qty / Acre *"><input type="number" min="0" value={qtyPerAcre} onChange={(e) => setQtyPerAcre(e.target.value)} placeholder="0" className={inputCls} /></Field>
            <Field label="Acres *"><input type="number" min="0" value={acres} onChange={(e) => setAcres(e.target.value)} placeholder="0" className={inputCls} /></Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Rate / Unit (₹) *">
              <input type="number" min="0" value={ratePerUnit} onChange={(e) => setRatePerUnit(e.target.value)} placeholder="0" className={inputCls} />
            </Field>
            <Field label={`Utilized Qty${uom ? ` (${uom})` : ""}`}>
              <input type="number" min="0" value={utilizedQty} onChange={(e) => setUtilizedQty(e.target.value)} placeholder="0" className={inputCls} />
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full transition-all ${barColor(utilizedPct)}`} style={{ width: `${utilizedPct}%` }} />
                </div>
                <span className={`text-[10px] font-extrabold tabular-nums ${barTextColor(utilizedPct)}`}>{Math.round(utilizedPct)}%</span>
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Total Qty</p>
              <p className="mt-0.5 text-sm font-extrabold text-amber-700">{fmtNum(totalQty)}</p>
            </div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Total Value</p>
              <p className="mt-0.5 text-sm font-extrabold text-emerald-700">{fmt(totalValue)}</p>
            </div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Utilized Value</p>
              <p className={`mt-0.5 text-sm font-extrabold ${barTextColor(utilizedPct)}`}>{fmt(utilizedNum * rateNum)}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button onClick={onClose} className="h-10 rounded-lg border border-slate-200 px-5 text-sm font-semibold hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={handleSave} className="h-10 rounded-lg bg-[#173f70] px-5 text-sm font-semibold text-white hover:bg-[#12345e]">Save Changes</button>
        </div>
      </div>
    </div>
  );
}

// ── Working Sheet Slide-over ──────────────────────────────────────────────────
function XlsxDrawer({
  item, onClose, sheetsMap, sheetNames, effectiveValues, onCellEdit, onLoadSheet,
}: {
  item: BudgetItem;
  onClose: () => void;
  sheetsMap: Record<string, SheetData>;
  sheetNames: string[];
  effectiveValues: Record<string, number>;
  onCellEdit: (sheetName: string, ri: number, ci: number, value: number) => void;
  onLoadSheet: (name: string) => void;
}) {
  // Derive the item's sheet + range from workingXlsxUrl ("SheetName!D3:G15" or legacy "D3:G15")
  const itemUrl = item.workingXlsxUrl ?? "";
  const bangIdx = itemUrl.indexOf("!");
  const itemSheet = bangIdx >= 0 ? itemUrl.slice(0, bangIdx) : (sheetNames[0] ?? "");
  const itemRange = bangIdx >= 0 ? itemUrl.slice(bangIdx + 1) : itemUrl;

  const [selectedSheet, setSelectedSheet] = useState<string>(itemSheet || sheetNames[0] || "");
  const [editingCell,   setEditingCell]   = useState<[number, number] | null>(null);
  const [editValue,     setEditValue]     = useState("");

  // Lazy-load the selected sheet the first time it's needed
  useEffect(() => { if (selectedSheet) onLoadSheet(selectedSheet); }, [selectedSheet]); // eslint-disable-line react-hooks/exhaustive-deps

  const sd = sheetsMap[selectedSheet];
  const grid        = sd?.grid        ?? [];
  const colWidths   = sd?.colWidths   ?? [];
  const rowHeights  = sd?.rowHeights  ?? [];
  const rangeOffset = sd?.rangeOffset ?? { r: 0, c: 0 };

  // Parse the stored range into grid indices (only when viewing item's own sheet)
  const displayRange = selectedSheet === itemSheet ? itemRange : "";
  let startRi = 0, startCi = 0;
  let endRi = Math.max(0, grid.length - 1);
  let endCi = Math.max(0, (grid[0]?.length ?? 1) - 1);
  if (displayRange?.includes(":")) {
    const [sa, ea] = displayRange.split(":");
    const [r1, c1] = cellAddrToGridIdx(sa, rangeOffset);
    const [r2, c2] = cellAddrToGridIdx(ea, rangeOffset);
    if (r1 >= 0) {
      startRi = Math.max(0, Math.min(r1, r2));
      endRi   = Math.min(grid.length - 1, Math.max(r1, r2));
      startCi = Math.max(0, Math.min(c1, c2));
      endCi   = Math.min((grid[0]?.length ?? 1) - 1, Math.max(c1, c2));
    }
  }

  const colLabel = (gridCi: number): string => {
    let n = gridCi + rangeOffset.c + 1;
    let s = "";
    while (n > 0) { const rem = (n - 1) % 26; s = String.fromCharCode(65 + rem) + s; n = Math.floor((n - 1) / 26); }
    return s;
  };

  const displayVal = (ri: number, ci: number): string => {
    const k = `${selectedSheet}:${ri},${ci}`;
    return effectiveValues[k] !== undefined ? String(effectiveValues[k]) : (grid[ri]?.[ci]?.value ?? "");
  };

  // Pointer badges — only highlight if on the selected sheet
  const qtyM  = item.qtyRaw.match(/^='([^']+)'!([A-Z]+\d+)$/i);
  const rateM = item.rateRaw.match(/^='([^']+)'!([A-Z]+\d+)$/i);
  const qtyAddr  = qtyM?.[1]  === selectedSheet ? qtyM?.[2]  ?? null : null;
  const rateAddr = rateM?.[1] === selectedSheet ? rateM?.[2] ?? null : null;
  const qtyGrid  = qtyAddr  ? cellAddrToGridIdx(qtyAddr,  rangeOffset) : null;
  const rateGrid = rateAddr ? cellAddrToGridIdx(rateAddr, rangeOffset) : null;

  const badge = (ri: number, ci: number): "qty" | "rate" | null => {
    if (qtyGrid  && qtyGrid[0]  === ri && qtyGrid[1]  === ci) return "qty";
    if (rateGrid && rateGrid[0] === ri && rateGrid[1] === ci) return "rate";
    return null;
  };

  const startEdit = (ri: number, ci: number) => { setEditingCell([ri, ci]); setEditValue(displayVal(ri, ci)); };
  const commitEdit = (ri: number, ci: number) => {
    const num = parseFloat(editValue);
    if (!isNaN(num)) onCellEdit(selectedSheet, ri, ci, num);
    setEditingCell(null);
  };

  const numRows = endRi - startRi + 1;
  const numCols = endCi - startCi + 1;

  return (
    <>
      <div className="fixed inset-0 z-30 bg-slate-950/20" onClick={onClose} />
      <div className="fixed right-0 top-0 z-40 flex h-full w-[620px] flex-col bg-white shadow-2xl ring-1 ring-slate-200 animate-in slide-in-from-right duration-300">

        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                {selectedSheet}
                {displayRange && (
                  <> · <code className="rounded bg-[#173f70]/10 px-1.5 text-[#173f70]">{displayRange}</code></>
                )}
              </p>
            </div>
            <h3 className="mt-1 text-sm font-extrabold text-slate-900">{item.lineItem}</h3>
            <p className="text-xs font-semibold text-slate-400">{item.category}</p>
          </div>
          <button onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sheet selector tabs */}
        {sheetNames.length > 1 && (
          <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 px-4 py-2">
            {sheetNames.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => { setSelectedSheet(name); setEditingCell(null); }}
                className={[
                  "shrink-0 h-7 rounded-md px-3 text-xs font-extrabold transition-all",
                  selectedSheet === name
                    ? "bg-[#173f70] text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                ].join(" ")}
              >
                {name === itemSheet ? `★ ${name}` : name}
              </button>
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-white px-5 py-2">
          {qtyAddr && (
            <span className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[10px] font-extrabold text-amber-700">
              <span className="h-2 w-2 rounded-sm bg-amber-300" />{qtyAddr} → Qty / Acre
            </span>
          )}
          {rateAddr && (
            <span className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-extrabold text-emerald-700">
              <span className="h-2 w-2 rounded-sm bg-emerald-300" />{rateAddr} → Rate / Unit
            </span>
          )}
          <span className="ml-auto text-[10px] font-semibold italic text-slate-400">
            click cell to edit · <span className="not-italic font-extrabold">fx</span> = formula
          </span>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto p-4">
          {grid.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
              <FileSpreadsheet className="h-10 w-10" />
              <p className="text-sm font-semibold">No sheet data loaded</p>
            </div>
          ) : (
            <div className="overflow-auto rounded-lg border border-slate-200" style={{ userSelect: "none" }}>
              <table className="border-collapse text-xs" style={{ tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: 32 }} />
                  {Array.from({ length: numCols }, (_, i) => (
                    <col key={i} style={{ width: Math.max(72, colWidths[startCi + i] ?? 72) }} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="sticky top-0 z-10 bg-slate-100">
                    <th className="border border-slate-200 px-1 py-1 text-center text-slate-400" />
                    {Array.from({ length: numCols }, (_, i) => (
                      <th key={i} className="border border-slate-200 px-1 py-1 text-center text-xs font-extrabold text-slate-500">
                        {colLabel(startCi + i)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: numRows }, (_, rIdx) => {
                    const ri = startRi + rIdx;
                    const absRow = ri + rangeOffset.r + 1;
                    return (
                      <tr key={ri} style={{ height: rowHeights[ri] ?? 22 }}>
                        <td className="select-none border border-slate-200 bg-slate-50 px-1 text-center text-[10px] font-semibold text-slate-400">
                          {absRow}
                        </td>
                        {Array.from({ length: numCols }, (_, cIdx) => {
                          const ci = startCi + cIdx;
                          const cell = grid[ri]?.[ci];
                          if (!cell || cell.skip) return <td key={ci} className="border border-slate-200" />;

                          const b = badge(ri, ci);
                          const isEditing = editingCell?.[0] === ri && editingCell?.[1] === ci;
                          const val = displayVal(ri, ci);

                          return (
                            <td
                              key={ci}
                              rowSpan={cell.rowSpan}
                              colSpan={cell.colSpan}
                              onClick={() => startEdit(ri, ci)}
                              className="border border-slate-200"
                              style={{
                                ...(cell.style as React.CSSProperties),
                                backgroundColor: b === "qty" ? "rgba(245,158,11,0.18)" : b === "rate" ? "rgba(16,185,129,0.18)" : cell.style.backgroundColor,
                                outline: b === "qty" ? "2px solid #f59e0b" : b === "rate" ? "2px solid #10b981" : undefined,
                                padding: "0 4px",
                                height: rowHeights[ri] ?? 22,
                                overflow: "hidden",
                                cursor: "text",
                              }}
                            >
                              {isEditing ? (
                                <input
                                  autoFocus
                                  value={editValue}
                                  onChange={e => setEditValue(e.target.value)}
                                  onBlur={() => commitEdit(ri, ci)}
                                  onKeyDown={e => { if (e.key === "Enter") commitEdit(ri, ci); if (e.key === "Escape") setEditingCell(null); }}
                                  className="h-full w-full border-0 bg-blue-50 px-0 text-xs outline-none ring-1 ring-[#173f70]"
                                  style={{ fontFamily: "inherit" }}
                                />
                              ) : (
                                <span className="flex items-center gap-1 overflow-hidden whitespace-nowrap">
                                  {cell.formula && (
                                    <span className="shrink-0 rounded bg-slate-200 px-0.5 text-[8px] font-extrabold text-slate-500">fx</span>
                                  )}
                                  <span className="overflow-hidden text-ellipsis">{val}</span>
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <p className="text-[10px] font-semibold text-center text-slate-400">
            Edits cascade through formulas automatically · saved with budget
          </p>
        </div>
      </div>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Budget() {
  const { budgetId } = useParams<{ budgetId: string }>();
  const { user } = useAuth();

  const [data,        setData]        = useState<BudgetItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [isSaving,    setIsSaving]    = useState(false);
  const [fetchKey,    setFetchKey]    = useState(0);
  const [originalXlsx, setOriginalXlsx] = useState<Uint8Array | null>(null);
  const [activeType,  setActiveType]  = useState<"All" | BudgetType>("All");
  const [locked,      setLocked]      = useState(false);
  const [showAdd,        setShowAdd]        = useState(false);
  const [editingItem,    setEditingItem]    = useState<BudgetItem | null>(null);
  const [xlsxDrawerItem, setXlsxDrawerItem] = useState<BudgetItem | null>(null);
  const [showPlayground, setShowPlayground] = useState(false);
  const [disbursementItem, setDisbursementItem] = useState<DisbursementSequenceLineItem | null>(null);
  const [expandedAllocationId, setExpandedAllocationId] = useState<string | null>(null);
  const [allocationBreakdowns, setAllocationBreakdowns] = useState<Record<string, BudgetAllocationEntry[]>>({});
  const [loadingAllocationId, setLoadingAllocationId] = useState<string | null>(null);
  const [allocationErrors, setAllocationErrors] = useState<Record<string, string>>({});

  const toggleAllocationBreakdown = async (row: BudgetItem) => {
    const nextId = expandedAllocationId === row.id ? null : row.id;
    setExpandedAllocationId(nextId);
    if (!nextId || allocationBreakdowns[row.id] || loadingAllocationId === row.id) return;

    setLoadingAllocationId(row.id);
    setAllocationErrors((prev) => {
      if (!(row.id in prev)) return prev;
      const next = { ...prev };
      delete next[row.id];
      return next;
    });
    try {
      const res = await fetch(`${getBaseUrl()}/admin_accounts/get_budget_allocation_schema`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budget_id: budgetId,
          line_item_category: row.category,
          line_item_type: row.type,
          line_item_name: row.lineItem,
        }),
      });
      const json: any = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Failed to load allocation breakdown");
      setAllocationBreakdowns((prev) => ({ ...prev, [row.id]: json.data || [] }));
    } catch (err: any) {
      setAllocationErrors((prev) => ({ ...prev, [row.id]: err?.message || "Failed to load allocation breakdown" }));
    } finally {
      setLoadingAllocationId((prev) => (prev === row.id ? null : prev));
    }
  };

  // All non-budget sheets parsed from the xlsx
  const [sheetsMap,       setSheetsMap]       = useState<Record<string, SheetData>>({});
  const [sheetNames,      setSheetNames]      = useState<string[]>([]);
  const [cellEdits,       setCellEdits]       = useState<Record<string, number>>({});
  const [effectiveValues, setEffectiveValues] = useState<Record<string, number>>({});
  const [budgetTotalAcres, setBudgetTotalAcres] = useState<number>(0);

  useEffect(() => {
    if (!budgetId) return;
    fetch(`${getBaseUrl()}/admin_accounts/get_budget_metadata/${budgetId}`)
      .then((r) => r.json())
      .then((d) => { if (d.success && d.data?.total_acres) setBudgetTotalAcres(d.data.total_acres); })
      .catch(() => {});
  }, [budgetId]);

  useEffect(() => {
    if (!budgetId) return;
    setLoading(true);
    fetch(`${getBaseUrl()}/admin_accounts/get_budget/${budgetId}`)
      .then(async (response) => {
        if (import.meta.env.DEV) {
          console.debug("[Budget XLSX] API response", {
            budgetId,
            status: response.status,
            contentDisposition: response.headers.get("content-disposition"),
            contentLength: response.headers.get("content-length"),
          });
        }
        if (!response.ok) throw new Error(`Budget XLSX request failed: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((buf) => {
        const uint8 = new Uint8Array(buf);
        setOriginalXlsx(uint8);

        // Sheet 1 "budget" — plain JSON for the table
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wb = (XLSX as any).read(uint8, {
          type: "array",
          cellFormula: true,
          cellText: false,
          cellNF: true,
        });
        if (import.meta.env.DEV) {
          const debugCells = [
            ["Land Preparation", "E17"],
            ["Tractor & Capex working", "E55"],
            ["Napier Financial Model", "E5"],
            ["Operating Expenditure", "J8"],
          ];
          const rawCellState = debugCells.map(([sheetName, address]) => {
            const cell = wb.Sheets[sheetName]?.[address];
            return {
              cell: `${sheetName}!${address}`,
              formula: cell?.f ?? null,
              value: cell?.v ?? null,
              type: cell?.t ?? null,
              formatted: cell?.w ?? null,
            };
          });
          const formulaSummary = (wb.SheetNames as string[])
            .filter((sheetName) => sheetName !== "budget")
            .map((sheetName) => {
              const cells = Object.entries(wb.Sheets[sheetName] ?? {})
                .filter(([address]) => !address.startsWith("!"))
                .map(([address, cell]) => ({ address, ...(cell as { f?: string; v?: unknown }) }));
              const formulas = cells.filter((cell) => cell.f);
              const missingCache = formulas.filter((cell) => cell.v === 0 || cell.v == null);
              return {
                sheet: sheetName,
                formulas: formulas.length,
                zeroOrMissingCachedValues: missingCache.length,
                samples: missingCache.slice(0, 5)
                  .map((cell) => `${cell.address}: ${cell.f}`)
                  .join(" | "),
              };
            });
          console.groupCollapsed("[Budget XLSX] Raw API workbook diagnostics");
          console.table(rawCellState);
          console.table(formulaSummary);
          console.groupEnd();
        }
        const budgetWs = wb.Sheets["budget"];
        let parsedBudget: BudgetItem[] = [];
        if (budgetWs) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rows: any[] = XLSX.utils.sheet_to_json(budgetWs);
          parsedBudget = rows.map((row, index) => {
            const item = mapXlsxRow(row);
            const qtyCell = budgetWs[XLSX.utils.encode_cell({ r: index + 1, c: 5 })];
            const rateCell = budgetWs[XLSX.utils.encode_cell({ r: index + 1, c: 8 })];
            if (qtyCell?.f) item.qtyRaw = `=${qtyCell.f}`;
            if (rateCell?.f) item.rateRaw = `=${rateCell.f}`;
            return item;
          });
        }

        // Pre-load ALL non-budget sheets in two passes:
        // 1. First pass: parse all sheets without cross-references
        const names = (wb.SheetNames as string[]).filter((n) => n !== "budget");
        const newSheetsMap: Record<string, SheetData> = {};
        for (const sheetName of names) {
          newSheetsMap[sheetName] = parseXlsxWithStyles(uint8, sheetName);
        }
        evaluateMissingFormulaValues(newSheetsMap);

        if (import.meta.env.DEV) {
          const parsedCellState = [
            ["Land Preparation", "E17"],
            ["Tractor & Capex working", "E55"],
            ["Napier Financial Model", "E5"],
            ["Operating Expenditure", "J8"],
          ].map(([sheetName, address]) => {
            const sheet = newSheetsMap[sheetName];
            const [ri, ci] = sheet ? cellAddrToGridIdx(address, sheet.rangeOffset) : [-1, -1];
            const cell = sheet?.grid[ri]?.[ci];
            return {
              cell: `${sheetName}!${address}`,
              parsedValue: cell?.value ?? null,
              formula: cell?.formula ?? null,
            };
          });
          console.groupCollapsed("[Budget XLSX] Parsed popup diagnostics");
          console.table(parsedCellState);
          console.groupEnd();
        }

        setData(syncBudgetFromOverrides(parsedBudget, {}, newSheetsMap));
        setSheetsMap(newSheetsMap);
        setSheetNames(names);
        setCellEdits({});
        setEffectiveValues({});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [budgetId, fetchKey]);

  const filtered = activeType === "All" ? data : data.filter((r) => r.type === activeType);

  const totalCapex   = data.filter((r) => r.type === "Capex").reduce((s, r) => s + r.qtyPerAcre * r.acres * r.ratePerUnit, 0);
  const totalOpex    = data.filter((r) => r.type === "Opex" ).reduce((s, r) => s + r.qtyPerAcre * r.acres * r.ratePerUnit, 0);
  const grandTotal   = totalCapex + totalOpex;
  const totalSavings = data.reduce((s, r) => s + r.savings, 0);

  const filteredTotalValue   = filtered.reduce((s, r) => s + r.qtyPerAcre * r.acres * r.ratePerUnit, 0);
  const filteredUtilizedVal  = filtered.reduce((s, r) => s + r.utilizedQty * r.ratePerUnit, 0);
  const filteredTotalSavings = filtered.reduce((s, r) => s + r.savings, 0);
  const overallPct           = filteredTotalValue > 0 ? Math.min(100, (filteredUtilizedVal / filteredTotalValue) * 100) : 0;

  const handleSaved = (item: BudgetItem) => setData((prev) => [...prev, item]);
  const handleBulkSaved = (items: BudgetItem[]) => setData((prev) => [...prev, ...items]);

  const handleSaveEdit = (updated: BudgetItem) => {
    setData((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  const handleDelete = (id: string) => {
    setData((prev) => prev.filter((r) => r.id !== id));
  };

  const hasUnsavedChanges =
    data.some((item) => item.id.startsWith("temp_")) || Object.keys(cellEdits).length > 0;

  const handleSave = async () => {
    if (!originalXlsx || !budgetId) return;
    setIsSaving(true);
    try {
      // 1. Read the original workbook (preserves all styles / formulas)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wb = (XLSX as any).read(originalXlsx, {
        type: "array", cellStyles: true, cellNF: true, cellFormula: true,
      });

      // 2. Rebuild "budget" sheet from current data array
      const BUDGET_COLS = [
        "line_item_id", "budget_type", "category", "line_item", "UoM",
        "quantity_per_acre", "total_acres", "total_quantity",
        "rate_per_unit", "total_value", "utilized_amount", "working_range", "savings",
        "amount_in_pipeline", "remaining_amount",
      ];
      const budgetWs = XLSX.utils.json_to_sheet(
        data.map((item) => ({
          line_item_id:       item.id,
          budget_type:        item.type,
          category:           item.category,
          line_item:          item.lineItem,
          UoM:                item.uom,
          quantity_per_acre:  item.qtyPerAcre,
          total_acres:        item.acres,
          total_quantity:     item.qtyPerAcre * item.acres,
          rate_per_unit:      item.ratePerUnit,
          total_value:        item.qtyPerAcre * item.acres * item.ratePerUnit,
          utilized_amount:    item.utilizedQty,
          working_range:      item.workingXlsxUrl,
          savings:            item.savings,
          amount_in_pipeline: item.amountInPipeline,
          remaining_amount:   item.remainingAmount,
        })),
        { header: BUDGET_COLS }
      );

      // Re-stamp formula references for qty/rate cells mapped from working sheet
      data.forEach((item, i) => {
        const r = i + 1; // row 0 = header row
        if (item.qtyRaw.startsWith("=")) {
          const addr = XLSX.utils.encode_cell({ r, c: 5 });
          budgetWs[addr] = { f: item.qtyRaw.slice(1), t: "n", v: item.qtyPerAcre };
        }
        if (item.rateRaw.startsWith("=")) {
          const addr = XLSX.utils.encode_cell({ r, c: 8 });
          budgetWs[addr] = { f: item.rateRaw.slice(1), t: "n", v: item.ratePerUnit };
        }
      });
      wb.Sheets["budget"] = budgetWs;
      if (!wb.SheetNames.includes("budget")) wb.SheetNames.unshift("budget");

      // 3. Patch edited sheets with user cell edits (keys: "SheetName:ri,ci")
      for (const [key, value] of Object.entries(cellEdits)) {
        const colonIdx = key.indexOf(":");
        if (colonIdx === -1) continue;
        const sheetName = key.slice(0, colonIdx);
        const [ri, ci] = key.slice(colonIdx + 1).split(",").map(Number);
        const sheetWs = wb.Sheets[sheetName];
        const sd = sheetsMap[sheetName];
        if (!sheetWs || !sd) continue;
        const addr = XLSX.utils.encode_cell({ r: ri + sd.rangeOffset.r, c: ci + sd.rangeOffset.c });
        const existing = sheetWs[addr] ?? {};
        sheetWs[addr] = { ...existing, v: value, t: "n", w: String(value) };
        delete sheetWs[addr].f;
      }

      // 4. Write workbook back to binary
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const xlsxBinary: ArrayBuffer = (XLSX as any).write(wb, { type: "array", bookType: "xlsx" });
      const blob = new Blob([xlsxBinary], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      // 5. Upload via multipart/form-data
      const form = new FormData();
      form.append("file", blob, `budget_${budgetId}.xlsx`);
      const res = await fetch(
        `${getBaseUrl()}/admin_accounts/update_budget_xlsx/${budgetId}`,
        { method: "POST", body: form }
      );
      const result = await res.json();
      if (!result.success) throw new Error(result.message ?? "Save failed");

      // 6. Log the update in the background (fire-and-forget)
      fetch(`${getBaseUrl()}/admin_accounts/last_updated_budget_logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budget_id:          budgetId,
          staff_name:         user?.name        ?? "",
          staff_designation:  user?.designation ?? "",
          staff_id:           user?.id          ?? "",
        }),
      }).catch(() => {});

      // 7. Re-fetch the saved budget to sync local state with server
      setFetchKey((k) => k + 1);
    } catch (err) {
      console.error("Budget save failed:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Parse a sheet on first use and cache it in sheetsMap
  const loadSheet = (name: string) => {
    if (!originalXlsx || sheetsMap[name]) return;
    setSheetsMap((prev) => {
      if (prev[name]) return prev;
      return { ...prev, [name]: parseXlsxWithStyles(originalXlsx, name) };
    });
  };

  const handleWorkingCellEdit = (sheetName: string, ri: number, ci: number, value: number) => {
    const newEdits = { ...cellEdits, [`${sheetName}:${ri},${ci}`]: value };
    const newEffective = computeEffectiveValues(newEdits, sheetsMap);
    setCellEdits(newEdits);
    setEffectiveValues(newEffective);
    setData((prev) => syncBudgetFromOverrides(prev, newEffective, sheetsMap));
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Budget</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Plan and track capital and operational expenditure across all farm acres</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPlayground(true)}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 text-sm font-semibold text-violet-700 transition-all hover:bg-violet-100"
          >
            <Sparkles className="h-4 w-4" />
            Playground
          </button>
          <button
            type="button"
            onClick={() => setLocked((l) => !l)}
            className={["inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-all",
              locked ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"].join(" ")}
          >
            {locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            {locked ? "Locked" : "Unlocked"}
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => setShowAdd(true)}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add Budget Item
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !hasUnsavedChanges}
            className={[
              "relative inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-semibold text-white shadow-sm transition-all",
              hasUnsavedChanges
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-slate-300 cursor-not-allowed",
              isSaving ? "opacity-70 cursor-not-allowed" : "",
            ].join(" ")}
          >
            {isSaving ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Saving…
              </>
            ) : (
              <>
                <FileSpreadsheet className="h-4 w-4" />
                Save Budget
                {hasUnsavedChanges && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[8px] font-extrabold text-white">
                    !
                  </span>
                )}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Grand Total</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#173f70]/10"><DollarSign className="h-4 w-4 text-[#173f70]" /></div>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{fmt(grandTotal)}</p>
          <p className="mt-1 text-xs font-semibold text-slate-400">Capex + Opex combined</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Total Capex</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50"><TrendingUp className="h-4 w-4 text-violet-600" /></div>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-violet-700">{fmt(totalCapex)}</p>
          <p className="mt-1 text-xs font-semibold text-slate-400">{grandTotal > 0 ? ((totalCapex / grandTotal) * 100).toFixed(1) : "0.0"}% of total budget</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Total Opex</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50"><TrendingDown className="h-4 w-4 text-sky-600" /></div>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-sky-700">{fmt(totalOpex)}</p>
          <p className="mt-1 text-xs font-semibold text-slate-400">{grandTotal > 0 ? ((totalOpex / grandTotal) * 100).toFixed(1) : "0.0"}% of total budget</p>
        </div>
        <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-extrabold uppercase tracking-wide text-teal-600">Total Savings</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100"><TrendingDown className="h-4 w-4 text-teal-600" /></div>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-teal-700">{fmt(totalSavings)}</p>
          <p className="mt-1 text-xs font-semibold text-teal-500/70">{grandTotal > 0 ? ((totalSavings / grandTotal) * 100).toFixed(1) : "0.0"}% of total budget</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-slate-400" />
        {(["All", "Capex", "Opex"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setActiveType(t)}
            className={["h-8 rounded-lg px-4 text-xs font-extrabold transition-all",
              activeType === t ? "bg-[#173f70] text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"].join(" ")}
          >{t}</button>
        ))}
      </div>

      {/* Full-area loader */}
      {loading && (
        <div className="flex flex-col items-center justify-center gap-4 py-24">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-[#173f70]" />
          <p className="text-sm font-semibold text-slate-400">Loading budget…</p>
        </div>
      )}

      {/* Table */}
      {!loading && (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1400px] border-collapse text-left">
            <thead>
              {/* Group header row */}
              <tr className="bg-slate-100 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                <th colSpan={9} className="px-4 pt-2.5 pb-1 border-b border-slate-200/60" />
                <th colSpan={3} className="px-4 pt-2.5 pb-1 text-center border-b border-slate-200/60 text-emerald-600/70 border-l border-emerald-200">
                  ₹ Cash Flow
                </th>
                <th colSpan={3} className="px-4 pt-2.5 pb-1 border-b border-slate-200/60 border-l border-slate-200" />
                {!locked && <th className="border-b border-slate-200/60" />}
              </tr>
              {/* Column header row */}
              <tr className="border-b-2 border-slate-200 bg-slate-50 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5 text-center text-slate-400">#</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5">Line Item</th>
                <th className="px-4 py-2.5">UoM</th>
                <th className="px-4 py-2.5 text-right">Qty / Acre</th>
                <th className="px-4 py-2.5 text-right">Acres</th>
                <th className="px-4 py-2.5 text-right bg-amber-50/60">Total Qty</th>
                <th className="px-4 py-2.5 text-right">Rate / Unit</th>
                {/* ── Cash flow columns ── */}
                <th className="px-4 py-2.5 text-right bg-emerald-50 border-l-2 border-emerald-200">
                  <div className="font-extrabold text-emerald-700">Total Value</div>
                  <div className="text-[9px] font-medium normal-case tracking-normal text-emerald-500/80 mt-0.5">Budgeted (₹)</div>
                </th>
                <th className="px-4 py-2.5 text-right bg-sky-50">
                  <div className="font-extrabold text-sky-700">Remaining</div>
                  <div className="text-[9px] font-medium normal-case tracking-normal text-sky-400/80 mt-0.5">Available (₹)</div>
                </th>
                <th className="px-4 py-2.5 text-right bg-violet-50">
                  <div className="font-extrabold text-violet-700">Allocated</div>
                  <div className="text-[9px] font-medium normal-case tracking-normal text-violet-400/80 mt-0.5">In Pipeline (₹)</div>
                </th>
                <th className="px-4 py-2.5 bg-slate-100/80 border-l-2 border-slate-200">
                  <div className="font-extrabold text-slate-500">Utilization</div>
                  <div className="text-[9px] font-medium normal-case tracking-normal text-slate-400/80 mt-0.5">Actual Spend</div>
                </th>
                <th className="px-4 py-2.5 text-right bg-teal-50">
                  <div className="font-extrabold text-teal-700">Savings</div>
                  <div className="text-[9px] font-medium normal-case tracking-normal text-teal-400/80 mt-0.5">vs Budget (₹)</div>
                </th>
                <th className="px-4 py-2.5 text-center">Working</th>
                {!locked && <th className="px-4 py-2.5">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => {
                const totalQty      = row.qtyPerAcre * row.acres;
                const totalValue    = totalQty * row.ratePerUnit;
                const utilizedValue = row.utilizedQty * row.ratePerUnit;
                const utilizedPct   = totalQty > 0 ? Math.min(100, (row.utilizedQty / totalQty) * 100) : 0;
                const isAllocationExpanded = expandedAllocationId === row.id;
                return (
                  <Fragment key={row.id}>
                  <tr className="border-b border-slate-100 text-sm last:border-b-0 hover:bg-slate-50/60">
                    <td className="px-3 py-3.5 text-center text-xs font-semibold text-slate-400 select-none">{idx + 1}</td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${typeColors[row.type]}`}>{row.type}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-700">{row.category}</td>
                    <td className="px-4 py-3.5 font-extrabold text-slate-900">{row.lineItem}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-500">{row.uom}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold text-slate-700">{fmtNum(row.qtyPerAcre)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold text-slate-700">{fmtNum(row.acres)}</td>
                    <td className="whitespace-nowrap bg-amber-50/40 px-4 py-3.5 text-right font-extrabold text-amber-800">{fmtNum(totalQty)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold text-slate-700">{fmt(row.ratePerUnit)}</td>

                    {/* ── Cash flow columns ── */}
                    {/* 1. Total Value — what was budgeted */}
                    <td className="whitespace-nowrap bg-emerald-50/60 px-4 py-3.5 text-right border-l-2 border-emerald-200">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="font-extrabold text-emerald-700 tabular-nums">{fmt(totalValue)}</div>
                        <button
                          type="button"
                          onClick={() =>
                            setDisbursementItem({
                              id: row.id,
                              category: row.category,
                              lineItem: row.lineItem,
                              type: row.type,
                              totalValue,
                            })
                          }
                          title="Disbursement sequence"
                          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-emerald-200 text-emerald-500 transition-colors hover:border-emerald-400 hover:text-emerald-700"
                        >
                          <ArrowUpDown className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </td>
                    {/* 2. Remaining — available budget left; red when overrun */}
                    <td className={`whitespace-nowrap px-4 py-3.5 text-right ${
                      row.remainingAmount < 0
                        ? 'bg-red-50/70'
                        : row.remainingAmount === 0
                        ? 'bg-slate-50'
                        : 'bg-sky-50/60'
                    }`}>
                      {row.remainingAmount !== 0 ? (
                        <div className={`font-extrabold tabular-nums flex items-center justify-end gap-1 ${row.remainingAmount < 0 ? 'text-red-600' : 'text-sky-700'}`}>
                          {row.remainingAmount < 0 && <span className="text-[10px] font-black">▼</span>}
                          {row.remainingAmount > 0 && <span className="text-[10px] font-black text-sky-500">▲</span>}
                          {fmt(Math.abs(row.remainingAmount))}
                        </div>
                      ) : <span className="text-slate-300 font-semibold">—</span>}
                    </td>
                    {/* 3. Allocated / In Pipeline — committed but not yet paid */}
                    <td className="whitespace-nowrap bg-violet-50/50 px-4 py-3.5 text-right">
                      {row.amountInPipeline !== 0 ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="font-extrabold text-violet-700 tabular-nums">{fmt(row.amountInPipeline)}</div>
                          <button
                            type="button"
                            onClick={() => toggleAllocationBreakdown(row)}
                            title="Show allocation breakdown"
                            className={[
                              "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                              isAllocationExpanded
                                ? "border-violet-400 bg-violet-100 text-violet-700"
                                : "border-violet-200 text-violet-400 hover:border-violet-400 hover:text-violet-600",
                            ].join(" ")}
                          >
                            <Info className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ) : <span className="text-slate-300 font-semibold">—</span>}
                    </td>
                    {/* 4. Utilization — actual spend progress */}
                    <td className="px-4 py-3.5 border-l-2 border-slate-200 min-w-[160px]">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[10px] font-bold text-slate-500 tabular-nums">{fmt(utilizedValue)}</span>
                          <span className={`text-[10px] font-extrabold tabular-nums ${utilizedPct > 100 ? 'text-red-500' : utilizedPct > 80 ? 'text-amber-600' : 'text-slate-400'}`}>
                            {utilizedPct.toFixed(0)}%
                          </span>
                        </div>
                        <UtilizationBar pct={utilizedPct} />
                        <p className="text-[9px] font-semibold text-slate-400 tabular-nums mt-0.5">
                          {fmtNum(row.utilizedQty)} / {fmtNum(totalQty)} {row.uom}
                        </p>
                      </div>
                    </td>
                    {/* 5. Savings — efficiency vs budget */}
                    <td className="whitespace-nowrap bg-teal-50/50 px-4 py-3.5 text-right">
                      {row.savings !== 0
                        ? <div className="font-extrabold text-teal-700 tabular-nums">{fmt(row.savings)}</div>
                        : <span className="text-slate-300 font-semibold">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.workingXlsxUrl ? (
                        <button
                          type="button"
                          onClick={() => setXlsxDrawerItem(row)}
                          className={[
                            "inline-flex h-7 w-7 items-center justify-center rounded-md transition-all",
                            xlsxDrawerItem?.id === row.id
                              ? "bg-emerald-100 text-emerald-700"
                              : "text-slate-400 hover:bg-emerald-50 hover:text-emerald-600",
                          ].join(" ")}
                          title="View working file"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <span className="text-slate-200">—</span>
                      )}
                    </td>
                    {!locked && (
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => setEditingItem(row)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => handleDelete(row.id)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-400 hover:bg-red-50">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                  {isAllocationExpanded && (
                    <tr className="border-b border-slate-100 bg-violet-50/30">
                      <td colSpan={locked ? 15 : 16} className="px-6 py-3">
                        <div className="rounded-lg border border-violet-100 bg-white px-4 py-3 text-xs">
                          {loadingAllocationId === row.id ? (
                            <span className="text-slate-400">Loading allocation breakdown…</span>
                          ) : allocationErrors[row.id] ? (
                            <span className="text-red-500">{allocationErrors[row.id]}</span>
                          ) : (allocationBreakdowns[row.id]?.length ?? 0) === 0 ? (
                            <span className="text-slate-400">No allocation breakdown found.</span>
                          ) : (
                            <table className="w-full text-left">
                              <thead>
                                <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                                  <th className="pb-1.5 pr-4 font-bold">Order Number</th>
                                  <th className="pb-1.5 pr-4 text-right font-bold">Allocated (₹)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {allocationBreakdowns[row.id]!.map((entry) => (
                                  <tr key={entry.flow_id} className="border-t border-slate-100">
                                    <td className="py-1.5 pr-4 font-semibold text-slate-700">{entry.order_number}</td>
                                    <td className="py-1.5 pr-4 text-right font-extrabold text-violet-700 tabular-nums">
                                      {fmt(entry.allocation.allocated)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 text-sm font-extrabold">
                <td colSpan={8} className="px-4 py-3 text-right text-slate-600">
                  {activeType === "All" ? "Grand Total" : `${activeType} Total`}
                </td>
                <td className="whitespace-nowrap bg-emerald-50 px-4 py-3 text-right text-base text-emerald-700">{fmt(filteredTotalValue)}</td>
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    <UtilizationBar pct={overallPct} />
                    <p className="text-[10px] font-semibold text-slate-400 tabular-nums">
                      {fmt(filteredUtilizedVal)} of {fmt(filteredTotalValue)}
                    </p>
                  </div>
                </td>
                <td className="whitespace-nowrap bg-teal-50 px-4 py-3 text-right text-base text-teal-700">{fmt(filteredTotalSavings)}</td>
                <td colSpan={locked ? 1 : 2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      )}

      {/* Modals */}
      {showAdd && (
        <AddLineItemModal
          onClose={() => setShowAdd(false)}
          onSaved={handleSaved}
          onBulkSaved={handleBulkSaved}
          sheetsMap={sheetsMap}
          sheetNames={sheetNames}
          onLoadSheet={loadSheet}
          defaultAcres={budgetTotalAcres}
        />
      )}
      {editingItem && (
        <EditLineItemModal item={editingItem} onClose={() => setEditingItem(null)} onSave={handleSaveEdit} />
      )}
      {xlsxDrawerItem && (
        <XlsxDrawer
          item={xlsxDrawerItem}
          onClose={() => setXlsxDrawerItem(null)}
          sheetsMap={sheetsMap}
          sheetNames={sheetNames}
          effectiveValues={effectiveValues}
          onCellEdit={handleWorkingCellEdit}
          onLoadSheet={loadSheet}
        />
      )}
      {showPlayground && (
        <Playground budgetId={budgetId} onClose={() => setShowPlayground(false)} />
      )}
      {disbursementItem && (
        <DisbursementSequence budgetId={budgetId} item={disbursementItem} onClose={() => setDisbursementItem(null)} />
      )}
    </div>
  );
}
