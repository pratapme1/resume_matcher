import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload, Link as LinkIcon, FileText, Settings, AlertCircle,
  Download, Loader2, ShieldAlert, ShieldCheck, ArrowLeft,
  Sun, Moon, CheckCircle2, X, Mail, Phone, MapPin, Linkedin,
  Search, Briefcase, ChevronDown, ChevronUp, Building2, LogOut,
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase, getAuthHeader } from './supabaseClient.ts';
import type {
  ApplicantProfile,
  ApplySessionSummary,
  CandidateProfile,
  DefaultResumeResponse,
  ExtractionWarning,
  JobSearchPreferences,
  JobSearchResult,
  LatestJobSearchSessionResponse,
  NormalizedJobDescription,
  ResumeSource,
  StoredResumeSummary,
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
    : score >= 60 ? 'var(--rt-accent)'
    : score >= 40 ? '#fbbf24'
    : '#f87171';

  const labelColor =
    score >= 80 ? 'text-emerald-400'
    : score >= 60 ? 'text-[var(--rt-accent)]'
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
            <p className="text-xs font-semibold text-accent uppercase tracking-wide mt-1">{headline}</p>
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
          <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-400 mb-1.5">Professional Summary</p>
          <p className="text-zinc-700 leading-relaxed">{summary}</p>
        </div>
      )}

      {/* Experience */}
      {experience?.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-400 mb-2">Professional Experience</p>
          <div className="space-y-4">
            {experience.map((exp) => (
              <div key={exp.id}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <p className="font-bold text-zinc-900 text-[13px]">{exp.title}</p>
                    <p className="text-accent font-semibold text-xs">{exp.company}{exp.location ? ` · ${exp.location}` : ''}</p>
                  </div>
                  <span className="text-[11px] text-zinc-400 shrink-0 mt-0.5">{exp.dates}</span>
                </div>
                {exp.bullets?.length > 0 && (
                  <ul className="space-y-1 ml-3">
                    {exp.bullets.map((b, i) => (
                      <li key={i} className="text-zinc-600 flex gap-2">
                        <span className="mt-[7px] w-1 h-1 rounded-full bg-accent-soft shrink-0" />
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
          <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-400 mb-2">Core Competencies</p>
          <div className="flex flex-wrap gap-1.5">
            {allSkills.map((sk, i) => (
              <span key={i} className="px-2 py-0.5 bg-accent-soft text-accent border border-accent-soft rounded text-[11px] font-semibold">
                {sk}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Education */}
      {education?.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-400 mb-2">Education</p>
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
          <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-400 mb-2">Certifications</p>
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
   Topbar — sticky top nav (V11 Studio)
───────────────────────────────────────── */
function Topbar({ isDark, onToggleDark, onSignOut, userEmail }: {
  isDark: boolean; onToggleDark: () => void; onSignOut: () => void; userEmail?: string;
}) {
  const initials = userEmail
    ? userEmail.split('@')[0].slice(0, 2).toUpperCase()
    : 'RT';

  return (
    <header className="sticky top-0 z-30 h-[52px] bg-[var(--rt-bg)]/90 backdrop-blur-xl border-b border-[var(--rt-border)] flex items-center justify-between px-7">
      {/* Left: logo wordmark */}
      <div className="flex items-center gap-2">
        <div className="w-[26px] h-[26px] rounded-[7px] bg-[var(--rt-accent)] flex items-center justify-center text-[10px] font-black text-white tracking-tight shadow-md">
          RT
        </div>
        <span className="text-sm font-bold tracking-tight">Resume Tailor</span>
      </div>

      {/* Right: dark mode toggle + user pill */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleDark}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[var(--rt-text-2)] hover:bg-[var(--rt-surface-2)] transition-colors text-xs font-medium"
        >
          {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
        </button>
        {userEmail && (
          <div className="flex items-center gap-2 bg-[var(--rt-surface)] rounded-[20px] py-1 pl-1 pr-3 shadow-sm border border-[var(--rt-border)]">
            <div className="w-[26px] h-[26px] rounded-full bg-[var(--rt-accent)] flex items-center justify-center text-[10px] font-bold text-white shrink-0">
              {initials}
            </div>
            <span className="text-xs font-semibold text-[var(--rt-text)] max-w-[120px] truncate">{userEmail.split('@')[0]}</span>
            <button
              onClick={onSignOut}
              title="Sign out"
              className="ml-1 text-[var(--rt-text-3)] hover:text-red-500 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

/* ─────────────────────────────────────────
   StepProgress — horizontal steps bar
───────────────────────────────────────── */
function StepProgress({ step, onStepClick }: { step: number; onStepClick: (n: number) => void }) {
  const steps = [
    { n: 1, label: 'Find roles' },
    { n: 2, label: 'Add JD' },
    { n: 3, label: 'Resume' },
    { n: 4, label: 'Results' },
  ];

  return (
    <div className="flex justify-center px-6 pt-4 pb-2">
      <div className="bg-[var(--rt-surface)] rounded-xl px-10 py-5 [box-shadow:var(--rt-shadow-card)] border border-[var(--rt-border)] max-w-[640px] w-full">
        <div className="flex items-start">
          {steps.map(({ n, label }, i) => {
            const isDone = step > n;
            const isCurrent = step === n;
            return (
              <React.Fragment key={n}>
                <div className="flex flex-col items-center gap-2 flex-1 relative z-10">
                  <div
                    data-testid={`step-indicator-${n}`}
                    data-testid-mobile={`step-indicator-${n}-mobile`}
                    aria-current={isCurrent ? 'step' : undefined}
                    onClick={isDone ? () => onStepClick(n) : undefined}
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                      isCurrent
                        ? 'bg-[var(--rt-accent)] text-white shadow-[0_0_0_4px_var(--rt-accent-soft)]'
                        : isDone
                        ? 'bg-emerald-500 text-white cursor-pointer'
                        : 'bg-[var(--rt-surface)] border-2 border-[var(--rt-border)] text-[var(--rt-text-3)]'
                    }`}
                  >
                    {isDone ? <CheckCircle2 className="w-4 h-4" /> : n}
                  </div>
                  <span className={`text-[11px] font-medium whitespace-nowrap text-center ${
                    isCurrent ? 'text-[var(--rt-accent)] font-bold'
                    : isDone ? 'text-emerald-500'
                    : 'text-[var(--rt-text-3)]'
                  }`}>{label}</span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 mt-[18px] relative z-0 transition-colors duration-300 ${
                    step > n + 1 || (step > n && step <= steps.length) ? 'bg-emerald-500' : 'bg-[var(--rt-border)]'
                  }`} />
                )}
              </React.Fragment>
            );
          })}
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

const APPLICATION_PROFILE_FIELDS: Array<{
  key: keyof ApplicantProfile;
  label: string;
  placeholder: string;
  type?: string;
}> = [
  { key: 'firstName', label: 'First Name', placeholder: 'Vishnu' },
  { key: 'lastName', label: 'Last Name', placeholder: 'Pratap Kumar' },
  { key: 'email', label: 'Email', placeholder: 'you@example.com', type: 'email' },
  { key: 'phone', label: 'Phone', placeholder: '9148969183', type: 'tel' },
  { key: 'location', label: 'Current Location', placeholder: 'Bengaluru, India' },
  { key: 'currentCompany', label: 'Current Company', placeholder: 'Current employer' },
  { key: 'currentTitle', label: 'Current Title', placeholder: 'Current designation' },
  { key: 'yearsOfExperience', label: 'Total Experience (Years)', placeholder: '5' },
  { key: 'currentCtcLpa', label: 'Current CTC (LPA)', placeholder: '12.5' },
  { key: 'expectedCtcLpa', label: 'Expected CTC (LPA)', placeholder: '18.0' },
  { key: 'noticePeriodDays', label: 'Notice Period (Days)', placeholder: '30' },
  { key: 'linkedin', label: 'LinkedIn Profile', placeholder: 'linkedin.com/in/yourprofile' },
  { key: 'github', label: 'GitHub Profile', placeholder: 'github.com/yourprofile' },
  { key: 'portfolio', label: 'Portfolio URL', placeholder: 'https://portfolio.example.com' },
  { key: 'website', label: 'Personal Website', placeholder: 'https://your-site.example.com' },
  { key: 'workAuthorization', label: 'Work Authorization', placeholder: 'Authorized to work in India' },
  { key: 'requiresSponsorship', label: 'Requires Sponsorship', placeholder: 'No' },
  { key: 'visaStatus', label: 'Visa Status', placeholder: 'Citizen / H1B / None' },
  { key: 'gender', label: 'Gender', placeholder: 'Prefer not to say' },
];

function formatResumeSourceLabel(source: ResumeSource | undefined): string {
  return source === 'default' ? 'Saved default resume' : 'Uploaded resume';
}

function splitFullName(fullName?: string) {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  };
}

function mergeApplicantProfileDrafts(...profiles: Array<Partial<ApplicantProfile> | null | undefined>): ApplicantProfile {
  const merged = profiles.reduce<ApplicantProfile>((acc, profile) => {
    if (!profile) return acc;
    const next = { ...acc };
    for (const [key, value] of Object.entries(profile)) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
          (next as Record<string, string | undefined>)[key] = trimmed;
        }
      }
    }
    return next;
  }, {});

  if (!merged.firstName && merged.fullName) {
    const split = splitFullName(merged.fullName);
    merged.firstName = split.firstName;
    merged.lastName = merged.lastName || split.lastName;
  }

  if (!merged.fullName && (merged.firstName || merged.lastName)) {
    merged.fullName = [merged.firstName, merged.lastName].filter(Boolean).join(' ');
  }

  return merged;
}

function deriveApplicationProfileFromResume(result: TailorResumeResponse | null, candidateProfile?: CandidateProfile | null): ApplicantProfile {
  if (!result) return {};
  const ci = result.tailoredResume.contactInfo;
  const split = splitFullName(ci?.name);
  const latestExperience = result.tailoredResume.experience?.[0];
  return mergeApplicantProfileDrafts({
    fullName: ci?.name,
    firstName: split.firstName,
    lastName: split.lastName,
    email: ci?.email,
    phone: ci?.phone,
    linkedin: ci?.linkedin,
    location: ci?.location,
    currentCompany: latestExperience?.company,
    currentTitle: latestExperience?.title,
    yearsOfExperience: candidateProfile?.yearsOfExperience ? String(candidateProfile.yearsOfExperience) : undefined,
  });
}

function pushJdHistoryItem(
  normalized: NormalizedJobDescription,
  setJdHistory: React.Dispatch<React.SetStateAction<{ id: string; savedAt: string; title: string; cleanText: string }[]>>,
) {
  const title = normalized.cleanText.split('\n')[0].trim().slice(0, 80) || 'Job Description';
  const newItem = { id: Date.now().toString(), savedAt: new Date().toISOString(), title, cleanText: normalized.cleanText };
  setJdHistory(prev => {
    const updated = [newItem, ...prev.filter(h => h.cleanText !== normalized.cleanText)].slice(0, 5);
    localStorage.setItem('jd_history', JSON.stringify(updated));
    return updated;
  });
}

function buildSearchSnippetJd(job: JobSearchResult): string {
  return `${job.title} at ${job.company}\n${job.location ? `Location: ${job.location}\n` : ''}${job.description}\n\n${
    job.requiredSkills.length ? `Required Skills: ${job.requiredSkills.join(', ')}\n` : ''
  }${job.niceToHaveSkills.length ? `Nice to Have: ${job.niceToHaveSkills.join(', ')}\n` : ''}${job.estimatedSalary ? `Salary: ${job.estimatedSalary}\n` : ''}`.trim();
}

/* ─────────────────────────────────────────
   Main App
───────────────────────────────────────── */
export default function App() {
  // VITE_SKIP_AUTH=true bypasses the auth gate — used by E2E tests only
  const skipAuth = import.meta.env.VITE_SKIP_AUTH === 'true';
  const [session, setSession] = useState<Session | null | undefined>(
    skipAuth ? ({ user: { id: 'test-user-e2e' } } as unknown as Session) : undefined
  );
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (skipAuth) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, [skipAuth]);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    const fn = authMode === 'signup'
      ? supabase.auth.signUp({ email: authEmail, password: authPassword })
      : supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    const { error } = await fn;
    setAuthLoading(false);
    if (error) { setAuthError(error.message); return; }
    setSessionExpired(false);
  }

  async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
    const r = await fetch(url, options);
    if (r.status === 401) {
      const body = await r.clone().json().catch(() => null);
      if (body?.code === 'UNAUTHENTICATED') {
        setSessionExpired(true);
        setAuthError(null);
        throw new Error('Session expired. Please sign in again.');
      }
    }
    return r;
  }

  const [step, setStep] = useState(0);
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const toggleDark = () => {
    const next = !isDark;
    localStorage.setItem('theme', next ? 'dark' : 'light');
    setIsDark(next);
  };

  const [jdType, setJdType] = useState<'url' | 'file' | 'paste'>('paste');
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
  const [applySession, setApplySession] = useState<ApplySessionSummary | null>(null);
  const [applyStarting, setApplyStarting] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [savedApplicationProfile, setSavedApplicationProfile] = useState<ApplicantProfile>({});
  const [applicationProfile, setApplicationProfile] = useState<ApplicantProfile>({});
  const [applicationProfileLoading, setApplicationProfileLoading] = useState(false);
  const [applicationProfileSaving, setApplicationProfileSaving] = useState(false);
  const [applicationProfileError, setApplicationProfileError] = useState<string | null>(null);
  const [applicationProfileSavedNotice, setApplicationProfileSavedNotice] = useState<string | null>(null);
  const [defaultResume, setDefaultResume] = useState<StoredResumeSummary | null>(null);
  const [defaultResumeLoading, setDefaultResumeLoading] = useState(false);
  const [defaultResumeSaving, setDefaultResumeSaving] = useState(false);
  const [defaultResumeError, setDefaultResumeError] = useState<string | null>(null);
  const [defaultResumeSavedNotice, setDefaultResumeSavedNotice] = useState<string | null>(null);
  const [showBlockedConfirm, setShowBlockedConfirm] = useState(false);
  const [warningsDismissed, setWarningsDismissed] = useState(false);

  // JD history (localStorage, max 5)
  const [jdHistory, setJdHistory] = useState<{ id: string; savedAt: string; title: string; cleanText: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem('jd_history') || '[]'); } catch { return []; }
  });

  // File input refs for programmatic click (most reliable cross-browser pattern)
  const searchFileRef = useRef<HTMLInputElement>(null);
  const jdFileRef = useRef<HTMLInputElement>(null);
  const resumeFileRef = useRef<HTMLInputElement>(null);

  // Job search (step 1)
  const [searchResumeFile, setSearchResumeFile] = useState<File | null>(null);
  const [isDraggingSearch, setIsDraggingSearch] = useState(false);
  const [searchPreferences, setSearchPreferences] = useState<JobSearchPreferences>({});
  const [searchLoading, setSearchLoading] = useState(false);
  const [jobSearchResults, setJobSearchResults] = useState<JobSearchResult[]>([]);
  const [candidateProfile, setCandidateProfile] = useState<CandidateProfile | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobSearchResult | null>(null);
  const [selectingJobId, setSelectingJobId] = useState<string | null>(null);
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
    window.postMessage({ type: 'RTP_SET_APP_ORIGIN', origin: window.location.origin }, window.location.origin);
    // Actively ping the content script — fixes race condition where READY fires before listener is attached
    window.postMessage({ type: 'RTP_PING' }, window.location.origin);
    // If launched from extension, request the pending JD
    const params = new URLSearchParams(window.location.search);
    if (params.get('from') === 'ext') {
      window.postMessage({ type: 'RTP_REQUEST_JD' }, window.location.origin);
    }
    return () => window.removeEventListener('message', handleMsg);
  }, []);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    const loadDefaultResume = async () => {
      setDefaultResumeLoading(true);
      try {
        const r = await apiFetch('/api/resumes/default', {
          headers: await getAuthHeader(),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || 'Failed to load saved default resume');
        const body = await r.json() as DefaultResumeResponse;
        if (!cancelled) {
          setDefaultResume(body.resume ?? null);
          setDefaultResumeError(null);
          if (body.resume?.candidateProfile) {
            setProfilePreview(body.resume.candidateProfile);
            setShowProfilePreview(true);
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setDefaultResume(null);
          setDefaultResumeError(err.message);
        }
      } finally {
        if (!cancelled) setDefaultResumeLoading(false);
      }
    };

    const loadApplicationProfile = async () => {
      setApplicationProfileLoading(true);
      try {
        const r = await apiFetch('/api/application-profile', {
          headers: await getAuthHeader(),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || 'Failed to load application profile');
        const body = await r.json() as { profile?: ApplicantProfile };
        if (!cancelled) {
          setSavedApplicationProfile(body.profile ?? {});
          setApplicationProfileError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setSavedApplicationProfile({});
          setApplicationProfileError(err.message);
        }
      } finally {
        if (!cancelled) setApplicationProfileLoading(false);
      }
    };

    const loadLatestSearchSession = async () => {
      try {
        const r = await apiFetch('/api/search-jobs/latest', {
          headers: await getAuthHeader(),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || 'Failed to load latest search');
        const body = await r.json() as LatestJobSearchSessionResponse;
        if (!cancelled && body.session) {
          setJobSearchResults(body.session.results ?? []);
          setCandidateProfile(body.session.candidateProfile ?? null);
          setSearchPreferences(body.session.preferences ?? {});
        }
      } catch {
        // Ignore latest-search hydration failures; live search still works.
      }
    };

    void loadDefaultResume();
    void loadApplicationProfile();
    void loadLatestSearchSession();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    const derived = deriveApplicationProfileFromResume(result, candidateProfile ?? profilePreview);
    setApplicationProfile(mergeApplicantProfileDrafts(derived, savedApplicationProfile));
  }, [result, candidateProfile, profilePreview, savedApplicationProfile]);

  useEffect(() => {
    if (!applySession) return;
    if (!['created', 'queued', 'starting', 'filling', 'submitting'].includes(applySession.status)) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const r = await apiFetch(`/api/apply/sessions/${applySession.id}`, {
          headers: await getAuthHeader(),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || 'Failed to refresh apply session');
        const next = await r.json() as ApplySessionSummary;
        if (!cancelled) {
          setApplySession(next);
          setApplyError(null);
        }
      } catch (err: any) {
        if (!cancelled) setApplyError(err.message);
      }
    };

    void poll();
    const id = window.setInterval(() => { void poll(); }, 1800);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [applySession?.id, applySession?.status]);

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
  const saveResumeAsDefault = async (file: File, opts: { clearSearchOverride?: boolean; clearTailorOverride?: boolean } = {}) => {
    setDefaultResumeSaving(true);
    setDefaultResumeError(null);
    setDefaultResumeSavedNotice(null);
    try {
      const fd = new FormData();
      fd.append('resume', file);
      const r = await apiFetch('/api/resumes/default', {
        method: 'POST',
        headers: await getAuthHeader(),
        body: fd,
      });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || 'Failed to save default resume');
      const body = await r.json() as DefaultResumeResponse;
      setDefaultResume(body.resume ?? null);
      if (body.resume?.candidateProfile) {
        setProfilePreview(body.resume.candidateProfile);
        setShowProfilePreview(true);
      }
      setDefaultResumeSavedNotice('Saved as your default resume.');
      if (opts.clearSearchOverride) setSearchResumeFile(null);
      if (opts.clearTailorOverride) setResumeFile(null);
    } catch (err: any) {
      setDefaultResumeError(err.message || 'Failed to save default resume.');
    } finally {
      setDefaultResumeSaving(false);
    }
  };

  const handleSearchResumeChange = async (file: File | null) => {
    setSearchResumeFile(file);
    setDefaultResumeSavedNotice(null);
    if (!file) {
      setProfilePreview(defaultResume?.candidateProfile ?? null);
      setShowProfilePreview(Boolean(defaultResume?.candidateProfile));
      return;
    }
    setProfilePreview(null);
    setShowProfilePreview(false);
    setProfilePreviewLoading(true);
    try {
      const fd = new FormData(); fd.append('resume', file);
      const r = await apiFetch('/api/build-profile', { method: 'POST', headers: await getAuthHeader(), body: fd });
      if (r.ok) {
        const profile = await r.json();
        setProfilePreview(profile);
        setShowProfilePreview(true);
      }
    } catch { /* silently ignore */ }
    finally { setProfilePreviewLoading(false); }
  };

  const handleSearchJobs = async () => {
    if (!searchResumeFile && !defaultResume) { setError('Please upload or save your resume first'); return; }
    setSearchLoading(true); setError(null); setJobSearchResults([]); setSelectedJob(null);
    try {
      const fd = new FormData();
      if (searchResumeFile) {
        fd.append('resume', searchResumeFile);
      } else if (defaultResume) {
        fd.append('resumeId', defaultResume.id);
      }
      fd.append('preferences', JSON.stringify(searchPreferences));
      const r = await apiFetch('/api/search-jobs', { method: 'POST', headers: await getAuthHeader(), body: fd });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || 'Search failed');
      const data = await r.json();
      setJobSearchResults(data.results ?? []);
      setCandidateProfile(data.candidateProfile ?? null);
    } catch (err: any) { setError(err.message); }
    finally { setSearchLoading(false); }
  };

  const handleSelectJob = async (job: JobSearchResult) => {
    setSelectedJob(job);
    setPreferences(p => ({ ...p, targetRole: p.targetRole || job.title }));
    setError(null);

    if (job.url) {
      setSelectingJobId(job.id);
      setJdType('url');
      setJdUrl(job.url);
      try {
        const r = await apiFetch('/api/extract-jd-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...await getAuthHeader() },
          body: JSON.stringify({ url: job.url }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || 'Failed to extract from URL');
        const normalized = await r.json() as NormalizedJobDescription;
        setNormalizedJd(normalized);
        setJdText(normalized.cleanText);
        setWarningsDismissed(false);
        pushJdHistoryItem(normalized, setJdHistory);
        setStep(3);
        return;
      } catch {
        // Fall back to the lighter search-result summary below.
      } finally {
        setSelectingJobId(null);
      }
    }

    const fallbackText = buildSearchSnippetJd(job);
    const fallbackNormalized: NormalizedJobDescription = {
      sourceType: 'paste',
      rawText: fallbackText,
      cleanText: fallbackText,
      extractionWarnings: [],
      qualityScore: 70,
    };
    setJdType('paste');
    setJdText(fallbackText);
    setNormalizedJd(fallbackNormalized);
    setWarningsDismissed(false);
    pushJdHistoryItem(fallbackNormalized, setJdHistory);
    setStep(3);
  };

  const handleExtractJd = async () => {
    setIsLoading(true); setError(null);
    try {
      let normalized: NormalizedJobDescription | null = null;
      if (jdType === 'url') {
        const r = await apiFetch('/api/extract-jd-url', { method: 'POST', headers: { 'Content-Type': 'application/json', ...await getAuthHeader() }, body: JSON.stringify({ url: jdUrl }) });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || 'Failed to extract from URL');
        normalized = await r.json();
      } else if (jdType === 'file' && jdFile) {
        const fd = new FormData(); fd.append('file', jdFile);
        const r = await apiFetch('/api/extract-jd-file', { method: 'POST', headers: await getAuthHeader(), body: fd });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || 'Failed to extract from file');
        normalized = await r.json();
      } else if (jdType === 'paste') {
        if (!jdText.trim()) throw new Error('No job description provided');
        normalized = { sourceType: 'paste', rawText: jdText, cleanText: jdText.trim(), extractionWarnings: [], qualityScore: 100 };
      }
      if (!normalized?.cleanText) throw new Error('No job description provided');
      setNormalizedJd(normalized); setJdText(normalized.cleanText); setWarningsDismissed(false);
      pushJdHistoryItem(normalized, setJdHistory);
      setStep(3);
    } catch (err: any) { setError(err.message); }
    finally { setIsLoading(false); }
  };

  const handleTailorResume = async () => {
    const activeResume = resumeFile ?? searchResumeFile;
    if (!activeResume && !defaultResume) { setError('Please upload or save a reference resume'); return; }
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
      if (activeResume) {
        fd.append('resume', activeResume);
      } else if (defaultResume) {
        fd.append('resumeId', defaultResume.id);
      }
      fd.append('jdText', normalizedJd.cleanText);
      fd.append('preferences', JSON.stringify(
        Object.fromEntries(Object.entries(preferences).filter(([, v]) => (v as string).trim() !== ''))
      ));
      const r = await apiFetch('/api/tailor-resume', { method: 'POST', headers: await getAuthHeader(), body: fd });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || 'Failed to tailor resume');
      const data = (await r.json()) as TailorResumeResponse;
      clearInterval(iv); setProgress(100);
      setProgressMsg(data.blocked ? 'Validation blocked output' : 'Finalizing...');
      await new Promise(res => setTimeout(res, 400));
      setResult(data); setStep(4); setIsLoading(false);
    } catch (err: any) { clearInterval(iv); setError(err.message); setIsLoading(false); }
  };

  const handleDownload = async () => {
    if (!result) return;
    try {
      const r = await apiFetch('/api/generate-docx', { method: 'POST', headers: { 'Content-Type': 'application/json', ...await getAuthHeader() }, body: JSON.stringify({ tailoredResume: result.tailoredResume, templateProfile: result.templateProfile, validation: result.validation }) });
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
      setApplySession(null);
      setApplyError(null);
      setStep(5);
      // Signal to extension (if installed) to cache prefill data for form filling
      const ci = result.tailoredResume.contactInfo;
      if (ci) {
        window.postMessage({ type: 'RTP_PREFILL', data: { name: ci.name, email: ci.email, phone: ci.phone, linkedin: ci.linkedin, location: ci.location } }, window.location.origin);
      }
    } catch (err: any) { setError(err.message); }
  };

  const handleApplicationProfileChange = (key: keyof ApplicantProfile, value: string) => {
    setApplicationProfile((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'firstName' || key === 'lastName') {
        next.fullName = [key === 'firstName' ? value : next.firstName, key === 'lastName' ? value : next.lastName]
          .filter(Boolean)
          .join(' ');
      }
      return next;
    });
    setApplicationProfileSavedNotice(null);
  };

  const saveApplicationProfile = async () => {
    setApplicationProfileSaving(true);
    setApplicationProfileError(null);
    try {
      const r = await apiFetch('/api/application-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...await getAuthHeader() },
        body: JSON.stringify({ profile: applicationProfile }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || 'Failed to save application profile');
      const body = await r.json() as { profile?: ApplicantProfile };
      setSavedApplicationProfile(body.profile ?? applicationProfile);
      setApplicationProfile(body.profile ?? applicationProfile);
      setApplicationProfileSavedNotice('Profile saved to your account.');
    } catch (err: any) {
      setApplicationProfileError(err.message || 'Failed to save application profile.');
    } finally {
      setApplicationProfileSaving(false);
    }
  };

  const handleAgentApply = async () => {
    if (!applyUrl.trim() || !result) return;
    if (!extensionInstalled) {
      setApplyError('Install the Resume Tailor Pro extension to run auto-apply.');
      return;
    }
    setApplyStarting(true);
    setApplyError(null);
    try {
      const r = await apiFetch('/api/apply/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await getAuthHeader() },
        body: JSON.stringify({
          applyUrl,
          tailoredResume: result.tailoredResume,
          templateProfile: result.templateProfile,
          validation: result.validation,
          applicationProfile,
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || 'Failed to create apply session');
      const data = await r.json() as { session: ApplySessionSummary; executorToken: string };
      setApplySession(data.session);
      window.postMessage({
        type: 'RTP_START_APPLY_SESSION',
        data: {
          sessionId: data.session.id,
          applyUrl,
          apiBaseUrl: window.location.origin,
          executorToken: data.executorToken,
        },
      }, window.location.origin);
    } catch (err: any) {
      setApplyError(err.message || 'Failed to start auto-apply.');
    } finally {
      setApplyStarting(false);
    }
  };

  const handleResumeAgentApply = async () => {
    if (!applySession) return;
    setApplyStarting(true);
    setApplyError(null);
    try {
      window.postMessage({
        type: 'RTP_RESUME_APPLY_SESSION',
        data: {
          sessionId: applySession.id,
        },
      }, window.location.origin);
      setApplySession({ ...applySession, status: 'starting', latestMessage: 'Resuming apply session in the extension.' });
    } catch (err: any) {
      setApplyError(err.message || 'Failed to resume auto-apply.');
    } finally {
      setApplyStarting(false);
    }
  };

  const handleAgentSubmit = async () => {
    if (!applySession) return;
    setApplyError(null);
    try {
      const r = await apiFetch(`/api/apply/sessions/${applySession.id}/confirm-submit`, {
        method: 'POST',
        headers: await getAuthHeader(),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || 'Failed to confirm submit');
      const next = await r.json() as ApplySessionSummary;
      setApplySession(next);
      window.postMessage({
        type: 'RTP_SUBMIT_APPLY_SESSION',
        data: {
          sessionId: applySession.id,
        },
      }, window.location.origin);
    } catch (err: any) {
      setApplyError(err.message || 'Failed to submit application.');
    }
  };

  const resetFlow = () => {
    setStep(1);
    setJdText('');
    setJdFile(null);
    setJdUrl('');
    setResumeFile(null);
    setResult(null);
    setNormalizedJd(null);
    setError(null);
    setProgress(0);
    setProgressMsg('');
    setHasDownloaded(false);
    setApplyUrl('');
    setApplySession(null);
    setApplyStarting(false);
    setApplyError(null);
    setSearchResumeFile(null);
    setJobSearchResults([]);
    setCandidateProfile(null);
    setSelectedJob(null);
    setSearchPreferences({});
    setShowSearchPrefs(false);
    setProfilePreview(defaultResume?.candidateProfile ?? null);
    setShowProfilePreview(Boolean(defaultResume?.candidateProfile));
  };
  const handleBackToStep3 = () => { setResult(null); setShowAllRecs(false); setStep(3); };
  const handleRetryResume = () => { setResumeFile(null); setResult(null); setShowAllRecs(false); setStep(3); };

  /* ── helpers ── */
  const normalizeScore = (value: unknown, fallback = 0) => {
    const candidate = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    return Math.max(0, Math.min(100, Math.round(candidate)));
  };
  const alignmentLabel = (s: number) => s >= 80 ? 'Strong match' : s >= 60 ? 'Moderate match' : s >= 40 ? 'Fair match' : 'Weak match';
  const alignmentColor = (s: number) => s >= 80 ? 'text-emerald-500 dark:text-emerald-400' : s >= 60 ? 'text-[var(--rt-accent)]' : s >= 40 ? 'text-amber-500 dark:text-amber-400' : 'text-red-500 dark:text-red-400';
  const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

  /* ── design tokens ── */
  const card = 'bg-[var(--rt-surface)] border border-[var(--rt-border)] rounded-2xl [box-shadow:var(--rt-shadow-card)] dark:backdrop-blur-[16px]';
  const inputCls = 'w-full px-4 py-3 bg-[var(--rt-surface-2)] border border-[var(--rt-border)] rounded-xl text-sm text-[var(--rt-text)] placeholder:text-[var(--rt-text-3)] focus:outline-none focus:ring-2 focus:ring-[var(--rt-accent-soft)] focus:border-[var(--rt-accent)] transition-all duration-200';
  const transition = { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] };

  // Show loading spinner while session is being determined
  if (session === undefined) {
    return (
      <div className={isDark ? 'dark' : ''}>
        <div className="rt-page min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-[var(--rt-accent)] animate-spin" />
        </div>
      </div>
    );
  }

  // Show sign-in / sign-up gate
  if (!session) {
    return (
      <div className={isDark ? 'dark' : ''}>
        <div className="rt-page min-h-screen text-[var(--rt-text)] flex items-center justify-center px-4">
          <div className="w-full max-w-md">
            <div className="flex items-center justify-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl bg-[var(--rt-accent)] flex items-center justify-center shadow-lg">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <span className="text-2xl font-bold">Resume Tailor Pro</span>
            </div>
            <div className="bg-[var(--rt-surface)] border border-[var(--rt-border)] rounded-2xl p-8 [box-shadow:var(--rt-shadow-card)] dark:backdrop-blur-[24px]">
              <h2 className="text-xl font-semibold mb-6">
                {authMode === 'signin' ? 'Sign in to continue' : 'Create your account'}
              </h2>
              <form onSubmit={handleAuth} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--rt-text-2)] mb-1.5">Email</label>
                  <input
                    type="email" required value={authEmail}
                    onChange={e => setAuthEmail(e.target.value)}
                    className={inputCls}
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--rt-text-2)] mb-1.5">Password</label>
                  <input
                    type="password" required value={authPassword}
                    onChange={e => setAuthPassword(e.target.value)}
                    className={inputCls}
                    placeholder="••••••••"
                  />
                </div>
                {authError && (
                  <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{authError}</p>
                )}
                <button
                  type="submit" disabled={authLoading}
                  className="btn-primary w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {authLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {authMode === 'signin' ? 'Sign In' : 'Create Account'}
                </button>
              </form>
              <p className="text-center text-sm text-[var(--rt-text-3)] mt-6">
                {authMode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
                <button
                  onClick={() => { setAuthMode(m => m === 'signin' ? 'signup' : 'signin'); setAuthError(null); }}
                  className="text-accent font-medium hover:underline"
                >
                  {authMode === 'signin' ? 'Sign up' : 'Sign in'}
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="rt-page min-h-screen text-[var(--rt-text)] transition-colors duration-500 overflow-x-hidden">

        {/* ── Ambient gradient orbs ── */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden z-0" aria-hidden>
          {/* V11 orbs — shown in default mode */}
          <div className="v11-orbs">
            <div className="absolute top-0 right-0 w-[700px] h-[700px] rounded-full bg-[var(--rt-accent-soft)] blur-[160px] animate-pulse-glow" />
            <div className="absolute bottom-0 left-0 w-[600px] h-[600px] rounded-full" style={{ background: 'rgba(20,184,166,0.06)', filter: 'blur(130px)', animationDelay: '1.5s' }} />
          </div>
          {/* Legacy orbs — shown only when .legacy-ui is active */}
          <div className="legacy-orbs">
            <div className="absolute -top-1/4 -right-1/4 w-[900px] h-[900px] rounded-full bg-[var(--rt-accent-soft)] dark:bg-[var(--rt-accent-soft)] blur-[160px] animate-pulse-glow" />
            <div className="absolute -bottom-1/4 -left-1/4 w-[700px] h-[700px] rounded-full bg-indigo-500/5 dark:bg-indigo-500/8 blur-[130px] animate-pulse-glow" style={{ animationDelay: '1.5s' }} />
          </div>
        </div>

        {/* ── Topbar ── */}
        <Topbar isDark={isDark} onToggleDark={toggleDark} onSignOut={() => supabase.auth.signOut()} userEmail={session?.user?.email} />

        {/* ── Step progress bar (shown when on a workflow step) ── */}
        {step >= 1 && step <= 4 && (
          <StepProgress step={step} onStepClick={n => setStep(n)} />
        )}

        {/* ── Alerts ── */}
        <div className="fixed top-[60px] inset-x-0 z-20 flex flex-col items-center gap-2 px-5 pointer-events-none">
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
          {!!activeWarnings.length && !warningsDismissed && (
            <div className="pointer-events-auto max-w-lg w-full px-4 py-3.5 bg-amber-50/95 dark:bg-amber-950/80 border border-amber-200 dark:border-amber-800/50 rounded-xl backdrop-blur-sm shadow-lg">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-widest">
                  Extraction and parsing warnings
                </p>
                <button onClick={() => setWarningsDismissed(true)} className="shrink-0 hover:opacity-60 transition-opacity">
                  <X className="w-3.5 h-3.5 text-amber-500" />
                </button>
              </div>
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
        <main className="relative z-10 max-w-[1100px] mx-auto px-6 pb-16 pt-6">
          <AnimatePresence mode="wait">
            {(() => {

              /* ════════════════ ENTRY — MODE PICKER ════════════════ */
              if (step === 0) return (
                <motion.div key="s0"
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={transition}
                  className="py-12"
                >
                  <div className="text-center mb-10">
                    <h1 className="text-3xl font-bold tracking-tight mb-2">How would you like to start?</h1>
                    <p className="text-[var(--rt-text-2)] text-sm">Pick a path — you can always switch.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">

                    {/* Card 1 — Discover Roles */}
                    <div
                      className="bg-[var(--rt-surface)] border border-[var(--rt-border)] rounded-2xl p-6 [box-shadow:var(--rt-shadow-card)] flex flex-col gap-4 hover:border-[var(--rt-accent)] transition-all duration-200 cursor-pointer group"
                      onClick={() => setStep(1)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="w-12 h-12 rounded-xl bg-[var(--rt-accent-soft)] flex items-center justify-center text-2xl">🔍</div>
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[var(--rt-green-soft)] text-[var(--rt-green)]">Recommended</span>
                      </div>
                      <div>
                        <h3 className="text-base font-bold mb-1">Discover Roles</h3>
                        <p className="text-sm text-[var(--rt-text-2)] leading-relaxed">AI scans thousands of listings and surfaces the best matches for your background.</p>
                      </div>
                      <div className="flex flex-col gap-1.5 flex-1">
                        {['Scored by fit', 'Real-time listings', 'One-click select'].map(b => (
                          <span key={b} className="text-sm text-[var(--rt-green)] flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />{b}
                          </span>
                        ))}
                      </div>
                      <button
                        className="btn-primary w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
                        onClick={e => { e.stopPropagation(); setStep(1); }}
                      >
                        Start discovering →
                      </button>
                    </div>

                    {/* Card 2 — I have a role in mind */}
                    <div
                      className="bg-[var(--rt-surface)] border border-[var(--rt-border)] rounded-2xl p-6 [box-shadow:var(--rt-shadow-card)] flex flex-col gap-4 hover:border-[var(--rt-accent)] transition-all duration-200 cursor-pointer group"
                      onClick={() => setStep(2)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="w-12 h-12 rounded-xl bg-[var(--rt-accent-soft)] flex items-center justify-center text-2xl">📄</div>
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[var(--rt-accent-soft)] text-[var(--rt-accent)]">Most popular</span>
                      </div>
                      <div>
                        <h3 className="text-base font-bold mb-1">I have a role in mind</h3>
                        <p className="text-sm text-[var(--rt-text-2)] leading-relaxed">Paste a URL or job description. We'll extract the requirements and tailor your resume instantly.</p>
                      </div>
                      <div className="flex flex-col gap-1.5 flex-1">
                        {['Paste or URL fetch', 'Instant extraction', 'Ready in 60s'].map(b => (
                          <span key={b} className="text-sm text-[var(--rt-green)] flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />{b}
                          </span>
                        ))}
                      </div>
                      <button
                        className="btn-primary w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
                        onClick={e => { e.stopPropagation(); setStep(2); }}
                      >
                        Paste a job →
                      </button>
                    </div>

                    {/* Card 3 — Auto Apply */}
                    <div className="bg-[var(--rt-surface)] border border-[var(--rt-border)] rounded-2xl p-6 [box-shadow:var(--rt-shadow-card)] flex flex-col gap-4 opacity-80">
                      <div className="flex items-start justify-between">
                        <div className="w-12 h-12 rounded-xl bg-[rgba(217,119,6,0.1)] flex items-center justify-center text-2xl">⚡</div>
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[rgba(217,119,6,0.1)] text-[var(--rt-amber)]">Beta</span>
                      </div>
                      <div>
                        <h3 className="text-base font-bold mb-1">Auto Apply</h3>
                        <p className="text-sm text-[var(--rt-text-2)] leading-relaxed">We handle applications automatically. Your tailored resume, sent to matching roles while you sleep.</p>
                      </div>
                      <div className="flex flex-col gap-1.5 flex-1">
                        {['Set your filters', 'Auto-tailor each app', 'Track status'].map(b => (
                          <span key={b} className="text-sm text-[var(--rt-green)] flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />{b}
                          </span>
                        ))}
                      </div>
                      <button
                        className="w-full py-2.5 rounded-xl text-sm font-semibold border border-[var(--rt-border)] text-[var(--rt-text-2)] hover:bg-[var(--rt-surface-2)] transition-all"
                        onClick={() => setStep(1)}
                      >
                        Set up auto apply →
                      </button>
                    </div>
                  </div>
                </motion.div>
              );

              /* ════════════════ STEP 1 — DISCOVER ════════════════ */
              if (step === 1) return (
                <motion.div key="s1"
                  initial={{ opacity: 0, y: 24, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -16, filter: 'blur(4px)' }}
                  transition={transition}
                  className="py-8"
                >
                  <div className="w-full max-w-5xl mx-auto">

                    {/* Phase label */}
                    <div className="flex items-center gap-2 mb-6">
                      <span className="text-[10px] font-medium text-accent uppercase tracking-[0.25em]">Phase 01</span>
                      <span className="w-8 h-px bg-accent-soft" />
                      <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Find roles that fit</span>
                    </div>

                    <h2 className="text-2xl font-semibold tracking-tight mb-3">
                      Find Your{' '}
                      <span className="text-[var(--rt-accent)]">
                        Best Matches
                      </span>
                    </h2>
                    <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed mb-8 max-w-lg">
                      Upload your resume and we'll build a deep candidate profile, then search live job boards to surface the best opportunities — ranked by how well they match your background.
                    </p>

                    {/* Upload + prefs row */}
                    <div className="flex flex-col gap-5 mb-5">

                      {/* Resume upload */}
                      <div className={`${card} p-6 flex flex-col gap-4`}>
                        <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Your Resume</p>
                        <input ref={searchFileRef} type="file" accept=".docx"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleSearchResumeChange(f); }}
                          className="hidden" />

                        {defaultResume && !searchResumeFile ? (
                          <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/60 dark:bg-emerald-500/10 p-4 space-y-3">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center shrink-0">
                                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Saved default resume</p>
                                <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100 truncate">{defaultResume.filename}</p>
                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                                  Updated {new Date(defaultResume.updatedAt).toLocaleString()}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => searchFileRef.current?.click()}
                                className="px-3 py-2 rounded-xl text-xs font-semibold text-accent bg-white dark:bg-zinc-900 border border-accent-soft hover:bg-accent-soft dark:hover:bg-[var(--rt-accent-soft)] transition-colors"
                              >
                                Upload Override
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            onDragEnter={e => { e.preventDefault(); setIsDraggingSearch(true); }}
                            onDragLeave={e => { e.preventDefault(); setIsDraggingSearch(false); }}
                            onDrop={e => { e.preventDefault(); setIsDraggingSearch(false); const f = e.dataTransfer.files?.[0]; if (f) handleSearchResumeChange(f); }}
                            onDragOver={e => e.preventDefault()}
                            onClick={() => !searchResumeFile && searchFileRef.current?.click()}
                            className={`relative rounded-xl border-2 border-dashed p-8 text-center transition-all duration-300 flex flex-col items-center justify-center min-h-[160px] cursor-pointer ${
                              isDraggingSearch
                                ? 'border-accent bg-[var(--rt-accent-soft)]'
                                : searchResumeFile
                                ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-50/40 dark:bg-emerald-500/5'
                                : 'border-zinc-200 dark:border-zinc-800 hover:border-accent-soft'
                            }`}
                          >
                            {searchResumeFile ? (
                              <>
                                <button
                                  onClick={e => { e.stopPropagation(); handleSearchResumeChange(null); }}
                                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors z-20"
                                >
                                  <X className="w-3 h-3 text-zinc-500" />
                                </button>
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center shrink-0">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                  </div>
                                  <div className="text-left">
                                    <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200 max-w-[200px] truncate">{searchResumeFile.name}</p>
                                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">Override ready for this search</p>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className={`w-11 h-11 rounded-2xl mb-3 flex items-center justify-center transition-all ${isDraggingSearch ? 'bg-accent-soft rotate-3' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
                                  <Upload className={`w-5 h-5 ${isDraggingSearch ? 'text-accent' : 'text-zinc-400'}`} />
                                </div>
                                <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">Drop your resume or click to browse</p>
                                <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">DOCX only</p>
                              </>
                            )}
                          </div>
                        )}

                        {searchResumeFile && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => saveResumeAsDefault(searchResumeFile, { clearSearchOverride: true })}
                              disabled={defaultResumeSaving}
                              className="px-3 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
                            >
                              {defaultResumeSaving ? 'Saving…' : 'Save as Default'}
                            </button>
                          </div>
                        )}

                        {(defaultResumeLoading || defaultResumeSavedNotice || defaultResumeError) && (
                          <div className="space-y-1">
                            {defaultResumeLoading && (
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Loading saved default resume…</p>
                            )}
                            {defaultResumeSavedNotice && (
                              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">{defaultResumeSavedNotice}</p>
                            )}
                            {defaultResumeError && (
                              <p className="text-[11px] text-red-500">{defaultResumeError}</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Search preferences */}
                      <div className={`${card} p-6 flex flex-col gap-4`}>
                        <button
                          onClick={() => setShowSearchPrefs(p => !p)}
                          className="flex items-center justify-between w-full"
                        >
                          <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Search Preferences</p>
                          {showSearchPrefs
                            ? <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
                            : <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />}
                        </button>

                        {showSearchPrefs && (
                          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                            <div>
                              <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">City / Region</label>
                              <input type="text" value={searchPreferences.location ?? ''}
                                onChange={e => setSearchPreferences(p => ({ ...p, location: e.target.value || undefined }))}
                                placeholder="e.g. Bengaluru, Maharashtra" className={`${inputCls} py-2`} />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">Country</label>
                              <input type="text" value={searchPreferences.country ?? ''}
                                onChange={e => setSearchPreferences(p => ({ ...p, country: e.target.value || undefined }))}
                                placeholder="e.g. India" className={`${inputCls} py-2`} />
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
                              <span className="text-[10px] font-medium text-accent uppercase tracking-widest">Search Criteria</span>
                              {profilePreviewLoading && <Loader2 className="w-3 h-3 text-zinc-400 animate-spin" />}
                            </div>
                            {!profilePreviewLoading && (showProfilePreview
                              ? <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
                              : <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />)}
                          </button>

                          {showProfilePreview && profilePreview && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div>
                                <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mb-1.5">Roles</p>
                                <div className="flex flex-wrap gap-1">
                                  {expandRoleTitles(profilePreview.primaryTitles).map(t => (
                                    <span key={t} className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-accent-soft text-accent">{t}</span>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mb-1.5">Seniority</p>
                                <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 capitalize">{profilePreview.seniorityLevel}</span>
                                <span className="ml-1.5 text-[11px] text-zinc-400">· {profilePreview.yearsOfExperience} yrs</span>
                              </div>
                              <div>
                                <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mb-1.5">Industries</p>
                                <div className="flex flex-wrap gap-1">
                                  {profilePreview.industries.slice(0, 3).map(i => (
                                    <span key={i} className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 capitalize">{i}</span>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-wider mb-1.5">Top Skills</p>
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
                      <button onClick={handleSearchJobs} disabled={searchLoading || (!searchResumeFile && !defaultResume)}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white btn-primary active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 shadow-lg">
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
                            <h3 className="text-base font-semibold tracking-tight">
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
                            <button onClick={() => { setJobSearchResults([]); setCandidateProfile(null); setSelectedJob(null); }}
                              className="text-xs font-semibold text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
                              ← Search Again
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {jobSearchResults.map(job => {
                            const fitColors = {
                              strong:   'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
                              good:     'bg-accent-soft text-accent border-accent-soft',
                              moderate: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
                              stretch:  'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
                            };
                            const remoteLabel = job.remoteType !== 'unknown' ? job.remoteType : null;
                            return (
                              <div key={job.id} className={`${card} p-5 flex flex-col gap-3 hover:border-accent-soft transition-colors`}>
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
                                  {job.sourceHost && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 uppercase">
                                      {job.sourceType === 'ats' ? 'ATS' : job.sourceType === 'direct' ? 'Direct' : job.sourceType === 'board' ? 'Board' : 'Source'} · {job.sourceHost.replace(/^www\./, '')}
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
                                      <span key={s} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-accent-soft text-accent">
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
                                  <button onClick={() => { void handleSelectJob(job); }}
                                    disabled={selectingJobId === job.id}
                                    className="flex-1 py-2 rounded-xl text-xs font-semibold text-white btn-primary active:scale-[0.98] transition-all shadow-sm">
                                    {selectingJobId === job.id ? <span className="inline-flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading full JD…</span> : 'Use This Job →'}
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
                        <button onClick={() => { setJobSearchResults([]); setCandidateProfile(null); setSelectedJob(null); }}
                          className="text-xs font-semibold text-accent hover:underline">
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
                  className="flex items-center justify-center py-8"
                >
                  <div className="w-full max-w-md">

                    {/* Phase label */}
                    <div className="flex items-center gap-3 mb-6">
                      <button onClick={() => setStep(1)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                        <ArrowLeft className="w-3.5 h-3.5 text-zinc-500" />
                      </button>
                      <span className="text-[10px] font-medium text-accent uppercase tracking-[0.25em]">Phase 02</span>
                      <span className="w-8 h-px bg-accent-soft" />
                      <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Target job description</span>
                    </div>

                    {/* Selected job banner */}
                    {selectedJob && (
                      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-3 px-4 py-3 mb-5 rounded-xl bg-accent-soft dark:bg-[var(--rt-accent-soft)] border border-accent-soft">
                        <Briefcase className="w-4 h-4 text-accent shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-accent truncate">{selectedJob.title} at {selectedJob.company}</p>
                          <p className="text-[10px] text-accent/70 dark:text-accent/60">Pre-filled from job search</p>
                        </div>
                        <button onClick={() => { setSelectedJob(null); setJdText(''); setJdType('paste'); }}
                          className="w-5 h-5 flex items-center justify-center text-[var(--rt-accent-soft)] hover:text-accent transition-colors shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </motion.div>
                    )}

                    <h2 className="text-2xl font-semibold tracking-tight mb-3">
                      Target Job{' '}
                      <span className="text-[var(--rt-accent)]">
                        Description
                      </span>
                    </h2>
                    <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed mb-10 max-w-sm">
                      Paste, link, or upload the role you're targeting. We extract requirements and tailor to match.
                    </p>

                    {/* Source type selector */}
                    <div className="flex gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 mb-5">
                      {(['paste', 'url', 'file'] as const).map(t => (
                        <button key={t} onClick={() => setJdType(t)}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-xl transition-all duration-200 ${
                            jdType === t
                              ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
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
                            onClick={() => jdFileRef.current?.click()}
                            className={`relative rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-300 ${
                              isDraggingJd
                                ? 'border-accent bg-[var(--rt-accent-soft)]'
                                : 'border-zinc-200 dark:border-zinc-800 hover:border-accent-soft'
                            }`}
                          >
                            <input ref={jdFileRef} type="file" accept=".pdf,.docx,.txt"
                              onChange={e => { setJdFile(e.target.files?.[0] || null); setIsDraggingJd(false); }}
                              className="hidden" />
                            <div className={`w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center transition-all ${isDraggingJd ? 'bg-accent-soft rotate-6' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
                              <Upload className={`w-5 h-5 ${isDraggingJd ? 'text-accent' : 'text-zinc-400'}`} />
                            </div>
                            <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">{jdFile ? jdFile.name : 'Drop or click to browse'}</p>
                            <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">PDF · DOCX · TXT</p>
                          </div>
                        </motion.div>
                      )}
                      {jdType === 'paste' && (
                        <motion.div key="paste" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-3">
                          <textarea value={jdText} onChange={e => setJdText(e.target.value)} rows={6}
                            placeholder="Paste the full job description here..."
                            className={`${inputCls} resize-none text-sm leading-relaxed`} />
                          {jdHistory.length > 0 && (
                            <div>
                              <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-2">Recent JDs</p>
                              <div className="space-y-1.5">
                                {jdHistory.map(h => (
                                  <button key={h.id} onClick={() => setJdText(h.cleanText)}
                                    className="w-full text-left px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-accent-soft hover:bg-accent-soft/40 dark:hover:bg-[var(--rt-accent-soft)] transition-colors group">
                                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 truncate group-hover:text-accent dark:group-hover:text-accent">{h.title}</p>
                                    <p className="text-[10px] text-zinc-400 dark:text-zinc-600 mt-0.5">{new Date(h.savedAt).toLocaleDateString()}</p>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {isLoading && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl bg-accent-soft dark:bg-[var(--rt-accent-soft)] border border-accent-soft mt-5"
                      >
                        <Loader2 className="w-4 h-4 text-accent animate-spin shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-accent">Extracting job description…</p>
                          <p className="text-[11px] text-accent/70 dark:text-accent/60 mt-0.5">Parsing requirements, keywords, and must-haves</p>
                        </div>
                      </motion.div>
                    )}
                    <button
                      onClick={handleExtractJd}
                      disabled={isLoading || (jdType === 'url' && !jdUrl) || (jdType === 'file' && !jdFile) || (jdType === 'paste' && !jdText)}
                      className="mt-3 w-full relative flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm text-white btn-primary active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 shadow-lg"
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
                  className="py-8"
                >
                  <div className="w-full max-w-4xl">

                    {/* Phase label */}
                    <div className="flex items-center gap-3 mb-5">
                      <button onClick={() => setStep(2)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                        <ArrowLeft className="w-3.5 h-3.5 text-zinc-500" />
                      </button>
                      <span className="text-[10px] font-medium text-accent uppercase tracking-[0.25em]">Phase 03</span>
                      <span className="w-8 h-px bg-accent-soft" />
                      <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Resume & prefs</span>
                    </div>

                    <h2 className="text-2xl font-semibold tracking-tight mb-2">
                      Reference Resume{' '}
                      <span className="text-[var(--rt-accent)]">
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
                          <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-3">Job Context</p>
                          {normalizedJd && (
                            <motion.div
                              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                              data-testid="jd-preview-card"
                              className="flex items-start gap-3"
                            >
                              <span className={`shrink-0 px-2 py-0.5 rounded-md text-[11px] font-semibold border mt-0.5 ${
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
                            <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Tailoring Hints</span>
                          </div>
                          <p className="text-[10px] text-zinc-400 dark:text-zinc-600">Help the AI frame the right emphasis</p>
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
                        <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Your Profile</p>
                        <input ref={resumeFileRef} type="file" accept=".docx"
                          onChange={e => { setResumeFile(e.target.files?.[0] || null); setIsDraggingResume(false); setDefaultResumeSavedNotice(null); }}
                          className="hidden" />

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
                              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-accent bg-accent-soft dark:bg-[var(--rt-accent-soft)] hover:bg-accent-soft dark:hover:bg-[var(--rt-accent-soft)] transition-colors border border-accent-soft shrink-0">
                              Change
                            </button>
                          </motion.div>
                        )}

                        {!searchResumeFile && !resumeFile && defaultResume && (
                          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                            className="rounded-lg border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/60 dark:bg-emerald-500/10 p-4 space-y-3">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center shrink-0">
                                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Saved default resume</p>
                                <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100 truncate">{defaultResume.filename}</p>
                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                                  Tailoring will use this resume by default.
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button onClick={() => resumeFileRef.current?.click()}
                                className="px-3 py-2 rounded-xl text-xs font-semibold text-accent bg-white dark:bg-zinc-900 border border-accent-soft hover:bg-accent-soft dark:hover:bg-[var(--rt-accent-soft)] transition-colors">
                                Upload Override
                              </button>
                            </div>
                          </motion.div>
                        )}

                        {(!searchResumeFile || resumeFile) && !(!resumeFile && !searchResumeFile && defaultResume) && <div
                          data-testid="drag-zone-resume"
                          onDragEnter={() => setIsDraggingResume(true)}
                          onDragLeave={() => setIsDraggingResume(false)}
                          onDrop={() => setIsDraggingResume(false)}
                          onDragOver={e => e.preventDefault()}
                          onClick={() => resumeFileRef.current?.click()}
                          className={`relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-300 flex-1 flex flex-col items-center justify-center min-h-[180px] ${
                            isDraggingResume
                              ? 'border-accent bg-[var(--rt-accent-soft)] dark:bg-[var(--rt-accent-soft)]'
                              : resumeFile
                              ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-50/40 dark:bg-emerald-500/5'
                              : 'border-zinc-200 dark:border-zinc-800 hover:border-accent-soft'
                          }`}
                        >
                          {resumeFile ? (
                            <div className="flex items-center gap-4">
                              <div className="w-11 h-11 rounded-xl bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center shrink-0">
                                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                              </div>
                              <div className="text-left">
                                <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200 max-w-[180px] truncate">{resumeFile.name}</p>
                                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">Override ready for this run</p>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className={`w-12 h-12 rounded-2xl mb-4 flex items-center justify-center transition-all duration-300 ${isDraggingResume ? 'bg-accent-soft dark:bg-[var(--rt-accent-soft)] scale-110 rotate-3' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
                                <Upload className={`w-5 h-5 transition-colors ${isDraggingResume ? 'text-accent' : 'text-zinc-400'}`} />
                              </div>
                              <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">Drop your resume or click to browse</p>
                              <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">DOCX only</p>
                            </>
                          )}
                        </div>}

                        {resumeFile && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => saveResumeAsDefault(resumeFile, { clearTailorOverride: true })}
                              disabled={defaultResumeSaving}
                              className="px-3 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
                            >
                              {defaultResumeSaving ? 'Saving…' : 'Save as Default'}
                            </button>
                          </div>
                        )}

                        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 px-3 py-2 bg-zinc-50/80 dark:bg-zinc-900/60">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Active resume source</p>
                          <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1">
                            {resumeFile
                              ? 'One-off uploaded override'
                              : searchResumeFile
                              ? 'Resume carried over from Step 1'
                              : defaultResume
                              ? 'Saved default resume'
                              : 'No resume selected yet'}
                          </p>
                        </div>

                        {(defaultResumeLoading || defaultResumeSavedNotice || defaultResumeError) && (
                          <div className="space-y-1">
                            {defaultResumeLoading && (
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Loading saved default resume…</p>
                            )}
                            {defaultResumeSavedNotice && (
                              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">{defaultResumeSavedNotice}</p>
                            )}
                            {defaultResumeError && (
                              <p className="text-[11px] text-red-500">{defaultResumeError}</p>
                            )}
                          </div>
                        )}

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
                              className="h-full bg-[var(--rt-accent)] rounded-full"
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
                        <button onClick={handleTailorResume} disabled={isLoading || (!resumeFile && !searchResumeFile && !defaultResume)}
                          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white btn-primary active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 shadow-lg">
                          {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Preparing...</> : 'Tailor Resume →'}
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
                const tailoredResume = 'tailoredResume' in result ? result.tailoredResume : null;
                const canProceedToApply = Boolean(tailoredResume);
                const safePreScore = normalizeScore(result.analysis.preAlignmentScore);
                const safePostScore = normalizeScore(result.analysis.alignmentScore, safePreScore);
                const safeFitScore = normalizeScore(result.tailoringPlan?.gapAnalysis?.fitScore, safePreScore);
                const scoreBreakdown = result.analysis.scoreBreakdown ?? {
                  keywordCoverage: 0,
                  niceCoverage: 0,
                  titleMatch: false,
                  seniorityMatch: false,
                  structureScore: 0,
                };

                return (
                  <motion.div key="s4"
                    initial={{ opacity: 0, y: 24, filter: 'blur(6px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={transition}
                    className="py-8"
                  >
                    <div className="max-w-[1300px] mx-auto">

                      {/* ── Page header ── */}
                      <div className="mb-8">
                        <div className="flex items-center gap-3 mb-3">
                          <button onClick={() => setStep(3)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                            <ArrowLeft className="w-3.5 h-3.5 text-zinc-500" />
                          </button>
                          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border ${
                            blocked
                              ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                          }`}>
                            {blocked ? <ShieldAlert className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                            {blocked ? 'Validation warnings detected' : 'Validation passed'}
                          </div>
                        </div>
                        <h2 className="text-2xl font-semibold tracking-tight">
                          {blocked ? 'Validation Warnings Detected' : 'Resume Tailored Successfully'}
                        </h2>
                        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1.5">
                          {blocked
                            ? 'Ambiguous claims detected. Review before downloading and submitting.'
                            : 'All claims validated against your source resume.'}
                        </p>
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-600 mt-2">
                          Resume source: {formatResumeSourceLabel(result.resumeSource)}
                        </p>
                      </div>

                      {/* ── Main bento grid ── */}
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">

                        {/* Fit Assessment + ATS Score — left */}
                        {(() => {
                          const gapAnalysis = result.tailoringPlan?.gapAnalysis;
                          const hasFitNarrative = Boolean(
                            gapAnalysis &&
                            (gapAnalysis.topStrengths.length > 0 ||
                              gapAnalysis.repositioningAngle ||
                              gapAnalysis.keyGaps.length > 0)
                          );
                          const preScore = safePreScore;
                          const postScore = safePostScore;
                          const scoreDelta = postScore - preScore;

                          return (
                            <div className={`${card} p-6 lg:col-span-3 flex flex-col gap-5 overflow-y-auto max-h-[calc(100vh-10rem)]`}>

                              {/* ── Section 1: Fit Assessment ── always visible */}
                              <div className="flex flex-col gap-3">
                                  <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Role Fit</p>
                                  <div className="flex items-center gap-3">
                                    <ScoreRing score={safeFitScore} active={step === 4} size={76} />
                                    <div>
                                      <p className={`text-sm font-semibold ${alignmentColor(safeFitScore)}`}>
                                        {alignmentLabel(safeFitScore)}
                                      </p>
                                      <p className="text-[11px] text-zinc-400 dark:text-zinc-600 mt-0.5">Semantic fit score</p>
                                    </div>
                                  </div>
                                  {!hasFitNarrative && (
                                    <p className="text-[11px] text-zinc-400 dark:text-zinc-600 italic">Using a verified fallback estimate from the resume-to-role analysis.</p>
                                  )}
                                  {hasFitNarrative && (<>

                                  {/* Repositioning angle */}
                                  {gapAnalysis.repositioningAngle && (
                                    <p className="text-[11px] italic text-zinc-500 dark:text-zinc-500 leading-relaxed border-l-2 border-accent-soft pl-2.5">
                                      {gapAnalysis.repositioningAngle}
                                    </p>
                                  )}

                                  {/* Top strengths */}
                                  {gapAnalysis.topStrengths.length > 0 && (
                                    <div>
                                      <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-500 uppercase tracking-widest mb-1.5">Why you're qualified</p>
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
                                        <p className="text-[10px] font-medium text-amber-600 dark:text-amber-500 uppercase tracking-widest mb-1.5">Genuine gaps</p>
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
                              <div className={`flex flex-col gap-4 ${hasFitNarrative ? 'pt-4 border-t border-zinc-100 dark:border-zinc-800' : 'pt-2'}`}>
                                <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">ATS Score</p>

                                <div className="flex flex-col items-center text-center">
                                  <ScoreRing score={postScore} active={step === 4} />
                                  <div className="mt-3">
                                    <p data-testid="alignment-score-label" className={`text-sm font-semibold ${alignmentColor(postScore)}`}>
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
                                  <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-2">Matched</p>
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
                                    <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-2">Missing Must-Haves</p>
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
                              <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Tailored Resume</p>
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
                              <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Validation Gate</p>
                            </div>
                            {validation.isValid ? (
                              <p className="text-sm text-emerald-600 dark:text-emerald-400 leading-relaxed">
                                No blocking issues. Ready for download.
                              </p>
                            ) : (
                              <div>
                                <p className="text-sm text-amber-600 dark:text-amber-400 mb-3 leading-relaxed">
                                  Ambiguous claims detected. Review before downloading.
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
                              <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-2">Executive Summary</p>
                              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-5">{tailoredResume.summary}</p>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="space-y-2.5 mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800">
                            <button
                              onClick={blocked ? () => setShowBlockedConfirm(true) : handleDownload}
                              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white btn-primary active:scale-[0.98] transition-all duration-200 shadow-lg">
                              <Download className="w-4 h-4" />
                              {blocked ? 'Download with Warnings ↓' : 'Download Tailored Resume (DOCX)'}
                            </button>

                            {showBlockedConfirm && (
                              <div className="rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4 space-y-3">
                                <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                                  This resume has validation warnings. The AI flagged some claims as ambiguous — they may still be accurate. Download and review?
                                </p>
                                <div className="flex gap-2">
                                  <button onClick={() => { setShowBlockedConfirm(false); handleDownload(); }}
                                    className="flex-1 py-2 rounded-xl text-xs font-semibold text-white bg-amber-500 hover:bg-amber-400 transition-colors">
                                    Download Anyway
                                  </button>
                                  <button onClick={() => setShowBlockedConfirm(false)}
                                    className="flex-1 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 transition-colors">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Apply hint — shown when a tailored resume is available */}
                            {canProceedToApply && (
                              <div className={`rounded-xl border px-3.5 py-3 text-xs leading-relaxed transition-all duration-300 ${
                                hasDownloaded
                                  ? blocked
                                    ? 'border-amber-400/40 bg-amber-500/10 dark:bg-amber-500/10'
                                    : 'border-accent-soft bg-[var(--rt-accent-soft)] dark:bg-[var(--rt-accent-soft)]'
                                  : blocked
                                    ? 'border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10'
                                    : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50'
                              }`}>
                                {hasDownloaded ? (
                                  <>
                                    <p className={`font-bold mb-1 ${blocked ? 'text-amber-700 dark:text-amber-400' : 'text-accent'}`}>
                                      {blocked ? 'Resume ready — review required in Apply stage' : '✓ Resume ready — next step'}
                                    </p>
                                    <p className="text-zinc-600 dark:text-zinc-400">
                                      {blocked
                                        ? 'Proceed to Apply, review the flagged claims and any unsupported required fields, then confirm submit only after checking the portal.'
                                        : <>Open the job application form, then click the <span className="font-semibold text-zinc-800 dark:text-zinc-200">Resume Tailor Pro</span> extension icon in Chrome and hit <span className="font-semibold text-zinc-800 dark:text-zinc-200">Fill application form →</span></>}
                                    </p>
                                  </>
                                ) : (
                                  <>
                                    <p className={`font-bold mb-1 ${blocked ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                      {blocked ? 'You can still continue to Apply' : '🧩 Auto-fill job applications'}
                                    </p>
                                    <p className="text-zinc-500 dark:text-zinc-500">
                                      {blocked
                                        ? 'After downloading, Stage 5 will still open so you can use the extension, review flagged claims, and complete the portal carefully.'
                                        : <>After downloading, use the <span className="font-semibold text-zinc-700 dark:text-zinc-300">Resume Tailor Pro Chrome extension</span> to pre-fill application forms on any career site. Run <code className="bg-zinc-200 dark:bg-zinc-800 px-1 rounded text-[11px]">npm run build:ext</code> to build it.</>}
                                    </p>
                                  </>
                                )}
                              </div>
                            )}

                            {blocked && (
                              <button data-testid="retry-resume" onClick={handleRetryResume}
                                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white btn-primary active:scale-[0.98] transition-all duration-200 shadow-lg">
                                Try a Different Resume →
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
                        <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-4">Strategic Recommendations</p>
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
                                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent-soft0 shrink-0" />
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{rec}</p>
                                  </motion.div>
                                ))}
                              </div>
                              {recs.length > 3 && (
                                <button data-testid="show-more-recs" onClick={() => setShowAllRecs(!showAllRecs)}
                                  className="mt-4 text-xs font-semibold text-accent hover:text-accent uppercase tracking-wide transition-colors">
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
              if (step === 5 && result) {
                const company = result.jdCompanyName ?? 'the Role';
                return (
                  <motion.div key="s5"
                    initial={{ opacity: 0, y: 24, filter: 'blur(6px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -16, filter: 'blur(4px)' }}
                    transition={transition}
                    className="flex items-center justify-center py-8"
                  >
                    <div className="w-full max-w-2xl">

                      {/* Phase label */}
                      <div className="flex items-center gap-3 mb-6">
                        <button onClick={() => setStep(4)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                          <ArrowLeft className="w-3.5 h-3.5 text-zinc-500" />
                        </button>
                        <span className="text-[10px] font-medium text-accent uppercase tracking-[0.25em]">Phase 05</span>
                        <span className="w-8 h-px bg-accent-soft" />
                        <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Submit Application</span>
                      </div>

                      <h2 className="text-2xl font-semibold tracking-tight mb-2">
                        Apply to{' '}
                        <span className="text-[var(--rt-accent)]">
                          {company}
                        </span>
                      </h2>
                      <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-8">
                        Stage 5 now runs through the Resume Tailor extension in your own browser session. The backend plans the fill, the extension executes it on the live job portal, and the app shows checkpoints before you confirm submit.
                      </p>

                      {result.blocked && (
                        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                          Validation warnings were detected in the tailored resume. You can still use Apply, but review flagged claims and portal fields before you confirm submit.
                        </div>
                      )}

                      {/* URL input */}
                      <div className={`${card} p-5 mb-5`}>
                        <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-2">
                          Job Application URL
                        </label>
                        <input
                          type="url"
                          value={applyUrl}
                          onChange={e => { setApplyUrl(e.target.value); setApplySession(null); setApplyError(null); }}
                          placeholder="https://company.com/apply/job-123"
                          className={inputCls}
                          disabled={applyStarting || ['starting', 'filling', 'submitting'].includes(applySession?.status ?? '')}
                        />

                        <div className="mt-3 flex items-center gap-2 text-xs">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold ${
                            extensionInstalled
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                          }`}>
                            {extensionInstalled ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                            {extensionInstalled ? 'Extension connected' : 'Extension required'}
                          </span>
                          <span className="text-zinc-400 dark:text-zinc-600">
                            Executor: {applySession?.executorMode ?? 'extension'}
                          </span>
                          {applySession?.portalType && (
                            <span className="text-zinc-400 dark:text-zinc-600 capitalize">
                              Portal: {applySession.portalType}
                            </span>
                          )}
                        </div>

                        <div className="mt-4 space-y-2.5">
                          {!applySession || applySession.status === 'failed' ? (
                            <button
                              onClick={handleAgentApply}
                              disabled={!applyUrl.trim() || applyStarting || !extensionInstalled}
                              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white btn-primary active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 shadow-lg"
                            >
                              {applyStarting && <Loader2 className="w-4 h-4 animate-spin" />}
                              Start Hybrid Apply →
                            </button>
                          ) : ['created', 'queued', 'starting', 'filling', 'submitting'].includes(applySession.status) ? (
                            <div className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-sm text-accent bg-accent-soft dark:bg-[var(--rt-accent-soft)] border border-accent-soft">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              {applySession.latestMessage || 'Opening the form and filling supported fields…'}
                            </div>
                          ) : applySession.status === 'protected' ? (
                            <div className="w-full flex items-center gap-2.5 px-4 py-3.5 rounded-xl text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                              <ShieldAlert className="w-4 h-4 shrink-0" />
                              <span>Bot protection detected (Cloudflare / CAPTCHA). <button onClick={() => applyUrl.trim() && window.open(applyUrl.trim(), '_blank')} className="underline font-semibold">Open manually ↗</button></span>
                            </div>
                          ) : applySession.status === 'review_required' ? (
                            <>
                              <div className="w-full flex items-center gap-2.5 px-4 py-3.5 rounded-xl text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span>{applySession.latestMessage || 'Review the highlighted fields in the job portal, then ask the extension to re-check the page.'}</span>
                              </div>
                              <button
                                onClick={handleResumeAgentApply}
                                disabled={applyStarting}
                                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white bg-amber-600 hover:bg-amber-500 active:scale-[0.98] disabled:opacity-40 transition-all duration-200 shadow-lg shadow-amber-500/20"
                              >
                                {applyStarting && <Loader2 className="w-4 h-4 animate-spin" />}
                                Re-check Form →
                              </button>
                            </>
                          ) : applySession.status === 'ready_to_submit' ? (
                            <button
                              onClick={handleAgentSubmit}
                              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] transition-all duration-200 shadow-lg shadow-emerald-500/25"
                            >
                              <CheckCircle2 className="w-4 h-4" />Confirm Submit
                            </button>
                          ) : applySession.status === 'submitted' ? (
                            <div className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 font-semibold">
                              <CheckCircle2 className="w-4 h-4" />Application submitted!
                            </div>
                          ) : applySession.status === 'unsupported' ? (
                            <div className="w-full flex items-center gap-2.5 px-4 py-3.5 rounded-xl text-sm text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700">
                              <AlertCircle className="w-4 h-4 shrink-0" />
                              <span>{applySession.latestMessage || 'This portal needs manual completion right now.'}</span>
                            </div>
                          ) : applySession.status === 'manual_required' ? (
                            <div className="w-full flex items-center gap-2.5 px-4 py-3.5 rounded-xl text-sm text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700">
                              <AlertCircle className="w-4 h-4 shrink-0" />
                              <span>{applySession.latestMessage || 'The portal needs manual completion from this point.'}</span>
                            </div>
                          ) : null}

                          <button
                            onClick={() => applyUrl.trim() && window.open(applyUrl.trim(), '_blank')}
                            className="w-full py-2 text-xs font-semibold text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors"
                          >
                            Open portal manually ↗
                          </button>

                          {applyError && (
                            <div className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                              {applyError}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Agent stats */}
                      {applySession && (
                        <div className="flex gap-3 mb-5">
                          <div className="flex-1 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl px-4 py-3 text-center">
                            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{applySession.filledCount}</p>
                            <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-500 uppercase tracking-widest mt-0.5">Fields filled</p>
                          </div>
                          <div className="flex-1 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl px-4 py-3 text-center">
                            <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{applySession.reviewCount}</p>
                            <p className="text-[10px] font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest mt-0.5">Need attention</p>
                          </div>
                        </div>
                      )}

                      {/* Screenshot preview */}
                      {applySession?.latestScreenshot && (
                        <div className={`${card} p-3 mb-5 overflow-hidden`}>
                          <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-2 px-1">
                            {applySession.status === 'submitted' ? 'Submission confirmation' : 'Latest form checkpoint'}
                          </p>
                          <img
                            src={`data:image/png;base64,${applySession.latestScreenshot}`}
                            alt="Application form screenshot"
                            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700"
                          />
                        </div>
                      )}

                      {/* Application profile for deterministic filling */}
                      <div className={`${card} p-5 mb-5`}>
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div>
                            <p className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Application Profile</p>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Saved to your account and reused across supported job portals.</p>
                          </div>
                          <button
                            onClick={() => void saveApplicationProfile()}
                            disabled={applicationProfileSaving || applicationProfileLoading}
                            className="shrink-0 px-3 py-2 rounded-xl text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white disabled:opacity-40 transition-colors"
                          >
                            {applicationProfileSaving ? 'Saving…' : 'Save Profile'}
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {APPLICATION_PROFILE_FIELDS.map((field) => (
                            <label key={field.key} className="block">
                              <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">{field.label}</span>
                              <input
                                type={field.type ?? 'text'}
                                value={applicationProfile[field.key] ?? ''}
                                onChange={(e) => handleApplicationProfileChange(field.key, e.target.value)}
                                placeholder={field.placeholder}
                                className={`${inputCls} py-2.5`}
                              />
                            </label>
                          ))}
                        </div>

                        {(applicationProfileLoading || applicationProfileSavedNotice || applicationProfileError) && (
                          <div className="mt-4 space-y-2">
                            {applicationProfileLoading && (
                              <div className="text-xs text-zinc-400 dark:text-zinc-500">Loading saved profile…</div>
                            )}
                            {applicationProfileSavedNotice && (
                              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                                {applicationProfileSavedNotice}
                              </div>
                            )}
                            {applicationProfileError && (
                              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                                {applicationProfileError}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Nav buttons */}
                      <div className="space-y-2">
                        <button onClick={() => setStep(4)}
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

        {/* ── Session-expired re-login modal ── */}
        {sessionExpired && (
          <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4">
            <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-2xl">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
                  <LogOut className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <h2 className="text-lg font-semibold">Session Expired</h2>
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">Your session has expired. Sign in again to continue — your current work is preserved.</p>
              <form onSubmit={handleAuth} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">Email</label>
                  <input
                    type="email" required value={authEmail}
                    onChange={e => setAuthEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--rt-accent-soft)] focus:border-accent transition-all"
                    placeholder="you@example.com"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">Password</label>
                  <input
                    type="password" required value={authPassword}
                    onChange={e => setAuthPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--rt-accent-soft)] focus:border-accent transition-all"
                    placeholder="••••••••"
                  />
                </div>
                {authError && (
                  <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{authError}</p>
                )}
                <button
                  type="submit" disabled={authLoading}
                  className="w-full py-3 rounded-xl btn-primary text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {authLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Sign In & Continue
                </button>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
