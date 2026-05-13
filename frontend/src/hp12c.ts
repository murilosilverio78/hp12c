// HP 12C Calculator Engine
// Supports RPN (4-level stack) and Algebraic modes, TVM, NPV, IRR, Depreciation, Memory

export type Mode = 'RPN' | 'ALG';
export type Shift = null | 'f' | 'g';

export interface Stack {
  x: number;
  y: number;
  z: number;
  t: number;
  lastX: number;
}

export interface FinancialRegs {
  n: number;
  i: number; // periodic % (e.g. 1 = 1%)
  pv: number;
  pmt: number;
  fv: number;
  cashflows: number[]; // CFo, CF1, CF2 ...
}

export interface CalcState {
  stack: Stack;
  mode: Mode;
  shift: Shift;
  fin: FinancialRegs;
  memory: number[]; // R0..R9
  display: string;
  entering: boolean; // typing digits into X
  pendingOp: null | '+' | '-' | '*' | '/' | '^'; // for ALG mode
  algLeft: number | null; // ALG accumulator
  algJustEvaluated: boolean;
  history: HistoryEntry[];
  status: string; // status text under display
}

export interface HistoryEntry {
  id: string;
  ts: number;
  label: string;
  result: string;
}

export const initialStack = (): Stack => ({ x: 0, y: 0, z: 0, t: 0, lastX: 0 });

export const initialFin = (): FinancialRegs => ({
  n: 0, i: 0, pv: 0, pmt: 0, fv: 0, cashflows: [],
});

export const initialState = (mode: Mode = 'RPN'): CalcState => ({
  stack: initialStack(),
  mode,
  shift: null,
  fin: initialFin(),
  memory: Array(10).fill(0),
  display: '0.00',
  entering: false,
  pendingOp: null,
  algLeft: null,
  algJustEvaluated: false,
  history: [],
  status: '',
});

// ---------------- Display formatting ----------------
export function fmt(n: number, decimals = 2): string {
  if (!isFinite(n)) return 'Error';
  if (Math.abs(n) >= 1e10 || (Math.abs(n) < 1e-6 && n !== 0)) {
    return n.toExponential(6);
  }
  return n.toFixed(decimals);
}

// ---------------- Stack operations ----------------
export function push(s: Stack, val: number): Stack {
  return { x: val, y: s.x, z: s.y, t: s.z, lastX: s.lastX };
}
export function drop(s: Stack): Stack {
  return { x: s.y, y: s.z, z: s.t, t: s.t, lastX: s.lastX };
}
export function swapXY(s: Stack): Stack {
  return { ...s, x: s.y, y: s.x };
}
export function rollDown(s: Stack): Stack {
  return { x: s.y, y: s.z, z: s.t, t: s.x, lastX: s.lastX };
}

// ---------------- Financial math ----------------
// Time Value of Money: PV + PMT * a(n,i) + FV * v(n,i) = 0
// where v = (1+i)^-n, a = (1-v)/i (annuity due if pmt at begin, handled by *(1+i))
// Standard end-mode (default).

function tvmResidual(n: number, i: number, pv: number, pmt: number, fv: number): number {
  if (i === 0) return pv + pmt * n + fv;
  const v = Math.pow(1 + i, -n);
  const a = (1 - v) / i;
  return pv + pmt * a + fv * v;
}

export function solveN(i: number, pv: number, pmt: number, fv: number): number {
  if (i === 0) {
    if (pmt === 0) throw new Error('No solution');
    return -(pv + fv) / pmt;
  }
  // -(pv*i + pmt) = (fv*i + pmt) * (1+i)^-n   ->  n = ln((pmt - fv*i)/(pmt + pv*i)) / ln(1+i)
  const num = pmt - fv * i;
  const den = pmt + pv * i;
  if (num / den <= 0) throw new Error('No solution');
  return Math.log(num / den) / Math.log(1 + i);
}

export function solvePV(n: number, i: number, pmt: number, fv: number): number {
  if (i === 0) return -(pmt * n + fv);
  const v = Math.pow(1 + i, -n);
  const a = (1 - v) / i;
  return -(pmt * a + fv * v);
}

export function solvePMT(n: number, i: number, pv: number, fv: number): number {
  if (i === 0) {
    if (n === 0) throw new Error('No solution');
    return -(pv + fv) / n;
  }
  const v = Math.pow(1 + i, -n);
  const a = (1 - v) / i;
  return -(pv + fv * v) / a;
}

export function solveFV(n: number, i: number, pv: number, pmt: number): number {
  if (i === 0) return -(pv + pmt * n);
  const v = Math.pow(1 + i, -n);
  const a = (1 - v) / i;
  return -(pv + pmt * a) / v;
}

export function solveI(n: number, pv: number, pmt: number, fv: number): number {
  // Newton-Raphson on residual
  let i = 0.01;
  for (let iter = 0; iter < 200; iter++) {
    const f = tvmResidual(n, i, pv, pmt, fv);
    const di = 1e-7;
    const f1 = tvmResidual(n, i + di, pv, pmt, fv);
    const dfdi = (f1 - f) / di;
    if (Math.abs(dfdi) < 1e-15) break;
    const next = i - f / dfdi;
    if (!isFinite(next)) break;
    if (Math.abs(next - i) < 1e-10) { i = next; break; }
    i = next;
  }
  if (!isFinite(i)) throw new Error('No solution');
  return i;
}

// NPV at periodic rate i, using cashflows[0]=CFo, [1]=CF1, ...
export function npv(rate: number, cashflows: number[]): number {
  let s = 0;
  for (let k = 0; k < cashflows.length; k++) {
    s += cashflows[k] / Math.pow(1 + rate, k);
  }
  return s;
}

export function irr(cashflows: number[]): number {
  if (cashflows.length < 2) throw new Error('Need cashflows');
  let r = 0.1;
  for (let iter = 0; iter < 300; iter++) {
    const f = npv(r, cashflows);
    let df = 0;
    for (let k = 1; k < cashflows.length; k++) {
      df += -k * cashflows[k] / Math.pow(1 + r, k + 1);
    }
    if (Math.abs(df) < 1e-15) break;
    const next = r - f / df;
    if (!isFinite(next)) break;
    if (Math.abs(next - r) < 1e-10) { r = next; break; }
    r = Math.max(next, -0.999);
  }
  if (!isFinite(r)) throw new Error('No IRR');
  return r;
}

// Depreciation: Straight Line
// inputs (stack on HP12C): cost in Y, salvage in (typically uses fin registers PV=cost, FV=salvage, n=life)
// returns depreciation for year `year`
export function depSL(cost: number, salvage: number, life: number, year: number): { dep: number; remaining: number } {
  if (life <= 0) throw new Error('Life invalid');
  const annual = (cost - salvage) / life;
  const dep = year >= 1 && year <= life ? annual : 0;
  const totalAcc = annual * Math.min(year, life);
  const remaining = cost - salvage - totalAcc;
  return { dep, remaining: remaining < 0 ? 0 : remaining };
}

// Sum of Years' Digits
export function depSOYD(cost: number, salvage: number, life: number, year: number): { dep: number; remaining: number } {
  if (life <= 0) throw new Error('Life invalid');
  const soy = (life * (life + 1)) / 2;
  const dep = year >= 1 && year <= life ? ((life - year + 1) / soy) * (cost - salvage) : 0;
  let totalAcc = 0;
  for (let k = 1; k <= Math.min(year, life); k++) {
    totalAcc += ((life - k + 1) / soy) * (cost - salvage);
  }
  const remaining = cost - salvage - totalAcc;
  return { dep, remaining: remaining < 0 ? 0 : remaining };
}

// Double Declining Balance
export function depDDB(cost: number, salvage: number, life: number, year: number): { dep: number; remaining: number } {
  if (life <= 0) throw new Error('Life invalid');
  const rate = 2 / life;
  let book = cost;
  let dep = 0;
  for (let k = 1; k <= Math.min(year, life); k++) {
    let d = book * rate;
    if (book - d < salvage) d = book - salvage;
    if (d < 0) d = 0;
    if (k === year) dep = d;
    book -= d;
  }
  return { dep, remaining: book };
}

// Simple Interest: returns {interest360, interest365} given n=days, i=annual%, pv=principal (negative usually)
export function simpleInterest(days: number, annualRatePct: number, principal: number): { int360: number; int365: number } {
  const r = annualRatePct / 100;
  const p = Math.abs(principal);
  return {
    int360: p * r * days / 360,
    int365: p * r * days / 365,
  };
}

// Amortization: given current TVM registers (n=number of payments to amortize, i=periodic rate%, pv=balance, pmt=payment)
// Returns {interest, principal, newBalance}
export function amortize(payments: number, ratePct: number, balance: number, pmt: number): { interest: number; principal: number; newBalance: number } {
  const r = ratePct / 100;
  let bal = balance;
  let totalInt = 0;
  let totalPrin = 0;
  for (let k = 0; k < payments; k++) {
    const interest = -bal * r; // bal is typically negative on HP12C; we keep sign convention loose
    const realInterest = Math.round(interest * 1e8) / 1e8;
    const principal = pmt - realInterest;
    totalInt += realInterest;
    totalPrin += principal;
    bal = bal + principal;
  }
  return { interest: totalInt, principal: totalPrin, newBalance: bal };
}
