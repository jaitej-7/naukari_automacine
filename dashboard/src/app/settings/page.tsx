"use client";

import { useEffect, useState, FormEvent } from "react";
import { Save, Loader2, Settings2, Plus, X } from "lucide-react";
import { motion } from "framer-motion";

type Config = {
  headless: boolean;
  keywords: string[];
};

export default function SettingsPage() {
  const [config, setConfig] = useState<Config>({ headless: true, keywords: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");

  useEffect(() => {
    fetch("/api/config")
      .then(res => res.json())
      .then(data => {
        if (data) {
          setConfig({
            headless: data.browser?.headless ?? true,
            keywords: data.jobs?.includeKeywords ?? []
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      // Mock success or show toast here
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const addKeyword = () => {
    if (keywordInput.trim() && !config.keywords.includes(keywordInput.trim())) {
      setConfig({ ...config, keywords: [...config.keywords, keywordInput.trim()] });
      setKeywordInput("");
    }
  };

  const removeKeyword = (keyword: string) => {
    setConfig({ ...config, keywords: config.keywords.filter(k => k !== keyword) });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-muted-foreground animate-pulse">Loading preferences...</p>
        </div>
      </div>
    );
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  } as const;

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
  } as const;

  return (
    <motion.div 
      className="max-w-3xl mx-auto space-y-10 py-6"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <motion.div variants={itemVariants} className="flex items-center gap-4">
        <div className="p-3 rounded-2xl bg-primary/10 text-primary">
          <Settings2 className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-pink-500">
            Settings
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">Customize your automated job hunting bot.</p>
        </div>
      </motion.div>

      <motion.form variants={itemVariants} onSubmit={handleSave} className="space-y-8">
        <div className="glass-panel rounded-3xl p-8 space-y-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
            <Settings2 className="h-40 w-40 text-primary translate-x-8 -translate-y-8" />
          </div>

          {/* Headless Mode Toggle */}
          <div className="flex items-center justify-between relative z-10">
            <div className="space-y-1">
              <label className="text-lg font-semibold tracking-tight">Stealth Mode (Headless)</label>
              <p className="text-sm text-muted-foreground max-w-md">Run the browser invisibly in the background. Disabling this will show the automated browser actions.</p>
            </div>
            <button
              type="button"
              onClick={() => setConfig({ ...config, headless: !config.headless })}
              className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${config.headless ? 'bg-primary' : 'bg-muted-foreground/30'}`}
            >
              <span className="sr-only">Toggle Headless Mode</span>
              <span
                className={`pointer-events-none block h-6 w-6 rounded-full bg-white shadow-lg ring-0 transition-transform ${config.headless ? 'translate-x-6' : 'translate-x-0'}`}
              />
            </button>
          </div>

          <div className="w-full h-px bg-border/40 relative z-10" />

          {/* Keywords Section */}
          <div className="space-y-5 relative z-10">
            <div className="space-y-1">
              <label className="text-lg font-semibold tracking-tight">Target Keywords</label>
              <p className="text-sm text-muted-foreground">The bot will prioritize jobs containing these exact phrases.</p>
            </div>
            
            <div className="flex space-x-3">
              <input
                type="text"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                placeholder="e.g. Senior Frontend Developer"
                className="flex h-12 w-full rounded-xl border border-border/50 bg-background/50 px-4 py-2 text-base ring-offset-background placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-all shadow-inner"
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                type="button"
                onClick={addKeyword}
                className="inline-flex items-center justify-center rounded-xl bg-secondary/80 hover:bg-secondary px-6 py-2 text-sm font-semibold text-secondary-foreground transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 shadow-sm border border-border/50"
              >
                <Plus className="w-4 h-4 mr-2" /> Add
              </motion.button>
            </div>

            <motion.div layout className="flex flex-wrap gap-2 pt-2 min-h-[50px]">
              {config.keywords.map(keyword => (
                <motion.span
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  key={keyword}
                  className="inline-flex items-center gap-2 rounded-full bg-primary/10 border border-primary/20 px-4 py-1.5 text-sm font-semibold text-primary shadow-sm"
                >
                  {keyword}
                  <button
                    type="button"
                    onClick={() => removeKeyword(keyword)}
                    className="rounded-full hover:bg-primary/20 p-1 transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </motion.span>
              ))}
              {config.keywords.length === 0 && (
                <motion.span 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  className="text-sm text-muted-foreground italic flex items-center h-full"
                >
                  No keywords added yet. Add some to refine your job search.
                </motion.span>
              )}
            </motion.div>
          </div>
        </div>

        <motion.div variants={itemVariants} className="flex justify-end pt-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            type="submit"
            disabled={saving}
            className="group relative inline-flex items-center justify-center rounded-xl bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_30px_rgba(99,102,241,0.6)] overflow-hidden"
          >
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
            <span className="relative flex items-center space-x-2">
              {saving ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Saving Configuration...</span>
                </>
              ) : (
                <>
                  <Save className="h-5 w-5" />
                  <span>Save Preferences</span>
                </>
              )}
            </span>
          </motion.button>
        </motion.div>
      </motion.form>
    </motion.div>
  );
}
