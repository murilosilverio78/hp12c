import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CalcState,
  HistoryEntry,
  initialState,
  push,
  swapXY,
  rollDown,
  fmt,
  solveN,
  solveI,
  solvePV,
  solvePMT,
  solveFV,
  npv,
  irr,
  depSL,
  depSOYD,
  depDDB,
  simpleInterest,
  amortize,
} from '../src/hp12c';

type Theme = 'classic' | 'modern';

const STORAGE_KEY = '@hp12c_state_v1';

const THEMES = {
  classic: {
    bg: '#1a1a1a',
    body: '#2a2a2a',
    bezel: '#C9A24E',
    bezelInner: '#8B6F2A',
    displayBg: '#9CB089',
    displayText: '#1A2016',
    keyNum: '#E8E8E8',
    keyNumText: '#111111',
    keyFn: '#3a3a3a',
    keyFnText: '#FFFFFF',
    keyEnter: '#3a3a3a',
    keyEnterText: '#FFFFFF',
    keyF: '#D9A441',
    keyG: '#5A94C7',
    fLabel: '#D9A441',
    gLabel: '#7DB6E0',
    keyBorder: '#000000',
    accent: '#D9A441',
    secondary: '#5A94C7',
    text: '#FFFFFF',
    muted: '#999',
  },
  modern: {
    bg: '#0A0A0A',
    body: '#141414',
    bezel: '#1F1F1F',
    bezelInner: '#0A0A0A',
    displayBg: '#0E0E0E',
    displayText: '#FFFFFF',
    keyNum: '#1E1E1E',
    keyNumText: '#FFFFFF',
    keyFn: '#161616',
    keyFnText: '#CFCFCF',
    keyEnter: '#222',
    keyEnterText: '#FFF',
    keyF: '#E59E25',
    keyG: '#3B82F6',
    fLabel: '#E59E25',
    gLabel: '#3B82F6',
    keyBorder: '#2A2A2A',
    accent: '#E59E25',
    secondary: '#3B82F6',
    text: '#FFFFFF',
    muted: '#777',
  },
};

type KeyDef = {
  id: string;
  main: string;
  f?: string;
  g?: string;
  variant?: 'num' | 'fn' | 'enter' | 'fkey' | 'gkey' | 'op';
  flex?: number;
};

const KEYS: KeyDef[][] = [
  [
    { id: 'n', main: 'n', f: 'AMORT', g: '12×', variant: 'fn' },
    { id: 'i', main: 'i', f: 'INT', g: '12÷', variant: 'fn' },
    { id: 'PV', main: 'PV', f: 'NPV', g: 'CFo', variant: 'fn' },
    { id: 'PMT', main: 'PMT', f: 'RND', g: 'CFj', variant: 'fn' },
    { id: 'FV', main: 'FV', f: 'IRR', g: 'Nj', variant: 'fn' },
  ],
  [
    { id: 'f', main: 'f', variant: 'fkey' },
    { id: 'g', main: 'g', variant: 'gkey' },
    { id: 'STO', main: 'STO', variant: 'fn' },
    { id: 'RCL', main: 'RCL', variant: 'fn' },
    { id: 'CHS', main: 'CHS', variant: 'fn' },
  ],
  [
    { id: 'ENTER', main: 'ENTER', g: 'LSTx', variant: 'enter', flex: 2 },
    { id: 'XY', main: 'x↔y', variant: 'fn' },
    { id: 'RDN', main: 'R↓', variant: 'fn' },
    { id: 'DIV', main: '÷', f: '√x', g: 'x²', variant: 'op' },
  ],
  [
    { id: '7', main: '7', f: 'BEG', variant: 'num' },
    { id: '8', main: '8', f: 'END', variant: 'num' },
    { id: '9', main: '9', g: '%T', variant: 'num' },
    { id: 'MUL', main: '×', variant: 'op' },
    { id: 'CLx', main: 'CLx', f: 'CLEAR', g: 'Δ%', variant: 'fn' },
  ],
  [
    { id: '4', main: '4', f: 'SL', variant: 'num' },
    { id: '5', main: '5', f: 'SOYD', variant: 'num' },
    { id: '6', main: '6', f: 'DDB', variant: 'num' },
    { id: 'SUB', main: '−', variant: 'op' },
    { id: 'PCT', main: '%', variant: 'fn' },
  ],
  [
    { id: '1', main: '1', f: 'yˣ', g: 'LN', variant: 'num' },
    { id: '2', main: '2', g: 'eˣ', variant: 'num' },
    { id: '3', main: '3', variant: 'num' },
    { id: 'ADD', main: '+', g: 'eˣ', variant: 'op' },
    { id: 'INV', main: '1/x', variant: 'fn' },
  ],
  [
    { id: '0', main: '0', f: 'x!', variant: 'num' },
    { id: 'DOT', main: '.', variant: 'num' },
    { id: 'EEX', main: 'EEX', g: 'π', variant: 'num' },
    { id: 'SUM', main: 'Σ+', g: 'CLΣ', variant: 'fn' },
    { id: 'BS', main: '⌫', variant: 'fn' },
  ],
];

export default function HP12C() {
  const [theme, setTheme] = useState<Theme>('classic');
  const [state, setState] = useState<CalcState>(() => initialState('RPN'));
  const [showHistory, setShowHistory] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [pendingMemOp, setPendingMemOp] = useState<null | 'STO' | 'RCL'>(null);
  const decimals = 2;

  const t = THEMES[theme];

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setState((s) => ({
            ...s,
            stack: parsed.stack || s.stack,
            fin: parsed.fin || s.fin,
            memory: parsed.memory || s.memory,
            history: parsed.history || [],
            mode: parsed.mode || s.mode,
            shift: null,
            status: '',
          }));
          if (parsed.theme) setTheme(parsed.theme);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    const toSave = {
      stack: state.stack,
      fin: state.fin,
      memory: state.memory,
      history: state.history.slice(0, 50),
      mode: state.mode,
      theme,
    };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave)).catch(() => {});
  }, [state.stack, state.fin, state.memory, state.history, state.mode, theme]);

  const display = useMemo(() => {
    if (state.entering) return state.display;
    return fmt(state.stack.x, decimals);
  }, [state.entering, state.display, state.stack.x]);

  const haptic = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, []);

  const setStatus = (msg: string) => {
    setState((s) => ({ ...s, status: msg }));
    if (msg) {
      setTimeout(() => {
        setState((s) => (s.status === msg ? { ...s, status: '' } : s));
      }, 2500);
    }
  };

  const addHistory = (label: string, result: number | string) => {
    const entry: HistoryEntry = {
      id: Math.random().toString(36).slice(2),
      ts: Date.now(),
      label,
      result: typeof result === 'number' ? fmt(result, decimals) : result,
    };
    setState((s) => ({ ...s, history: [entry, ...s.history].slice(0, 100) }));
  };

  const commitEntry = (s: CalcState): CalcState => {
    if (!s.entering) return s;
    const num = parseFloat(s.display);
    return { ...s, stack: { ...s.stack, x: isNaN(num) ? 0 : num }, entering: false };
  };

  const pushNumber = (val: number, s: CalcState): CalcState => ({
    ...s,
    stack: push(s.stack, val),
    entering: false,
  });

  const doDigit = (d: string) => {
    haptic();
    setState((s) => {
      if (pendingMemOp) {
        const idx = parseInt(d, 10);
        if (isNaN(idx) || idx < 0 || idx > 9) return s;
        if (pendingMemOp === 'STO') {
          const c = commitEntry(s);
          const mem = [...c.memory];
          mem[idx] = c.stack.x;
          setStatus(`STO R${idx} = ${fmt(c.stack.x, decimals)}`);
          setPendingMemOp(null);
          return { ...c, memory: mem };
        } else {
          const c = commitEntry(s);
          const val = c.memory[idx];
          setStatus(`RCL R${idx} = ${fmt(val, decimals)}`);
          setPendingMemOp(null);
          return pushNumber(val, c);
        }
      }
      if (!s.entering) {
        return { ...s, display: d, entering: true, stack: push(s.stack, parseFloat(d)) };
      }
      let nd = s.display === '0' ? d : s.display + d;
      if (nd.length > 12) nd = nd.slice(0, 12);
      const num = parseFloat(nd);
      return { ...s, display: nd, stack: { ...s.stack, x: isNaN(num) ? 0 : num } };
    });
  };

  const doDot = () => {
    haptic();
    setState((s) => {
      if (!s.entering) return { ...s, display: '0.', entering: true, stack: push(s.stack, 0) };
      if (s.display.includes('.')) return s;
      return { ...s, display: s.display + '.' };
    });
  };

  const doChs = () => {
    haptic();
    setState((s) => {
      if (s.entering) {
        const nd = s.display.startsWith('-') ? s.display.slice(1) : '-' + s.display;
        const num = parseFloat(nd);
        return { ...s, display: nd, stack: { ...s.stack, x: isNaN(num) ? 0 : num } };
      }
      return { ...s, stack: { ...s.stack, x: -s.stack.x } };
    });
  };

  const applyOp = (a: number, b: number, op: '+' | '-' | '*' | '/'): number => {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b === 0 ? NaN : a / b;
    }
  };

  const doBinaryOp = (op: '+' | '-' | '*' | '/') => {
    haptic();
    setState((s) => {
      if (s.mode === 'ALG') {
        const c = commitEntry(s);
        if (s.pendingOp && s.algLeft !== null && !s.algJustEvaluated) {
          const res = applyOp(s.algLeft, c.stack.x, s.pendingOp);
          addHistory(
            `${fmt(s.algLeft, decimals)} ${opSym(s.pendingOp)} ${fmt(c.stack.x, decimals)} =`,
            res
          );
          return {
            ...c,
            stack: { ...c.stack, x: res },
            algLeft: res,
            pendingOp: op,
            algJustEvaluated: false,
            display: fmt(res, decimals),
          };
        }
        return { ...c, algLeft: c.stack.x, pendingOp: op, algJustEvaluated: false };
      }
      const c = commitEntry(s);
      const x = c.stack.x;
      const y = c.stack.y;
      const res = applyOp(y, x, op);
      addHistory(`${fmt(y, decimals)} ${opSym(op)} ${fmt(x, decimals)}`, res);
      return {
        ...c,
        stack: { x: res, y: c.stack.z, z: c.stack.t, t: c.stack.t, lastX: x },
      };
    });
  };

  const opSym = (op: '+' | '-' | '*' | '/') =>
    op === '*' ? '×' : op === '/' ? '÷' : op;

  const doEquals = () => {
    haptic();
    setState((s) => {
      if (s.mode !== 'ALG') return s;
      const c = commitEntry(s);
      if (s.pendingOp && s.algLeft !== null) {
        const res = applyOp(s.algLeft, c.stack.x, s.pendingOp);
        addHistory(
          `${fmt(s.algLeft, decimals)} ${opSym(s.pendingOp)} ${fmt(c.stack.x, decimals)} =`,
          res
        );
        return {
          ...c,
          stack: { ...c.stack, x: res, lastX: c.stack.x },
          algLeft: null,
          pendingOp: null,
          algJustEvaluated: true,
          display: fmt(res, decimals),
        };
      }
      return c;
    });
  };

  const doEnter = () => {
    haptic();
    setState((s) => {
      if (s.mode === 'ALG') {
        const c = commitEntry(s);
        if (s.pendingOp && s.algLeft !== null) {
          const res = applyOp(s.algLeft, c.stack.x, s.pendingOp);
          addHistory(
            `${fmt(s.algLeft, decimals)} ${opSym(s.pendingOp)} ${fmt(c.stack.x, decimals)} =`,
            res
          );
          return {
            ...c,
            stack: { ...c.stack, x: res, lastX: c.stack.x },
            algLeft: null,
            pendingOp: null,
            algJustEvaluated: true,
            display: fmt(res, decimals),
          };
        }
        return c;
      }
      const c = commitEntry(s);
      return { ...c, stack: push(c.stack, c.stack.x) };
    });
  };

  const doBackspace = () => {
    haptic();
    setState((s) => {
      if (s.entering && s.display.length > 0) {
        let nd = s.display.slice(0, -1);
        if (nd === '' || nd === '-') nd = '0';
        const num = parseFloat(nd);
        return { ...s, display: nd, entering: nd !== '0', stack: { ...s.stack, x: isNaN(num) ? 0 : num } };
      }
      return { ...s, stack: { ...s.stack, x: 0 }, entering: false };
    });
  };

  const doClearX = () => {
    haptic();
    setState((s) => ({ ...s, stack: { ...s.stack, x: 0 }, display: '0', entering: false }));
  };

  const doClearAll = () => {
    haptic();
    setState((s) => ({
      ...s,
      stack: { x: 0, y: 0, z: 0, t: 0, lastX: 0 },
      fin: { n: 0, i: 0, pv: 0, pmt: 0, fv: 0, cashflows: [] },
      display: '0',
      entering: false,
      pendingOp: null,
      algLeft: null,
      status: 'CLEAR ALL',
    }));
  };

  const doSwapXY = () => {
    haptic();
    setState((s) => {
      const c = commitEntry(s);
      return { ...c, stack: swapXY(c.stack) };
    });
  };

  const doRollDown = () => {
    haptic();
    setState((s) => {
      const c = commitEntry(s);
      return { ...c, stack: rollDown(c.stack) };
    });
  };

  const doPercent = () => {
    haptic();
    setState((s) => {
      const c = commitEntry(s);
      const res = (c.stack.y * c.stack.x) / 100;
      addHistory(`${fmt(c.stack.y, decimals)} × ${fmt(c.stack.x, decimals)}%`, res);
      return { ...c, stack: { ...c.stack, x: res, lastX: c.stack.x } };
    });
  };

  const doInverse = () => {
    haptic();
    setState((s) => {
      const c = commitEntry(s);
      if (c.stack.x === 0) { setStatus('Erro: ÷0'); return c; }
      const res = 1 / c.stack.x;
      addHistory(`1/${fmt(c.stack.x, decimals)}`, res);
      return { ...c, stack: { ...c.stack, x: res, lastX: c.stack.x } };
    });
  };

  const doSigmaPlus = () => {
    haptic();
    setState((s) => {
      const c = commitEntry(s);
      const mem = [...c.memory];
      mem[1] = (mem[1] || 0) + 1;
      mem[2] = (mem[2] || 0) + c.stack.x;
      mem[3] = (mem[3] || 0) + c.stack.x * c.stack.x;
      mem[4] = (mem[4] || 0) + c.stack.y;
      mem[5] = (mem[5] || 0) + c.stack.y * c.stack.y;
      mem[6] = (mem[6] || 0) + c.stack.x * c.stack.y;
      setStatus(`Σ+ n=${mem[1]}`);
      return { ...c, memory: mem, stack: { ...c.stack, x: mem[1], lastX: c.stack.x } };
    });
  };

  const handleFinancialKey = (key: 'n' | 'i' | 'pv' | 'pmt' | 'fv', label: string) => {
    haptic();
    setState((s) => {
      if (s.entering) {
        const c = commitEntry(s);
        const newFin = { ...c.fin, [key]: c.stack.x };
        setStatus(`${label} = ${fmt(c.stack.x, decimals)} (armazenado)`);
        return { ...c, fin: newFin };
      }
      try {
        const { n, i, pv, pmt, fv } = s.fin;
        const rate = i / 100;
        let result = 0;
        if (key === 'n') result = solveN(rate, pv, pmt, fv);
        else if (key === 'i') result = solveI(n, pv, pmt, fv) * 100;
        else if (key === 'pv') result = solvePV(n, rate, pmt, fv);
        else if (key === 'pmt') result = solvePMT(n, rate, pv, fv);
        else if (key === 'fv') result = solveFV(n, rate, pv, pmt);
        const newFin = { ...s.fin, [key]: result };
        addHistory(`Calcular ${label}`, result);
        setStatus(`${label} = ${fmt(result, decimals)}`);
        return { ...s, fin: newFin, stack: { ...s.stack, x: result, lastX: s.stack.x } };
      } catch (e: any) {
        setStatus('Erro: ' + (e?.message || 'Sem solução'));
        return s;
      }
    });
  };

  const depreciation = (method: 'SL' | 'SOYD' | 'DDB') => {
    setState((s) => {
      const c = commitEntry(s);
      const year = Math.max(1, Math.floor(c.stack.x));
      const cost = Math.abs(c.fin.pv);
      const salvage = c.fin.fv;
      const life = c.fin.n;
      if (life <= 0) { setStatus('Defina n (vida útil)'); return c; }
      const fn = method === 'SL' ? depSL : method === 'SOYD' ? depSOYD : depDDB;
      const r = fn(cost, salvage, life, year);
      addHistory(`${method} ano ${year}`, `dep ${fmt(r.dep, decimals)} | rest ${fmt(r.remaining, decimals)}`);
      setStatus(`${method} ano ${year}: dep=${fmt(r.dep, decimals)} rest=${fmt(r.remaining, decimals)}`);
      return { ...c, stack: { x: r.dep, y: r.remaining, z: c.stack.z, t: c.stack.t, lastX: c.stack.x } };
    });
  };

  const handleFShift = (id: string) => {
    haptic();
    switch (id) {
      case 'CLx': doClearAll(); return;
      case 'n':
        setState((s) => {
          const c = commitEntry(s);
          const pays = Math.max(1, Math.floor(c.stack.x || 1));
          const { i, pv, pmt } = c.fin;
          const res = amortize(pays, i, pv, pmt);
          addHistory(`AMORT ${pays}`, `Juros ${fmt(res.interest, decimals)} | Princ ${fmt(res.principal, decimals)}`);
          setStatus(`Juros: ${fmt(res.interest, decimals)}  Princ: ${fmt(res.principal, decimals)}`);
          return { ...c, stack: { x: res.interest, y: res.principal, z: res.newBalance, t: c.stack.t, lastX: c.stack.x }, fin: { ...c.fin, pv: res.newBalance } };
        });
        return;
      case 'i':
        setState((s) => {
          const c = commitEntry(s);
          const { n, i, pv } = c.fin;
          const r = simpleInterest(n, i, pv);
          addHistory(`INT (${n}d ${i}%)`, `360: ${fmt(r.int360, decimals)} | 365: ${fmt(r.int365, decimals)}`);
          setStatus(`Juros 360: ${fmt(r.int360, decimals)} | 365: ${fmt(r.int365, decimals)}`);
          return { ...c, stack: { x: r.int360, y: r.int365, z: c.stack.z, t: c.stack.t, lastX: c.stack.x } };
        });
        return;
      case 'PV':
        setState((s) => {
          const c = commitEntry(s);
          const r = c.fin.i / 100;
          if (c.fin.cashflows.length === 0) { setStatus('Sem fluxos (use g+PV/g+PMT)'); return c; }
          const v = npv(r, c.fin.cashflows);
          addHistory(`NPV @${c.fin.i}%`, v);
          setStatus(`NPV = ${fmt(v, decimals)}`);
          return { ...c, stack: { ...c.stack, x: v, lastX: c.stack.x } };
        });
        return;
      case 'FV':
        setState((s) => {
          const c = commitEntry(s);
          if (c.fin.cashflows.length < 2) { setStatus('Sem fluxos suficientes'); return c; }
          try {
            const v = irr(c.fin.cashflows) * 100;
            addHistory('IRR', v);
            setStatus(`IRR = ${fmt(v, decimals)}%`);
            return { ...c, stack: { ...c.stack, x: v, lastX: c.stack.x } };
          } catch {
            setStatus('Erro IRR'); return c;
          }
        });
        return;
      case 'PMT':
        setState((s) => {
          const c = commitEntry(s);
          const f = Math.pow(10, decimals);
          const res = Math.round(c.stack.x * f) / f;
          return { ...c, stack: { ...c.stack, x: res } };
        });
        return;
      case '4': depreciation('SL'); return;
      case '5': depreciation('SOYD'); return;
      case '6': depreciation('DDB'); return;
      case 'DIV':
        setState((s) => {
          const c = commitEntry(s);
          if (c.stack.x < 0) { setStatus('Erro: √ neg'); return c; }
          const res = Math.sqrt(c.stack.x);
          addHistory(`√${fmt(c.stack.x, decimals)}`, res);
          return { ...c, stack: { ...c.stack, x: res, lastX: c.stack.x } };
        });
        return;
      case '1':
        setState((s) => {
          const c = commitEntry(s);
          const res = Math.pow(c.stack.y, c.stack.x);
          addHistory(`${fmt(c.stack.y, decimals)}^${fmt(c.stack.x, decimals)}`, res);
          return { ...c, stack: { x: res, y: c.stack.z, z: c.stack.t, t: c.stack.t, lastX: c.stack.x } };
        });
        return;
      case '0':
        setState((s) => {
          const c = commitEntry(s);
          const n = Math.floor(c.stack.x);
          if (n < 0 || n > 170) { setStatus('Erro factorial'); return c; }
          let f = 1; for (let k = 2; k <= n; k++) f *= k;
          addHistory(`${n}!`, f);
          return { ...c, stack: { ...c.stack, x: f, lastX: c.stack.x } };
        });
        return;
      case '7':
        setStatus('Modo BEG (início de período) — não usado neste solver');
        return;
      case '8':
        setStatus('Modo END (fim de período) — padrão');
        return;
      default:
        setStatus('f+' + id + ' não impl.');
    }
  };

  const handleGShift = (id: string) => {
    haptic();
    switch (id) {
      case 'n':
        setState((s) => {
          const c = commitEntry(s);
          const r = c.stack.x * 12;
          setStatus(`× 12 = ${fmt(r, decimals)}`);
          return { ...c, stack: { ...c.stack, x: r, lastX: c.stack.x }, fin: { ...c.fin, n: r } };
        });
        return;
      case 'i':
        setState((s) => {
          const c = commitEntry(s);
          const r = c.stack.x / 12;
          setStatus(`÷ 12 = ${fmt(r, decimals)}`);
          return { ...c, stack: { ...c.stack, x: r, lastX: c.stack.x }, fin: { ...c.fin, i: r } };
        });
        return;
      case 'PV':
        setState((s) => {
          const c = commitEntry(s);
          const cfs = [c.stack.x];
          setStatus(`CFo = ${fmt(c.stack.x, decimals)}`);
          return { ...c, fin: { ...c.fin, cashflows: cfs } };
        });
        return;
      case 'PMT':
        setState((s) => {
          const c = commitEntry(s);
          const cfs = c.fin.cashflows.length === 0 ? [0] : [...c.fin.cashflows];
          cfs.push(c.stack.x);
          setStatus(`CF${cfs.length - 1} = ${fmt(c.stack.x, decimals)}`);
          return { ...c, fin: { ...c.fin, cashflows: cfs } };
        });
        return;
      case 'FV':
        setState((s) => {
          const c = commitEntry(s);
          const reps = Math.max(1, Math.floor(c.stack.x));
          const cfs = [...c.fin.cashflows];
          if (cfs.length === 0) { setStatus('Sem CF para repetir'); return c; }
          const last = cfs[cfs.length - 1];
          for (let k = 1; k < reps; k++) cfs.push(last);
          setStatus(`Nj = ${reps}`);
          return { ...c, fin: { ...c.fin, cashflows: cfs } };
        });
        return;
      case '1':
        setState((s) => {
          const c = commitEntry(s);
          if (c.stack.x <= 0) { setStatus('Erro LN'); return c; }
          const r = Math.log(c.stack.x);
          addHistory(`ln(${fmt(c.stack.x, decimals)})`, r);
          return { ...c, stack: { ...c.stack, x: r, lastX: c.stack.x } };
        });
        return;
      case '2':
      case 'ADD':
        setState((s) => {
          const c = commitEntry(s);
          const r = Math.exp(c.stack.x);
          addHistory(`e^${fmt(c.stack.x, decimals)}`, r);
          return { ...c, stack: { ...c.stack, x: r, lastX: c.stack.x } };
        });
        return;
      case 'DIV':
        setState((s) => {
          const c = commitEntry(s);
          const r = c.stack.x * c.stack.x;
          addHistory(`${fmt(c.stack.x, decimals)}²`, r);
          return { ...c, stack: { ...c.stack, x: r, lastX: c.stack.x } };
        });
        return;
      case 'EEX':
        setState((s) => pushNumber(Math.PI, commitEntry(s)));
        return;
      case 'ENTER':
        setState((s) => pushNumber(s.stack.lastX, commitEntry(s)));
        return;
      case 'SUM':
        setState((s) => ({ ...s, fin: { ...s.fin, cashflows: [] } }));
        setStatus('CLΣ - fluxos limpos');
        return;
      case 'CLx':
        setState((s) => {
          const c = commitEntry(s);
          if (c.stack.y === 0) { setStatus('Erro Δ%'); return c; }
          const r = ((c.stack.x - c.stack.y) / c.stack.y) * 100;
          addHistory(`Δ% ${fmt(c.stack.y, decimals)}→${fmt(c.stack.x, decimals)}`, r);
          return { ...c, stack: { ...c.stack, x: r, lastX: c.stack.x } };
        });
        return;
      case '9':
        setState((s) => {
          const c = commitEntry(s);
          if (c.stack.y === 0) { setStatus('Erro %T'); return c; }
          const r = (c.stack.x / c.stack.y) * 100;
          addHistory(`%T ${fmt(c.stack.x, decimals)}/${fmt(c.stack.y, decimals)}`, r);
          return { ...c, stack: { ...c.stack, x: r, lastX: c.stack.x } };
        });
        return;
      default:
        setStatus('g+' + id + ' não impl.');
    }
  };

  const handleKey = (key: KeyDef) => {
    const id = key.id;
    const shift = state.shift;

    if (id === 'f') {
      haptic();
      setState((s) => ({ ...s, shift: s.shift === 'f' ? null : 'f' }));
      return;
    }
    if (id === 'g') {
      haptic();
      setState((s) => ({ ...s, shift: s.shift === 'g' ? null : 'g' }));
      return;
    }

    if (shift === 'f') {
      handleFShift(id);
      setState((s) => ({ ...s, shift: null }));
      return;
    }
    if (shift === 'g') {
      handleGShift(id);
      setState((s) => ({ ...s, shift: null }));
      return;
    }

    switch (id) {
      case '0': case '1': case '2': case '3': case '4':
      case '5': case '6': case '7': case '8': case '9':
        doDigit(id); return;
      case 'DOT': doDot(); return;
      case 'CHS': doChs(); return;
      case 'ADD': doBinaryOp('+'); return;
      case 'SUB': doBinaryOp('-'); return;
      case 'MUL': doBinaryOp('*'); return;
      case 'DIV': doBinaryOp('/'); return;
      case 'ENTER': doEnter(); return;
      case 'BS': doBackspace(); return;
      case 'CLx': doClearX(); return;
      case 'XY': doSwapXY(); return;
      case 'RDN': doRollDown(); return;
      case 'PCT': doPercent(); return;
      case 'INV': doInverse(); return;
      case 'SUM': doSigmaPlus(); return;
      case 'EEX': setStatus('EEX: use notação direta'); haptic(); return;
      case 'STO': haptic(); setPendingMemOp('STO'); setStatus('STO → toque dígito 0-9'); return;
      case 'RCL': haptic(); setPendingMemOp('RCL'); setStatus('RCL → toque dígito 0-9'); return;
      case 'n': handleFinancialKey('n', 'n'); return;
      case 'i': handleFinancialKey('i', 'i'); return;
      case 'PV': handleFinancialKey('pv', 'PV'); return;
      case 'PMT': handleFinancialKey('pmt', 'PMT'); return;
      case 'FV': handleFinancialKey('fv', 'FV'); return;
    }
  };

  const renderKey = (k: KeyDef) => {
    const bg =
      k.variant === 'num' ? t.keyNum :
      k.variant === 'enter' ? t.keyEnter :
      k.variant === 'fkey' ? t.keyF :
      k.variant === 'gkey' ? t.keyG :
      t.keyFn;
    const flex = k.flex || 1;
    const radius = theme === 'classic' ? 4 : 12;
    const mainColor =
      k.variant === 'fkey' ? '#000' :
      k.variant === 'gkey' ? '#fff' :
      k.variant === 'num' ? t.keyNumText :
      k.variant === 'enter' ? t.keyEnterText :
      t.keyFnText;

    const isFActiveOnThis = state.shift === 'f' && k.id === 'f';
    const isGActiveOnThis = state.shift === 'g' && k.id === 'g';

    return (
      <Pressable
        key={k.id}
        testID={`key-${k.id}`}
        onPress={() => handleKey(k)}
        style={({ pressed }) => [
          styles.key,
          {
            backgroundColor: bg,
            flex,
            borderRadius: radius,
            borderColor: theme === 'classic' ? '#000' : t.keyBorder,
            borderWidth: 1,
            opacity: pressed ? 0.7 : 1,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          },
          (isFActiveOnThis || isGActiveOnThis) && { borderColor: '#fff', borderWidth: 2 },
        ]}
      >
        {k.f ? (
          <Text style={[styles.fLabel, { color: t.fLabel }]} numberOfLines={1}>{k.f}</Text>
        ) : (
          <View style={{ height: 10 }} />
        )}
        <Text
          style={[
            styles.keyMain,
            {
              color: mainColor,
              fontSize: k.main.length > 3 ? 12 : k.main === 'ENTER' ? 13 : 17,
              fontWeight: k.variant === 'enter' ? '700' : '600',
            },
          ]}
          numberOfLines={1}
        >
          {k.main}
        </Text>
        {k.g ? (
          <Text style={[styles.gLabel, { color: t.gLabel }]} numberOfLines={1}>{k.g}</Text>
        ) : (
          <View style={{ height: 10 }} />
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <View style={[styles.body, { backgroundColor: t.body }]} testID="calculator-body">
        <View style={styles.topbar}>
          <Text style={[styles.brand, { color: t.accent }]}>HP 12C</Text>
          <View style={styles.topRight}>
            <TouchableOpacity
              testID="toggle-mode"
              onPress={() => {
                haptic();
                setState((s) => ({ ...s, mode: s.mode === 'RPN' ? 'ALG' : 'RPN', algLeft: null, pendingOp: null }));
              }}
              style={[styles.pill, { borderColor: t.accent }]}
            >
              <Text style={[styles.pillTxt, { color: t.accent }]}>{state.mode}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="toggle-theme"
              onPress={() => { haptic(); setTheme((p) => (p === 'classic' ? 'modern' : 'classic')); }}
              style={[styles.pill, { borderColor: t.secondary }]}
            >
              <Text style={[styles.pillTxt, { color: t.secondary }]}>
                {theme === 'classic' ? 'Clássico' : 'Moderno'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity testID="open-history" onPress={() => { haptic(); setShowHistory(true); }} style={[styles.pill, { borderColor: t.muted }]}>
              <Text style={[styles.pillTxt, { color: t.text }]}>Hist</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="open-memory" onPress={() => { haptic(); setShowMemory(true); }} style={[styles.pill, { borderColor: t.muted }]}>
              <Text style={[styles.pillTxt, { color: t.text }]}>Mem</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="open-help" onPress={() => { haptic(); setShowHelp(true); }} style={[styles.pill, { borderColor: t.muted }]}>
              <Text style={[styles.pillTxt, { color: t.text }]}>?</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.bezel, { backgroundColor: t.bezel, borderColor: t.bezelInner }]}>
          <View style={[styles.display, { backgroundColor: t.displayBg }]} testID="display-screen">
            <View style={styles.indicatorRow}>
              <Text style={[styles.ind, { color: state.shift === 'f' ? t.keyF : 'transparent' }]}>f</Text>
              <Text style={[styles.ind, { color: state.shift === 'g' ? t.keyG : 'transparent' }]}>g</Text>
              <Text style={[styles.ind, { color: state.mode === 'RPN' ? t.displayText : 'transparent', opacity: 0.6 }]}>RPN</Text>
              <Text style={[styles.ind, { color: state.mode === 'ALG' ? t.displayText : 'transparent', opacity: 0.6 }]}>
                {state.pendingOp ? opSym(state.pendingOp) : 'ALG'}
              </Text>
              <Text style={[styles.ind, { color: pendingMemOp ? t.displayText : 'transparent' }]}>{pendingMemOp || ''}</Text>
            </View>
            <Text testID="display-value" style={[styles.displayText, { color: t.displayText }]} numberOfLines={1} adjustsFontSizeToFit>
              {display}
            </Text>
            <View style={styles.stackRow}>
              <Text style={[styles.stackTxt, { color: t.displayText, opacity: 0.55 }]}>Y: {fmt(state.stack.y, decimals)}</Text>
              <Text style={[styles.stackTxt, { color: t.displayText, opacity: 0.4 }]}>Z: {fmt(state.stack.z, decimals)}</Text>
              <Text style={[styles.stackTxt, { color: t.displayText, opacity: 0.3 }]}>T: {fmt(state.stack.t, decimals)}</Text>
            </View>
          </View>
        </View>

        <Text testID="status-text" style={[styles.statusTxt, { color: t.muted }]} numberOfLines={1}>
          {state.status ||
            `n=${fmt(state.fin.n, 0)}  i=${fmt(state.fin.i, decimals)}%  PV=${fmt(state.fin.pv, decimals)}  PMT=${fmt(state.fin.pmt, decimals)}  FV=${fmt(state.fin.fv, decimals)}`}
        </Text>

        <View style={styles.keyboard} testID="keypad-grid">
          {KEYS.map((row, ri) => (
            <View key={ri} style={styles.row}>
              {row.map((k) => renderKey(k))}
            </View>
          ))}
          {state.mode === 'ALG' && (
            <View style={styles.row}>
              <Pressable
                testID="key-EQ"
                onPress={doEquals}
                style={({ pressed }) => [
                  styles.key,
                  {
                    flex: 1,
                    backgroundColor: t.accent,
                    borderRadius: theme === 'classic' ? 4 : 12,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <View style={{ height: 10 }} />
                <Text style={[styles.keyMain, { color: '#000', fontWeight: '800', fontSize: 22 }]}>=</Text>
                <View style={{ height: 10 }} />
              </Pressable>
            </View>
          )}
        </View>
      </View>

      <Modal visible={showHistory} animationType="slide" transparent onRequestClose={() => setShowHistory(false)}>
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: t.body, borderColor: t.bezel }]} testID="history-panel">
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: t.accent }]}>Histórico</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  testID="clear-history"
                  onPress={() => { haptic(); setState((s) => ({ ...s, history: [] })); }}
                  style={[styles.pill, { borderColor: t.muted }]}
                >
                  <Text style={[styles.pillTxt, { color: t.text }]}>Limpar</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="close-history" onPress={() => setShowHistory(false)} style={[styles.pill, { borderColor: t.muted }]}>
                  <Text style={[styles.pillTxt, { color: t.text }]}>Fechar</Text>
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView style={{ maxHeight: 480 }}>
              {state.history.length === 0 && (
                <Text style={{ color: t.muted, padding: 16, textAlign: 'center' }}>Nenhum cálculo ainda.</Text>
              )}
              {state.history.map((h) => (
                <View key={h.id} style={[styles.histRow, { borderColor: t.keyBorder }]}>
                  <Text style={[styles.histLabel, { color: t.muted }]}>{h.label}</Text>
                  <Text style={[styles.histResult, { color: t.text }]}>{h.result}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showMemory} animationType="slide" transparent onRequestClose={() => setShowMemory(false)}>
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: t.body, borderColor: t.bezel }]} testID="memory-display">
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: t.accent }]}>Memória & Registradores</Text>
              <TouchableOpacity testID="close-memory" onPress={() => setShowMemory(false)} style={[styles.pill, { borderColor: t.muted }]}>
                <Text style={[styles.pillTxt, { color: t.text }]}>Fechar</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={[styles.section, { color: t.secondary }]}>Registradores Financeiros</Text>
              {([
                ['n', state.fin.n],
                ['i (%)', state.fin.i],
                ['PV', state.fin.pv],
                ['PMT', state.fin.pmt],
                ['FV', state.fin.fv],
              ] as [string, number][]).map(([k, v]) => (
                <View key={k} style={[styles.memRow, { borderColor: t.keyBorder }]}>
                  <Text style={{ color: t.muted }}>{k}</Text>
                  <Text style={{ color: t.text }}>{fmt(v, decimals)}</Text>
                </View>
              ))}
              <Text style={[styles.section, { color: t.secondary }]}>Fluxos de Caixa</Text>
              {state.fin.cashflows.length === 0 && (
                <Text style={{ color: t.muted, padding: 12 }}>Vazio. Use g+PV para CFo e g+PMT para CFj.</Text>
              )}
              {state.fin.cashflows.map((cf, idx) => (
                <View key={idx} style={[styles.memRow, { borderColor: t.keyBorder }]}>
                  <Text style={{ color: t.muted }}>CF{idx}</Text>
                  <Text style={{ color: t.text }}>{fmt(cf, decimals)}</Text>
                </View>
              ))}
              <Text style={[styles.section, { color: t.secondary }]}>Registradores R0 - R9</Text>
              {state.memory.map((m, idx) => (
                <View key={idx} style={[styles.memRow, { borderColor: t.keyBorder }]}>
                  <Text style={{ color: t.muted }}>R{idx}</Text>
                  <Text style={{ color: t.text }}>{fmt(m, decimals)}</Text>
                </View>
              ))}
              <TouchableOpacity
                testID="clear-memory"
                onPress={() => {
                  haptic();
                  setState((s) => ({
                    ...s,
                    memory: Array(10).fill(0),
                    fin: { n: 0, i: 0, pv: 0, pmt: 0, fv: 0, cashflows: [] },
                  }));
                }}
                style={[styles.pill, { borderColor: t.muted, alignSelf: 'center', marginVertical: 16 }]}
              >
                <Text style={[styles.pillTxt, { color: t.text }]}>Limpar Memória</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showHelp} animationType="slide" transparent onRequestClose={() => setShowHelp(false)}>
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: t.body, borderColor: t.bezel }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: t.accent }]}>Ajuda Rápida</Text>
              <TouchableOpacity testID="close-help" onPress={() => setShowHelp(false)} style={[styles.pill, { borderColor: t.muted }]}>
                <Text style={[styles.pillTxt, { color: t.text }]}>Fechar</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ paddingHorizontal: 8 }}>
              <Text style={[styles.helpTitle, { color: t.accent }]}>Modos</Text>
              <Text style={[styles.helpTxt, { color: t.text }]}>
                <Text style={{ color: t.accent }}>RPN</Text>: digite o 1º número, toque ENTER, digite o 2º, e o operador.{'\n'}
                <Text style={{ color: t.secondary }}>ALG</Text>: 5 + 3 = (como uma calculadora comum).
              </Text>
              <Text style={[styles.helpTitle, { color: t.accent }]}>Teclas Financeiras</Text>
              <Text style={[styles.helpTxt, { color: t.text }]}>
                Digite um valor → toque n / i / PV / PMT / FV para armazenar.{'\n'}
                Para CALCULAR essa variável: toque a tecla SEM ter digitado nada (com as outras já preenchidas).
              </Text>
              <Text style={[styles.helpTitle, { color: t.accent }]}>Modificadoras</Text>
              <Text style={[styles.helpTxt, { color: t.text }]}>
                <Text style={{ color: t.keyF }}>f</Text> = funções amarelas (acima da tecla).{'\n'}
                <Text style={{ color: t.keyG }}>g</Text> = funções azuis (abaixo da tecla).
              </Text>
              <Text style={[styles.helpTitle, { color: t.accent }]}>Exemplos</Text>
              <Text style={[styles.helpTxt, { color: t.text }]}>
                <Text style={{ color: t.accent }}>Parcela:</Text> 60 [n]  1.5 [i]  50000 [PV]  0 [FV] → [PMT] resolve a parcela.{'\n\n'}
                <Text style={{ color: t.accent }}>NPV:</Text> -1000 [g][PV]  300 [g][PMT]  300 [g][PMT]  300 [g][PMT]  300 [g][PMT]  10 [i]  [f][PV] → NPV.{'\n\n'}
                <Text style={{ color: t.accent }}>IRR:</Text> Após os fluxos acima → [f][FV] → IRR.{'\n\n'}
                <Text style={{ color: t.accent }}>Depreciação SL:</Text> 10000 [PV]  1000 [FV]  5 [n]; 1 [f][4] = ano 1.{'\n\n'}
                <Text style={{ color: t.accent }}>Amortização:</Text> Após PMT, digite nº parcelas → [f][n].
              </Text>
              <Text style={[styles.helpTitle, { color: t.accent }]}>Memória</Text>
              <Text style={[styles.helpTxt, { color: t.text }]}>
                STO + dígito (0–9) salva o valor de X. RCL + dígito recupera.
              </Text>
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, padding: 10, gap: 8 },
  topbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  brand: { fontSize: 18, fontWeight: '800', letterSpacing: 2 },
  topRight: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderRadius: 14,
  },
  pillTxt: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  bezel: { borderRadius: 8, padding: 4, borderWidth: 2 },
  display: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 4,
    minHeight: 90,
  },
  indicatorRow: { flexDirection: 'row', gap: 14, marginBottom: 2 },
  ind: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  displayText: {
    fontSize: 38,
    fontWeight: '300',
    textAlign: 'right',
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
    letterSpacing: 1,
  },
  stackRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 4,
  },
  stackTxt: {
    fontSize: 10,
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
  },
  statusTxt: { fontSize: 11, textAlign: 'center', paddingVertical: 2 },
  keyboard: { flex: 1, gap: 6 },
  row: { flexDirection: 'row', gap: 6, flex: 1 },
  key: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 2,
    minHeight: 50,
  },
  fLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  gLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  keyMain: { fontSize: 16, fontWeight: '600' },
  modalWrap: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modal: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 2,
    padding: 16,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  histRow: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  histLabel: { fontSize: 12 },
  histResult: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  section: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 6,
    letterSpacing: 1,
    paddingHorizontal: 8,
  },
  memRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  helpTitle: { fontSize: 14, fontWeight: '800', marginTop: 14, marginBottom: 4, letterSpacing: 1 },
  helpTxt: { fontSize: 13, lineHeight: 20 },
});
