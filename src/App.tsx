import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload, Link as LinkIcon, FileText, Settings, AlertCircle,
  Download, Loader2, ShieldAlert, ShieldCheck, ArrowLeft,
  Sun, Moon, CheckCircle2, X, Mail, Phone, MapPin, Linkedin,
  Search, Briefcase, ChevronDown, ChevronUp, Building2,
} from 'lucide-react';
import type {
  CandidateProfile,
  ExtractionWarning,
  JobSearchPreferences,
  JobSearchResult,
  NormalizedJobDescription,
  TailorResumeResponse,
  TailoredResumeDocument,
} from './shared/types.ts';

/* ─────────────────────────────────────────
   Score Ring — animated SVG arc
───────────────────────────────────────── */
function ScoreRing({ score, active, size = 120 }: { score: number; active: boolean; size?: number }) {
  const R = size === 120 ? 42 : 32;
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

  const vb = size === 120 ? 100 : 76;

  return (
    <div className="relative flex items-center justify-center">
      <div
        className="absolute rounded-full blur-2xl opacity-20 animate-pulse-glow"
        style={{ background: ringColor, width: size, height: size }}
      />
      <svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} className="-rotate-90 relative">
        <circle cx={vb/2} cy={vb/2} r={R} fill="none" strokeWidth="5"
          className="stroke-zinc-200 dark:stroke-zinc-800" />
        <circle
          cx={vb/2} cy={vb/2} r={R} fill="none" strokeWidth="5"
          stroke={ringColor} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={offset}
          style={{ filter: `drop-shadow(0 0 8px ${ringColor}90)` }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={`font-black tabular-nums leading-none ${labelColor} ${size === 120 ? 'text-3xl' : 'text-xl'}`}>
          {display}
        </span>
        <span className="text-[10px] text-zinc-500 mt-0.5 font-medium">/100</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Resume Preview — document card
───────────────────────────────────────── */
function ResumePreview({ resume }: { resume: TailoredResumeDocument }) {
  const { contactInfo, headline, summary, experience, education, skills, skillCategories, certifications } = resume;
  const allSkills = skillCategories?.flatMap(c => c.items) ?? skills;

  return (
    <div className="bg-white rounded-xl p-7 text-zinc-900 shadow-xl shadow-zinc-900/10 font-sans text-[13px] leading-relaxed overflow-y-auto max-h-[calc(100vh-16rem)]">
      {/* Header */}
      {contactInfo?.name && (
        <div className="mb-5 pb-4 border-b border-zinc-200">
          <h1 className="text-xl font-black tracking-tight text-zinc-900 uppercase">
            {contactInfo.name}
          </h1>
          {headline && (
            <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mt-1">{headline}</p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-zinc-500">
            {contactInfo.email && (
              <span className="flex items-center gap-1">
                <Mail className="w-3 h-3" />{contactInfo.email}
              </span>
            )}
            {contactInfo.phone && (
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3" />{contactInfo.phone}
              </span>
            )}
            {contactInfo.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />{contactInfo.location}
              </span>
            )}
            {contactInfo.linkedin && (
              <span className="flex items-center gap-1">
                <Linkedin className="w-3 h-3" />{contactInfo.linkedin}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="mb-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5">Professional Summary</p>
          <p className="text-zinc-700 leading-relaxed">{summary}</p>
        </div>
      )}

      {/* Experience */}
      {experience?.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Professional Experience</p>
          <div className="space-y-4">
            {experience.map((exp) => (
              <div key={exp.id}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <p className="font-bold text-zinc-900 text-[13px]">{exp.title}</p>
                    <p className="text-violet-600 font-semibold text-xs">{exp.company}{exp.location ? ` · ${exp.location}` : ''}</p>
                  </div>
                  <span className="text-[11px] text-zinc-400 shrink-0 mt-0.5">{exp.dates}</span>
                </div>
                {exp.bullets?.length > 0 && (
                  <ul className="space-y-1 ml-3">
                    {exp.bullets.map((b, i) => (
                      <li key={i} className="text-zinc-600 flex gap-2">
                        <span className="mt-[7px] w-1 h-1 rounded-full bg-violet-400 shrink-0" />
                        <span>{b.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills */}
      {allSkills?.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Core Competencies</p>
          <div className="flex flex-wrap gap-1.5">
            {allSkills.map((sk, i) => (
              <span key={i} className="px-2 py-0.5 bg-violet-50 text-violet-700 border border-violet-200 rounded text-[11px] font-semibold">
                {sk}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Education */}
      {education?.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Education</p>
          <div className="space-y-1.5">
            {education.map((ed) => (
              <div key={ed.id} className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-zinc-800 text-[13px]">{ed.degree}</p>
                  <p className="text-xs text-zinc-500">{ed.institution}</p>
                </div>
                <span className="text-[11px] text-zinc-400 shrink-0">{ed.dates}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Certifications */}
      {certifications?.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Certifications</p>
          <ul className="space-y-1">
            {certifications.map((c, i) => (
              <li key={i} className="text-zinc-600 text-[12px]">· {c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   Sidebar — fixed left nav
───────────────────────────────────────── */
function Sidebar({ step, isDark, onToggleDark }: {
  step: number; isDark: boolean; onToggleDark: () => void;
}) {
  const steps = [
    { n: 1, label: 'Discover',   sublabel: 'Find opportunities' },
    { n: 2, label: 'The Source', sublabel: 'Job description' },
    { n: 3, label: 'The Profile', sublabel: 'Resume & prefs' },
    { n: 4, label: 'The Output', sublabel: 'Results & download' },
    { n: 5, label: 'Apply',      sublabel: 'Auto-fill form' },
  ];

  return (
    <aside className="fixed left-0 top-0 h-screen w-[200px] hidden lg:flex flex-col bg-white/80 dark:bg-zinc-950/80 border-r border-zinc-200/80 dark:border-zinc-800/60 backdrop-blur-xl z-30">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-zinc-100 dark:border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <FileText className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <p className="text-[11px] font-black tracking-tight leading-none">Resume Tailor</p>
            <p className="text-[9px] text-zinc-400 dark:text-zinc-600 tracking-widest uppercase mt-0.5">Pro</p>
          </div>
        </div>
      </div>

      {/* Phase label */}
      <div className="px-5 pt-5 pb-2">
        <p className="text-[9px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.2em]">Analysis Flow</p>
      </div>

      {/* Steps */}
      <nav className="px-3 flex-1 space-y-1">
        {steps.map(({ n, label, sublabel }) => {
          const isDone = step > n;
          const isCurrent = step === n;
          const isLocked = step < n;
          return (
            <div
              key={n}
              data-testid={`step-indicator-${n}`}
              aria-current={isCurrent ? 'step' : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 ${
                isCurrent
                  ? 'bg-violet-50 dark:bg-violet-500/10'
                  : isLocked
                  ? 'opacity-35'
                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-default'
              }`}
            >
              <motion.div
                animate={isCurrent ? { scale: 1.1 } : { scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 transition-colors duration-300 ${
                  isDone
                    ? 'bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400'
                    : isCurrent
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-500/40'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                }`}
              >
                {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : `0${n}`}
              </motion.div>
              <div className="min-w-0">
                <p className={`text-xs font-bold truncate transition-colors ${isCurrent ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-500'}`}>
                  {label}
                </p>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-600 truncate">{sublabel}</p>
              </div>
            </div>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-zinc-100 dark:border-zinc-800/80">
        <button
          onClick={onToggleDark}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors"
        >
          {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          <span className="text-xs font-medium">{isDark ? 'Light mode' : 'Dark mode'}</span>
        </button>
      </div>
    </aside>
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
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [extensionInstalled, setExtensionInstalled] = useState(false);
  const [applyUrl, setApplyUrl] = useState('');
  const [autoFillArmed, setAutoFillArmed] = useState(false);
  const [agentStatus, setAgentStatus] = useState<'idle' | 'running' | 'filled' | 'submitted' | 'protected' | 'error'>('idle');
  const [agentSessionId, setAgentSessionId] = useState<string | null>(null);
  const [agentScreenshot, setAgentScreenshot] = useState<string | null>(null);
  const [agentStats, setAgentStats] = useState<{ filled: number; highlighted: number } | null>(null);

  // Job search (step 1)
  const [searchResumeFile, setSearchResumeFile] = useState<File | null>(null);
  const [isDraggingSearch, setIsDraggingSearch] = useState(false);
  const [searchPreferences, setSearchPreferences] = useState<JobSearchPreferences>({});
  const [searchLoading, setSearchLoading] = useState(false);
  const [jobSearchResults, setJobSearchResults] = useState<JobSearchResult[]>([]);
  const [candidateProfile, setCandidateProfile] = useState<CandidateProfile | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobSearchResult | null>(null);
  const [showSearchPrefs, setShowSearchPrefs] = useState(false);
  const [profilePreview, setProfilePreview] = useState<CandidateProfile | null>(null);
  const [profilePreviewLoading, setProfilePreviewLoading] = useState(false);
  const [showProfilePreview, setShowProfilePreview] = useState(false);

  const activeWarnings: ExtractionWarning[] = [
    ...(normalizedJd?.extractionWarnings ?? []),
    ...(result?.parseWarnings ?? []),
  ];

  // Extension bridge: detect extension + handle JD injection when launched from extension
  useEffect(() => {
    const handleMsg = (e: MessageEvent) => {
      if (e.source !== window) return;
      // Ping/pong detection (primary) — content script responds immediately
      if (e.data?.type === 'RTP_PONG') {
        setExtensionInstalled(true);
      }
      // Fallback: content script self-announces on fresh page load
      if (e.data?.type === 'RTP_EXTENSION_READY') {
        setExtensionInstalled(true);
      }
      // Content script delivering a pending JD (when app was opened by extension)
      if (e.data?.type === 'RTP_DELIVER_JD' && e.data.text) {
        setJdType('paste');
        setJdText(e.data.text);
        const url = new URL(window.location.href);
        url.searchParams.delete('from');
        window.history.replaceState({}, '', url.toString());
      }
    };
    window.addEventListener('message', handleMsg);
    // Actively ping the content script — fixes race condition where READY fires before listener is attached
    window.postMessage({ type: 'RTP_PING' }, window.location.origin);
    // If launched from extension, request the pending JD
    const params = new URLSearchParams(window.location.search);
    if (params.get('from') === 'ext') {
      window.postMessage({ type: 'RTP_REQUEST_JD' }, window.location.origin);
    }
    return () => window.removeEventListener('message', handleMsg);
  }, []);

  /* ── role expansion for criteria display ── */
  const DISPLAY_ROLE_VARIANTS: Record<string, string[]> = {
    // Product
    'product manager':    ['Product Manager', 'Product Owner', 'Group PM', 'Principal PM'],
    'product owner':      ['Product Owner', 'Product Manager', 'Senior PM'],
    'program manager':    ['Program Manager', 'TPM', 'PMO Manager'],
    'project manager':    ['Project Manager', 'Program Manager', 'Delivery Manager'],
    // Engineering – general
    'software engineer':  ['Software Engineer', 'Backend Engineer', 'Full Stack Engineer', 'Staff SWE'],
    'software developer': ['Software Developer', 'Software Engineer', 'Senior SWE'],
    'backend engineer':   ['Backend Engineer', 'Senior Backend Engineer', 'Software Engineer', 'Senior SWE'],
    'backend developer':  ['Backend Developer', 'Backend Engineer', 'Senior SWE', 'API Engineer'],
    'frontend engineer':  ['Frontend Engineer', 'Senior Frontend Engineer', 'UI Engineer', 'React Developer'],
    'frontend developer': ['Frontend Developer', 'Frontend Engineer', 'Senior Frontend Engineer'],
    'full stack':         ['Full Stack Engineer', 'Full Stack Developer', 'Software Engineer'],
    'fullstack':          ['Full Stack Engineer', 'Full Stack Developer', 'Software Engineer'],
    // Staff / Principal
    'staff engineer':     ['Staff Engineer', 'Principal Engineer', 'Distinguished Engineer'],
    'principal engineer': ['Principal Engineer', 'Staff Engineer', 'Distinguished Engineer'],
    'tech lead':          ['Tech Lead', 'Engineering Lead', 'Staff Engineer'],
    // Management
    'engineering manager':['Engineering Manager', 'Director of Engineering', 'VP Engineering'],
    // DevOps / Platform / Cloud
    'devops':             ['DevOps Engineer', 'Platform Engineer', 'SRE', 'Cloud Engineer'],
    'sre':                ['SRE', 'Platform Engineer', 'DevOps Engineer'],
    'platform engineer':  ['Platform Engineer', 'DevOps Engineer', 'Cloud Engineer'],
    'cloud engineer':     ['Cloud Engineer', 'Platform Engineer', 'Infrastructure Engineer'],
    // Mobile
    'mobile engineer':    ['Mobile Engineer', 'iOS Engineer', 'Android Engineer'],
    'ios':                ['iOS Engineer', 'iOS Developer', 'Mobile Engineer'],
    'android':            ['Android Engineer', 'Android Developer', 'Mobile Engineer'],
    // Data / ML
    'data scientist':     ['Data Scientist', 'ML Engineer', 'Applied Scientist'],
    'data engineer':      ['Data Engineer', 'Analytics Engineer', 'Data Platform Engineer'],
    'ml engineer':        ['ML Engineer', 'AI Engineer', 'Applied ML Engineer'],
    'machine learning':   ['ML Engineer', 'AI Engineer', 'Data Scientist'],
    // Design
    'ux designer':        ['UX Designer', 'Product Designer', 'UI/UX Designer'],
    'designer':           ['Product Designer', 'UX Designer', 'UI/UX Designer'],
    // Security
    'security engineer':  ['Security Engineer', 'AppSec Engineer', 'Cloud Security Engineer'],
  };
  const expandRoleTitles = (titles: string[]) => {
    const expanded = titles.flatMap(t => {
      const key = t.toLowerCase();
      for (const [pattern, variants] of Object.entries(DISPLAY_ROLE_VARIANTS)) {
        if (key.includes(pattern) || pattern.includes(key)) return variants;
      }
      return [t];
    });
    return [...new Set(expanded)].slice(0, 5);
  };

  /* ── handlers ── */
  const handleSearchResumeChange = async (file: File | null) => {
    setSearchResumeFile(file);
    setProfilePreview(null);
    setShowProfilePreview(false);
    if (!file) return;
    setProfilePreviewLoading(true);
    try {
      const fd = new FormData(); fd.append('resume', file);
      const r = await fetch('/api/build-profile', { method: 'POST', body: fd });
      if (r.ok) {
        const profile = await r.json();
        setProfilePreview(profile);
        setShowProfilePreview(true);
      }
    } catch { /* silently ignore */ }
    finally { setProfilePreviewLoading(false); }
  };

  const handleSearchJobs = async () => {
    if (!searchResumeFile) { setError('Please upload your resume first'); return; }
    setSearchLoading(true); setError(null); setJobSearchResults([]);
    try {
      const fd = new FormData();
      fd.append('resume', searchResumeFile);
      fd.append('preferences', JSON.stringify(searchPreferences));
      const r = await fetch('/api/search-jobs', { method: 'POST', body: fd });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || 'Search failed');
      const data = await r.json();
      setJobSearchResults(data.results ?? []);
      setCandidateProfile(data.candidateProfile ?? null);
    } catch (err: any) { setError(err.message); }
    finally { setSearchLoading(false); }
  };

  const handleSelectJob = (job: JobSearchResult) => {
    setSelectedJob(job);
    // Pre-fill JD text with the job description
    setJdType('paste');
    setJdText(
      `${job.title} at ${job.company}\n${job.location ? `Location: ${job.location}\n` : ''}` +
      `${job.description}\n\n` +
      (job.requiredSkills.length ? `Required Skills: ${job.requiredSkills.join(', ')}\n` : '') +
      (job.niceToHaveSkills.length ? `Nice to Have: ${job.niceToHaveSkills.join(', ')}\n` : '') +
      (job.estimatedSalary ? `Salary: ${job.estimatedSalary}\n` : '')
    );
    setStep(2);
  };

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
      setNormalizedJd(normalized); setJdText(normalized.cleanText); setStep(3);
    } catch (err: any) { setError(err.message); }
    finally { setIsLoading(false); }
  };

  const handleTailorResume = async () => {
    const activeResume = resumeFile ?? searchResumeFile;
    if (!activeResume) { setError('Please upload a reference resume'); return; }
    if (!normalizedJd?.cleanText) { setError('Please provide a valid job description first'); return; }
    setIsLoading(true); setError(null); setProgress(0); setProgressMsg('Parsing source resume...');
    const t0 = Date.now();
    const iv = setInterval(() => {
      const p = Math.min((Date.now() - t0) / 18000 * 90, 95);
      setProgress(p);
      if (p < 20) setProgressMsg('Parsing source resume...');
      else if (p < 40) setProgressMsg('Analyzing job requirements...');
      else if (p < 60) setProgressMsg('Building tailoring plan...');
      else if (p < 80) setProgressMsg('Rewriting with verified facts...');
      else setProgressMsg('Running validation gate...');
    }, 200);
    try {
      const fd = new FormData();
      fd.append('resume', activeResume);
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
      setResult(data); setStep(4); setIsLoading(false);
    } catch (err: any) { clearInterval(iv); setError(err.message); setIsLoading(false); }
  };

  const handleDownload = async () => {
    if (!result || result.blocked) return;
    try {
      const r = await fetch('/api/generate-docx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tailoredResume: result.tailoredResume, templateProfile: result.templateProfile, validation: result.validation }) });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || 'Failed to generate DOCX');
      const blob = await r.blob();
      const url = window.URL.createObjectURL(blob);
      const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      const personName = sanitize(result.tailoredResume.contactInfo?.name ?? 'Resume');
      const company = result.jdCompanyName ? sanitize(result.jdCompanyName) : null;
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const yyyy = now.getFullYear();
      const filename = company
        ? `${personName}_${company}_${dd}${mm}${yyyy}.docx`
        : `${personName}_${dd}${mm}${yyyy}.docx`;
      const a = Object.assign(document.createElement('a'), { href: url, download: filename });
      document.body.appendChild(a); a.click(); a.remove();
      setHasDownloaded(true);
      setApplyUrl(prev => prev || jdUrl); // pre-fill with JD URL if user used URL tab
      setStep(5);
      // Signal to extension (if installed) to cache prefill data for form filling
      const ci = result.tailoredResume.contactInfo;
      if (ci) {
        window.postMessage({ type: 'RTP_PREFILL', data: { name: ci.name, email: ci.email, phone: ci.phone, linkedin: ci.linkedin, location: ci.location } }, window.location.origin);
      }
    } catch (err: any) { setError(err.message); }
  };

  const handleAutoApply = async () => {
    if (!applyUrl.trim()) return;
    // Arm the content script so it auto-fills when the page loads
    window.postMessage({ type: 'RTP_ARM_AUTOFILL' }, window.location.origin);
    await new Promise(r => setTimeout(r, 150));
    window.open(applyUrl.trim(), '_blank');
    setAutoFillArmed(true);
  };

  const handleAgentApply = async () => {
    if (!applyUrl.trim() || !result) return;
    setAgentStatus('running');
    try {
      const r = await fetch('/api/auto-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applyUrl,
          contactInfo: result.tailoredResume.contactInfo,
          tailoredResume: result.tailoredResume,
          templateProfile: result.templateProfile,
          validation: result.validation,
        }),
      });
      const data = await r.json();
      if (data.status === 'protected') { setAgentStatus('protected'); return; }
      setAgentStatus('filled');
      setAgentSessionId(data.sessionId);
      setAgentScreenshot(data.screenshot);
      setAgentStats({ filled: data.filled, highlighted: data.highlighted });
    } catch { setAgentStatus('error'); }
  };

  const handleAgentSubmit = async () => {
    if (!agentSessionId) return;
    setAgentStatus('running');
    try {
      const r = await fetch('/api/auto-apply/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: agentSessionId }),
      });
      const data = await r.json();
      setAgentStatus('submitted');
      if (data.screenshot) setAgentScreenshot(data.screenshot);
    } catch { setAgentStatus('error'); }
  };

  const resetFlow = () => { setStep(1); setJdText(''); setJdFile(null); setJdUrl(''); setResumeFile(null); setResult(null); setNormalizedJd(null); setError(null); setProgress(0); setProgressMsg(''); setHasDownloaded(false); setApplyUrl(''); setAutoFillArmed(false); setAgentStatus('idle'); setAgentSessionId(null); setAgentScreenshot(null); setAgentStats(null); setSearchResumeFile(null); setJobSearchResults([]); setCandidateProfile(null); setSelectedJob(null); setSearchPreferences({}); setShowSearchPrefs(false); setProfilePreview(null); setShowProfilePreview(false); };
  const handleBackToStep3 = () => { setResult(null); setShowAllRecs(false); setStep(3); };
  const handleRetryResume = () => { setResumeFile(null); setResult(null); setShowAllRecs(false); setStep(3); };

  /* ── helpers ── */
  const alignmentLabel = (s: number) => s >= 80 ? 'Strong match' : s >= 60 ? 'Moderate match' : s >= 40 ? 'Fair match' : 'Weak match';
  const alignmentColor = (s: number) => s >= 80 ? 'text-emerald-500 dark:text-emerald-400' : s >= 60 ? 'text-violet-600 dark:text-violet-400' : s >= 40 ? 'text-amber-500 dark:text-amber-400' : 'text-red-500 dark:text-red-400';
  const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

  /* ── design tokens ── */
  const card = 'bg-white dark:bg-zinc-900/70 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl';
  const inputCls = 'w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500 transition-all duration-200';
  const transition = { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] };

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="relative min-h-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 transition-colors duration-500 overflow-x-hidden">

        {/* ── Ambient gradient orbs ── */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden z-0" aria-hidden>
          <div className="absolute -top-1/4 -right-1/4 w-[900px] h-[900px] rounded-full bg-violet-500/6 dark:bg-violet-500/10 blur-[160px] animate-pulse-glow" />
          <div className="absolute -bottom-1/4 -left-1/4 w-[700px] h-[700px] rounded-full bg-indigo-500/5 dark:bg-indigo-500/8 blur-[130px] animate-pulse-glow" style={{ animationDelay: '1.5s' }} />
        </div>

        {/* ── Sidebar (desktop) ── */}
        <Sidebar step={step} isDark={isDark} onToggleDark={() => setIsDark(d => !d)} />

        {/* ── Mobile header ── */}
        <header className="lg:hidden fixed inset-x-0 top-0 z-30 h-13 border-b border-zinc-200/60 dark:border-zinc-800/60 bg-white/80 dark:bg-[#09090b]/90 backdrop-blur-xl">
          <div className="px-5 h-13 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                <FileText className="w-3 h-3 text-white" />
              </div>
              <span className="text-sm font-bold">Resume Tailor Pro</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n, i) => (
                  <React.Fragment key={n}>
                    {i > 0 && <div className={`w-5 h-px ${step > i ? 'bg-violet-400' : 'bg-zinc-300 dark:bg-zinc-700'}`} />}
                    <div
                      data-testid={`step-indicator-${n}-mobile`}
                      aria-current={step === n ? 'step' : undefined}
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black transition-colors ${
                        step === n ? 'bg-violet-600 text-white' : step > n ? 'bg-violet-100 dark:bg-violet-900/50 text-violet-600' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {step > n ? <CheckCircle2 className="w-3 h-3" /> : n}
                    </div>
                  </React.Fragment>
                ))}
              </div>
              <button onClick={() => setIsDark(d => !d)} className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </header>

        {/* ── Alerts ── */}
        <div className="fixed top-14 lg:top-4 inset-x-0 lg:left-[216px] lg:right-4 z-20 flex flex-col items-center gap-2 px-5 lg:px-0 pointer-events-none">
          <AnimatePresence>
            {error && (
              <motion.div key="err"
                initial={{ opacity: 0, y: -12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.95 }}
                transition={transition}
                className="pointer-events-auto max-w-lg w-full flex items-start gap-3 px-4 py-3.5 bg-red-50/95 dark:bg-red-950/90 border border-red-200 dark:border-red-800/60 rounded-xl backdrop-blur-sm shadow-lg text-red-700 dark:text-red-300"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="text-sm flex-1">{error}</p>
                <button onClick={() => setError(null)} className="hover:opacity-60 shrink-0"><X className="w-4 h-4" /></button>
              </motion.div>
            )}
          </AnimatePresence>
          {!!activeWarnings.length && (
            <div className="pointer-events-auto max-w-lg w-full px-4 py-3.5 bg-amber-50/95 dark:bg-amber-950/80 border border-amber-200 dark:border-amber-800/50 rounded-xl backdrop-blur-sm shadow-lg">
              <p className="text-[11px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest mb-1.5">
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

        {/* ── Main content ── */}
        <main className="relative z-10 lg:ml-[200px] pt-13 lg:pt-0">
          <AnimatePresence mode="wait">
            {(() => {

              /* ════════════════ STEP 1 — DISCOVER ════════════════ */
              if (step === 1) return (
                <motion.div key="s1"
                  initial={{ opacity: 0, y: 24, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -16, filter: 'blur(4px)' }}
                  transition={transition}
                  className="min-h-screen px-6 py-20"
                >
                  <div className="w-full max-w-5xl mx-auto">

                    {/* Phase label */}
                    <div className="flex items-center gap-2 mb-6">
                      <span className="text-[10px] font-black text-violet-500 dark:text-violet-400 uppercase tracking-[0.25em]">Phase 01</span>
                      <span className="w-8 h-px bg-violet-400/40" />
                      <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Opportunity Discovery</span>
                    </div>

                    <h2 className="text-[3rem] font-black tracking-tight leading-[1.0] mb-3">
                      Find Your{' '}
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 via-violet-500 to-indigo-400 dark:from-violet-400 dark:via-violet-300 dark:to-indigo-300">
                        Best Matches
                      </span>
                    </h2>
                    <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed mb-8 max-w-lg">
                      Upload your resume and we'll build a deep candidate profile, then search live job boards to surface the best opportunities — ranked by how well they match your background.
                    </p>

                    {/* Upload + prefs row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">

                      {/* Resume upload */}
                      <div className={`${card} p-6 flex flex-col gap-4`}>
                        <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Your Resume</p>
                        <label
                          htmlFor="search-resume-input"
                          onDragEnter={e => { e.preventDefault(); setIsDraggingSearch(true); }}
                          onDragLeave={e => { e.preventDefault(); setIsDraggingSearch(false); }}
                          onDrop={e => { e.preventDefault(); setIsDraggingSearch(false); const f = e.dataTransfer.files?.[0]; if (f) handleSearchResumeChange(f); }}
                          onDragOver={e => e.preventDefault()}
                          className={`relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center min-h-[160px] ${
                            isDraggingSearch
                              ? 'border-violet-500 bg-violet-500/5'
                              : searchResumeFile
                              ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-50/40 dark:bg-emerald-500/5'
                              : 'border-zinc-200 dark:border-zinc-800 hover:border-violet-400/60 dark:hover:border-violet-700'
                          }`}
                        >
                          <input id="search-resume-input" type="file" accept=".docx"
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleSearchResumeChange(f); }}
                            className="sr-only" />
                          {searchResumeFile ? (
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center shrink-0">
                                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                              </div>
                              <div className="text-left">
                                <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200 max-w-[200px] truncate">{searchResumeFile.name}</p>
                                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">Ready to analyze</p>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className={`w-11 h-11 rounded-2xl mb-3 flex items-center justify-center transition-all ${isDraggingSearch ? 'bg-violet-100 dark:bg-violet-500/20 rotate-3' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
                                <Upload className={`w-5 h-5 ${isDraggingSearch ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-400'}`} />
                              </div>
                              <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">Drop your resume or click to browse</p>
                              <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">DOCX only</p>
                            </>
                          )}
                        </label>
                      </div>

                      {/* Search preferences */}
                      <div className={`${card} p-6 flex flex-col gap-4`}>
                        <button
                          onClick={() => setShowSearchPrefs(p => !p)}
                          className="flex items-center justify-between w-full"
                        >
                          <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Search Preferences</p>
                          {showSearchPrefs
                            ? <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
                            : <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />}
                        </button>

                        {showSearchPrefs && (
                          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                            <div>
                              <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">Location</label>
                              <input type="text" value={searchPreferences.location ?? ''}
                                onChange={e => setSearchPreferences(p => ({ ...p, location: e.target.value || undefined }))}
                                placeholder="City, State or leave blank" className={`${inputCls} py-2`} />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">Remote Preference</label>
                              <div className="flex gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                                {(['any', 'remote', 'hybrid', 'onsite'] as const).map(v => (
                                  <button key={v} onClick={() => setSearchPreferences(p => ({ ...p, remotePreference: v }))}
                                    className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all capitalize ${
                                      (searchPreferences.remotePreference ?? 'any') === v
                                        ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                                        : 'text-zinc-400 hover:text-zinc-600'
                                    }`}>{v}</button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">Role Focus</label>
                              <input type="text" value={searchPreferences.roleType ?? ''}
                                onChange={e => setSearchPreferences(p => ({ ...p, roleType: e.target.value || undefined }))}
                                placeholder="e.g. Engineering Manager, Frontend" className={`${inputCls} py-2`} />
                            </div>
                          </motion.div>
                        )}

                        {!showSearchPrefs && (
                          <p className="text-xs text-zinc-400 dark:text-zinc-600 leading-relaxed">
                            Optionally filter by location, remote preference, or role type. We'll build a full candidate profile from your resume automatically.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Candidate profile preview — shown after file upload */}
                    <AnimatePresence>
                      {(profilePreview || profilePreviewLoading) && (
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.3 }}
                          className={`${card} p-5 mb-5`}
                        >
                          <button
                            onClick={() => setShowProfilePreview(v => !v)}
                            className="w-full flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black text-violet-500 dark:text-violet-400 uppercase tracking-widest">Search Criteria</span>
                              {profilePreviewLoading && <Loader2 className="w-3 h-3 text-zinc-400 animate-spin" />}
                            </div>
                            {!profilePreviewLoading && (showProfilePreview
                              ? <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
                              : <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />)}
                          </button>

                          {showProfilePreview && profilePreview && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div>
                                <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mb-1.5">Roles</p>
                                <div className="flex flex-wrap gap-1">
                                  {expandRoleTitles(profilePreview.primaryTitles).map(t => (
                                    <span key={t} className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300">{t}</span>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mb-1.5">Seniority</p>
                                <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 capitalize">{profilePreview.seniorityLevel}</span>
                                <span className="ml-1.5 text-[11px] text-zinc-400">· {profilePreview.yearsOfExperience} yrs</span>
                              </div>
                              <div>
                                <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mb-1.5">Industries</p>
                                <div className="flex flex-wrap gap-1">
                                  {profilePreview.industries.slice(0, 3).map(i => (
                                    <span key={i} className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 capitalize">{i}</span>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mb-1.5">Top Skills</p>
                                <div className="flex flex-wrap gap-1">
                                  {profilePreview.topSkills.slice(0, 4).map(s => (
                                    <span key={s} className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">{s}</span>
                                  ))}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Search button */}
                    <div className="flex flex-col items-center gap-3 max-w-xs mx-auto mb-8">
                      <button onClick={handleSearchJobs} disabled={searchLoading || !searchResumeFile}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white bg-violet-600 hover:bg-violet-500 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-violet-500/25">
                        {searchLoading
                          ? <><Loader2 className="w-4 h-4 animate-spin" />Searching live job boards...</>
                          : <><Search className="w-4 h-4" />Search Jobs</>}
                      </button>
                      <button onClick={() => setStep(2)}
                        className="text-xs text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors">
                        Skip — I have a specific job in mind →
                      </button>
                    </div>

                    {/* Results */}
                    {jobSearchResults.length > 0 && (
                      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="text-lg font-black tracking-tight">
                              {jobSearchResults.length} Opportunities Found
                            </h3>
                            {candidateProfile && (
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                Matched for {candidateProfile.seniorityLevel} {candidateProfile.primaryTitles[0] ?? 'professional'} · {candidateProfile.yearsOfExperience} yrs exp
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Ranked by fit</span>
                            <button onClick={() => { setJobSearchResults([]); setCandidateProfile(null); }}
                              className="text-xs font-semibold text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
                              ← Search Again
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {jobSearchResults.map(job => {
                            const fitColors = {
                              strong:   'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
                              good:     'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20',
                              moderate: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
                              stretch:  'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
                            };
                            const remoteLabel = job.remoteType !== 'unknown' ? job.remoteType : null;
                            return (
                              <div key={job.id} className={`${card} p-5 flex flex-col gap-3 hover:border-violet-300 dark:hover:border-violet-700/60 transition-colors`}>
                                {/* Header row */}
                                <div className="flex items-start gap-3">
                                  <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                                    <Building2 className="w-4 h-4 text-zinc-400" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">{job.title}</p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{job.company}</p>
                                  </div>
                                  <ScoreRing score={job.matchScore} active size={56} />
                                </div>

                                {/* Location + remote */}
                                <div className="flex items-center gap-2 flex-wrap">
                                  {job.location && (
                                    <span className="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                                      <MapPin className="w-3 h-3" />{job.location}
                                    </span>
                                  )}
                                  {remoteLabel && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 uppercase">{remoteLabel}</span>
                                  )}
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border capitalize ${fitColors[job.matchBreakdown.overallFit]}`}>
                                    {job.matchBreakdown.overallFit} fit
                                  </span>
                                </div>

                                {/* Matching skills */}
                                {job.matchBreakdown.topMatchingSkills.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {job.matchBreakdown.topMatchingSkills.slice(0, 4).map(s => (
                                      <span key={s} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300">
                                        {s}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* Gaps */}
                                {job.matchBreakdown.keyGaps.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {job.matchBreakdown.keyGaps.slice(0, 2).map(g => (
                                      <span key={g} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500">
                                        gap: {g}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* Description snippet */}
                                {job.description && (
                                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-2">{job.description}</p>
                                )}

                                {/* Actions */}
                                <div className="mt-auto pt-2 flex items-center gap-2">
                                  <button onClick={() => handleSelectJob(job)}
                                    className="flex-1 py-2 rounded-lg text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 active:scale-[0.98] transition-all shadow-sm shadow-violet-500/20">
                                    Use This Job →
                                  </button>
                                  {job.url && (
                                    <a href={job.url} target="_blank" rel="noopener noreferrer"
                                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
                                      <LinkIcon className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}

                    {/* Empty state after search with no results */}
                    {!searchLoading && jobSearchResults.length === 0 && searchResumeFile && candidateProfile && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${card} p-8 text-center max-w-sm mx-auto`}>
                        <Briefcase className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                        <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">No results returned</p>
                        <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1 mb-4">Try adjusting your preferences or skip to enter a specific job description.</p>
                        <button onClick={() => { setJobSearchResults([]); setCandidateProfile(null); }}
                          className="text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline">
                          ← Search Again
                        </button>
                      </motion.div>
                    )}

                  </div>
                </motion.div>
              );

              /* ════════════════ STEP 2 — THE SOURCE ════════════════ */
              if (step === 2) return (
                <motion.div key="s2"
                  initial={{ opacity: 0, y: 24, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -16, filter: 'blur(4px)' }}
                  transition={transition}
                  className="min-h-screen flex items-center justify-center px-6 py-20"
                >
                  <div className="w-full max-w-md">

                    {/* Phase label */}
                    <div className="flex items-center gap-2 mb-6">
                      <span className="text-[10px] font-black text-violet-500 dark:text-violet-400 uppercase tracking-[0.25em]">Phase 02</span>
                      <span className="w-8 h-px bg-violet-400/40" />
                      <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Data Acquisition</span>
                    </div>

                    {/* Selected job banner */}
                    {selectedJob && (
                      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-3 px-4 py-3 mb-5 rounded-xl bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20">
                        <Briefcase className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-violet-700 dark:text-violet-300 truncate">{selectedJob.title} at {selectedJob.company}</p>
                          <p className="text-[10px] text-violet-500/70 dark:text-violet-400/60">Pre-filled from job search</p>
                        </div>
                        <button onClick={() => { setSelectedJob(null); setJdText(''); setJdType('paste'); }}
                          className="w-5 h-5 flex items-center justify-center text-violet-400 hover:text-violet-600 transition-colors shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </motion.div>
                    )}

                    <h2 className="text-[3rem] font-black tracking-tight leading-[1.0] mb-3">
                      Target Job{' '}
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 via-violet-500 to-indigo-400 dark:from-violet-400 dark:via-violet-300 dark:to-indigo-300">
                        Description
                      </span>
                    </h2>
                    <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed mb-10 max-w-sm">
                      Paste, link, or upload the role you're targeting. We extract requirements and tailor to match.
                    </p>

                    {/* Source type selector */}
                    <div className="flex gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 mb-5">
                      {(['url', 'file', 'paste'] as const).map(t => (
                        <button key={t} onClick={() => setJdType(t)}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all duration-200 ${
                            jdType === t
                              ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                              : 'text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400'
                          }`}
                        >
                          {t === 'url'   && <><LinkIcon className="w-3.5 h-3.5" />URL</>}
                          {t === 'file'  && <><Upload className="w-3.5 h-3.5" />Upload</>}
                          {t === 'paste' && <><FileText className="w-3.5 h-3.5" />Paste</>}
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

                    <button
                      onClick={handleExtractJd}
                      disabled={isLoading || (jdType === 'url' && !jdUrl) || (jdType === 'file' && !jdFile) || (jdType === 'paste' && !jdText)}
                      className="mt-5 w-full relative flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white bg-violet-600 hover:bg-violet-500 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-violet-500/25"
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

              /* ════════════════ STEP 3 — THE PROFILE ════════════════ */
              if (step === 3) return (
                <motion.div key="s3"
                  initial={{ opacity: 0, y: 24, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -16, filter: 'blur(4px)' }}
                  transition={transition}
                  className="min-h-screen px-6 py-20 flex flex-col items-center justify-center"
                >
                  <div className="w-full max-w-4xl">

                    {/* Phase label */}
                    <div className="flex items-center gap-2 mb-5">
                      <span className="text-[10px] font-black text-violet-500 dark:text-violet-400 uppercase tracking-[0.25em]">Phase 03</span>
                      <span className="w-8 h-px bg-violet-400/40" />
                      <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Profile Deposit</span>
                    </div>

                    <h2 className="text-[2.5rem] font-black tracking-tight leading-[1.05] mb-2">
                      Reference Resume{' '}
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-500 dark:from-violet-400 dark:to-indigo-400">
                        &amp; Preferences
                      </span>
                    </h2>
                    <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-8 max-w-lg">
                      Upload your current DOCX. We rewrite it for this role using only facts already in the document.
                    </p>

                    {/* Two-column card layout */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">

                      {/* Left — JD context */}
                      <div className={`${card} p-6 flex flex-col gap-4`}>
                        <div>
                          <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-3">Job Context</p>
                          {normalizedJd && (
                            <motion.div
                              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                              data-testid="jd-preview-card"
                              className="flex items-start gap-3"
                            >
                              <span className={`shrink-0 px-2 py-0.5 rounded-md text-[11px] font-black border mt-0.5 ${
                                normalizedJd.qualityScore >= 80
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                                  : normalizedJd.qualityScore >= 50
                                  ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
                                  : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20'
                              }`}>
                                {normalizedJd.qualityScore}/100
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] text-zinc-400 uppercase tracking-wide font-semibold mb-0.5">
                                  {normalizedJd.sourceType} · {wordCount(normalizedJd.cleanText)} words
                                </p>
                                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-4">
                                  {normalizedJd.cleanText.slice(0, 200)}{normalizedJd.cleanText.length > 200 ? '...' : ''}
                                </p>
                              </div>
                            </motion.div>
                          )}
                        </div>

                        {/* Optional preferences here */}
                        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
                          <div className="flex items-center gap-2">
                            <Settings className="w-3.5 h-3.5 text-zinc-400" />
                            <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Optional Preferences</span>
                          </div>
                          <div className="space-y-2.5">
                            {([
                              { k: 'targetRole', label: 'Target Role', ph: 'e.g. Senior Product Manager' },
                              { k: 'seniority',  label: 'Seniority',   ph: 'e.g. Director, IC' },
                            ] as const).map(({ k, label, ph }) => (
                              <div key={k}>
                                <label className="block text-[10px] font-semibold text-zinc-400 dark:text-zinc-600 uppercase tracking-wide mb-1">{label}</label>
                                <input type="text" value={preferences[k as 'targetRole' | 'seniority']}
                                  onChange={e => setPreferences({ ...preferences, [k]: e.target.value })}
                                  placeholder={ph} className={`${inputCls} py-2`} />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Right — Resume upload */}
                      <div className={`${card} p-6 flex flex-col gap-4`}>
                        <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Your Profile</p>

                        {/* Resume carried over from search step */}
                        {searchResumeFile && !resumeFile && (
                          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 truncate">{searchResumeFile.name}</p>
                              <p className="text-[10px] text-emerald-500/70 dark:text-emerald-400/60">Carried over from job search</p>
                            </div>
                            <button onClick={() => setSearchResumeFile(null)}
                              className="text-emerald-400 hover:text-emerald-600 transition-colors shrink-0 text-[10px] font-semibold">
                              Change
                            </button>
                          </motion.div>
                        )}

                        {(!searchResumeFile || resumeFile) && <div
                          data-testid="drag-zone-resume"
                          onDragEnter={() => setIsDraggingResume(true)}
                          onDragLeave={() => setIsDraggingResume(false)}
                          onDrop={() => setIsDraggingResume(false)}
                          onDragOver={e => e.preventDefault()}
                          className={`relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-300 flex-1 flex flex-col items-center justify-center min-h-[180px] ${
                            isDraggingResume
                              ? 'border-violet-500 bg-violet-500/5 dark:bg-violet-500/8'
                              : resumeFile
                              ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-50/40 dark:bg-emerald-500/5'
                              : 'border-zinc-200 dark:border-zinc-800 hover:border-violet-400/60 dark:hover:border-violet-700'
                          }`}
                        >
                          <input type="file" accept=".docx"
                            onChange={e => { setResumeFile(e.target.files?.[0] || null); setIsDraggingResume(false); }}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />

                          {resumeFile ? (
                            <div className="flex items-center gap-4">
                              <div className="w-11 h-11 rounded-xl bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center shrink-0">
                                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                              </div>
                              <div className="text-left">
                                <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200 max-w-[180px] truncate">{resumeFile.name}</p>
                                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">Ready to tailor</p>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className={`w-12 h-12 rounded-2xl mb-4 flex items-center justify-center transition-all duration-300 ${isDraggingResume ? 'bg-violet-100 dark:bg-violet-500/20 scale-110 rotate-3' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
                                <Upload className={`w-5 h-5 transition-colors ${isDraggingResume ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-400'}`} />
                              </div>
                              <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">Drop your resume or click to browse</p>
                              <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">DOCX only</p>
                            </>
                          )}
                        </div>}

                        <div className="pt-2 text-center">
                          <p className="text-[11px] text-zinc-400 dark:text-zinc-600 leading-relaxed">
                            We extract structured facts with source provenance.<br />No fabrications pass the validation gate.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Progress / actions */}
                    {isLoading && progress > 0 ? (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                        <div className={`${card} p-5`}>
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{progressMsg}</p>
                            <span className="text-xs text-zinc-400 tabular-nums">{Math.round(progress)}%</span>
                          </div>
                          <div className="h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <motion.div
                              className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full"
                              style={{ width: `${progress}%` }}
                              transition={{ duration: 0.3 }}
                            />
                          </div>
                          <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-3 text-center">
                            Validating against source facts — fabrications blocked automatically
                          </p>
                        </div>
                      </motion.div>
                    ) : (
                      <div className="space-y-2.5 max-w-sm mx-auto w-full">
                        <button onClick={handleTailorResume} disabled={isLoading || (!resumeFile && !searchResumeFile)}
                          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white bg-violet-600 hover:bg-violet-500 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-violet-500/20">
                          {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Preparing...</> : 'Tailor Resume →'}
                        </button>
                        <button onClick={() => setStep(2)} disabled={isLoading}
                          className="w-full py-2.5 text-sm text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors">
                          ← Back
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );

              /* ════════════════ STEP 4 — THE OUTPUT ════════════════ */
              if (step === 4 && result) {
                const blocked = result.blocked;
                const validation = result.validation;
                const tailoredResume = !blocked && 'tailoredResume' in result ? result.tailoredResume : null;
                const scoreBreakdown = result.analysis.scoreBreakdown;

                return (
                  <motion.div key="s4"
                    initial={{ opacity: 0, y: 24, filter: 'blur(6px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={transition}
                    className="min-h-screen px-5 py-16"
                  >
                    <div className="max-w-[1300px] mx-auto">

                      {/* ── Page header ── */}
                      <div className="mb-8">
                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border mb-3 ${
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
                        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1.5">
                          {blocked
                            ? 'Unsupported claims detected. Download is disabled until resolved.'
                            : 'All claims validated against your source resume.'}
                        </p>
                      </div>

                      {/* ── Main bento grid ── */}
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">

                        {/* Fit Assessment + ATS Score — left */}
                        {(() => {
                          const gapAnalysis = result.tailoringPlan?.gapAnalysis;
                          const hasFitData = gapAnalysis && (
                            gapAnalysis.fitScore !== undefined ||
                            gapAnalysis.topStrengths.length > 0 ||
                            gapAnalysis.repositioningAngle
                          );
                          const preScore = result.analysis.preAlignmentScore;
                          const postScore = result.analysis.alignmentScore;
                          const scoreDelta = postScore - preScore;

                          return (
                            <div className={`${card} p-6 lg:col-span-3 flex flex-col gap-5 overflow-y-auto max-h-[calc(100vh-10rem)]`}>

                              {/* ── Section 1: Fit Assessment ── always visible */}
                              <div className="flex flex-col gap-3">
                                  <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Role Fit</p>
                                  {!hasFitData && (
                                    <p className="text-[11px] text-zinc-400 dark:text-zinc-600 italic">Role fit analysis unavailable for this run.</p>
                                  )}
                                  {hasFitData && (<>

                                  {/* fitScore badge */}
                                  {gapAnalysis.fitScore !== undefined && (
                                    <div className="flex items-center gap-3">
                                      <ScoreRing score={gapAnalysis.fitScore} active={step === 4} size={76} />
                                      <div>
                                        <p className={`text-sm font-black ${alignmentColor(gapAnalysis.fitScore)}`}>
                                          {alignmentLabel(gapAnalysis.fitScore)}
                                        </p>
                                        <p className="text-[11px] text-zinc-400 dark:text-zinc-600 mt-0.5">Semantic fit score</p>
                                      </div>
                                    </div>
                                  )}

                                  {/* Repositioning angle */}
                                  {gapAnalysis.repositioningAngle && (
                                    <p className="text-[11px] italic text-zinc-500 dark:text-zinc-500 leading-relaxed border-l-2 border-violet-300 dark:border-violet-700 pl-2.5">
                                      {gapAnalysis.repositioningAngle}
                                    </p>
                                  )}

                                  {/* Top strengths */}
                                  {gapAnalysis.topStrengths.length > 0 && (
                                    <div>
                                      <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-500 uppercase tracking-widest mb-1.5">Why you're qualified</p>
                                      <ul className="space-y-1.5">
                                        {gapAnalysis.topStrengths.map((s, i) => (
                                          <li key={i} className="flex gap-2 text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug">
                                            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                                            {s}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}

                                  {/* Key gaps */}
                                  <div>
                                    {gapAnalysis.keyGaps.length > 0 ? (
                                      <>
                                        <p className="text-[10px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-widest mb-1.5">Genuine gaps</p>
                                        <ul className="space-y-1.5">
                                          {gapAnalysis.keyGaps.map((g, i) => (
                                            <li key={i} className="flex gap-2 text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug">
                                              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                                              {g}
                                            </li>
                                          ))}
                                        </ul>
                                      </>
                                    ) : (
                                      <p className="text-[11px] text-emerald-600 dark:text-emerald-500 font-semibold">No critical gaps identified</p>
                                    )}
                                  </div>
                                  </>)}
                                </div>

                              {/* ── Section 2: ATS Score ── */}
                              <div className={`flex flex-col gap-4 ${hasFitData ? 'pt-4 border-t border-zinc-100 dark:border-zinc-800' : 'pt-2'}`}>
                                <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">ATS Score</p>

                                <div className="flex flex-col items-center text-center">
                                  <ScoreRing score={postScore} active={step === 4} />
                                  <div className="mt-3">
                                    <p data-testid="alignment-score-label" className={`text-sm font-black ${alignmentColor(postScore)}`}>
                                      {alignmentLabel(postScore)}
                                    </p>
                                    <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">
                                      {result.analysis.matchedKeywords.length}/{result.analysis.matchedKeywords.length + result.analysis.missingMustHaveKeywords.length} keywords matched
                                    </p>
                                  </div>
                                </div>

                                {/* Pre → post improvement */}
                                {scoreDelta > 0 && (
                                  <div className="flex items-center justify-center gap-2 text-[11px]">
                                    <span className="text-zinc-400 dark:text-zinc-600">Before: <span className="font-bold text-zinc-600 dark:text-zinc-400">{preScore}</span></span>
                                    <span className="text-zinc-300 dark:text-zinc-700">→</span>
                                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">After tailoring: {postScore}</span>
                                    <span className="text-emerald-500 font-black">+{scoreDelta}</span>
                                  </div>
                                )}

                                {/* Score breakdown sub-stats */}
                                {scoreBreakdown && (
                                  <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                                    {[
                                      { label: 'Keyword Coverage', value: `${Math.round(scoreBreakdown.keywordCoverage * 100)}%` },
                                      { label: 'Nice-to-haves', value: `${Math.round(scoreBreakdown.niceCoverage * 100)}%` },
                                      { label: 'Title Match', value: scoreBreakdown.titleMatch ? '✓ Yes' : '✗ No' },
                                      { label: 'Seniority Match', value: scoreBreakdown.seniorityMatch ? '✓ Yes' : '✗ No' },
                                    ].map(({ label, value }) => (
                                      <div key={label} className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] text-zinc-500 dark:text-zinc-500">{label}</span>
                                        <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">{value}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Matched keywords */}
                                <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3">
                                  <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-2">Matched</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {result.analysis.matchedKeywords.map((kw, i) => (
                                      <motion.span key={i}
                                        initial={{ opacity: 0, scale: 0.75 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: i * 0.03, duration: 0.18, ease: 'backOut' }}
                                        className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[11px] font-semibold rounded border border-zinc-200 dark:border-zinc-700/60"
                                      >
                                        {kw}
                                      </motion.span>
                                    ))}
                                  </div>
                                </div>

                                {/* Missing keywords */}
                                {result.analysis.missingMustHaveKeywords.length > 0 && (
                                  <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3">
                                    <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-2">Missing Must-Haves</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {result.analysis.missingMustHaveKeywords.map((kw, i) => (
                                        <span key={i} className="px-2 py-0.5 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[11px] font-semibold rounded border border-amber-200 dark:border-amber-500/20">
                                          {kw}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>

                            </div>
                          );
                        })()}

                        {/* Resume Preview — center */}
                        <div className={`lg:col-span-5 flex flex-col gap-3`}>
                          <div className={`${card} p-4 flex items-center justify-between`}>
                            <div>
                              <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Tailored Resume</p>
                              {tailoredResume?.contactInfo?.name && (
                                <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{tailoredResume.contactInfo.name}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {validation.isValid
                                ? <ShieldCheck className="w-4 h-4 text-emerald-500" />
                                : <ShieldAlert className="w-4 h-4 text-amber-500" />
                              }
                              <span className="text-xs font-semibold text-zinc-500">{validation.isValid ? 'Verified' : 'Blocked'}</span>
                            </div>
                          </div>

                          {tailoredResume ? (
                            <ResumePreview resume={tailoredResume} />
                          ) : (
                            <div className={`${card} p-10 flex flex-col items-center justify-center text-center gap-3 flex-1 min-h-[300px]`}>
                              <ShieldAlert className="w-8 h-8 text-amber-400" />
                              <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Resume preview unavailable</p>
                              <p className="text-xs text-zinc-400 max-w-xs">Validation blocked the output. Resolve the issues listed and retry with a different resume.</p>
                            </div>
                          )}
                        </div>

                        {/* Validation + Actions — right */}
                        <div className={`${card} p-6 lg:col-span-4 flex flex-col gap-5`}>

                          {/* Validation gate */}
                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              {validation.isValid
                                ? <ShieldCheck className="w-4 h-4 text-emerald-500" />
                                : <ShieldAlert className="w-4 h-4 text-amber-500" />
                              }
                              <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Validation Gate</p>
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
                          </div>

                          {/* Formatting status */}
                          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-2 text-xs">
                            <div className="flex justify-between items-center">
                              <span className="text-zinc-500">Formatting status:</span>
                              <span className="font-semibold text-zinc-700 dark:text-zinc-300">{preservationLabels[result.templateProfile.preservationStatus]}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-zinc-500">Render readiness:</span>
                              <span className="font-semibold text-zinc-700 dark:text-zinc-300">{result.renderReadiness}</span>
                            </div>
                          </div>

                          {/* Tailored summary */}
                          {tailoredResume?.summary && (
                            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                              <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-2">Executive Summary</p>
                              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-5">{tailoredResume.summary}</p>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="space-y-2.5 mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800">
                            <button onClick={handleDownload} disabled={blocked}
                              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white bg-violet-600 hover:bg-violet-500 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-violet-500/20">
                              <Download className="w-4 h-4" />
                              {blocked ? 'Download Blocked by Validation' : 'Download Tailored Resume (DOCX)'}
                            </button>

                            {/* Auto-apply hint — shown after download or always when not blocked */}
                            {!blocked && (
                              <div className={`rounded-xl border px-3.5 py-3 text-xs leading-relaxed transition-all duration-300 ${
                                hasDownloaded
                                  ? 'border-violet-400/40 bg-violet-500/10 dark:bg-violet-500/10'
                                  : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50'
                              }`}>
                                {hasDownloaded ? (
                                  <>
                                    <p className="font-bold text-violet-600 dark:text-violet-400 mb-1">✓ Resume ready — next step</p>
                                    <p className="text-zinc-600 dark:text-zinc-400">Open the job application form, then click the <span className="font-semibold text-zinc-800 dark:text-zinc-200">Resume Tailor Pro</span> extension icon in Chrome and hit <span className="font-semibold text-zinc-800 dark:text-zinc-200">Fill application form →</span></p>
                                  </>
                                ) : (
                                  <>
                                    <p className="font-bold text-zinc-700 dark:text-zinc-300 mb-1">🧩 Auto-fill job applications</p>
                                    <p className="text-zinc-500 dark:text-zinc-500">After downloading, use the <span className="font-semibold text-zinc-700 dark:text-zinc-300">Resume Tailor Pro Chrome extension</span> to pre-fill application forms on any career site. Run <code className="bg-zinc-200 dark:bg-zinc-800 px-1 rounded text-[11px]">npm run build:ext</code> to build it.</p>
                                  </>
                                )}
                              </div>
                            )}

                            {blocked && (
                              <button data-testid="retry-resume" onClick={handleRetryResume}
                                className="w-full py-3 text-sm font-bold text-violet-600 dark:text-violet-400 hover:text-violet-500 border border-violet-200 dark:border-violet-500/20 rounded-xl transition-colors">
                                Try a different resume
                              </button>
                            )}

                            <button data-testid="back-to-step2" onClick={handleBackToStep3}
                              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-800 rounded-xl transition-colors">
                              <ArrowLeft className="w-3.5 h-3.5" />Back to Preferences
                            </button>

                            <button onClick={resetFlow}
                              className="w-full py-2 text-xs font-semibold text-zinc-400 dark:text-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-500 transition-colors">
                              Start Over
                            </button>
                          </div>
                        </div>

                      </div>

                      {/* ── Recommendations — full width ── */}
                      <div className={`${card} p-6`}>
                        <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-4">Strategic Recommendations</p>
                        {(() => {
                          const recs = result.analysis.recommendations;
                          const visible = showAllRecs ? recs : recs.slice(0, 3);
                          return (
                            <div>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {visible.map((rec, i) => (
                                  <motion.div key={i} data-testid="rec-item"
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05, ease: 'easeOut' }}
                                    className="flex gap-3 p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800"
                                  >
                                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{rec}</p>
                                  </motion.div>
                                ))}
                              </div>
                              {recs.length > 3 && (
                                <button data-testid="show-more-recs" onClick={() => setShowAllRecs(!showAllRecs)}
                                  className="mt-4 text-xs font-black text-violet-600 dark:text-violet-400 hover:text-violet-500 uppercase tracking-wide transition-colors">
                                  {showAllRecs ? '↑ Show less' : `↓ +${recs.length - 3} more recommendations`}
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                    </div>
                  </motion.div>
                );
              }

              /* ════════════════ STEP 5 — AGENT APPLY ════════════════ */
              if (step === 5 && result && !result.blocked) {
                const ci = result.tailoredResume.contactInfo;
                const company = result.jdCompanyName ?? 'the Role';
                return (
                  <motion.div key="s5"
                    initial={{ opacity: 0, y: 24, filter: 'blur(6px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -16, filter: 'blur(4px)' }}
                    transition={transition}
                    className="min-h-screen flex items-center justify-center px-6 py-20"
                  >
                    <div className="w-full max-w-2xl">

                      {/* Phase label */}
                      <div className="flex items-center gap-2 mb-6">
                        <span className="text-[10px] font-black text-violet-500 dark:text-violet-400 uppercase tracking-[0.25em]">Phase 04</span>
                        <span className="w-8 h-px bg-violet-400/40" />
                        <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Submit Application</span>
                      </div>

                      <h2 className="text-[2.8rem] font-black tracking-tight leading-[1.0] mb-2">
                        Apply to{' '}
                        <span className="bg-gradient-to-r from-violet-500 to-indigo-500 bg-clip-text text-transparent">
                          {company}
                        </span>
                      </h2>
                      <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-8">
                        The agent opens the form in a headless browser, maps your profile to every field using AI, uploads your tailored resume, and shows you a screenshot before submitting.
                      </p>

                      {/* URL input */}
                      <div className={`${card} p-5 mb-5`}>
                        <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-2">
                          Job Application URL
                        </label>
                        <input
                          type="url"
                          value={applyUrl}
                          onChange={e => { setApplyUrl(e.target.value); setAgentStatus('idle'); setAgentScreenshot(null); setAgentStats(null); }}
                          placeholder="https://company.com/apply/job-123"
                          className={inputCls}
                          disabled={agentStatus === 'running'}
                        />

                        <div className="mt-4 space-y-2.5">
                          {agentStatus === 'idle' || agentStatus === 'error' ? (
                            <button
                              onClick={handleAgentApply}
                              disabled={!applyUrl.trim()}
                              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white bg-violet-600 hover:bg-violet-500 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-violet-500/25"
                            >
                              <Loader2 className="w-4 h-4 hidden" />Agent Apply →
                            </button>
                          ) : agentStatus === 'running' ? (
                            <div className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-sm text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Opening form and filling fields…
                            </div>
                          ) : agentStatus === 'protected' ? (
                            <div className="w-full flex items-center gap-2.5 px-4 py-3.5 rounded-xl text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                              <ShieldAlert className="w-4 h-4 shrink-0" />
                              <span>Bot protection detected (Cloudflare / CAPTCHA). <button onClick={() => applyUrl.trim() && window.open(applyUrl.trim(), '_blank')} className="underline font-semibold">Open manually ↗</button></span>
                            </div>
                          ) : agentStatus === 'filled' ? (
                            <button
                              onClick={handleAgentSubmit}
                              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] transition-all duration-200 shadow-lg shadow-emerald-500/25"
                            >
                              <CheckCircle2 className="w-4 h-4" />Submit Application
                            </button>
                          ) : agentStatus === 'submitted' ? (
                            <div className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 font-semibold">
                              <CheckCircle2 className="w-4 h-4" />Application submitted!
                            </div>
                          ) : null}

                          {agentStatus === 'filled' && (
                            <button
                              onClick={() => applyUrl.trim() && window.open(applyUrl.trim(), '_blank')}
                              className="w-full py-2 text-xs font-semibold text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors"
                            >
                              I'll review and submit manually ↗
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Agent stats */}
                      {agentStats && agentStatus !== 'idle' && (
                        <div className="flex gap-3 mb-5">
                          <div className="flex-1 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl px-4 py-3 text-center">
                            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{agentStats.filled}</p>
                            <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-500 uppercase tracking-widest mt-0.5">Fields filled</p>
                          </div>
                          <div className="flex-1 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl px-4 py-3 text-center">
                            <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{agentStats.highlighted}</p>
                            <p className="text-[10px] font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest mt-0.5">Need attention</p>
                          </div>
                        </div>
                      )}

                      {/* Screenshot preview */}
                      {agentScreenshot && (
                        <div className={`${card} p-3 mb-5 overflow-hidden`}>
                          <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-2 px-1">
                            {agentStatus === 'submitted' ? 'Submission confirmation' : 'Form preview — review before submitting'}
                          </p>
                          <img
                            src={`data:image/png;base64,${agentScreenshot}`}
                            alt="Application form screenshot"
                            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700"
                          />
                        </div>
                      )}

                      {/* Contact data for manual reference */}
                      <div className={`${card} p-5 mb-5`}>
                        <p className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-3">Your profile used for filling</p>
                        <div className="grid grid-cols-2 gap-2.5 text-sm">
                          {[
                            { label: 'Name', value: ci?.name },
                            { label: 'Email', value: ci?.email },
                            { label: 'Phone', value: ci?.phone },
                            { label: 'LinkedIn', value: ci?.linkedin },
                            { label: 'Location', value: ci?.location },
                          ].filter(f => f.value).map(({ label, value }) => (
                            <div key={label} className="bg-zinc-50 dark:bg-zinc-800/60 rounded-lg px-3 py-2">
                              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{label}</p>
                              <p className="text-zinc-800 dark:text-zinc-200 mt-0.5 truncate">{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Nav buttons */}
                      <div className="space-y-2">
                        <button onClick={() => setStep(3)}
                          className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-800 rounded-xl transition-colors">
                          <ArrowLeft className="w-3.5 h-3.5" />Back to Results
                        </button>
                        <button onClick={resetFlow}
                          className="w-full py-2 text-xs font-semibold text-zinc-400 dark:text-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-500 transition-colors">
                          Start Over
                        </button>
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
