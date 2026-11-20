import { AlertTriangle, Film, Loader2, RefreshCw } from "lucide-react";
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ToastProvider } from "./components/ui";
import { probeBackend } from "./lib/api";
import { initProjects } from "./lib/projectStore";
import { resumePending } from "./lib/pipeline";
import ApiConfig from "./pages/ApiConfig";
import CharacterStudio from "./pages/CharacterStudio";
import Editor from "./pages/Editor";
import Generator from "./pages/Generator";
import GenerationHistory from "./pages/History";
import ImageToVideo from "./pages/ImageToVideo";
import Overview from "./pages/Overview";
import Projects from "./pages/Projects";
import SceneGenerator from "./pages/SceneGenerator";
import Settings from "./pages/Settings";
import SoundEffects from "./pages/SoundEffects";
import StoryWriter from "./pages/StoryWriter";
import Storyboard from "./pages/Storyboard";
import Subtitles from "./pages/Subtitles";
import Voiceover from "./pages/Voiceover";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("TJ AI VIDEO FACTORY crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <div className="glass max-w-md p-6">
          <AlertTriangle className="mx-auto h-6 w-6 text-amber-300" />
          <h1 className="mt-3 font-display text-lg font-semibold text-white">The studio hit an error</h1>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-400">
            Your projects are still in local storage. Reload to recover; if it repeats, open Diagnostics after reload.
          </p>
          <pre className="mt-3 max-h-32 overflow-auto rounded-lg border border-white/8 bg-ink-950/70 p-2 text-left font-mono text-[10px] text-rose-200">
            {this.state.error.message}
          </pre>
          <button onClick={() => window.location.reload()} className="btn-primary mt-4">
            <RefreshCw className="h-4 w-4" /> Reload studio
          </button>
        </div>
      </div>
    );
  }
}

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-neon-blue to-neon-violet shadow-glow">
        <Film className="h-7 w-7 text-white" />
      </div>
      <div className="text-center">
        <p className="font-display text-sm font-bold tracking-[0.18em] text-white">TJ AI VIDEO FACTORY</p>
        <p className="mt-1 flex items-center justify-center gap-2 text-[11px] text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Opening the local studio…
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      await initProjects();
      await probeBackend(true);
      if (!alive) return;
      setReady(true);
      // Resume tasks that were running when the tab closed.
      setTimeout(() => void resumePending(), 600);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!ready) return <Splash />;

  return (
    <ErrorBoundary>
      <ToastProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Overview />} />
            <Route path="generator" element={<Generator />} />
            <Route path="story" element={<StoryWriter />} />
            <Route path="characters" element={<CharacterStudio />} />
            <Route path="storyboard" element={<Storyboard />} />
            <Route path="scenes" element={<SceneGenerator />} />
            <Route path="image-to-video" element={<ImageToVideo />} />
            <Route path="voiceover" element={<Voiceover />} />
            <Route path="subtitles" element={<Subtitles />} />
            <Route path="sound" element={<SoundEffects />} />
            <Route path="editor" element={<Editor />} />
            <Route path="projects" element={<Projects />} />
            <Route path="history" element={<GenerationHistory />} />
            <Route path="api" element={<ApiConfig />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </ToastProvider>
    </ErrorBoundary>
  );
}
