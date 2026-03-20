import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload, Link as LinkIcon, FileText, Settings, AlertCircle,
  Download, Loader2, ShieldAlert, ShieldCheck, ArrowLeft,
  Sun, Moon, CheckCircle2, X,
} from 'lucide-react';
import type {
  ExtractionWarning,
  NormalizedJobDescription,
  TailorResumeResponse,
} from './shared/types.ts';

/* ─────────────────────────────────────────
   Score Ring — animated SVG arc
───────────────────────────────────────── */
function ScoreRing({ score, active }: { score: number; active: boolean }) {
  const R = 42;
  const C = 2 * Math.PI * R;
  const [offset, setOffset] = useState(C);
  const [display, setDisplay] = useState(0);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (!active) { setOffset(C); setDisplay(0); return; }
    const t0 = Date.now(), dur = 1100;
    const tick = () => {
      const p = Math.min((Date.now() - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(e * score));
      setOffset(C * (1 - (e * score) / 100));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [score, active, C]);

  const ringColor =
    score >= 80 ? '#34d399'
    : score >= 60 ? '#a78bfa'
    : score >= 40 ? '#fbbf24'
    : '#f87171';

  const labelColor =
    score >= 80 ? 'text-emerald-400'
    : score >= 60 ? 'text-violet-400'
    : score >= 40 ? 'text-amber-400'
    : 'text-red-400';

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex items-center justify-center">
        {/* glow */}
        <div
          className="absolute w-24 h-24 rounded-full blur-2xl opacity-30 animate-pulse-glow"
          style={{ background: ringColor }}
        />
        <svg width="120" height="120" viewBox="0 0 100 100" className="-rotate-90 relative">
          <circle cx="50" cy="50" r={R} fill="none" strokeWidth="5"
            className="stroke-zinc-200 dark:stroke-zinc-800" />
          <circle
            cx="50" cy="50" r={R} fill="none" strokeWidth="5"
            stroke={ringColor} strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={offset}
            style={{ filter: `drop-shadow(0 0 8px ${ringColor}90)` }}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className={`text-3xl font-black tabular-nums leading-none ${labelColor}`}>
            {display}
          </span>
          <span className="text-[10px] text-zinc-500 mt-0.5 font-medium">/100</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Preservation labels
───────────────────────────────────────── */
const preservationLabels = {
  fully_preserved: 'Fully preserved',
  minor_fallback: 'Preserved with minor fallback',
  fallback_template: 'Fallback template used',
} as const;

/* ─────────────────────────────────────────
   Main App
───────────────────────────────────────── */
export default function App() {
  const [step, setStep] = useState(1);
  const [isDark, setIsDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  const [jdType, setJdType] = useState<'url' | 'file' | 'paste'>('url');
  const [jdUrl, setJdUrl] = useState('');
  const [jdText, setJdText] = useState('');
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [preferences, setPreferences] = useState({ targetRole: '', tone: 'Professional', seniority: '' });

  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [normalizedJd, setNormalizedJd] = useState<NormalizedJobDescription | null>(null);
  const [result, setResult] = useState<TailorResumeResponse | null>(null);
  const [isDraggingJd, setIsDraggingJd] = useState(false);
  const [isDraggingResume, setIsDraggingResume] = useState(false);
  const [showAllRecs, setShowAllRecs] = useState(false);

  const activeWarnings: ExtractionWarning[] = [
    ...(normalizedJd?.extractionWarnings ?? []),
    ...(result?.parseWarnings ?? []),
  ];

  /* ── handlers ── */
  const handleExtractJd = async () => {
    setIsLoading(true); setError(null);
    try {
      let normalized: NormalizedJobDescription | null = null;
      if (jdType === 'url') {
        const r = await fetch('/api/extract-jd-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: jdUrl }) });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || 'Failed to extract from URL');
        normalized = await r.json();
      } else if (jdType === 'file' && jdFile) {
        const fd = new FormData(); fd.append('file', jdFile);
        const r = await fetch('/api/extract-jd-file', { method: 'POST', body: fd });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || 'Failed to extract from file');
        normalized = await r.json();
      } else if (jdType === 'paste') {
        if (!jdText.trim()) throw new Error('No job description provided');
        normalized = { sourceType: 'paste', rawText: jdText, cleanText: jdText.trim(), extractionWarnings: [], qualityScore: 100 };
      }
      if (!normalized?.cleanText) throw new Error('No job description provided');
      setNormalizedJd(normalized); setJdText(normalized.cleanText); setStep(2);
    } catch (err: any) { setError(err.message); }
    finally { setIsLoading(false); }
  };

  const handleTailorResume = async () => {
    if (!resumeFile) { setError('Please upload a reference resume'); return; }
    if (!normalizedJd?.cleanText) { setError('Please provide a valid job description first'); return; }
    setIsLoading(true); setError(null); setProgress(0); setProgressMsg('Parsing source resume...');
    const t0 = Date.now();
    const iv = setInterval(() => {
      const p = Math.min((Date.now() - t0) / 18000 * 90, 95);
      setProgress(p);
      if (p < 20) setProgressMsg('Parsing source resume...');
      else if (p < 40) setProgressMsg('Analyzing job description...');
      else if (p < 60) setProgressMsg('Building tailoring plan...');
      else if (p < 80) setProgressMsg('Rewriting with verified facts...');
      else setProgressMsg('Running validation gate...');
    }, 200);
    try {
      const fd = new FormData();
      fd.append('resume', resumeFile);
      fd.append('jdText', normalizedJd.cleanText);
      fd.append('preferences', JSON.stringify(
        Object.fromEntries(Object.entries(preferences).filter(([, v]) => (v as string).trim() !== ''))
      ));
      const r = await fetch('/api/tailor-resume', { method: 'POST', body: fd });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || 'Failed to tailor resume');
      const data = (await r.json()) as TailorResumeResponse;
      clearInterval(iv); setProgress(100);
      setProgressMsg(data.blocked ? 'Validation blocked output' : 'Finalizing...');
      await new Promise(res => setTimeout(res, 400));
      setResult(data); setStep(3); setIsLoading(false);
    } catch (err: any) { clearInterval(iv); setError(err.message); setIsLoading(false); }
  };

  const handleDownload = async () => {
    if (!result || result.blocked) return;
    try {
      const r = await fetch('/api/generate-docx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tailoredResume: result.tailoredResume, templateProfile: result.templateProfile, validation: result.validation }) });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || 'Failed to generate DOCX');
      const blob = await r.blob();
      const url = window.URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: 'Tailored_Resume.docx' });
      document.body.appendChild(a); a.click(); a.remove();
    } catch (err: any) { setError(err.message); }
  };

  const resetFlow = () => { setStep(1); setJdText(''); setJdFile(null); setJdUrl(''); setResumeFile(null); setResult(null); setNormalizedJd(null); setError(null); setProgress(0); setProgressMsg(''); };
  const handleBackToStep2 = () => { setResult(null); setShowAllRecs(false); setStep(2); };
  const handleRetryResume = () => { setResumeFile(null); setResult(null); setShowAllRecs(false); setStep(2); };

  /* ── helpers ── */
  const alignmentLabel = (s: number) => s >= 80 ? 'Strong match' : s >= 60 ? 'Moderate match' : s >= 40 ? 'Fair match' : 'Weak match';
  const alignmentColor = (s: number) => s >= 80 ? 'text-emerald-500 dark:text-emerald-400' : s >= 60 ? 'text-violet-600 dark:text-violet-400' : s >= 40 ? 'text-amber-500 dark:text-amber-400' : 'text-red-500 dark:text-red-400';
  const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

  /* ── shared design tokens ── */
  const card = 'bg-white dark:bg-zinc-900/80 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl';
  const inputCls = 'w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500 transition-all duration-200';
  const pill = 'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors duration-200';

  const transition = { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as [number,number,number,number] };

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="relative min-h-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 transition-colors duration-500 overflow-x-hidden">

        {/* ── Ambient gradient orbs ── */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden z-0" aria-hidden>
          <div className="absolute -top-1/4 -right-1/4 w-[900px] h-[900px] rounded-full bg-violet-500/8 dark:bg-violet-500/10 blur-[140px] animate-pulse-glow" />
          <div className="absolute -bottom-1/4 -left-1/4 w-[700px] h-[700px] rounded-full bg-indigo-500/6 dark:bg-indigo-500/8 blur-[120px] animate-pulse-glow" style={{ animationDelay: '1.5s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-violet-400/4 dark:bg-violet-400/5 blur-[80px] animate-pulse-glow" style={{ animationDelay: '3s' }} />
        </div>

        {/* ── Header ── */}
        <header className="fixed inset-x-0 top-0 z-30 h-14 border-b border-zinc-200/60 dark:border-zinc-800/60 bg-white/70 dark:bg-[#09090b]/80 backdrop-blur-xl">
          <div className="max-w-6xl mx-auto px-5 h-full flex items-center justify-between">

            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                <FileText className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-bold tracking-tight">Resume Tailor Pro</span>
            </div>

            {/* Step indicator */}
            <div className="hidden sm:flex items-center gap-1.5">
              {[
                { n: 1, label: 'Job Description' },
                { n: 2, label: 'Upload Resume' },
                { n: 3, label: 'Results' },
              ].map(({ n, label }, i) => (
                <React.Fragment key={n}>
                  {i > 0 && (
                    <div className={`w-8 h-px transition-colors duration-700 ${step > i ? 'bg-violet-400' : 'bg-zinc-300 dark:bg-zinc-700'}`} />
                  )}
                  <div
                    data-testid={`step-indicator-${n}`}
                    aria-current={step === n ? 'step' : undefined}
                    className="flex items-center gap-1.5"
                  >
                    <motion.div
                      animate={step === n ? { scale: 1.2 } : { scale: 1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black transition-colors duration-500 ${
                        step === n
                          ? 'bg-violet-600 dark:bg-violet-500 text-white shadow-lg shadow-violet-500/40'
                          : step > n
                          ? 'bg-violet-100 dark:bg-violet-900/60 text-violet-600 dark:text-violet-400'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600'
                      }`}
                    >
                      {step > n ? <CheckCircle2 className="w-3 h-3" /> : n}
                    </motion.div>
                    <span className={`text-xs font-medium transition-colors duration-300 hidden md:block ${step === n ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 dark:text-zinc-600'}`}>
                      {label}
                    </span>
                  </div>
                </React.Fragment>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="sm:hidden text-xs text-zinc-500">{step}/3</span>
              <button
                onClick={() => setIsDark(d => !d)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors"
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </header>

        {/* ── Alerts (fixed, over content) ── */}
        <div className="fixed top-16 inset-x-0 z-20 flex flex-col items-center gap-2 px-5 pointer-events-none">
          <AnimatePresence>
            {error && (
              <motion.div key="err"
                initial={{ opacity: 0, y: -12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.95 }}
                transition={transition}
                className="pointer-events-auto max-w-lg w-full flex items-start gap-3 px-4 py-3.5 bg-red-50/90 dark:bg-red-950/80 border border-red-200 dark:border-red-800/60 rounded-xl backdrop-blur-sm shadow-lg text-red-700 dark:text-red-300"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="text-sm flex-1">{error}</p>
                <button onClick={() => setError(null)} className="hover:opacity-60 shrink-0"><X className="w-4 h-4" /></button>
              </motion.div>
            )}
          </AnimatePresence>
          {!!activeWarnings.length && (
            <div className="pointer-events-auto max-w-lg w-full px-4 py-3.5 bg-amber-50/90 dark:bg-amber-950/70 border border-amber-200 dark:border-amber-800/50 rounded-xl backdrop-blur-sm shadow-lg">
              <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest mb-1.5">
                Extraction and parsing warnings
              </p>
              <ul className="space-y-1">
                {activeWarnings.map((w, i) => (
                  <li key={`${w.code}-${i}`} className="text-xs text-amber-600 dark:text-amber-300/80 flex gap-1.5">
                    <span className="shrink-0">·</span>{w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── Content ── */}
        <main className="relative z-10 pt-14">
          <AnimatePresence mode="wait">
            {(() => {

              /* ════════════════ STEP 1 ════════════════ */
              if (step === 1) return (
                <motion.div key="s1"
                  initial={{ opacity: 0, y: 28, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -20, filter: 'blur(4px)' }}
                  transition={transition}
                  className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-5 py-24"
                >
                  <div className="w-full max-w-lg">
                    {/* Watermark step number */}
                    <p className="text-[11px] font-black text-violet-600 dark:text-violet-400 uppercase tracking-[0.2em] mb-4">Step 01 / 03</p>

                    <h2 className="text-[2.75rem] font-black tracking-tight leading-[1.05] mb-3">
                      Target Job{' '}
                      <span className="block text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-500 dark:from-violet-400 dark:to-indigo-400">
                        Description
                      </span>
                    </h2>
                    <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed mb-10 max-w-sm">
                      Paste, link, or upload the role you're targeting. We extract requirements and tailor to match.
                    </p>

                    {/* Type selector */}
                    <div className="flex gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 mb-5">
                      {(['url', 'file', 'paste'] as const).map(t => (
                        <button key={t} onClick={() => setJdType(t)}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all duration-200 ${
                            jdType === t
                              ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                              : 'text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400'
                          }`}
                        >
                          {t === 'url'  && <><LinkIcon className="w-3.5 h-3.5" />URL</>}
                          {t === 'file' && <><Upload className="w-3.5 h-3.5" />Upload</>}
                          {t === 'paste'&& <><FileText className="w-3.5 h-3.5" />Paste</>}
                        </button>
                      ))}
                    </div>

                    <AnimatePresence mode="wait">
                      {jdType === 'url' && (
                        <motion.div key="url" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                          <input type="url" value={jdUrl} onChange={e => setJdUrl(e.target.value)}
                            placeholder="https://example.com/job/123" className={inputCls} />
                        </motion.div>
                      )}
                      {jdType === 'file' && (
                        <motion.div key="file" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                          <div
                            data-testid="drag-zone-jd"
                            onDragEnter={() => setIsDraggingJd(true)}
                            onDragLeave={() => setIsDraggingJd(false)}
                            onDrop={() => setIsDraggingJd(false)}
                            onDragOver={e => e.preventDefault()}
                            className={`relative rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-300 ${
                              isDraggingJd
                                ? 'border-violet-500 bg-violet-50/80 dark:bg-violet-500/8'
                                : 'border-zinc-200 dark:border-zinc-800 hover:border-violet-400/60 dark:hover:border-violet-700'
                            }`}
                          >
                            <input type="file" accept=".pdf,.docx,.txt"
                              onChange={e => { setJdFile(e.target.files?.[0] || null); setIsDraggingJd(false); }}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                            <div className={`w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center transition-all ${isDraggingJd ? 'bg-violet-100 dark:bg-violet-500/20 rotate-6' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
                              <Upload className={`w-5 h-5 ${isDraggingJd ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-400'}`} />
                            </div>
                            <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">{jdFile ? jdFile.name : 'Drop or click to browse'}</p>
                            <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">PDF · DOCX · TXT</p>
                          </div>
                        </motion.div>
                      )}
                      {jdType === 'paste' && (
                        <motion.div key="paste" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                          <textarea value={jdText} onChange={e => setJdText(e.target.value)} rows={10}
                            placeholder="Paste the full job description here..."
                            className={`${inputCls} resize-none font-mono text-[13px] leading-relaxed`} />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* CTA */}
                    <button
                      onClick={handleExtractJd}
                      disabled={isLoading || (jdType === 'url' && !jdUrl) || (jdType === 'file' && !jdFile) || (jdType === 'paste' && !jdText)}
                      className="mt-5 w-full relative overflow-hidden flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white bg-violet-600 hover:bg-violet-500 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-violet-500/20"
                    >
                      {isLoading
                        ? <><Loader2 className="w-4 h-4 animate-spin" />Extracting...</>
                        : 'Continue →'}
                    </button>

                    <p className="mt-6 text-xs text-zinc-400 dark:text-zinc-600 text-center leading-relaxed">
                      Only facts from your resume appear in the output. Fabrications are automatically blocked.
                    </p>
                  </div>
                </motion.div>
              );

              /* ════════════════ STEP 2 ════════════════ */
              if (step === 2) return (
                <motion.div key="s2"
                  initial={{ opacity: 0, y: 28, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -20, filter: 'blur(4px)' }}
                  transition={transition}
                  className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-5 py-24"
                >
                  <div className="w-full max-w-lg">
                    <p className="text-[11px] font-black text-violet-600 dark:text-violet-400 uppercase tracking-[0.2em] mb-4">Step 02 / 03</p>

                    <h2 className="text-[2.75rem] font-black tracking-tight leading-[1.05] mb-3">
                      Reference Resume<br />
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-500 dark:from-violet-400 dark:to-indigo-400">
                        & Preferences
                      </span>
                    </h2>
                    <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed mb-8 max-w-sm">
                      Upload your current DOCX. We rewrite it for this role using only facts already in the document.
                    </p>

                    {/* JD context pill */}
                    {normalizedJd && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        data-testid="jd-preview-card"
                        className="mb-6 flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-xl"
                      >
                        <span className={`shrink-0 px-2 py-0.5 rounded-md text-[11px] font-black border ${
                          normalizedJd.qualityScore >= 80
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                            : normalizedJd.qualityScore >= 50
                            ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
                            : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20'
                        }`}>
                          {normalizedJd.qualityScore}/100
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-zinc-400 dark:text-zinc-600 truncate uppercase tracking-wide font-semibold">
                            {normalizedJd.sourceType} · {wordCount(normalizedJd.cleanText)} words
                          </p>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 truncate mt-0.5">
                            {normalizedJd.cleanText.slice(0, 90)}
                          </p>
                        </div>
                      </motion.div>
                    )}

                    {/* Upload zone */}
                    <div
                      data-testid="drag-zone-resume"
                      onDragEnter={() => setIsDraggingResume(true)}
                      onDragLeave={() => setIsDraggingResume(false)}
                      onDrop={() => setIsDraggingResume(false)}
                      onDragOver={e => e.preventDefault()}
                      className={`relative rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-300 mb-6 ${
                        isDraggingResume
                          ? 'border-violet-500 bg-violet-50/60 dark:bg-violet-500/8'
                          : resumeFile
                          ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-50/40 dark:bg-emerald-500/5'
                          : 'border-zinc-200 dark:border-zinc-800 hover:border-violet-400/60 dark:hover:border-violet-700'
                      }`}
                    >
                      <input type="file" accept=".docx"
                        onChange={e => { setResumeFile(e.target.files?.[0] || null); setIsDraggingResume(false); }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />

                      {resumeFile ? (
                        <div className="flex items-center justify-center gap-4">
                          <div className="w-11 h-11 rounded-xl bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{resumeFile.name}</p>
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">Ready to tailor</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className={`w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center transition-all duration-300 ${isDraggingResume ? 'bg-violet-100 dark:bg-violet-500/20 scale-110 rotate-3' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
                            <Upload className={`w-5 h-5 transition-colors ${isDraggingResume ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-400'}`} />
                          </div>
                          <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">Drop your resume or click to browse</p>
                          <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">DOCX only</p>
                        </>
                      )}
                    </div>

                    {/* Preferences */}
                    <div className="mb-8 space-y-3">
                      <div className="flex items-center gap-2">
                        <Settings className="w-3.5 h-3.5 text-zinc-400" />
                        <span className="text-[11px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Optional</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {([
                          { k: 'targetRole', label: 'Target Role', ph: 'e.g. Senior Frontend' },
                          { k: 'seniority',  label: 'Seniority',   ph: 'e.g. Leadership, IC' },
                        ] as const).map(({ k, label, ph }) => (
                          <div key={k}>
                            <label className="block text-[11px] font-semibold text-zinc-400 dark:text-zinc-600 uppercase tracking-wide mb-1.5">{label}</label>
                            <input type="text" value={preferences[k as 'targetRole' | 'seniority']}
                              onChange={e => setPreferences({ ...preferences, [k]: e.target.value })}
                              placeholder={ph} className={`${inputCls} py-2.5`} />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Progress / actions */}
                    {isLoading && progress > 0 ? (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{progressMsg}</p>
                        </div>
                        <div className="h-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden relative">
                          <motion.div
                            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full"
                            animate={{ x: ['0%', '300%', '0%'] }}
                            transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
                          />
                        </div>
                        <p className="text-xs text-zinc-400 dark:text-zinc-600 text-center">Validating against source facts — fabrications blocked automatically.</p>
                      </motion.div>
                    ) : (
                      <div className="space-y-2.5">
                        <button onClick={handleTailorResume} disabled={isLoading || !resumeFile}
                          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white bg-violet-600 hover:bg-violet-500 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-violet-500/20">
                          {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Preparing...</> : 'Tailor Resume →'}
                        </button>
                        <button onClick={() => setStep(1)} disabled={isLoading}
                          className="w-full py-2.5 text-sm text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors">
                          ← Back
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );

              /* ════════════════ STEP 3 ════════════════ */
              if (step === 3 && result) {
                const blocked = result.blocked;
                const validation = result.validation;
                return (
                  <motion.div key="s3"
                    initial={{ opacity: 0, y: 28, filter: 'blur(6px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={transition}
                    className="max-w-6xl mx-auto px-5 py-20"
                  >
                    {/* ── Page header ── */}
                    <div className="mb-10">
                      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border mb-4 ${
                        blocked
                          ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                      }`}>
                        {blocked ? <ShieldAlert className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                        {blocked ? 'Validation blocked output' : 'Validation passed'}
                      </div>
                      <h2 className="text-4xl font-black tracking-tight">
                        {blocked ? 'Validation Blocked Output' : 'Resume Tailored Successfully'}
                      </h2>
                      <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-2">
                        {blocked
                          ? 'Unsupported claims detected. Download is disabled until resolved.'
                          : 'All claims validated against your source resume.'}
                      </p>
                    </div>

                    {/* ── Bento grid ── */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">

                      {/* Score — tall, spans 2 grid rows */}
                      <div className={`${card} p-7 lg:col-span-3 lg:row-span-2 flex flex-col`}>
                        <p className="text-[11px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-6">Alignment Score</p>
                        <div className="flex-1 flex flex-col items-center justify-center gap-4">
                          <ScoreRing score={result.analysis.alignmentScore} active={step === 3} />
                          <div className="text-center">
                            <p data-testid="alignment-score-label" className={`text-base font-black ${alignmentColor(result.analysis.alignmentScore)}`}>
                              {alignmentLabel(result.analysis.alignmentScore)}
                            </p>
                            <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">
                              {result.analysis.matchedKeywords.length} of{' '}
                              {result.analysis.matchedKeywords.length + result.analysis.missingMustHaveKeywords.length} keywords matched
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Keywords */}
                      <div className={`${card} p-6 lg:col-span-5`}>
                        <p className="text-[11px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-4">Matched Keywords</p>
                        <div className="flex flex-wrap gap-1.5">
                          {result.analysis.matchedKeywords.map((kw, i) => (
                            <motion.span key={i}
                              initial={{ opacity: 0, scale: 0.75, y: 6 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              transition={{ delay: i * 0.045, duration: 0.2, ease: 'backOut' }}
                              className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-700/80"
                            >
                              {kw}
                            </motion.span>
                          ))}
                        </div>
                        {result.analysis.missingMustHaveKeywords.length > 0 && (
                          <div className="mt-5 pt-5 border-t border-zinc-100 dark:border-zinc-800">
                            <p className="text-[11px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-3">Missing Must-Haves</p>
                            <div className="flex flex-wrap gap-1.5">
                              {result.analysis.missingMustHaveKeywords.map((kw, i) => (
                                <span key={i} className="px-2.5 py-1 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-semibold rounded-lg border border-amber-200 dark:border-amber-500/20">
                                  {kw}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Validation — right panel, spans 2 rows */}
                      <div className={`${card} p-6 lg:col-span-4 lg:row-span-2 flex flex-col gap-5`}>
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            {validation.isValid
                              ? <ShieldCheck className="w-4 h-4 text-emerald-500" />
                              : <ShieldAlert className="w-4 h-4 text-amber-500" />
                            }
                            <p className="text-[11px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Validation Gate</p>
                          </div>
                          {validation.isValid ? (
                            <p className="text-sm text-emerald-600 dark:text-emerald-400 leading-relaxed">
                              No blocking issues. Ready for download.
                            </p>
                          ) : (
                            <div>
                              <p className="text-sm text-amber-600 dark:text-amber-400 mb-3 leading-relaxed">
                                Unsupported or ambiguous claims were detected. Download is blocked.
                              </p>
                              <ul className="space-y-2">
                                {validation.blockingIssues.map((issue, i) => (
                                  <li key={i} className="text-xs text-zinc-500 flex gap-2">
                                    <AlertCircle className="w-3.5 h-3.5 text-amber-400/70 shrink-0 mt-0.5" />
                                    {issue.message}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {!!validation.warnings.length && (
                            <ul className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-1.5">
                              {validation.warnings.map((w, i) => (
                                <li key={i} className="text-xs text-zinc-400 dark:text-zinc-600 flex gap-2">
                                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{w.message}
                                </li>
                              ))}
                            </ul>
                          )}
                          <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-1.5 text-xs text-zinc-500">
                            <p>Formatting status: <span className="text-zinc-700 dark:text-zinc-400 font-medium">{preservationLabels[result.templateProfile.preservationStatus]}</span></p>
                            <p>Render readiness: <span className="text-zinc-700 dark:text-zinc-400 font-medium">{result.renderReadiness}</span></p>
                          </div>
                        </div>

                        {!blocked && 'tailoredResume' in result && result.tailoredResume.summary && (
                          <div className="pt-5 border-t border-zinc-100 dark:border-zinc-800">
                            <p className="text-[11px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-2">Tailored Summary</p>
                            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{result.tailoredResume.summary}</p>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="space-y-2 mt-auto">
                          <button onClick={handleDownload} disabled={blocked}
                            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white bg-violet-600 hover:bg-violet-500 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-violet-500/20">
                            <Download className="w-4 h-4" />
                            {blocked ? 'Download Blocked by Validation' : 'Download Tailored Resume (DOCX)'}
                          </button>

                          {blocked && (
                            <button data-testid="retry-resume" onClick={handleRetryResume}
                              className="w-full py-3 text-sm font-bold text-violet-600 dark:text-violet-400 hover:text-violet-500 border border-violet-200 dark:border-violet-500/20 rounded-xl transition-colors">
                              Try a different resume
                            </button>
                          )}

                          <button data-testid="back-to-step2" onClick={handleBackToStep2}
                            className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-800 rounded-xl transition-colors">
                            <ArrowLeft className="w-3.5 h-3.5" />Back to Preferences
                          </button>

                          <button onClick={resetFlow}
                            className="w-full py-2.5 text-xs font-semibold text-zinc-400 dark:text-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-500 transition-colors">
                            Start Over
                          </button>
                        </div>
                      </div>

                      {/* Recommendations — spans remaining cols */}
                      <div className={`${card} p-6 lg:col-span-8`}>
                        <p className="text-[11px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-4">Recommendations</p>
                        {(() => {
                          const recs = result.analysis.recommendations;
                          const visible = showAllRecs ? recs : recs.slice(0, 3);
                          return (
                            <>
                              <ul className="space-y-3">
                                {visible.map((rec, i) => (
                                  <motion.li key={i} data-testid="rec-item"
                                    initial={{ opacity: 0, x: -12 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.07, ease: 'easeOut' }}
                                    className="flex gap-3 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed"
                                  >
                                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                                    {rec}
                                  </motion.li>
                                ))}
                              </ul>
                              {recs.length > 3 && (
                                <button data-testid="show-more-recs" onClick={() => setShowAllRecs(!showAllRecs)}
                                  className="mt-4 text-xs font-black text-violet-600 dark:text-violet-400 hover:text-violet-500 uppercase tracking-wide transition-colors">
                                  {showAllRecs ? '↑ Show less' : `↓ +${recs.length - 3} more`}
                                </button>
                              )}
                            </>
                          );
                        })()}
                      </div>

                    </div>
                  </motion.div>
                );
              }

              return null;
            })()}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
