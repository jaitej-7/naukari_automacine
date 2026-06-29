"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { 
  CheckCircle2, FileText, Briefcase, Zap, ExternalLink, 
  Clock, AlertTriangle, Activity, Terminal, X, ClipboardCopy, Search,
  SlidersHorizontal, RotateCcw, ChevronRight, Info, HelpCircle, Eye, EyeOff,
  Sparkles, ListChecks, Play, Cpu, Download, FileSpreadsheet
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";


type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  status: string;
  relevanceScore: number;
  appliedAt?: string;
  capturedAt?: string;
  lastSeenAt?: string;
  url?: string;
  matchDecision?: string;
  posted?: string;
  resumeChecklist?: string;
};

type RunLog = {
  id: string;
  startedAt: string;
  finishedAt?: string;
  jobCount: number;
  trackerCount: number;
  actions: string[];
  warnings: string[];
};

type BotStatus = {
  running: boolean;
  lastRun: string | null;
  status?: string;
  logs?: string[];
  id?: string;
};

export default function Dashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [runLogs, setRunLogs] = useState<RunLog[]>([]);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [botStatus, setBotStatus] = useState<BotStatus>({ running: false, lastRun: null });
  const [loading, setLoading] = useState(true);
  const [showBrowser, setShowBrowser] = useState(false);
  
  const initialJobCountRef = useRef<number | null>(null);
  const wasRunningRef = useRef<boolean>(false);
  
  // Custom states
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [showLogsPanel, setShowLogsPanel] = useState(false);
  
  // Search, Filter, and Sort states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [scoreFilter, setScoreFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("NEWEST");
  const [botEnabled, setBotEnabled] = useState(false);

  // Terminal Console Controls
  const [terminalSearch, setTerminalSearch] = useState("");
  const [terminalFontSize, setTerminalFontSize] = useState<"sm" | "md" | "lg">("sm");
  const [terminalScrollLocked, setTerminalScrollLocked] = useState(true);
  const [localLogsBuffer, setLocalLogsBuffer] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'ALL' | 'APPLIED' | 'PENDING_QA' | 'INTERNSHIPS' | 'MANUAL_APPLY'>('ALL');
  const [seenCounts, setSeenCounts] = useState<Record<string, number>>({});
  
  // AI Slide-over drawer tab
  const [drawerTab, setDrawerTab] = useState<"checklist" | "details">("checklist");
  
  // Interactive checklist tasks state
  const [completedTasks, setCompletedTasks] = useState<Record<string, boolean>>({});

  const terminalContainerRef = useRef<HTMLDivElement>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const newJobs = Array.isArray(data?.tracker) ? data.tracker : [];
      setJobs(newJobs);
      setRunLogs(Array.isArray(data?.runLog) ? data.runLog : []);
      return newJobs;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBotStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/run", { cache: "no-store" });
      const data = await res.json();
      setBotStatus(data);
      if (data.logs) {
        setLocalLogsBuffer(data.logs);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch("/api/config");
        if (res.ok) {
          const config = await res.json();
          setShowBrowser(!config.headless);
          setBotEnabled(!!config.botEnabled);
        }
      } catch (err) {}
    };

    fetchJobs();
    fetchBotStatus();
    fetchConfig();
  }, [fetchJobs, fetchBotStatus]);

  // Poll status more frequently (every 3s) when running,  // Polling mechanism
  useEffect(() => {
    const intervalTime = botStatus.running ? 3000 : 8000;
    const timer = setInterval(() => {
      fetchBotStatus();
      if (botStatus.running) {
        fetchJobs(); // Update the tracking feed live while bot runs
      }
    }, intervalTime);
    return () => clearInterval(timer);
  }, [botStatus.running, fetchBotStatus, fetchJobs]);

  // Auto-scroll logs terminal to bottom unless scroll is locked
  // Uses scrollTop on the container div — NOT scrollIntoView which scrolls the whole page
  useEffect(() => {
    if (showLogsPanel && terminalScrollLocked && terminalContainerRef.current) {
      const el = terminalContainerRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [localLogsBuffer, showLogsPanel, terminalScrollLocked]);

  // Track job count to alert if no new jobs were found
  useEffect(() => {
    if (botStatus.running && !wasRunningRef.current) {
      // Run just started
      initialJobCountRef.current = jobs.length;
      wasRunningRef.current = true;
    } else if (!botStatus.running && wasRunningRef.current) {
      // Run just finished
      wasRunningRef.current = false;
      fetchJobs().then(newJobs => {
        if (newJobs && initialJobCountRef.current !== null) {
          if (newJobs.length === initialJobCountRef.current) {
            alert('Sweep Complete: No new jobs were found in this run.');
          }
        }
      });
    }
  }, [botStatus.running, fetchJobs, jobs.length]);

  const runBot = async () => {
    if (botStatus.running) return;

    try {
      const configRes = await fetch("/api/config");
      const configData = await configRes.json();
      
      const hasEmail = !!configData.naukriEmail;
      const hasResume = !!configData.resume?.path;

      if (!hasEmail || !hasResume) {
        alert("Action Required: You must provide your Hunter (Naukri) email, password, and upload a resume in the Settings page before running the bot.");
        return;
      }
    } catch (e) {
      console.error("Failed to fetch config for validation", e);
    }

    setBotStatus(s => ({ ...s, running: true }));
    setShowLogsPanel(true);
    setTerminalScrollLocked(true);
    try {
      await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headless: !showBrowser })
      });
    } catch {}
  };

  const toggleHeadless = async () => {
    const newValue = !showBrowser;
    setShowBrowser(newValue);
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headless: !newValue })
      });
    } catch (e) { console.error(e); }
  };

  const toggleContinuousSweep = async () => {
    const newValue = !botEnabled;
    setBotEnabled(newValue);
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botEnabled: newValue })
      });
    } catch (e) { console.error(e); }

    // If turning on, immediately trigger a sweep
    if (newValue) {
      runBot();
    }
  };

  const renderResumeChecklist = (checklistStr: string | null, jobId?: string) => { };

  const resetFilters = () => {
    setSearchQuery("");
    setStatusFilter("ALL");
    setScoreFilter("ALL");
    setSortBy("NEWEST");
  };

  const hasActiveFilters = searchQuery !== "" || statusFilter !== "ALL" || scoreFilter !== "ALL" || sortBy !== "NEWEST";

  const downloadJobsExcel = () => {
    const rows = filteredAndSortedJobs.map((job, idx) => ({
      "#": idx + 1,
      "Title": job.title,
      "Company": job.company,
      "Location": job.location || "",
      "Status": job.status || "Not Applied",
      "Match Decision": job.matchDecision || "",
      "Relevance Score": job.relevanceScore ?? 0,
      "Posted": job.posted || "",
      "Scouted At": job.capturedAt ? new Date(job.capturedAt).toLocaleString("en-IN") : "",
      "Last Seen": job.lastSeenAt ? new Date(job.lastSeenAt).toLocaleString("en-IN") : "",
      "Applied At": job.appliedAt ? new Date(job.appliedAt).toLocaleString("en-IN") : "",
      "Job URL": job.url || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    // Auto column widths
    const colWidths = Object.keys(rows[0] || {}).map(k => ({ wch: Math.max(k.length, 18) }));
    ws["!cols"] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Jobs");
    XLSX.writeFile(wb, `hunter-jobs-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const downloadResume = async () => {
    try {
      const res = await fetch("/api/resume");
      if (!res.ok) throw new Error("Resume not found");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "master_resume.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Resume not available. Please upload one via Settings.");
    }
  };

  const totalJobs = jobs.length;
  const strongMatches = jobs.filter(j => j.relevanceScore >= 80 || j.matchDecision === 'Strong Match').length;
  const appliedJobs = jobs.filter(j => j.status === "Applied").length;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
  } as const;

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 22 } }
  } as const;

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  // Always-fresh relative time — recalculated from the real capturedAt timestamp
  const timeAgo = (iso?: string) => {
    if (!iso) return 'Unknown';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    if (weeks < 5) return `${weeks}w ago`;
    return `${months}mo ago`;
  };

  const toggleTask = (jobId: string, lineIndex: number) => {
    const key = `${jobId}-${lineIndex}`;
    setCompletedTasks(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Advanced Markdown checklist renderer with interactive task triggers
  const renderInteractiveMarkdown = (text?: string, jobId?: string) => {
    if (!text) return <p className="italic text-muted-foreground text-center py-6">No optimization suggestions generated.</p>;
    return text.split('\n').map((line, idx) => {
      const trimmed = line.trim();
      const isHeader1 = trimmed.startsWith('# ');
      const isHeader2 = trimmed.startsWith('## ');
      const isHeader3 = trimmed.startsWith('### ');
      const isChecklistEmpty = trimmed.startsWith('- [ ] ') || trimmed.startsWith('* [ ] ');
      const isChecklistDone = trimmed.startsWith('- [x] ') || trimmed.startsWith('* [x] ');

      if (isHeader1) {
        return <h1 key={idx} className="text-lg font-heading font-extrabold mt-5 mb-2 text-primary border-b border-border/20 pb-1.5">{trimmed.slice(2)}</h1>;
      }
      if (isHeader2) {
        return <h2 key={idx} className="text-base font-heading font-bold mt-4 mb-2 text-foreground/90">{trimmed.slice(3)}</h2>;
      }
      if (isHeader3) {
        return <h3 key={idx} className="text-sm font-heading font-semibold mt-3 mb-1 text-foreground/85">{trimmed.slice(4)}</h3>;
      }

      if (isChecklistEmpty || isChecklistDone) {
        const itemText = trimmed.slice(6);
        const taskKey = `${jobId || "temp"}-${idx}`;
        const isChecked = completedTasks[taskKey] ?? isChecklistDone;

        return (
          <div 
            key={idx} 
            onClick={() => toggleTask(jobId || "temp", idx)}
            className={`flex items-start gap-3 my-2 pl-1.5 pr-2 py-1.5 rounded-lg border border-transparent hover:border-border/30 hover:bg-muted/10 cursor-pointer transition-all ${isChecked ? 'opacity-50 line-through bg-zinc-950/20' : ''}`}
          >
            <input 
              type="checkbox" 
              checked={isChecked} 
              readOnly
              className="mt-0.5 accent-primary rounded shrink-0 cursor-pointer w-4 h-4" 
            />
            <span className="text-xs text-foreground/90 leading-relaxed">{itemText}</span>
          </div>
        );
      }

      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        return (
          <ul key={idx} className="list-disc pl-5 my-1.5 space-y-1">
            <li className="text-xs text-muted-foreground">{trimmed.slice(2)}</li>
          </ul>
        );
      }
      if (trimmed === '') return <div key={idx} className="h-2" />;
      return <p key={idx} className="text-xs my-1.5 leading-relaxed text-muted-foreground">{trimmed}</p>;
    });
  };

  const parsePostedAge = (posted?: string | null) => {
    if (!posted) return 999999;
    const text = posted.toLowerCase();
    if (text.includes('just now') || text.includes('today')) return 0;
    if (text.includes('hour')) {
      const m = text.match(/(\d+)/);
      return m ? parseInt(m[1]) : 1;
    }
    if (text.includes('day')) {
      const m = text.match(/(\d+)/);
      return m ? parseInt(m[1]) * 24 : 24;
    }
    if (text.includes('month')) {
      const m = text.match(/(\d+)/);
      return m ? parseInt(m[1]) * 24 * 30 : 24 * 30;
    }
    return 999999;
  };

  // Filter & Sort Logic
  const filteredAndSortedJobs = jobs
    .filter(job => {
      // 1. Search Query
      const query = searchQuery.toLowerCase().trim();
      if (query) {
        const matchesTitle = job.title?.toLowerCase().includes(query) ?? false;
        const matchesCompany = job.company?.toLowerCase().includes(query) ?? false;
        const matchesLoc = (job.location || '').toLowerCase().includes(query);
        if (!matchesTitle && !matchesCompany && !matchesLoc) return false;
      }

      // 2. Status Filter
      if (statusFilter !== 'ALL') {
        if (job.status !== statusFilter) return false;
      }
        // 4. Tab Filter
        if (activeTab !== 'ALL') {
          if (activeTab === 'APPLIED' && job.status !== 'Applied') return false;
          if (activeTab === 'PENDING_QA' && job.status !== 'Pending Q&A') return false;
          if (activeTab === 'INTERNSHIPS' && !(job.title?.toLowerCase().includes('intern') || (job as any).isInternship)) return false;
          if (activeTab === 'MANUAL_APPLY' && job.status !== 'Manual Apply Needed') return false;
        }
      // 3. Relevance Score Filter
      if (scoreFilter !== 'ALL') {
        const score = job.relevanceScore || 0;
        if (scoreFilter === 'STRONG' && score < 80) return false;
        if (scoreFilter === 'MEDIUM' && (score < 50 || score >= 80)) return false;
        if (scoreFilter === 'LOW' && score >= 50) return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'NEWEST') {
        // Newest first – based on most recent activity timestamp (capturedAt or lastSeenAt)
        const timeA = new Date(a.lastSeenAt || a.capturedAt || 0).getTime();
        const timeB = new Date(b.lastSeenAt || b.capturedAt || 0).getTime();
        return timeB - timeA;
      }
      if (sortBy === 'OLDEST') {
        const timeA = new Date(a.lastSeenAt || a.capturedAt || 0).getTime();
        const timeB = new Date(b.lastSeenAt || b.capturedAt || 0).getTime();
        return timeA - timeB;
      }
      if (sortBy === 'SCORE_DESC') {
        return (b.relevanceScore || 0) - (a.relevanceScore || 0);
      }
      if (sortBy === 'SCORE_ASC') {
        return (a.relevanceScore || 0) - (b.relevanceScore || 0);
      }
      if (sortBy === 'COMPANY_A_Z') {
        return a.company.localeCompare(b.company);
      }
      return 0;
    });

  // Filter terminal log buffer
  const filteredLogs = localLogsBuffer.filter(logLine => 
    logLine.toLowerCase().includes(terminalSearch.toLowerCase())
  );

  return (
    <motion.div
      className="space-y-8 py-2 relative"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {/* Header Widget */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-heading font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary via-indigo-400 to-pink-500">
            Automachine Overview
          </h1>
          <p className="text-muted-foreground mt-1 text-sm font-medium">
            Monitor and trigger your automated profile sweeps in real-time.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          
          {/* Stealth Mode Toggle */}
          <div className={`flex items-center justify-between gap-3 border px-4 py-2 rounded-xl backdrop-blur-md transition-colors ${!showBrowser ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-zinc-100 dark:bg-zinc-950/40 border-border/50 hover:bg-zinc-200 dark:hover:bg-zinc-950/60'}`}>
            <span className={`text-xs font-bold flex items-center gap-1.5 ${!showBrowser ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
              <EyeOff className={`w-3.5 h-3.5 ${!showBrowser ? 'text-indigo-500 fill-indigo-500' : 'text-muted-foreground'}`} />
              {!showBrowser ? 'Stealth Active' : 'Stealth Off'}
            </span>
            <button
              type="button"
              onClick={toggleHeadless}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-all ${!showBrowser ? 'bg-indigo-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}
            >
              <span className={`pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow ring-0 transition-transform ${!showBrowser ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* Trigger Sweep Button */}
          <motion.button
            whileHover={{ scale: 1.03, y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={toggleContinuousSweep}
            className={`relative group inline-flex items-center justify-center rounded-xl px-6 py-2.5 text-xs font-bold text-white transition-all shadow-md overflow-hidden cursor-pointer ${
              botEnabled 
                ? 'bg-gradient-to-r from-red-500 to-rose-600 shadow-red-500/20 hover:shadow-red-500/30' 
                : 'bg-gradient-to-r from-primary to-indigo-600 shadow-primary/20 hover:shadow-primary/30'
            }`}
          >
            <span className="relative flex items-center gap-2">
              {botEnabled ? (
                <>
                  <div className="h-3.5 w-3.5 animate-pulse rounded-full bg-white/30 border border-white/50" />
                  <span>Stop Continuous Sweep</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Start Continuous Sweep</span>
                </>
              )}
            </span>
          </motion.button>
        </div>
      </motion.div>

      {/* Live Runner Telemetry Banner */}
      <AnimatePresence>
        {(botStatus.running || botStatus.lastRun) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className={`glass-panel rounded-2xl px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-4 text-xs cursor-pointer border ${botStatus.running ? 'border-primary/30 bg-primary/5 shadow-lg shadow-primary/5' : 'border-border/30 bg-muted/5'}`}
            onClick={() => setShowLogsPanel(!showLogsPanel)}
          >
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex h-2.5 w-2.5 shrink-0">
                {botStatus.running && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${botStatus.running ? 'bg-primary' : 'bg-emerald-500'}`}></span>
              </div>
              <Cpu className={`h-4 w-4 shrink-0 ${botStatus.running ? 'text-primary animate-pulse' : 'text-zinc-400'}`} />
              <span className="font-semibold text-foreground/90">
                {botStatus.running 
                  ? 'Active Telemetry Log Sweep — click to show/hide runner logs output.' 
                  : 'Runner Daemon Idle — click to review the console execution log history.'}
              </span>
            </div>
            <div className="flex items-center gap-3 text-muted-foreground text-[10px] sm:ml-auto">
              {botStatus.lastRun && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Last Scan: {formatDate(botStatus.lastRun)}
                </span>
              )}
              <span className="bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-bold px-2 py-0.5 rounded uppercase tracking-wider text-[9px]">
                {showLogsPanel ? 'Collapse' : 'Expand Logs'}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Telemetry Console (Hacker-style Terminal) */}
      <AnimatePresence>
        {showLogsPanel && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-primary/20 bg-zinc-950 p-6 space-y-4 shadow-2xl relative">
              {/* Header Details */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-900 pb-3">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-primary animate-pulse" />
                  <span className="text-[10px] font-mono text-primary font-black tracking-widest uppercase">LIVE CONSOLE STREAM</span>
                </div>
                
                {/* Console Actions */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Search buffer */}
                  <div className="relative">
                    <input 
                      type="text"
                      placeholder="Search log trace..."
                      value={terminalSearch}
                      onChange={(e) => setTerminalSearch(e.target.value)}
                      className="h-7 w-40 rounded-lg bg-zinc-900 border border-zinc-800 text-[10px] px-2.5 pl-6 text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-primary/50"
                    />
                    <Search className="w-3 h-3 absolute left-2 top-2 text-zinc-600" />
                  </div>

                  {/* Font Sizes */}
                  <div className="flex rounded-lg bg-zinc-900 border border-zinc-800 p-0.5 text-[9px] font-mono text-zinc-400">
                    {(["sm", "md", "lg"] as const).map((sz) => (
                      <button
                        key={sz}
                        onClick={() => setTerminalFontSize(sz)}
                        className={`px-2 py-0.5 rounded capitalize ${terminalFontSize === sz ? 'bg-zinc-800 text-primary font-bold' : 'hover:text-zinc-200'}`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>

                  {/* Scroll Lock */}
                  <button
                    onClick={() => setTerminalScrollLocked(!terminalScrollLocked)}
                    className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border transition-colors ${terminalScrollLocked ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
                  >
                    {terminalScrollLocked ? 'Scroll Locked' : 'Scroll Free'}
                  </button>

                  {/* Close */}
                  <button 
                    onClick={() => setShowLogsPanel(false)}
                    className="p-1 hover:bg-zinc-900 text-zinc-500 hover:text-zinc-300 rounded-lg"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              
              {/* Terminal Screen */}
              <div 
                ref={terminalContainerRef}
                className={`bg-zinc-950/60 border border-zinc-900 rounded-xl p-5 h-[240px] overflow-y-auto font-mono text-zinc-300 space-y-1.5 scrollbar-thin scrollbar-thumb-zinc-900 ${
                  terminalFontSize === "sm" ? "text-[11px]" : terminalFontSize === "md" ? "text-xs" : "text-sm"
                }`}
              >
                {filteredLogs.length === 0 ? (
                  <div className="text-zinc-600 italic text-center py-12">
                    {terminalSearch ? 'No matching log traces found.' : 'Terminal console awaiting output streams...'}
                  </div>
                ) : (
                  filteredLogs.map((logLine, idx) => {
                    const isError = logLine.includes('ERROR:') || logLine.includes('Exception');
                    const isWarning = logLine.includes('WARNING:') || logLine.includes('Aborted');
                    const isSuccess = logLine.includes('Successfully') || logLine.includes('Match:') || logLine.includes('Applied');

                    return (
                      <div key={idx} className="leading-relaxed whitespace-pre-wrap break-all border-l border-zinc-900/50 pl-2">
                        {isError ? (
                          <span className="text-red-400/90 font-bold">{logLine}</span>
                        ) : isWarning ? (
                          <span className="text-amber-400/95">{logLine}</span>
                        ) : isSuccess ? (
                          <span className="text-emerald-400/90 font-semibold">{logLine}</span>
                        ) : (
                          <span className="text-zinc-300">{logLine}</span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              
              {/* Telemetry Status Footer */}
              <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500">
                <span>Displaying {filteredLogs.length} of {localLogsBuffer.length} trace items</span>
                <span className="flex items-center gap-1">
                  Telemetry Engine v1.1.0 <span className="terminal-cursor" />
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats Cards */}
      <motion.div variants={itemVariants} className="grid gap-6 md:grid-cols-3">
        {[
          { title: "Scouted Opportunities", icon: Briefcase, value: totalJobs, color: "text-indigo-400", glow: "hover:shadow-indigo-500/10", border: "hover:border-indigo-500/30", bg: "bg-indigo-500/10" },
          { title: "Strong Matches (>=80%)", icon: Zap, value: strongMatches, color: "text-amber-400", glow: "hover:shadow-amber-500/10", border: "hover:border-amber-500/30", bg: "bg-amber-500/10" },
          { title: "Successfully Applied", icon: CheckCircle2, value: appliedJobs, color: "text-emerald-400", glow: "hover:shadow-emerald-500/10", border: "hover:border-emerald-500/30", bg: "bg-emerald-500/10" }
        ].map((stat, i) => (
          <motion.div
            key={i}
            whileHover={{ y: -3 }}
            className={`glass-panel rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden group cursor-default border border-glass-border/30 hover:bg-zinc-100/35 dark:hover:bg-zinc-900/35 ${stat.glow} ${stat.border}`}
          >
            <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-300">
              <stat.icon className={`h-28 w-28 ${stat.color} translate-x-4 -translate-y-4`} />
            </div>
            <div className="flex items-center gap-3 pb-6 relative z-10">
              <div className={`p-3 rounded-xl ${stat.bg} border border-white/5`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <h3 className="text-sm font-semibold tracking-tight text-muted-foreground">{stat.title}</h3>
            </div>
            <div className="text-4xl font-heading font-black relative z-10 flex items-baseline gap-2">
              {loading ? (
                <div className="h-10 w-16 rounded-lg bg-zinc-900 animate-pulse" />
              ) : (
                <span>{stat.value}</span>
              )}
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Main Panel Grid */}
      <motion.div variants={itemVariants} className="grid gap-6 lg:grid-cols-3">
        
        {/* Jobs Feed Table (Left 2 columns) */}
        <div className="lg:col-span-2 glass-panel rounded-2xl overflow-hidden border border-glass-border/30 bg-white/40 dark:bg-zinc-950/20 shadow-xl flex flex-col">
          
          {/* Section Header */}
          <div className="px-6 py-5 border-b border-border/40 bg-zinc-100/50 dark:bg-zinc-900/10 flex items-center justify-between gap-3 flex-wrap">
            <h3 className="font-heading font-bold text-base flex items-center gap-2.5 text-foreground/90">
              <FileText className="h-4.5 w-4.5 text-primary" /> Tracking Feed
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-muted-foreground bg-zinc-100 dark:bg-zinc-900/40 px-2.5 py-1 rounded-lg border border-border/20">
                {filteredAndSortedJobs.length === jobs.length 
                  ? `${jobs.length} tracked` 
                  : `${filteredAndSortedJobs.length} matches of ${jobs.length}`}
              </span>
              <button
                onClick={downloadResume}
                title="Download Resume PDF"
                className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 hover:bg-indigo-500/20 hover:border-indigo-500/40 transition-all cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                Resume PDF
              </button>
              <button
                onClick={downloadJobsExcel}
                disabled={filteredAndSortedJobs.length === 0}
                title="Download Jobs as Excel"
                className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Export Excel
              </button>
            </div>
          </div>

          {/* Combined Toolbar Panel */}
          <div className="px-6 py-4 border-b border-border/25 bg-zinc-900/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            
            {/* Custom Search Box */}
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search job titles, companies, or locations..."
                className="w-full h-10 rounded-xl border border-border/50 bg-zinc-100 dark:bg-zinc-900/30 pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary/80 transition-all shadow-inner"
              />
              <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-muted-foreground/80" />
            </div>

            {/* Filter & Sort selectors */}
            <div className="flex flex-wrap items-center gap-2.5">
              
              {/* Status Selector */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 px-3 rounded-xl border border-border/50 bg-zinc-100 dark:bg-zinc-900 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-primary/60 cursor-pointer"
              >
                <option value="ALL" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">All Statuses</option>
                <option value="Applied" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">Applied</option>
                <option value="Manual Apply Needed" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">Manual Apply</option>
                <option value="Not Applied" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">Not Applied</option>
                <option value="Manual Review (Q&A Timeout)" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">Timeout</option>
              </select>

              {/* Match Score Selector */}
              <select
                value={scoreFilter}
                onChange={(e) => setScoreFilter(e.target.value)}
                className="h-10 px-3 rounded-xl border border-border/50 bg-zinc-100 dark:bg-zinc-900 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-primary/60 cursor-pointer"
              >
                <option value="ALL" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">All Match Grades</option>
                <option value="STRONG" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">Strong Match (&gt;=80%)</option>
                <option value="MEDIUM" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">Medium Match (50%-79%)</option>
                <option value="LOW" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">Low Match (&lt;50%)</option>
              </select>

              {/* Sorting Options */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="h-10 px-3 rounded-xl border border-border/50 bg-zinc-100 dark:bg-zinc-900 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-primary/60 cursor-pointer"
              >
                <option value="NEWEST" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">Newest Tracked</option>
                <option value="OLDEST" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">Oldest Tracked</option>
                <option value="SCORE_DESC" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">Relevance: High-Low</option>
                <option value="SCORE_ASC" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">Relevance: Low-High</option>
                <option value="COMPANY_A_Z" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">Company: A-Z</option>
              </select>

              {/* Reset trigger */}
              <AnimatePresence>
                {hasActiveFilters && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={resetFilters}
                    className="h-10 px-3 rounded-xl border border-border/50 bg-zinc-950/30 hover:bg-zinc-900 text-xs font-bold text-primary flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Reset Filters"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>
          
          {/* Job Feed List Container */}
          <div className="px-6 pt-4 flex space-x-2">
            {(() => {
              const tabCounts: Record<string, number> = {
                ALL: jobs.length,
                APPLIED: jobs.filter(j => j.status === 'Applied').length,
                PENDING_QA: jobs.filter(j => j.status === 'Pending Q&A').length,
                MANUAL_APPLY: jobs.filter(j => j.status === 'Manual Apply Needed').length,
                INTERNSHIPS: jobs.filter(j => j.title?.toLowerCase().includes('intern') || (j as any).isInternship).length
              };

              return (['ALL', 'APPLIED', 'PENDING_QA', 'MANUAL_APPLY', 'INTERNSHIPS'] as const).map(tab => {
                const unseen = tabCounts[tab] - (seenCounts[tab] || 0);
                return (
                  <button
                    key={tab}
                    onClick={() => {
                      setActiveTab(tab);
                      setSeenCounts(prev => ({ ...prev, [tab]: tabCounts[tab] }));
                    }}
                    className={`px-4 py-2 rounded-lg text-[11px] font-bold transition-all flex items-center ${activeTab === tab ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-zinc-100 dark:bg-zinc-900/50 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800'}`}
                  >
                    {tab.replace('_', ' ')}
                    {unseen > 0 && (
                      <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${activeTab === tab ? 'bg-white/20 text-white' : 'bg-red-500 text-white'}`}>
                        {unseen}
                      </span>
                    )}
                  </button>
                );
              });
            })()}
          </div>
          <div className="overflow-x-auto flex-1 mt-2">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/30 bg-muted/40 dark:bg-zinc-950/15">
                  <th className="px-6 py-4 font-heading font-semibold text-xs text-muted-foreground uppercase tracking-wider">Job Opportunity</th>
                  <th className="px-6 py-4 font-heading font-semibold text-xs text-muted-foreground uppercase tracking-wider">Company</th>
                  <th className="px-6 py-4 font-heading font-semibold text-xs text-muted-foreground uppercase tracking-wider hidden md:table-cell">Metadata</th>
                  <th className="px-6 py-4 font-heading font-semibold text-xs text-muted-foreground uppercase tracking-wider text-center">Relevance</th>
                  <th className="px-6 py-4 font-heading font-semibold text-xs text-muted-foreground uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20 dark:divide-zinc-900/35">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="h-18">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-6 py-4">
                          <div className="h-4 rounded bg-zinc-200 dark:bg-zinc-900 animate-pulse" style={{ width: `${50 + ((i * 7 + j * 13) % 40)}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filteredAndSortedJobs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center gap-3 max-w-sm mx-auto">
                        <div className="p-4 rounded-full bg-zinc-100 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800">
                          <SlidersHorizontal className="h-6 w-6 text-zinc-500" />
                        </div>
                        <h4 className="font-semibold text-sm text-zinc-700 dark:text-zinc-300">No Matching Jobs Tracked</h4>
                        <p className="text-xs text-muted-foreground">
                          Try adjusting search terms or status toggles to reveal hidden jobs feed.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedJobs.map((job, idx) => {
                    const isManualApply = job.status === "Manual Apply Needed";
                    const isApplied = job.status === "Applied";
                    const isPendingQA = job.status === "Pending Q&A";
                    const isQATimeout = job.status === "Manual Review (Q&A Timeout)";
                    const score = job.relevanceScore || 0;

                    // Progress Ring Setup
                    const radius = 12;
                    const stroke = 3;
                    const normalizedRadius = radius - stroke * 2;
                    const circumference = normalizedRadius * 2 * Math.PI;
                    const strokeDashoffset = circumference - (score / 100) * circumference;

                    const scoreColorClass = 
                      score >= 80 ? 'text-emerald-500' :
                      score >= 50 ? 'text-amber-500' : 'text-zinc-500';

                    return (
                      <motion.tr
                        key={job.id || idx}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(idx * 0.02, 0.4) }}
                        className="hover:bg-zinc-100/50 dark:hover:bg-zinc-900/20 transition-all duration-200 group cursor-pointer"
                        onClick={() => {
                          if (job.resumeChecklist) {
                            setSelectedJob(job);
                            setDrawerTab("checklist");
                          }
                        }}
                      >
                        {/* Title Info */}
                        <td className="px-6 py-4.5 max-w-[240px]">
                          <div className="flex flex-col gap-1">
                            {job.url ? (
                              <a
                                href={job.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors inline-flex items-center gap-1.5 leading-snug hover:underline underline-offset-2"
                              >
                                <span className="line-clamp-2">{job.title}</span>
                                <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </a>
                            ) : (
                              <span className="font-semibold text-xs text-foreground line-clamp-2 leading-snug">{job.title}</span>
                            )}
                            {job.resumeChecklist && (
                              <div className="inline-flex items-center gap-1 w-max px-1.5 py-0.5 rounded bg-primary/10 border border-primary/15 text-[9px] font-extrabold text-primary animate-pulse">
                                <Sparkles className="w-2.5 h-2.5" />
                                <span>Checklist Ready</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Company */}
                        <td className="px-6 py-4.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                          {job.company}
                        </td>

                        {/* Metadata (Location & Date) */}
                        <td className="px-6 py-4.5 text-xs text-muted-foreground hidden md:table-cell">
                          <div className="flex flex-col gap-0.5 font-medium">
                            <span className="truncate max-w-[140px] text-[11px] text-zinc-600 dark:text-zinc-400">{job.location || 'Remote'}</span>
                            <span 
                              className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono"
                              title={job.posted ? `Hunter posted: ${job.posted}` : 'No Hunter post date'}
                            >
                              Scouted: {timeAgo(job.capturedAt)}
                            </span>
                          </div>
                        </td>

                        {/* Relevance Ring */}
                        <td className="px-6 py-4.5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="relative inline-flex items-center justify-center shrink-0">
                              <svg className="w-8 h-8 transform -rotate-90">
                                <circle
                                  cx="16"
                                  cy="16"
                                  r={radius}
                                  className="stroke-zinc-200 dark:stroke-zinc-800 fill-none"
                                  strokeWidth={stroke}
                                />
                                <circle
                                  cx="16"
                                  cy="16"
                                  r={radius}
                                  className={`fill-none transition-all duration-700 ${
                                    score >= 80 ? 'stroke-emerald-500' :
                                    score >= 50 ? 'stroke-amber-500' : 'stroke-zinc-700'
                                  }`}
                                  strokeWidth={stroke}
                                  strokeDasharray={circumference}
                                  strokeDashoffset={strokeDashoffset}
                                  strokeLinecap="round"
                                />
                              </svg>
                              <span className={`absolute text-[9px] font-bold ${scoreColorClass}`}>{score}%</span>
                            </div>
                          </div>
                        </td>

                        {/* Status Pills */}
                        <td className="px-6 py-4.5">
                          <div className="inline-flex items-center text-xs">
                            {isApplied ? (
                              <span className="text-emerald-400 font-bold flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                ✓ Applied
                              </span>
                            ) : isPendingQA ? (
                              <span className="text-blue-400 font-bold flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20">
                                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                                Pending Q&A
                              </span>
                            ) : isManualApply ? (
                              <span className="text-amber-400 font-bold flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                                Manual Apply
                              </span>
                            ) : isQATimeout ? (
                              <span className="text-orange-400 font-bold flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20">
                                <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                                Q&A Timeout
                              </span>
                            ) : (
                              <span className="text-muted-foreground font-semibold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80">
                                {job.status || 'Not Applied'}
                              </span>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sweep History Logs (Right 1 column) */}
        <div className="glass-panel rounded-2xl overflow-hidden border border-glass-border/30 bg-white/40 dark:bg-zinc-950/20 shadow-xl flex flex-col h-full">
          
          <div className="px-6 py-5 border-b border-border/40 bg-zinc-100/50 dark:bg-zinc-900/10 flex items-center justify-between">
            <h3 className="font-heading font-bold text-base flex items-center gap-2.5 text-foreground/90">
              <Activity className="h-4.5 w-4.5 text-primary" /> Sweep History
            </h3>
            <span className="text-xs font-semibold text-muted-foreground bg-zinc-100 dark:bg-zinc-900/40 px-2.5 py-1 rounded-lg">
              {runLogs.length} Scans
            </span>
          </div>

          <div className="p-4 flex-1 overflow-y-auto max-h-[560px] space-y-3 scrollbar-thin">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-zinc-900 animate-pulse" />
              ))
            ) : runLogs.length === 0 ? (
              <div className="text-center text-muted-foreground py-16 text-xs font-medium">
                No past sweeps recorded.
              </div>
            ) : (
              runLogs.map((log) => {
                const isExpanded = expandedLogId === log.id;
                const totalActions = log.actions?.length || 0;
                const totalWarnings = log.warnings?.length || 0;

                return (
                  <div
                    key={log.id}
                    className="border border-border/30 rounded-xl overflow-hidden bg-zinc-100/20 dark:bg-zinc-900/20 hover:border-border/60 transition-all duration-200"
                  >
                    {/* Header Item */}
                    <button
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                      className="w-full text-left p-4 flex items-center justify-between gap-3 text-xs focus:outline-none"
                    >
                      <div className="space-y-1">
                        <div className="font-bold text-zinc-200">{formatDate(log.startedAt)}</div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                          <span className="font-medium">🔍 Found: {log.jobCount}</span>
                          <span>•</span>
                          <span className="font-medium">📋 Tracked: {log.trackerCount}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {totalWarnings > 0 && (
                          <span className="bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                            <AlertTriangle className="h-2.5 w-2.5" /> {totalWarnings}
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/15 px-2 py-0.5 rounded-lg">
                          {isExpanded ? 'Hide' : 'Open'}
                        </span>
                      </div>
                    </button>

                    {/* Actions and Warnings */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: 'auto' }}
                          exit={{ height: 0 }}
                          className="overflow-hidden border-t border-zinc-900 bg-zinc-950/40"
                        >
                          <div className="p-4 space-y-4 text-[10px] font-mono leading-relaxed">
                            {/* Warnings */}
                            {totalWarnings > 0 && (
                              <div className="space-y-1.5">
                                <div className="font-bold text-red-400 flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" /> Error Warnings:
                                </div>
                                <ul className="list-disc pl-4 space-y-1 text-red-400/80">
                                  {log.warnings.map((warn, wIdx) => (
                                    <li key={wIdx}>{warn}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Actions List */}
                            <div className="space-y-2">
                              <div className="font-bold text-zinc-300 flex items-center gap-1.5">
                                <Activity className="h-3 w-3 text-primary animate-pulse" /> Telemetry Traces:
                              </div>
                              {totalActions === 0 ? (
                                <div className="text-muted-foreground italic pl-1">No steps recorded in database.</div>
                              ) : (
                                <ul className="space-y-2 border-l border-zinc-200 dark:border-zinc-800 pl-3.5">
                                  {log.actions.map((act, aIdx) => (
                                    <li key={aIdx} className="text-muted-foreground relative py-0.5">
                                      <span className="absolute -left-[17.5px] top-[7px] h-1.5 w-1.5 rounded-full border border-primary/45 bg-background" />
                                      {act}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </motion.div>

      {/* Slide-over Side Panel for AI Resume Checklist */}
      <AnimatePresence>
        {selectedJob && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedJob(null)}
              className="fixed inset-0 bg-black/70 z-50 cursor-pointer backdrop-blur-sm"
            />
            {/* Panel Card */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 220 }}
              className="fixed inset-y-0 right-0 max-w-lg w-full bg-white/95 dark:bg-zinc-950/95 border-l border-border/40 shadow-2xl z-50 flex flex-col p-6 overflow-hidden backdrop-blur-md"
            >
              {/* Header */}
              <div className="flex items-start justify-between border-b border-zinc-200 dark:border-zinc-900 pb-4 mb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded font-black tracking-widest uppercase">
                      AI Job Tailor Assist
                    </span>
                  </div>
                  <h2 className="text-lg font-heading font-black text-foreground line-clamp-1 mt-1">{selectedJob.title}</h2>
                  <p className="text-xs text-muted-foreground font-semibold">{selectedJob.company}</p>
                </div>
                <button
                  onClick={() => setSelectedJob(null)}
                  className="p-1.5 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 rounded-lg"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Quick Info Summary */}
              <div className="grid grid-cols-2 gap-3 mb-5 bg-zinc-100/50 dark:bg-zinc-900/35 border border-zinc-200 dark:border-zinc-900 rounded-xl p-3.5 text-[11px] font-mono">
                <div className="flex flex-col gap-0.5">
                  <span className="text-zinc-500 dark:text-zinc-400 font-bold">MATCH VALUE:</span>
                  <span className="text-primary font-extrabold text-xs">{selectedJob.relevanceScore}% Grade</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-zinc-500 dark:text-zinc-400 font-bold">DECISION:</span>
                  <span className="text-amber-500 font-extrabold text-xs">Manual Review</span>
                </div>
              </div>

              {/* Details Tabs (Checklist vs Job Description) */}
              <div className="flex border-b border-zinc-200 dark:border-zinc-900 mb-4 text-xs font-semibold">
                <button
                  onClick={() => setDrawerTab("checklist")}
                  className={`flex items-center gap-1.5 pb-2 px-3 relative ${drawerTab === 'checklist' ? 'text-primary' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                >
                  <ListChecks className="w-3.5 h-3.5" />
                  <span>Resume Checklist</span>
                  {drawerTab === 'checklist' && (
                    <motion.div layoutId="drawerActiveTab" className="absolute bottom-0 inset-x-0 h-0.5 bg-primary" />
                  )}
                </button>
                <button
                  onClick={() => setDrawerTab("details")}
                  className={`flex items-center gap-1.5 pb-2 px-3 relative ${drawerTab === 'details' ? 'text-primary' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>Job Metadata</span>
                  {drawerTab === 'details' && (
                    <motion.div layoutId="drawerActiveTab" className="absolute bottom-0 inset-x-0 h-0.5 bg-primary" />
                  )}
                </button>
              </div>

              {/* Scrollable Content Body */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
                <AnimatePresence mode="wait">
                  {drawerTab === "checklist" ? (
                    <motion.div
                      key="checklist"
                      initial={{ opacity: 0, x: 5 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -5 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">ATS checklist modifications</h4>
                        <span className="text-[9px] text-muted-foreground font-mono">Click tasks to cross off</span>
                      </div>
                      <div className="border border-border/30 rounded-xl p-4.5 bg-zinc-50/50 dark:bg-zinc-950/60 max-h-[380px] overflow-y-auto scrollbar-thin">
                        {renderInteractiveMarkdown(selectedJob.resumeChecklist, selectedJob.id)}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="details"
                      initial={{ opacity: 0, x: 5 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -5 }}
                      className="space-y-4 text-xs"
                    >
                      <div className="bg-zinc-50/50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-900 rounded-xl p-4 space-y-3">
                        <div className="flex justify-between border-b border-zinc-200 dark:border-zinc-900 pb-2">
                          <span className="text-muted-foreground">Location:</span>
                          <span className="font-semibold text-zinc-800 dark:text-zinc-200">{selectedJob.location || 'Not Specified'}</span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-200 dark:border-zinc-900 pb-2">
                          <span className="text-muted-foreground">Date Scouted:</span>
                          <span className="font-mono text-zinc-800 dark:text-zinc-200">{formatDate(selectedJob.capturedAt)}</span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-200 dark:border-zinc-900 pb-2">
                          <span className="text-muted-foreground">Last Seen:</span>
                          <span className="font-mono text-zinc-800 dark:text-zinc-200">{formatDate(selectedJob.lastSeenAt)}</span>
                        </div>
                        <div className="flex justify-between pb-1">
                          <span className="text-muted-foreground">Decision Rationale:</span>
                          <span className="font-semibold text-indigo-400 capitalize">{selectedJob.matchDecision || 'Manual Review'}</span>
                        </div>
                      </div>

                      {selectedJob.url && (
                        <a
                          href={selectedJob.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold h-11 rounded-xl text-xs transition-opacity hover:opacity-90 mt-2"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>Apply on Hunter Platform</span>
                        </a>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
