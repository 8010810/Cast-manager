import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell
} from "recharts";

// -----------------------------------------------------------------------------
// Storage (localStorage)
// -----------------------------------------------------------------------------
const STORAGE_KEY = "castManagerData_v3";

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const d = raw ? JSON.parse(raw) : {};
    return { casts: d.casts || [], records: d.records || {}, customers: d.customers || {} };
  } catch {
    return { casts: [], records: {}, customers: {} };
  }
}

function saveAll(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
const pad      = n => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const yen      = n => n == null ? "--" : `\u00a5${Number(n).toLocaleString()}`;
const fmtDate  = s => { if (!s) return ""; const [y, m, d] = s.split("-"); return `${y}/${m}/${d}`; };
const uid      = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function calcWorkDays(records, castId, scope) {
  return (records[castId] || []).filter(r => {
    if (scope === "all") return true;
    if (scope.length === 7) return r.date.slice(0, 7) === scope;
    return r.date.slice(0, 4) === scope;
  }).length;
}

const METRICS = [
  { key: "sales",       label: "売上",    color: "#e8b86d", unit: "\u00a5" },
  { key: "companions",  label: "同伴数",  color: "#a78bfa", unit: "回" },
  { key: "nominations", label: "指名組数",color: "#34d399", unit: "組" },
  { key: "workDays",    label: "出勤日数",color: "#fb923c", unit: "日" },
  { key: "floorCount",  label: "場内組数",color: "#60a5fa", unit: "組" },
