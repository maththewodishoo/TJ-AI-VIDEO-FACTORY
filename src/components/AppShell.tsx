import {
  AudioLines,
  Captions,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Film,
  FolderOpen,
  History,
  ImagePlus,
  LayoutDashboard,
  LayoutList,
  Mic,
  MoreHorizontal,
  PenLine,
  Plug,
  Settings,
  Sparkles,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { backendLabel, useBackend } from "../lib/api";
import { useEngine } from "../lib/pipeline";
import { useActiveProject } from "../lib/projectStore";
import { Badge, cn as classNames } from "./ui";

interface NavEntry {
  to: string;
  label: string;
  icon: ReactNode;
  mobile?: boolean;
}

const NAV: { group: string; entries: NavEntry[] }[] = [
  {
    group: "Studio",
    entries: [
      { to: "/", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" />, mobile: true },
      { to: "/generator", label: "AI Video Generator", icon: <Wand2 className="h-4 w-4" />, mobile: true },
      { to: "/story", label: "AI Story Writer", icon: <PenLine className="h-4 w-4" /> },
      { to: "/characters", label: "Character Studio", icon: <Users className="h-4 w-4" /> },
      { to: "/storyboard", label: "Storyboard Generator", icon: <LayoutList className="h-4 w-4" /> },
      { to: "/scenes", label: "Scene Generator", icon: <Clapperboard className="h-4 w-4" />, mobile: true },
      { to: "/image-to-video", label: "Image to Video", icon: <ImagePlus className="h-4 w-4" /> },
    ],
  },
  {
    group: "Post",
    entries: [
      { to: "/voiceover", label: "AI Voiceover", icon: <Mic className="h-4 w-4" /> },
      { to: "/subtitles", label: "Subtitle Studio", icon: <Captions className="h-4 w-4" /> },
      { to: "/sound", label: "Sound Effects Studio", icon: <AudioLines className="h-4 w-4" /> },
      { to: "/editor", label: "Video Editor", icon: <Film className="h-4 w-4" />, mobile: true },
    ],
  },
  {
    group: "Library",
    entries: [
      { to: "/projects", label: "Projects Library", icon: <FolderOpen className="h-4 w-4" /> },
      { to: "/history", label: "Generation History", icon: <History className="h-4 w-4" /> },
    ],
  },
  {
    group: "System",
    entries: [
      { to: "/api", label: "API Configuration", icon: <Plug className="h-4 w-4" /> },
      { to: "/settings", label: "Settings & Diagnostics", icon: <Settings className="h-4 w-4" /> },
    ],
  },
];

const ALL_ENTRIES = NAV.flatMap((group) => group.entries);

function NavItems({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav className="space-y-5">
      {NAV.map((group) => (
        <div key={group.group}>
          {!collapsed && (
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {group.group}
            </p>
          )}
          <div className="space-y-0.5">
            {group.entries.map((entry) => (
              <NavLink
                key={entry.to}
                to={entry.to}
                end={entry.to === "/"}
                onClick={onNavigate}
                title={collapsed ? entry.label : undefined}
                className={({ isActive }) =>
                  classNames("nav-item", isActive && "nav-item-active", collapsed && "justify-center px-2")
                }
              >
                <span className="shrink-0">{entry.icon}</span>
                {!collapsed && <span className="truncate">{entry.label}</span>}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-3 px-1">
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-neon-blue to-neon-violet shadow-glow">
        <Film className="h-5 w-5 text-white" />
        <Sparkles className="absolute -right-1 -top-1 h-3.5 w-3.5 text-cyan-200" />
      </span>
      {!collapsed && (
        <span className="min-w-0">
          <span className="block font-display text-[13px] font-bold leading-tight tracking-tight text-white">
            TJ AI VIDEO
            <br />
            FACTORY
          </span>
          <span className="mt-0.5 block text-[9.5px] uppercase tracking-[0.14em] text-slate-500">
            Zero mandatory cost
          </span>
        </span>
      )}
    </Link>
  );
}

function JobBanner() {
  const engine = useEngine();
  if (!engine.busy) return null;
  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-neon-blue/25 bg-neon-blue/[0.07] px-4 py-3">
      <span className="relative mt-1 flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon-blue opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-neon-blue" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-medium text-sky-100">
          {engine.message || "Working…"}
          {engine.activeScenes.length > 0 && (
            <span className="ml-2 text-sky-300/70">{engine.activeScenes.length} in flight</span>
          )}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-400">
          Progress is saved — you can navigate away, refresh, or lock your phone.
        </p>
      </div>
      <Link to="/scenes" className="btn-ghost btn-sm shrink-0 text-sky-200 hover:bg-white/10">
        View
      </Link>
    </div>
  );
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("tj.sidebar") === "collapsed");
  const [moreOpen, setMoreOpen] = useState(false);
  const backend = useBackend();
  const project = useActiveProject();
  const location = useLocation();

  useEffect(() => {
    localStorage.setItem("tj.sidebar", collapsed ? "collapsed" : "expanded");
  }, [collapsed]);

  useEffect(() => {
    setMoreOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [location.pathname]);

  const activeLabel = ALL_ENTRIES.find(
    (entry) => entry.to === location.pathname || (entry.to !== "/" && location.pathname.startsWith(entry.to)),
  )?.label;

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside
        className={classNames(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-white/8 bg-ink-900/70 px-3 py-5 backdrop-blur-2xl transition-[width] duration-300 lg:flex",
          collapsed ? "w-[76px]" : "w-[262px]",
        )}
      >
        <Brand collapsed={collapsed} />
        <div className="mt-7 flex-1 overflow-y-auto pr-0.5 scroll-thin">
          <NavItems collapsed={collapsed} />
        </div>
        <div className="mt-4 space-y-2 border-t border-white/8 pt-4">
          {!collapsed && (
            <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Active project</p>
              <p className="mt-1 truncate text-[12.5px] font-medium text-slate-200">
                {project?.name || "No project yet"}
              </p>
              <Link to="/projects" className="mt-2 inline-flex text-[11px] text-neon-blue hover:text-white">
                Manage projects →
              </Link>
            </div>
          )}
          <div className={classNames("flex items-center gap-2", collapsed ? "justify-center" : "justify-between")}>
            <span className="flex items-center gap-2 text-[11px] text-slate-400">
              <span
                className={classNames(
                  "h-1.5 w-1.5 rounded-full",
                  backend.mode === "direct" ? "bg-amber-400" : backend.mode === "proxy" ? "bg-emerald-400" : "bg-slate-500",
                )}
              />
              {!collapsed && backendLabel(backend)}
            </span>
            <button
              onClick={() => setCollapsed((value) => !value)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/8 bg-ink-950/80 px-4 py-3 pt-safe backdrop-blur-xl lg:hidden">
        <Brand collapsed={false} />
        <Link to="/projects" className="min-w-0 text-right">
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Project</p>
          <p className="max-w-[140px] truncate text-[12px] font-medium text-slate-200">
            {project?.name || "Create one"}
          </p>
        </Link>
      </header>

      <main className={classNames("px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pt-8", collapsed ? "lg:pl-[108px]" : "lg:pl-[294px]")}>
        <div className="mx-auto w-full max-w-6xl">
          {location.pathname !== "/" && (
            <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 lg:hidden">
              {activeLabel}
            </p>
          )}
          <JobBanner />
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink-950/92 backdrop-blur-2xl lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5 pb-safe pt-1.5">
          {ALL_ENTRIES.filter((entry) => entry.mobile || entry.to === "/projects").slice(0, 4).map((entry) => (
            <NavLink
              key={entry.to}
              to={entry.to}
              end={entry.to === "/"}
              className={({ isActive }) =>
                classNames(
                  "flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium transition",
                  isActive ? "text-neon-blue" : "text-slate-500",
                )
              }
            >
              {entry.icon}
              <span className="truncate">{entry.label.split(" ")[0]}</span>
            </NavLink>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className={classNames(
              "flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium",
              moreOpen ? "text-neon-blue" : "text-slate-500",
            )}
          >
            <MoreHorizontal className="h-4 w-4" />
            More
          </button>
        </div>
      </nav>

      {/* Mobile "more" sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-ink-950/80 backdrop-blur-md lg:hidden" onClick={() => setMoreOpen(false)}>
          <div
            className="max-h-[80dvh] overflow-y-auto rounded-t-3xl border-t border-white/12 bg-ink-900 p-4 pb-safe scroll-thin animate-fade-up"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-white">All sections</h2>
              <button onClick={() => setMoreOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/10" aria-label="Close menu">
                <X className="h-4 w-4" />
              </button>
            </div>
            <NavItems collapsed={false} onNavigate={() => setMoreOpen(false)} />
            <div className="mt-4 flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
              <span className="text-[11px] text-slate-400">Backend</span>
              <Badge tone={backend.mode === "direct" ? "amber" : "green"}>{backendLabel(backend)}</Badge>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
