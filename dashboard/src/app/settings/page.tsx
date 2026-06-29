"use client";

import { useEffect, useState, FormEvent } from "react";
import { 
  Save, Loader2, Settings2, Plus, X, Upload, 
  Eye, EyeOff, Calendar, Sliders, MessageSquare, 
  Trash2, Edit3, HelpCircle, BellRing, Brain, Lock,
  ChevronRight, Sparkles, Send, ShieldAlert, BookOpen,
  Search
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Config = {
  headless: boolean;
  keywords: string[];
  naukriEmail: string;
  naukriPasswordSet: boolean;
  geminiApiKey: string;
  careerStartDate: string;
  customFields: Record<string, string>;
  discordWebhookUrl: string;
  discordBotToken: string;
  discordQaChannelId: string;
  schedulerEnabled: boolean;
  schedulerIntervalMin: number;
  qaMemory: Record<string, string>;
  refreshProfile: boolean;
};

type TabType = "resume" | "credentials" | "scheduler" | "profile" | "discord" | "qa" | "danger";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabType>("resume");
  const [config, setConfig] = useState<Config>({
    headless: true,
    keywords: [],
    naukriEmail: "",
    naukriPasswordSet: false,
    geminiApiKey: "",
    careerStartDate: "",
    customFields: {},
    discordWebhookUrl: "",
    discordBotToken: "",
    discordQaChannelId: "",
    schedulerEnabled: false,
    schedulerIntervalMin: 60,

    qaMemory: {},
    refreshProfile: true
  });

  const [publicKey, setPublicKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Local input states
  const [keywordInput, setKeywordInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [customKey, setCustomKey] = useState("");
  const [customVal, setCustomVal] = useState("");
  
  // Resume upload states
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [resumeTextLength, setResumeTextLength] = useState<number | null>(null);

  // Q&A memory editor states
  const [qaSearch, setQaSearch] = useState("");
  const [editingQaKey, setEditingQaKey] = useState<string | null>(null);
  const [editingQaVal, setEditingQaVal] = useState("");
  
  // Danger Zone Clear Data Modal
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Webhook Test utility state
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [webhookTestStatus, setWebhookTestStatus] = useState<"idle" | "success" | "error">("idle");

  const handleClearData = async () => {
    setClearing(true);
    try {
      const res = await fetch("/api/jobs", { method: "DELETE" });
      if (res.ok) {
        alert("✅ All job board, bot run tracks, and telemetry data successfully cleared!");
      } else {
        alert("❌ Failed to clear tables.");
      }
    } catch (err) {
      console.error(err);
      alert("❌ Server connection lost while clearing.");
    } finally {
      setClearing(false);
      setShowClearConfirm(false);
    }
  };

  const handleTestWebhook = async () => {
    if (!config.discordWebhookUrl) return;
    setWebhookTesting(true);
    setWebhookTestStatus("idle");
    try {
      const payload = {
        embeds: [{
          title: "🔔 Hunter Bot Webhook Diagnostic",
          description: "This is a successful connection diagnostic test triggered from your dashboard controller panel.",
          color: 6513905, // Indigo HSL equivalent
          timestamp: new Date().toISOString(),
          footer: { text: "Hunter Automachine v1.1" }
        }]
      };
      
      const res = await fetch(config.discordWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setWebhookTestStatus("success");
      } else {
        setWebhookTestStatus("error");
      }
    } catch {
      setWebhookTestStatus("error");
    } finally {
      setWebhookTesting(false);
    }
  };

  useEffect(() => {
    fetch("/api/config")
      .then(res => res.json())
      .then(data => {
        if (data) {
          setConfig({
            headless: data.browser?.headless ?? true,
            keywords: data.jobs?.includeKeywords ?? [],
            naukriEmail: data.naukriEmail ?? "",
            naukriPasswordSet: !!data.naukriPassword,
            geminiApiKey: data.geminiApiKey ?? "",
            careerStartDate: data.careerStartDate ?? "",
            customFields: data.customFields ?? {},
            discordWebhookUrl: data.discordWebhookUrl ?? "",
            discordBotToken: data.discordBotToken ?? "",
            discordQaChannelId: data.discordQaChannelId ?? "",
            schedulerEnabled: data.schedulerEnabled ?? false,
            schedulerIntervalMin: data.schedulerIntervalMin ?? 60,

            qaMemory: data.applications?.qaMemory ?? {},
            refreshProfile: data.profile?.refreshProfile ?? true
          });
          setPublicKey(data.publicKey ?? "");
          if (data.resume?.resumeText) {
            setResumeTextLength(data.resume.resumeText.length);
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = {
        browser: { headless: config.headless },
        jobs: { includeKeywords: config.keywords },
        naukriEmail: config.naukriEmail,
        geminiApiKey: config.geminiApiKey,
        careerStartDate: config.careerStartDate,
        customFields: config.customFields,
        discordWebhookUrl: config.discordWebhookUrl,
        discordBotToken: config.discordBotToken,
        discordQaChannelId: config.discordQaChannelId,
        schedulerEnabled: config.schedulerEnabled,
        schedulerIntervalMin: config.schedulerIntervalMin,
        applications: { qaMemory: config.qaMemory },
        profile: { refreshProfile: config.refreshProfile },
        publicKey: publicKey
      };

      if (passwordInput.trim()) {
        payload.naukriPassword = passwordInput;
      }

      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setPasswordInput("");
        setConfig(prev => ({ ...prev, naukriPasswordSet: passwordInput.trim() ? true : prev.naukriPasswordSet }));
        alert("Configuration preferences saved!");
      } else {
        alert("Failed to write to database.");
      }
    } catch (error) {
      console.error(error);
      alert("Save operation connection failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleResumeUpload = async () => {
    if (!resumeFile) return;
    setUploading(true);
    setUploadMessage("");
    
    const formData = new FormData();
    formData.append("file", resumeFile);

    try {
      const res = await fetch("/api/resume", {
        method: "POST",
        body: formData
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setUploadMessage(`✅ Resume text successfully parsed! (${data.textLength} characters cached).`);
        setResumeTextLength(data.textLength);
        setResumeFile(null);
      } else {
        setUploadMessage(`❌ Upload aborted: ${data.error}`);
      }
    } catch (err) {
      setUploadMessage("❌ Upload connection failed.");
    } finally {
      setUploading(false);
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

  const addCustomField = () => {
    if (customKey.trim() && customVal.trim()) {
      setConfig({
        ...config,
        customFields: { ...config.customFields, [customKey.trim()]: customVal.trim() }
      });
      setCustomKey("");
      setCustomVal("");
    }
  };

  const removeCustomField = (key: string) => {
    const updated = { ...config.customFields };
    delete updated[key];
    setConfig({ ...config, customFields: updated });
  };

  const saveQaMemoryEdit = (key: string) => {
    const updated = { ...config.qaMemory, [key]: editingQaVal.trim() };
    setConfig({ ...config, qaMemory: updated });
    setEditingQaKey(null);
    setEditingQaVal("");
  };

  const deleteQaMemoryKey = (key: string) => {
    const updated = { ...config.qaMemory };
    delete updated[key];
    setConfig({ ...config, qaMemory: updated });
  };

  const getExperiencePreview = () => {
    if (!config.careerStartDate) return "No date set";
    const start = new Date(config.careerStartDate);
    const now = new Date();
    if (isNaN(start.getTime())) return "Invalid Date";
    
    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();
    if (months < 0) {
      years--;
      months += 12;
    }
    return `${years} Years, ${months} Months`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-9 h-9 animate-spin text-primary" />
          <p className="text-muted-foreground animate-pulse text-xs font-semibold">Configuring environment settings...</p>
        </div>
      </div>
    );
  }

  const filteredQa = Object.entries(config.qaMemory).filter(([k, v]) => 
    k?.toLowerCase().includes(qaSearch?.toLowerCase() || "") || 
    v?.toLowerCase().includes(qaSearch?.toLowerCase() || "")
  );

  const tabs: { id: TabType; label: string; icon: any; desc: string }[] = [
    { id: "resume", label: "Master Resume", icon: BookOpen, desc: "Supabase cloud resume PDF storage" },
    { id: "credentials", label: "Login Access", icon: Lock, desc: "Hunter email password & browser headless" },
    { id: "scheduler", label: "Sweeper Timer", icon: Calendar, desc: "Auto scan sweep frequency configuration" },
    { id: "profile", label: "ATS profile & tags", icon: Sliders, desc: "Keywords and manual screening values" },
    { id: "discord", label: "Discord integration", icon: BellRing, desc: "Webhook channels and gateway bots" },
    { id: "qa", label: "Saved Q&A Answers", icon: Brain, desc: "AI screening answers history editor" },
    { id: "danger", label: "Danger zone", icon: Trash2, desc: "Wipe tracker logs history" }
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8 py-2">
      
      {/* Title Widget */}
      <div className="flex items-center gap-4">
        <div className="p-3.5 rounded-2xl bg-gradient-to-tr from-primary/10 to-indigo-500/10 text-primary border border-primary/20 shadow-lg">
          <Settings2 className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-heading font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground via-zinc-200 to-zinc-400">
            Control Center
          </h1>
          <p className="text-muted-foreground text-xs font-semibold">
            Manage your profiles, automated sweeper timers, and notification webhooks.
          </p>
        </div>
      </div>

      {/* Main Settings Grid Workspace */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
        
        {/* Left Side: Navigation Tabs Column */}
        <div className="md:col-span-1 flex flex-row md:flex-col overflow-x-auto md:overflow-visible gap-1 pb-3 md:pb-0 scrollbar-thin">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setActiveTab(t.id);
                  if (t.id === "danger") setShowClearConfirm(false);
                }}
                className={`flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all border shrink-0 md:shrink ${
                  isActive 
                    ? 'bg-primary/10 border-primary/20 text-primary shadow-sm' 
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-zinc-900/40'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : 'text-zinc-500'}`} />
                <span className="whitespace-nowrap">{t.label}</span>
                <ChevronRight className={`w-3.5 h-3.5 ml-auto hidden md:block opacity-0 transition-opacity ${isActive ? 'opacity-100' : ''}`} />
              </button>
            );
          })}
        </div>

        {/* Right Side: Settings Content Card */}
        <div className="md:col-span-3">
          <form onSubmit={handleSave} className="space-y-6">
            <div className="glass-panel rounded-2xl border border-glass-border/30 bg-zinc-950/20 shadow-xl overflow-hidden p-6 md:p-8 min-h-[420px]">
              
              <AnimatePresence mode="wait">
                {/* 1. Resume Storage Tab */}
                {activeTab === "resume" && (
                  <motion.div
                    key="resume"
                    initial={{ opacity: 0, x: 4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                    className="space-y-6"
                  >
                    <div className="border-b border-zinc-900 pb-3">
                      <h2 className="text-base font-heading font-black text-zinc-100 flex items-center gap-2">
                        <BookOpen className="w-4.5 h-4.5 text-primary" /> Master Resume PDF Storage
                      </h2>
                      <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">
                        Upload your resume PDF to Supabase Storage. The runner daemon automatically downloads it during scans.
                      </p>
                    </div>

                    <div className="bg-zinc-900/35 border border-zinc-900/70 p-6 rounded-2xl flex flex-col items-center justify-center text-center space-y-4 relative group hover:border-primary/25 transition-all">
                      <div className="p-4 rounded-full bg-primary/5 border border-primary/10 group-hover:scale-105 transition-transform duration-300">
                        <Upload className="w-6 h-6 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-zinc-200">
                          {resumeFile ? resumeFile.name : 'Select Master Resume PDF'}
                        </p>
                        <p className="text-[10px] text-zinc-500">Only PDF formats are supported.</p>
                      </div>
                      
                      <input 
                        type="file" 
                        accept=".pdf"
                        onChange={(e) => {
                          setResumeFile(e.target.files?.[0] || null);
                          setUploadMessage("");
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full"
                      />
                    </div>

                    {resumeTextLength ? (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold w-max">
                        <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                        <span>ATS Resume parsing cached ({resumeTextLength} characters stored)</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold w-max">
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span>No resume text parse cache saved. Upload to initialize.</span>
                      </div>
                    )}

                    {resumeFile && (
                      <button
                        type="button"
                        onClick={handleResumeUpload}
                        disabled={uploading}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-primary to-indigo-600 font-bold px-4 h-11 rounded-xl text-xs text-white transition-opacity disabled:opacity-50 cursor-pointer"
                      >
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        <span>Parse and Upload PDF to Supabase</span>
                      </button>
                    )}

                    {uploadMessage && (
                      <p className="text-[10px] font-semibold text-center text-zinc-300 animate-pulse">{uploadMessage}</p>
                    )}
                  </motion.div>
                )}

                {/* 2. Credentials Settings Tab */}
                {activeTab === "credentials" && (
                  <motion.div
                    key="credentials"
                    initial={{ opacity: 0, x: 4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                    className="space-y-6"
                  >
                    <div className="border-b border-zinc-900 pb-3">
                      <h2 className="text-base font-heading font-black text-zinc-100 flex items-center gap-2">
                        <Lock className="w-4.5 h-4.5 text-primary" /> Hunter Login Credentials
                      </h2>
                      <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">
                        Securely store access emails and password. Encryption is run client-side.
                      </p>
                    </div>

                    <div className="grid gap-5 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider pl-0.5">Hunter Login Email</label>
                        <input
                          type="email"
                          value={config.naukriEmail}
                          onChange={(e) => setConfig({ ...config, naukriEmail: e.target.value })}
                          placeholder="email@example.com"
                          className="flex h-11 w-full rounded-xl border border-border/50 bg-zinc-900/30 px-4 text-xs focus:outline-none focus:ring-1 focus:ring-primary shadow-inner"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider pl-0.5">Password</label>
                        <div className="relative">
                          <input
                            type={showPassword ? "text" : "password"}
                            value={passwordInput}
                            onChange={(e) => setPasswordInput(e.target.value)}
                            placeholder={config.naukriPasswordSet ? "•••••••• (Encrypted in Cloud)" : "Enter access password"}
                            className="flex h-11 w-full rounded-xl border border-border/50 bg-zinc-900/30 px-4 pr-10 text-xs focus:outline-none focus:ring-1 focus:ring-primary shadow-inner"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3.5 top-3 text-zinc-500 hover:text-zinc-300"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Gemini AI Key Input */}
                    <div className="space-y-2 pt-2 border-t border-zinc-900 mt-4">
                      <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider pl-0.5 flex items-center gap-2">
                        <Brain className="w-3.5 h-3.5 text-primary" /> Gemini AI API Token
                      </label>
                      <input
                        type="password"
                        value={config.geminiApiKey}
                        onChange={(e) => setConfig({ ...config, geminiApiKey: e.target.value })}
                        placeholder="AIzaSy..."
                        className="flex h-11 w-full rounded-xl border border-border/50 bg-zinc-900/30 px-4 text-xs focus:outline-none focus:ring-1 focus:ring-primary shadow-inner"
                      />
                      <p className="text-[10px] text-muted-foreground font-medium pl-1">
                        Leave blank to use the default system AI key. Required for AI-powered screening question answering.
                      </p>
                    </div>

                    {/* Headless Toggle */}
                    <div className="flex items-center justify-between bg-zinc-900/20 border border-zinc-900 rounded-xl p-4.5 mt-2">
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-zinc-200">Stealth Scraper sweeps (Headless mode)</span>
                        <p className="text-[10px] text-muted-foreground font-medium">Keep the Playwright scraper window hidden inside background threads.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setConfig({ ...config, headless: !config.headless })}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-all focus:outline-none ${config.headless ? 'bg-primary' : 'bg-zinc-800'}`}
                      >
                        <span className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform ${config.headless ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* 3. Automatic Interval Scheduler Tab */}
                {activeTab === "scheduler" && (
                  <motion.div
                    key="scheduler"
                    initial={{ opacity: 0, x: 4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                    className="space-y-6"
                  >
                    <div className="border-b border-zinc-900 pb-3">
                      <h2 className="text-base font-heading font-black text-zinc-100 flex items-center gap-2">
                        <Calendar className="w-4.5 h-4.5 text-primary" /> Sweeper sweep scheduler
                      </h2>
                      <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">
                        Configure how frequently the daemon scans job boards for matching listings.
                      </p>
                    </div>

                    <div className="flex items-center justify-between bg-zinc-900/20 border border-zinc-900 rounded-xl p-4.5">
                      <div className="space-y-0.5 pr-4">
                        <span className="text-xs font-bold text-zinc-200">Enable automatic daemon sweeps</span>
                        <p className="text-[10px] text-muted-foreground font-medium">Automatically triggers new profile sweeps on fixed schedules.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setConfig({ ...config, schedulerEnabled: !config.schedulerEnabled })}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-all focus:outline-none ${config.schedulerEnabled ? 'bg-primary' : 'bg-zinc-800'}`}
                      >
                        <span className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform ${config.schedulerEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    {config.schedulerEnabled && (
                      <div className="space-y-4 pt-4 border-t border-zinc-900">
                        <div className="flex justify-between items-center text-xs font-semibold">
                          <span className="text-zinc-300">Sweep Interval Frequency:</span>
                          <span className="text-primary font-bold bg-primary/10 border border-primary/20 px-2 py-0.5 rounded">Every {config.schedulerIntervalMin} Minutes</span>
                        </div>
                        
                        <input 
                          type="range" 
                          min="30" 
                          max="480" 
                          step="30"
                          value={config.schedulerIntervalMin}
                          onChange={(e) => setConfig({ ...config, schedulerIntervalMin: parseInt(e.target.value) })}
                          className="w-full h-1.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                        
                        <div className="flex justify-between text-[9px] font-mono text-zinc-500">
                          <span>30m</span>
                          <span>1h</span>
                          <span>2h</span>
                          <span>4h</span>
                          <span>8h</span>
                        </div>

                        {/* Frequency Stats Info */}
                        <div className="p-3.5 bg-zinc-900/10 border border-zinc-900 rounded-xl text-[10px] font-mono text-zinc-400">
                          📊 Estimated run frequency: ~{Math.round(1440 / config.schedulerIntervalMin)} automatic sweeps per day.
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between bg-zinc-900/20 border border-zinc-900 rounded-xl p-4.5 mt-6">
                      <div className="space-y-0.5 pr-4">
                        <span className="text-xs font-bold text-zinc-200">Stealth Background Mode (Headless)</span>
                        <p className="text-[10px] text-muted-foreground font-medium">Run browser invisibly in the background. Turn OFF to watch the bot work.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setConfig({ ...config, headless: !config.headless })}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-all focus:outline-none ${config.headless ? 'bg-primary' : 'bg-zinc-800'}`}
                      >
                        <span className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform ${config.headless ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>

                  </motion.div>
                )}

                {/* 4. Experience & Custom ATS Fields Tab */}
                {activeTab === "profile" && (
                  <motion.div
                    key="profile"
                    initial={{ opacity: 0, x: 4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                    className="space-y-6"
                  >
                    <div className="border-b border-zinc-900 pb-3">
                      <h2 className="text-base font-heading font-black text-zinc-100 flex items-center gap-2">
                        <Sliders className="w-4.5 h-4.5 text-primary" /> ATS Profile Fields
                      </h2>
                      <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">
                        Provide custom data points to help the AI complete screening question forms.
                      </p>
                    </div>

                    <div className="grid gap-5 md:grid-cols-2">
                      {/* Career Start Date */}
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider pl-0.5 flex flex-wrap items-center gap-1.5">
                          Career Start Date
                          <span className="inline-flex px-2 py-0.5 rounded text-[9px] bg-primary/10 border border-primary/15 text-primary font-bold">
                            Exp: {getExperiencePreview()}
                          </span>
                        </label>
                        <input
                          type="date"
                          value={config.careerStartDate}
                          onChange={(e) => setConfig({ ...config, careerStartDate: e.target.value })}
                          className="flex h-11 w-full rounded-xl border border-border/50 bg-zinc-900/30 px-4 text-xs focus:outline-none"
                        />
                      </div>

                      {/* Auto-Bump Profile */}
                      <div className="space-y-2 flex flex-col justify-center border border-zinc-900 bg-zinc-900/10 p-4 rounded-xl">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider pl-0.5">Auto-Bump Profile</label>
                            <p className="text-[10px] text-muted-foreground font-medium pl-0.5">Updates profile timestamp on every run to boost SEO.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setConfig({ ...config, refreshProfile: !config.refreshProfile })}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-all focus:outline-none ${config.refreshProfile ? 'bg-primary' : 'bg-zinc-800'}`}
                          >
                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition duration-200 ease-in-out ${config.refreshProfile ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Keywords tags section */}
                    <div className="space-y-3 pt-3 border-t border-zinc-900">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-zinc-300">Target Search Keywords</label>
                        <p className="text-[10px] text-muted-foreground">Scout jobs containing these filter tags.</p>
                      </div>

                      <div className="flex gap-2">
                        <input 
                          type="text"
                          value={keywordInput}
                          onChange={(e) => setKeywordInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                          placeholder="e.g. Next.js Developer"
                          className="flex h-9 flex-1 rounded-xl border border-border/50 bg-zinc-900/30 px-3 text-xs focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={addKeyword}
                          className="h-9 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-xs font-bold flex items-center justify-center border border-zinc-800"
                        >
                          Add
                        </button>
                      </div>

                      {/* Keywords Tags */}
                      <div className="flex flex-wrap gap-1.5 pt-1.5">
                        {config.keywords.map((kw) => (
                          <span 
                            key={kw} 
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-bold text-zinc-300"
                          >
                            {kw}
                            <button
                              type="button"
                              onClick={() => removeKeyword(kw)}
                              className="text-zinc-500 hover:text-red-400"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                        {config.keywords.length === 0 && (
                          <span className="text-[10px] text-muted-foreground italic">No search keyword filters defined.</span>
                        )}
                      </div>
                    </div>

                    {/* Custom fields manual questionnaire */}
                    <div className="space-y-3 pt-3 border-t border-zinc-900">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-zinc-300">Custom Screen Responses</label>
                        <p className="text-[10px] text-muted-foreground">Screen fields like relocation or notice period (key-values).</p>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2.5">
                        <input
                          type="text"
                          value={customKey}
                          onChange={(e) => setCustomKey(e.target.value)}
                          placeholder="Notice Period"
                          className="flex h-9 flex-1 rounded-xl border border-border/50 bg-zinc-900/30 px-3 text-xs focus:outline-none"
                        />
                        <input
                          type="text"
                          value={customVal}
                          onChange={(e) => setCustomVal(e.target.value)}
                          placeholder="30 Days"
                          className="flex h-9 flex-1 rounded-xl border border-border/50 bg-zinc-900/30 px-3 text-xs focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={addCustomField}
                          className="h-9 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-xs font-bold flex items-center justify-center border border-zinc-800 shrink-0"
                        >
                          Add Response
                        </button>
                      </div>

                      {/* Custom Fields List */}
                      <div className="grid gap-2 pt-1.5">
                        {Object.entries(config.customFields).map(([k, v]) => (
                          <div key={k} className="flex items-center justify-between gap-3 bg-zinc-900/20 border border-zinc-900/60 px-4 py-2 rounded-xl text-xs font-medium">
                            <span className="text-zinc-500 font-bold font-mono">{k}:</span>
                            <span className="font-semibold text-zinc-300 ml-1 flex-1">{v}</span>
                            <button
                              type="button"
                              onClick={() => removeCustomField(k)}
                              className="p-1 hover:bg-red-500/10 text-red-400 rounded-lg"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                        {Object.keys(config.customFields).length === 0 && (
                          <span className="text-[10px] text-muted-foreground italic">No manual responses added.</span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* 5. Discord Webhook Tab */}
                {activeTab === "discord" && (
                  <motion.div
                    key="discord"
                    initial={{ opacity: 0, x: 4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                    className="space-y-6"
                  >
                    <div className="border-b border-zinc-900 pb-3">
                      <h2 className="text-base font-heading font-black text-zinc-100 flex items-center gap-2">
                        <BellRing className="w-4.5 h-4.5 text-primary" /> Discord Bot Integration
                      </h2>
                      <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">
                        Setup interactive channel bots and webhooks to notify you when manual reviews are needed.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider pl-0.5">Discord Webhook Notification URL</label>
                        <input
                          type="text"
                          value={config.discordWebhookUrl}
                          onChange={(e) => setConfig({ ...config, discordWebhookUrl: e.target.value })}
                          placeholder="https://discord.com/api/webhooks/..."
                          className="flex h-11 w-full rounded-xl border border-border/50 bg-zinc-900/30 px-4 text-xs focus:outline-none"
                        />
                      </div>

                      {config.discordWebhookUrl && (
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={handleTestWebhook}
                            disabled={webhookTesting}
                            className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-zinc-100 cursor-pointer disabled:opacity-50"
                          >
                            {webhookTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            <span>Send Webhook Connection Test</span>
                          </button>
                          
                          {webhookTestStatus === "success" && (
                            <span className="text-[10px] font-bold text-emerald-400">✅ Test Webhook Sent!</span>
                          )}
                          {webhookTestStatus === "error" && (
                            <span className="text-[10px] font-bold text-red-400">❌ Webhook POST failed. Verify link.</span>
                          )}
                        </div>
                      )}

                      <div className="grid gap-5 md:grid-cols-2 pt-2 border-t border-zinc-900">
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider pl-0.5">Q&A Interactive Discord Bot Token</label>
                          <input
                            type="password"
                            value={config.discordBotToken}
                            onChange={(e) => setConfig({ ...config, discordBotToken: e.target.value })}
                            placeholder="MTIyMzQ..."
                            className="flex h-11 w-full rounded-xl border border-border/50 bg-zinc-900/30 px-4 text-xs focus:outline-none"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider pl-0.5">Discord channel ID</label>
                          <input
                            type="text"
                            value={config.discordQaChannelId}
                            onChange={(e) => setConfig({ ...config, discordQaChannelId: e.target.value })}
                            placeholder="12345678..."
                            className="flex h-11 w-full rounded-xl border border-border/50 bg-zinc-900/30 px-4 text-xs focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* 6. Q&A Memory Editor Tab */}
                {activeTab === "qa" && (
                  <motion.div
                    key="qa"
                    initial={{ opacity: 0, x: 4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                    className="space-y-6"
                  >
                    <div className="border-b border-zinc-900 pb-3">
                      <h2 className="text-base font-heading font-black text-zinc-100 flex items-center gap-2">
                        <Brain className="w-4.5 h-4.5 text-primary" /> Q&A Memory Cache Editor
                      </h2>
                      <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">
                        Modify previously resolved screening questions. Future matching questions auto-resolve from this cache first.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="relative">
                        <input
                          type="text"
                          value={qaSearch}
                          onChange={(e) => setQaSearch(e.target.value)}
                          placeholder="Search questions or answers..."
                          className="flex h-10 w-full rounded-xl border border-border/50 bg-zinc-900/30 px-4.5 pl-9 text-xs focus:outline-none"
                        />
                        <Search className="w-3.5 h-3.5 absolute left-3.5 top-3.5 text-zinc-500" />
                      </div>

                      <div className="border border-zinc-900 rounded-xl overflow-hidden max-h-[260px] overflow-y-auto divide-y divide-zinc-900/60 bg-zinc-950/20">
                        {filteredQa.map(([k, v]) => (
                          <div key={k} className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/5 hover:bg-zinc-900/20 transition-all">
                            <div className="space-y-1.5 flex-1 pr-4">
                              <div className="text-[10px] font-mono font-bold text-primary break-all leading-normal">{k}</div>
                              
                              {editingQaKey === k ? (
                                <div className="flex gap-2 pt-1.5">
                                  <input
                                    type="text"
                                    value={editingQaVal}
                                    onChange={(e) => setEditingQaVal(e.target.value)}
                                    className="flex-1 h-8 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 text-xs text-zinc-300 focus:outline-none focus:border-primary"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => saveQaMemoryEdit(k)}
                                    className="px-2.5 h-8 rounded-lg bg-primary text-white text-[10px] font-bold"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setEditingQaKey(null); setEditingQaVal(""); }}
                                    className="px-2.5 h-8 rounded-lg bg-zinc-800 text-zinc-400 text-[10px] font-bold"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="text-xs font-medium text-zinc-200">{v}</div>
                              )}
                            </div>

                            {editingQaKey !== k && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => { setEditingQaKey(k); setEditingQaVal(v); }}
                                  className="p-2 hover:bg-primary/10 text-primary rounded-lg"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteQaMemoryKey(k)}
                                  className="p-2 hover:bg-red-500/10 text-red-500 rounded-lg"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                        {filteredQa.length === 0 && (
                          <div className="text-[11px] text-zinc-500 italic p-10 text-center">
                            No cached Q&A history pairs found.
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* 7. Danger Zone Tab */}
                {activeTab === "danger" && (
                  <motion.div
                    key="danger"
                    initial={{ opacity: 0, x: 4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                    className="space-y-6 relative"
                  >
                    <div className="border-b border-red-500/10 pb-3">
                      <h2 className="text-base font-heading font-black text-red-500 flex items-center gap-2">
                        <ShieldAlert className="w-4.5 h-4.5 text-red-500" /> Database Danger Zone
                      </h2>
                      <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">
                        Permanently purge application records.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="p-4 rounded-xl bg-red-950/10 border border-red-500/15 text-xs text-red-400 leading-relaxed">
                        ⚠️ **CRITICAL WARNING**: Clearing data permanently deletes all jobs from the tracking feed, sweep telemetry traces, run history logs, and unresolved Discord Q&As. Credential variables, keywords, and PDF resumes are **not** affected.
                      </div>
                      
                      {!showClearConfirm ? (
                        <button
                          type="button"
                          onClick={() => setShowClearConfirm(true)}
                          className="px-5 h-11 bg-red-650 hover:bg-red-650 hover:opacity-90 transition-opacity rounded-xl text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer shadow-md shadow-red-950/20"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Wipe Job Tracking Data</span>
                        </button>
                      ) : (
                        <div className="p-4 border border-red-500/30 rounded-xl bg-red-950/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <span className="text-[11px] font-bold text-red-300">Are you absolutely sure? This cannot be undone.</span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={clearing}
                              onClick={handleClearData}
                              className="px-4 h-9 bg-red-500 text-white font-bold text-[11px] rounded-lg cursor-pointer flex items-center gap-1 hover:bg-red-400"
                            >
                              {clearing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                              Confirm Wipe
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowClearConfirm(false)}
                              className="px-4 h-9 bg-zinc-800 text-zinc-300 border border-zinc-700 font-bold text-[11px] rounded-lg cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>

            {/* Global Settings Save Button Bar (Hidden in Danger Zone and Q&A tab as they run local operations) */}
            {activeTab !== "danger" && activeTab !== "qa" && (
              <div className="flex justify-end pt-2">
                <motion.button
                  whileHover={{ scale: 1.02, y: -0.5 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-primary to-indigo-600 px-8 py-3.5 text-xs font-bold text-white transition-all shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 cursor-pointer disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      <span>Saving preferences...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      <span>Save configs</span>
                    </>
                  )}
                </motion.button>
              </div>
            )}
          </form>
        </div>

      </div>

    </div>
  );
}
