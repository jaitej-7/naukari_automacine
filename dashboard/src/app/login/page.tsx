"use client";

import { useState, FormEvent } from "react";
import { Lock, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        router.push("/");
        router.refresh();
      } else {
        setError(data.error || "Incorrect access key. Please verify and retry.");
        setLoading(false);
      }
    } catch (err) {
      setError("Failed to establish server connection. Try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 overflow-hidden relative bg-[#030307]">
      {/* Dynamic Background Glows */}
      <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-primary/10 rounded-full blur-[140px] pointer-events-none animate-pulse-ring" />
      <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] bg-pink-500/8 rounded-full blur-[140px] pointer-events-none" />

      {/* Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 120, damping: 22 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="glass-panel rounded-[2rem] p-10 space-y-8 relative overflow-hidden shadow-2xl border border-glass-border/40 backdrop-blur-2xl bg-zinc-950/45">
          {/* Neon Top Accent Gradient Line */}
          <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-primary via-purple-500 to-pink-500" />
          
          <div className="flex flex-col items-center space-y-4 text-center">
            <motion.div
              whileHover={{ scale: 1.08, rotate: 3 }}
              whileTap={{ scale: 0.96 }}
              className="p-4 rounded-2xl bg-gradient-to-tr from-primary/10 to-pink-500/10 text-primary border border-primary/20 shadow-lg shadow-primary/5 flex items-center justify-center"
            >
              <Lock className="w-7 h-7 text-indigo-400" />
            </motion.div>
            <div className="space-y-1">
              <h1 className="text-3xl font-heading font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground via-zinc-200 to-zinc-400">
                Stealth Automachine
              </h1>
              <p className="text-muted-foreground text-sm font-medium">
                Enter your password to unlock the dashboard
              </p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2.5">
              <label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase pl-1">
                Access Token / Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  disabled={loading}
                  className="flex h-14 w-full rounded-2xl border border-border/40 bg-zinc-900/35 px-5 py-3 text-base text-center font-mono tracking-widest placeholder:text-muted-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:border-primary transition-all shadow-inner"
                />
              </div>
            </div>

            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: -8, height: 0 }}
                  className="flex items-center gap-3 text-sm text-red-400 bg-red-950/15 border border-red-500/15 p-4 rounded-xl font-medium"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading || !password}
              className="group w-full relative inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-primary to-indigo-600 h-14 text-sm font-bold text-white transition-all disabled:opacity-50 disabled:pointer-events-none shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 overflow-hidden cursor-pointer"
            >
              <span className="relative flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Verifying Access Token...</span>
                  </>
                ) : (
                  <>
                    <span>Unlock Dashboard</span>
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </span>
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
