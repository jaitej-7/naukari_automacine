"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, FileText, Briefcase, Zap, ExternalLink, Clock, AlertTriangle, Activity } from "lucide-react";
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
  url?: string;
  matchDecision?: string;
};

type BotStatus = {
  running: boolean;
  lastRun: string | null;
  pid: number | null;
  log?: string;
};

export default function Dashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [botStatus, setBotStatus] = useState<BotStatus>({ running: false, lastRun: null, pid: null });
  const [loading, setLoading] = useState(true);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      const data = await res.json().catch(() => ({}));
      setJobs(Array.isArray(data?.tracker) ? data.tracker : []);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBotStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/run");
      const data = await res.json();
      setBotStatus(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchBotStatus();
  }, [fetchJobs, fetchBotStatus]);

  // Poll bot status every 5 seconds
  useEffect(() => {
    const interval = setInterval(fetchBotStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchBotStatus]);

  // Refresh jobs when bot finishes
  useEffect(() => {
    if (!botStatus.running && botStatus.lastRun) {
      fetchJobs();
    }
  }, [botStatus.running, botStatus.lastRun, fetchJobs]);

  const runBot = async () => {
    if (botStatus.running) return;
    setBotStatus(s => ({ ...s, running: true }));
    try {
      await fetch("/api/run", { method: "POST" });
    } catch {}
  };

  const totalJobs = jobs.length;
  const strongMatches = jobs.filter(j => j.relevanceScore >= 80 || j.matchDecision === 'Strong Match').length;
  const appliedJobs = jobs.filter(j => j.status === "Applied").length;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const getScoreColor = (score: number, decision?: string) => {
    if (decision === 'Strong Match' || score >= 80) return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
    if (score >= 50) return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
    return 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400';
  };

  return (
    <motion.div
      className="space-y-8 py-4"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-pink-500">
            Overview
          </h1>
          <p className="text-muted-foreground mt-1 text-base">Monitor your automated job applications in real-time.</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={runBot}
          disabled={botStatus.running}
          className="relative group inline-flex items-center justify-center rounded-xl bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground transition-all focus-visible:outline-none disabled:opacity-60 disabled:pointer-events-none shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_30px_rgba(99,102,241,0.6)] overflow-hidden"
        >
          <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
          <span className="relative flex items-center gap-2">
            {botStatus.running ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                <span>Bot Running...</span>
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                <span>Initialize Bot</span>
              </>
            )}
          </span>
        </motion.button>
      </motion.div>

      {/* Live Bot Status Banner */}
      <AnimatePresence>
        {(botStatus.running || botStatus.lastRun) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={`glass-panel rounded-xl px-5 py-3 flex items-center gap-3 text-sm ${botStatus.running ? 'border-primary/30' : 'border-border/40'}`}
          >
            <div className={`relative flex h-2.5 w-2.5`}>
              {botStatus.running && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${botStatus.running ? 'bg-primary' : 'bg-emerald-500'}`}></span>
            </div>
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">
              {botStatus.running ? 'Bot is running — searching and applying to jobs...' : 'Bot is idle'}
            </span>
            {botStatus.lastRun && (
              <span className="ml-auto text-muted-foreground flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Last run: {formatDate(botStatus.lastRun)}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats Cards */}
      <motion.div variants={itemVariants} className="grid gap-5 md:grid-cols-3">
        {[
          { title: "Total Opportunities", icon: Briefcase, value: totalJobs, color: "text-blue-500", bg: "bg-blue-500/10" },
          { title: "Strong Matches", icon: Zap, value: strongMatches, color: "text-amber-500", bg: "bg-amber-500/10" },
          { title: "Successfully Applied", icon: CheckCircle2, value: appliedJobs, color: "text-emerald-500", bg: "bg-emerald-500/10" }
        ].map((stat, i) => (
          <motion.div
            key={i}
            whileHover={{ y: -4 }}
            className="glass-panel rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden group cursor-default"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <stat.icon className={`h-24 w-24 ${stat.color} translate-x-4 -translate-y-4`} />
            </div>
            <div className="flex items-center gap-3 pb-4 relative z-10">
              <div className={`p-2.5 rounded-xl ${stat.bg}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <h3 className="text-sm font-medium text-muted-foreground">{stat.title}</h3>
            </div>
            <div className="text-4xl font-extrabold relative z-10">
              {loading ? <div className="h-10 w-16 rounded-lg bg-muted animate-pulse" /> : stat.value}
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Jobs Table */}
      <motion.div variants={itemVariants} className="glass-panel rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border/40 bg-muted/10 flex items-center justify-between">
          <h3 className="font-semibold text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> Recent Job Activity
          </h3>
          <span className="text-xs text-muted-foreground">{jobs.length} jobs tracked</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-muted-foreground border-b border-border/40 bg-muted/5">
              <tr>
                <th className="px-5 py-3.5 font-semibold uppercase tracking-wider text-xs">Job Title</th>
                <th className="px-5 py-3.5 font-semibold uppercase tracking-wider text-xs">Company</th>
                <th className="px-5 py-3.5 font-semibold uppercase tracking-wider text-xs hidden md:table-cell">Location</th>
                <th className="px-5 py-3.5 font-semibold uppercase tracking-wider text-xs hidden md:table-cell">Captured</th>
                <th className="px-5 py-3.5 font-semibold uppercase tracking-wider text-xs text-center">Score</th>
                <th className="px-5 py-3.5 font-semibold uppercase tracking-wider text-xs">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 rounded bg-muted animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-3">
                      <AlertTriangle className="h-8 w-8 opacity-30" />
                      <p>No jobs found. Initialize the bot to start discovering opportunities.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                jobs.map((job, idx) => (
                  <motion.tr
                    key={job.id || idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(idx * 0.03, 0.5) }}
                    className="hover:bg-muted/30 transition-colors group"
                  >
                    {/* Clickable Job Title */}
                    <td className="px-5 py-4 font-medium max-w-[220px]">
                      {job.url ? (
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-1.5 text-foreground group-hover:text-primary transition-colors hover:underline underline-offset-2"
                        >
                          <span className="line-clamp-2">{job.title}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                      ) : (
                        <span className="text-foreground line-clamp-2">{job.title}</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{job.company}</td>
                    <td className="px-5 py-4 text-muted-foreground text-xs hidden md:table-cell max-w-[160px] truncate">{job.location}</td>
                    <td className="px-5 py-4 text-muted-foreground text-xs hidden md:table-cell whitespace-nowrap">{formatDate(job.capturedAt)}</td>
                    <td className="px-5 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${getScoreColor(job.relevanceScore, job.matchDecision)}`}>
                        {job.relevanceScore}%
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center text-xs font-medium">
                        {job.status === "Applied" ? (
                          <span className="text-emerald-500 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Applied
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{job.status || 'Not Applied'}</span>
                        )}
                      </span>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  );
}
