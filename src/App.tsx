/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useRef, useState } from 'react';


declare global { interface Window { LZString: any } }

function encodePayload(obj: unknown): string {
  return window.LZString.compressToEncodedURIComponent(JSON.stringify(obj));
}
function decodePayload<T>(s: string): T {
  const raw = window.LZString.decompressFromEncodedURIComponent(s);
  if (!raw) throw new Error('Decode failed');
  return JSON.parse(raw) as T;
}

// --- Types ---
type Dir = 'RIGHT' | 'DOWN';
export type Variant = 'LEFT_CLUE_RIGHT' | 'ABOVE_CLUE_DOWN' | 'LEFT_CLUE_DOWN' | 'ABOVE_CLUE_RIGHT' | 'LEFT_OF_CLUE_DOWN';

type Clue = { text: string; variant: Variant; answer?: string };
type Cell = {
  type: 'empty' | 'clue';
  clue?: Clue;
  letter?: string;
  solutionIndex?: number | null;
  expected?: string | null;
};
type Segment = {
  id: string;
  cluePos: { r: number; c: number };
  dir: Dir;
  start: { r: number; c: number };
  cells: { r: number; c: number }[];
  clue: Clue;
};

const N = 12;
const LS_KEY = 'schwedenraetsel_v1';

// --- Utils ---
const emptyGrid = (): Cell[][] =>
  Array.from({ length: N }, () =>
    Array.from({ length: N }, () => ({
      type: 'empty',
      letter: '',
      solutionIndex: null,
      expected: null,
    }))
  );

const inBounds = (r: number, c: number) => r >= 0 && r < N && c >= 0 && c < N;
const advance = (r: number, c: number, dir: Dir) =>
  dir === 'RIGHT' ? { r, c: c + 1 } : { r: r + 1, c };

function letterFromKey(e: KeyboardEvent): string | null {
  if (e.key.length === 1 && /[a-zA-ZäöüÄÖÜß]/.test(e.key)) return e.key.toUpperCase();
  return null;
}
function cloneGrid(g: Cell[][]): Cell[][] {
  return g.map(row => row.map(c => ({ ...c, clue: c.clue ? { ...c.clue } : undefined })));
}
function normalizeAnswer(s: string) {
  return s?.trim().toUpperCase().replace(/[^A-ZÄÖÜß]/g, '') || '';
}

// --- Build segments from clues ---
function buildSegments(grid: Cell[][]): Segment[] {
  const segs: Segment[] = [];

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const cell = grid[r][c];
      if (cell.type !== 'clue' || !cell.clue) continue;
      const clue = cell.clue;

      // Defaults
      let start: { r: number; c: number } = { r, c: c + 1 };
      let dir: Dir = 'RIGHT';

      const variant: Variant = (clue.variant ?? 'LEFT_CLUE_RIGHT') as Variant;

      switch (variant) {
        case 'LEFT_CLUE_RIGHT':
          start = { r, c: c + 1 }; dir = 'RIGHT';
          break;

        case 'ABOVE_CLUE_DOWN':
          start = { r: r + 1, c }; dir = 'DOWN';
          break;

        case 'LEFT_CLUE_DOWN':
          start = { r, c: c + 1 }; dir = 'DOWN';
          break;

        case 'ABOVE_CLUE_RIGHT':
          start = { r: r + 1, c }; dir = 'RIGHT';
          break;

        case 'LEFT_OF_CLUE_DOWN':     // ✅ neu: Pfeil links vom Hinweis, Lösung ↓
          start = { r, c: c - 1 };
          dir = 'DOWN';
          break;

        default:
          start = { r, c: c + 1 }; dir = 'RIGHT';
          break;
      }

      // Falls der Start außerhalb des Grids läge, diesen Hinweis überspringen
      if (!inBounds(start.r, start.c)) continue;

      const cells: { r: number; c: number }[] = [];
      let cur = { ...start };
      while (inBounds(cur.r, cur.c)) {
        if (grid[cur.r][cur.c].type === 'clue') break;
        cells.push({ ...cur });
        const nxt = advance(cur.r, cur.c, dir);
        if (!inBounds(nxt.r, nxt.c)) break;
        if (grid[nxt.r][nxt.c].type === 'clue') break;
        cur = nxt;
      }

      segs.push({ id: `${r}-${c}`, cluePos: { r, c }, dir, start, cells, clue });
    }
  }
  return segs;
}

function mapExpected(g: Cell[][], segs?: Segment[]) {
  const grid = cloneGrid(g);
  grid.forEach(row => row.forEach(c => (c.expected = null)));
  const segments = segs ?? buildSegments(grid);
  for (const seg of segments) {
    if (!seg.clue.answer) continue;
    const letters = seg.clue.answer.replace(/\s+/g, '').toUpperCase().split('');
    for (let i = 0; i < seg.cells.length && i < letters.length; i++) {
      const { r, c } = seg.cells[i];
      grid[r][c].expected = letters[i];
    }
  }
  return grid;
}

/** Konfetti-Canvas */
function ConfettiCanvas() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cnv = ref.current!; const ctx = cnv.getContext('2d')!;
    const dpr = Math.max(1, (window.devicePixelRatio || 1));
    function resize() {
      const w = innerWidth, h = innerHeight;
      cnv.width = Math.floor(w * dpr); cnv.height = Math.floor(h * dpr);
      cnv.style.width = `${w}px`; cnv.style.height = `${h}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr);
    }
    resize(); addEventListener('resize', resize);
    type P = { x:number;y:number;vx:number;vy:number;r:number;rot:number;vr:number;color:string };
    const colors = ['#22d3ee','#f97316','#84cc16','#a78bfa','#eab308','#f43f5e','#10b981'];
    const parts: P[] = Array.from({length:140},()=>({
      x: Math.random()*innerWidth, y: -20-Math.random()*200,
      vx: -1+Math.random()*2, vy: 2+Math.random()*2,
      r: 3+Math.random()*4, rot: Math.random()*Math.PI*2,
      vr: -0.2+Math.random()*0.4, color: colors[(Math.random()*colors.length)|0]
    }));
    let raf=0; const gravity=0.05, drag=0.995;
    function tick(){
      const w=innerWidth,h=innerHeight; ctx.clearRect(0,0,w,h);
      for(const p of parts){
        p.vx*=drag; p.vy=p.vy*drag+gravity; p.x+=p.vx; p.y+=p.vy; p.rot+=p.vr;
        if(p.y>h+50){ p.y=-20; p.x=Math.random()*w; p.vy=2+Math.random()*2; }
        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
        ctx.fillStyle=p.color; ctx.fillRect(-p.r,-p.r,p.r*2,p.r*2); ctx.restore();
      }
      raf=requestAnimationFrame(tick);
    }
    raf=requestAnimationFrame(tick);
    return ()=>{ cancelAnimationFrame(raf); removeEventListener('resize',resize); };
  }, []);
  return <canvas ref={ref} style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:999}} />;
}

// --- App ---
type SettingsTab = 'file' | 'sound' | 'share';

export default function App() {
  const [grid, setGrid] = useState<Cell[][]>(() => emptyGrid());
  const [mode, setMode] = useState<'edit' | 'play'>('edit');
  const [solutionMode, setSolutionMode] = useState(false);
  const [solutionNext, setSolutionNext] = useState(1);
  const [locked, setLocked] = useState(false);

  // Timer
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [winTimeMs, setWinTimeMs] = useState<number | null>(null);

  // Start-/Win-Popups
  const [showStart, setShowStart] = useState(false);
  const [startStage, setStartStage] = useState<number>(0);
  const [showWin, setShowWin] = useState(false);

  // Countdown vorm Start
  const [preCount, setPreCount] = useState<number | null>(null);

  const prevAllCorrect = useRef(false);
  const [warnedLS, setWarnedLS] = useState(false);

  // Flashing
  const [flashingSegs, setFlashingSegs] = useState<Set<string>>(new Set());
  const prevSolvedRef = useRef<Set<string>>(new Set());

  // File input
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- Sounds ---
  const CLICK_URL = '/sounds/Blopp_drück.mp3';
  const START_URL = '/sounds/Maumau.mp3';

  // --- Globale Lautstärke ---
  const MUSIC_MASTER = 0.6;

  // Playlist-Typ
  type PlaylistKey = 'lofi' | 'rock' | 'techno';

  // Dateien liegen unter: public/sounds/backgroundmusic/<playlist>/
  const PLAYLISTS: Record<PlaylistKey, string[]> = {
    lofi: [
      '/sounds/backgroundmusic/lofi/lofi_1.mp3',
      '/sounds/backgroundmusic/lofi/lofi_2.mp3',
      '/sounds/backgroundmusic/lofi/lofi_3.mp3',
    ],
    rock: [
      '/sounds/backgroundmusic/rock/rock_1.mp3',
      '/sounds/backgroundmusic/rock/rock_2.mp3',
      '/sounds/backgroundmusic/rock/rock_3.mp3',
    ],
    techno: [
      '/sounds/backgroundmusic/techno/techno_1.mp3',
      '/sounds/backgroundmusic/techno/techno_2.mp3',
      '/sounds/backgroundmusic/techno/techno_3.mp3',
    ],
  };

  const clickAudioRef = useRef<HTMLAudioElement | null>(null);
  const startAudioRef = useRef<HTMLAudioElement | null>(null);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);

  // === Fade-in Steuerung (Musik) ===
  const fadeRafRef = useRef<number | null>(null);
  const fadeOnNextPlayRef = useRef<boolean>(true); // beim nächsten Play reinfaden
  const targetMusicVolRef = useRef<number>(0);

  // UI-State für Sound (persistiert)
  const [soundMuted, setSoundMuted] = useState<boolean>(() => {
    try { return localStorage.getItem('sound_muted') === '1'; } catch { return false; }
  });

  // Effekte-Lautstärke (Fallback auf alten Key sound_volume)
  const [soundVolume, setSoundVolume] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('effects_volume') ?? localStorage.getItem('sound_volume');
      const v = Number(raw);
      return v >= 1 && v <= 10 ? v : 6;
    } catch { return 6; }
  });

  // Musik-Lautstärke separat
  const [musicVolume, setMusicVolume] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem('music_volume'));
      return v >= 0.5 && v <= 10 ? v : 4;
    } catch { return 4; }
  });

  // Ziel-Lautstärke für Fade aktuell halten
  useEffect(() => {
    targetMusicVolRef.current = Math.min(1, Math.max(0, (musicVolume / 10) * MUSIC_MASTER));
  }, [musicVolume]);  

  // Playlist + aktueller Track
  const [playlist, setPlaylist] = useState<PlaylistKey>(() => {
    const p = localStorage.getItem('music_playlist') as PlaylistKey | null;
    return p ?? 'lofi';
  });
  const [trackIdx, setTrackIdx] = useState<number>(() => {
    const n = Number(localStorage.getItem('music_track_idx') ?? '0');
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });

  // Refs für Audio + aktuelle Playlist (für Events)
  const playlistRef = useRef<PlaylistKey>(playlist);
  useEffect(() => { playlistRef.current = playlist; }, [playlist]);

  const userPausedRef = useRef(false);

  // aktuell auszuspielender Track (oder null, wenn Liste leer)
  const currentTrack = useMemo(() => {
    const arr = PLAYLISTS[playlist] ?? [];
    if (!arr.length) return null;
    const idx = ((trackIdx % arr.length) + arr.length) % arr.length;
    return arr[idx];
  }, [playlist, trackIdx]);

  const startBgMusic = () => {
    const a = musicAudioRef.current;
    if (!a || soundMuted) return;
  
    // Falls noch kein Track geladen ist, jetzt setzen
    if (!a.src && currentTrack) {
      a.src = currentTrack;
      a.currentTime = 0;
      a.load();
    }
  
    void a.play().catch(() => {
    });
  };
  

  // Audios anlegen
  useEffect(() => {
    const click = new Audio(CLICK_URL);
    const start = new Audio(START_URL);
    const music = new Audio();         // src wird dynamisch gesetzt
    click.preload = 'auto';
    start.preload = 'auto';
    music.preload = 'auto';
    music.loop = false;

    clickAudioRef.current  = click;
    startAudioRef.current  = start;
    musicAudioRef.current  = music;

    const onEnded = () => {
      const arr = PLAYLISTS[playlistRef.current] ?? [];
      if (!arr.length) return;
      setTrackIdx(prev => {
        const next = (prev + 1) % arr.length;
        try { localStorage.setItem('music_track_idx', String(next)); } catch {}
        return next;
      });
    };

    const onPlay  = () => {
      setIsPlaying(true);
      const a = musicAudioRef.current;
      if (!a) return;
      if (fadeOnNextPlayRef.current) {
        fadeOnNextPlayRef.current = false;
        a.volume = 0;                                          // Start bei 0
        // 10s in Ziel-Lautstärke reinfaden
        fadeMusicTo(targetMusicVolRef.current, 10000);
      }
    };
    const onPause = () => setIsPlaying(false);

    music.addEventListener('ended', onEnded);
    music.addEventListener('play',  onPlay);
    music.addEventListener('pause', onPause);

    return () => {
      music.removeEventListener('ended', onEnded);
      music.removeEventListener('play',  onPlay);
      music.removeEventListener('pause', onPause);
      if (fadeRafRef.current) cancelAnimationFrame(fadeRafRef.current);

      clickAudioRef.current = null;
      startAudioRef.current = null;
      musicAudioRef.current?.pause();
      musicAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const resumeOnPointer = () => {
      const a = musicAudioRef.current;
      if (!a) return;
      if (!soundMuted && !userPausedRef.current && a.src && a.paused) {
        void a.play().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', resumeOnPointer);
    return () => window.removeEventListener('pointerdown', resumeOnPointer);
  }, [soundMuted]);
  

  // Fade-Funktion
  const fadeMusicTo = (target: number, durationMs = 10000) => {
    const a = musicAudioRef.current;
    if (!a) return;
    if (fadeRafRef.current) cancelAnimationFrame(fadeRafRef.current);

    const start = performance.now();
    const startVol = a.volume;

    const step = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      a.volume = startVol + (target - startVol) * p;
      if (p < 1) {
        fadeRafRef.current = requestAnimationFrame(step);
      } else {
        fadeRafRef.current = null;
      }
    };
    fadeRafRef.current = requestAnimationFrame(step);
  };

  // aktuellen Track laden/abspielen, wenn sich playlist/trackIdx ändert
  useEffect(() => {
    const a = musicAudioRef.current;
    if (!a) return;
  
    if (!currentTrack) {
      a.pause();
      a.removeAttribute('src');
      a.load();
      return;
    }
  
    // Quelle setzen und aktiv laden
    a.src = currentTrack;
    a.currentTime = 0;
    a.load();
  
    // Nur automatisch starten, wenn nicht gemutet
    if (!soundMuted) {
      a.play().catch(() => {
        // Autoplay-Block → okay, User kann einmal ⏯️ drücken
      });
    }
  }, [currentTrack, soundMuted]);  

  // Lautstärke/Mute auf Audios anwenden + speichern
  useEffect(() => {
    const effVol = Math.min(1, Math.max(0.0, soundVolume / 10));
    const musVol = Math.min(1, Math.max(0.0, (musicVolume / 10) * MUSIC_MASTER));

    const apply = (a: HTMLAudioElement | null, vol: number, isMusic = false) => {
      if (!a) return;
      a.muted = soundMuted;
      // Während eines Fades die Musik-Lautstärke nicht hart überschreiben
      if (!isMusic || fadeRafRef.current === null) a.volume = vol;
    };
    apply(clickAudioRef.current, effVol);
    apply(startAudioRef.current, effVol);
    apply(musicAudioRef.current, musVol, true);

    try {
      localStorage.setItem('sound_muted', soundMuted ? '1' : '0');
      localStorage.setItem('effects_volume', String(soundVolume));
      localStorage.setItem('sound_volume', String(soundVolume)); // Backwards-compat
      localStorage.setItem('music_volume', String(musicVolume));
    } catch {}

    if (soundMuted) {
      musicAudioRef.current?.pause();
    } else {
      // falls bereits ein Track gesetzt ist, spielen
      void musicAudioRef.current?.play().catch(() => {});
    }
  }, [soundMuted, soundVolume, musicVolume]);

  useEffect(() => {
    try { localStorage.setItem('music_playlist', playlist); } catch {}
    // Beim Wechsel immer bei 0 starten
    setTrackIdx(0);
    try { localStorage.setItem('music_track_idx', '0'); } catch {}
  }, [playlist]);

  const playClick = () => {
    const a = clickAudioRef.current;
    if (!a) return;
    try { a.currentTime = 0; void a.play(); } catch {}
  };

  const playStart = () => {
    const a = startAudioRef.current;
    if (!a) return;
    try { a.currentTime = 0; void a.play(); } catch {}
  };

  // Spielstatus
  const [isPlaying, setIsPlaying] = useState(false);

  // Nächstes Lied
  const nextTrack = () => {
    const arr = PLAYLISTS[playlistRef.current] ?? [];
    if (!arr.length) return;
    setTrackIdx(prev => {
      const next = (prev + 1) % arr.length;
      try { localStorage.setItem('music_track_idx', String(next)); } catch {}
      return next;
    });
  };

  // Play/Pause toggeln
  const togglePlayPause = () => {
    const a = musicAudioRef.current;
    if (!a) return;
  
    if (a.paused) {
      userPausedRef.current = false;
      if (!a.src && currentTrack) {
        a.src = currentTrack;
        a.currentTime = 0;
        a.load();
      }
      void a.play().catch(() => {});
    } else {
      userPausedRef.current = true;
      a.pause();
    }
  };
  

  // Globaler Button-Klicksound
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el.closest('button, .btn')) playClick();
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);

  // --- localStorage availability (once) ---
  const canLSRef = useRef<boolean>(true);
  if (canLSRef.current === true) {
    try {
      const t = '__ls_test__';
      localStorage.setItem(t, '1');
      localStorage.removeItem(t);
    } catch {
      canLSRef.current = false;
      if (!warnedLS) {
        console.warn('localStorage nicht verfügbar – Autosave deaktiviert.');
      }
    }
  }

  const formatTime = (ms: number) => {
    const total = Math.max(0, Math.floor(ms));
    const mm = Math.floor(total / 60000);
    const ss = String(Math.floor((total % 60000) / 1000)).padStart(2, '0');
    const hh = String(Math.floor((total % 1000) / 10)).padStart(2, '0');
    return `${mm}:${ss}.${hh}`;
  };

  // Schreibauswahl
  const [activeSeg, setActiveSeg] = useState<{ seg: Segment; index: number } | null>(null);

  // Hinweis-Modal
  const [modal, setModal] = useState<{ open: boolean; r: number; c: number; text: string; variant: Variant; answer: string; }>
    ({ open: false, r: 0, c: 0, text: '', variant: 'LEFT_CLUE_RIGHT', answer: '' });

  // ===== Draft Save helper =====
  const saveDraft = (g: Cell[][]) => {
    if (!canLSRef.current || locked) return;
    try {
      const slim = g.map(row =>
        row.map(({ type, clue, letter, solutionIndex }) => ({ type, clue, letter, solutionIndex }))
      );
      localStorage.setItem(LS_KEY, JSON.stringify({ grid: slim }));
    } catch (e) {
      if (!warnedLS) {
        setWarnedLS(true);
        alert('Hinweis: Autosave konnte nicht in deinem Browser gespeichert werden. Nutze „Speichern (Lokal)“.');
      }
      console.warn('Autosave fehlgeschlagen:', e);
    }
  };

  // ===== Laden: URL-Hash ODER lokaler Entwurf =====
  useEffect(() => {
    const raw = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
    const params = new URLSearchParams(raw);
    const p = params.get('p');
    const isLocked = params.get('lock') === '1';

    if (p) {
      const payload = decodePayload<{ grid: Cell[][] }>(p);
      const g = payload.grid.map(row =>
        row.map(cell => ({
          type: cell.type, clue: cell.clue, letter: cell.letter ?? '',
          solutionIndex: cell.solutionIndex ?? null, expected: null,
        }))
      );
      setGrid(g);
      setLocked(isLocked);
      setMode(isLocked ? 'play' : 'edit');
      setShowWin(false); setWinTimeMs(null);
      setTimeout(() => setGrid(g2 => mapExpected(g2)), 0);

      // Timer / Start je nach Modus
      setTimerRunning(false); setTimerStart(null); setElapsedMs(0);
      if (isLocked) { setShowStart(true); setStartStage(0); } else { setShowStart(false); setStartStage(0); }

      // Edit-Link -> Hash entfernen
      if (!isLocked) history.replaceState(null, '', location.pathname);
    } else {
      // Entwurf aus localStorage
      try {
        const rawLs = localStorage.getItem(LS_KEY);
        if (rawLs) {
          const saved = JSON.parse(rawLs) as { grid: Cell[][] };
          if (saved?.grid?.length === N) {
            const g = saved.grid.map(row =>
              row.map(cell => ({
                type: cell.type, clue: cell.clue, letter: cell.letter ?? '',
                solutionIndex: cell.solutionIndex ?? null, expected: null,
              }))
            );
            setGrid(g);
            setTimeout(() => setGrid(g2 => mapExpected(g2)), 0);
          }
        }
      } catch (e) {
        console.warn('Laden aus localStorage fehlgeschlagen:', e);
      }
    }
  }, []);

  // ===== Debounced Autosave (nur wenn NICHT locked) =====
  useEffect(() => {
    if (!canLSRef.current || locked) return;
    const id = setTimeout(() => saveDraft(grid), 250);
    return () => clearTimeout(id);
  }, [grid, locked]);

  // ===== Sichere Speicherungen beim Tab-Verlassen / Minimieren =====
  useEffect(() => {
    if (!canLSRef.current || locked) return;
    const onBeforeUnload = () => saveDraft(grid);
    const onVis = () => { if (document.visibilityState === 'hidden') saveDraft(grid); };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [grid, locked]);

  // Wenn in Play-Modus gewechselt wird: Startdialog zeigen
  useEffect(() => {
    if (mode === 'play' && timerStart === null && !showStart && !showWin) {
      setShowStart(true); setStartStage(0);
    }
  }, [mode]);

  // Segmente / Mappings
  const segments = useMemo(() => buildSegments(grid), [grid]);
  const arrowStarts = useMemo(() => {
    const m = new Map<string, Set<Dir>>();
    for (const s of segments) {
      const k = `${s.start.r}-${s.start.c}`;
      if (!m.has(k)) m.set(k, new Set<Dir>());
      m.get(k)!.add(s.dir);
    }
    return m;
  }, [segments]);
  
  const segmentByCell = useMemo(() => {
    const m = new Map<string, Segment>();
    for (const s of segments) for (const pos of s.cells) m.set(`${pos.r}-${pos.c}`, s);
    return m;
  }, [segments]);
  const completedSegIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of segments) {
      if (s.cells.length && s.cells.every(({ r, c }) => (grid[r][c].letter ?? '') !== '')) ids.add(s.id);
    }
    return ids;
  }, [segments, grid]);

  useEffect(() => { setGrid(g => mapExpected(g, segments)); }, [segments.length]);

  // Timer
  useEffect(() => {
    if (!timerRunning || !timerStart) return;
    const id = setInterval(() => setElapsedMs(Date.now() - timerStart), 33);
    return () => clearInterval(id);
  }, [timerRunning, timerStart]);

  // Korrekt?
  const allCorrect = useMemo(() => {
    let hasExpected = false;
    for (const row of grid) for (const cell of row) {
      if (cell.expected) { hasExpected = true; if (cell.letter !== cell.expected) return false; }
    }
    return hasExpected;
  }, [grid]);

  const solvedSegIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of segments) {
      let hasAnyExpected = false; let ok = true;
      for (const { r, c } of s.cells) {
        const cell = grid[r][c];
        if (cell.expected) { hasAnyExpected = true; if (cell.letter !== cell.expected) { ok = false; break; } }
        else { if ((cell.letter ?? '') !== '') { ok = false; break; } }
      }
      if (hasAnyExpected && ok) ids.add(s.id);
    }
    return ids;
  }, [segments, grid]);

  useEffect(() => {
    const prev = prevSolvedRef.current;
    const newly: string[] = [];
    solvedSegIds.forEach(id => { if (!prev.has(id)) newly.push(id); });
    if (newly.length) {
      newly.forEach(id => {
        setFlashingSegs(s => new Set(s).add(id));
        setTimeout(() => setFlashingSegs(s => { const ns = new Set(s); ns.delete(id); return ns; }), 600);
      });
    }
    prevSolvedRef.current = new Set(solvedSegIds);
  }, [solvedSegIds]);

  useEffect(() => {
    if (allCorrect && !prevAllCorrect.current) {
      setTimerRunning(false);
      setWinTimeMs(elapsedMs);
      setActiveSeg(null);
      setShowWin(true);
    }
    prevAllCorrect.current = allCorrect;
  }, [allCorrect, elapsedMs]);

  // Tastatur
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (mode !== 'play' || !activeSeg) return;
      const { seg, index } = activeSeg;

      if (e.key === 'Backspace') {
        e.preventDefault();
        setGrid(g => {
          const g2 = cloneGrid(g);
          const { r, c } = seg.cells[index];
          if (g2[r][c].letter) g2[r][c].letter = '';
          else if (index > 0) {
            const prev = seg.cells[index - 1];
            g2[prev.r][prev.c].letter = '';
            setActiveSeg({ seg, index: index - 1 });
          }
          return g2;
        });
        return;
      }

      const L = letterFromKey(e);
      if (L) {
        e.preventDefault();
        setGrid(g => {
          const g2 = cloneGrid(g);
          const { r, c } = seg.cells[index];
          g2[r][c].letter = L;
          if (index < seg.cells.length - 1) setActiveSeg({ seg, index: index + 1 });
          return g2;
        });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeSeg, mode]);

  // Lösungswort
  const solutionSlots = useMemo(() => {
    const pairs: { idx: number; ch: string }[] = [];
    grid.forEach(row => row.forEach(cell => {
      if ((cell.solutionIndex ?? 0) > 0) pairs.push({ idx: cell.solutionIndex!, ch: cell.letter || '' });
    }));
    const max = pairs.reduce((m, p) => Math.max(m, p.idx), 0);
    const arr = Array.from({ length: max }, () => '');
    pairs.forEach(p => (arr[p.idx - 1] = p.ch || ''));
    return arr;
  }, [grid]);
  // Lösungswort als String für das Win-Modal
  const solutionWord = useMemo(() => {
    return solutionSlots.length ? solutionSlots.join('') : '';
  }, [solutionSlots]);


  // --- Settings Modal State ---
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('file');

  function openSettings() {
    // Default: im Edit-Modus "Datei", sonst "Soundeinstellungen"
    setSettingsTab(mode === 'edit' && !locked ? 'file' : 'sound');
    setSettingsOpen(true);
  }

  // ---- Board width = grid width (Header = Grid-Breite) ----
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [boardW, setBoardW] = useState<number | null>(null);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const update = () => setBoardW(el.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  // --- Actions ---
  function onCellClick(r: number, c: number) {
    if (mode === 'edit' && locked) return;

    if (mode === 'edit') {
      if (solutionMode) {
        const wasEmpty = !grid[r][c].solutionIndex;
        const nextNo = solutionNext;
        setGrid(g => {
          const g2 = cloneGrid(g);
          const cell = g2[r][c];
          if (!cell.solutionIndex) cell.solutionIndex = nextNo; else cell.solutionIndex = null;
          return g2;
        });
        if (wasEmpty) setSolutionNext(n => n + 1);
        return;
      }
      const cell = grid[r][c];
      setModal({
        open: true, r, c,
        text: cell.clue?.text ?? '',
        variant: (cell.clue?.variant ?? 'LEFT_CLUE_RIGHT') as Variant,
        answer: cell.clue?.answer ?? ''
      });
      return;
    }

    // play
    const cell = grid[r][c];
    if (cell.type === 'clue' && cell.clue) {
      const seg = segments.find(s => s.cluePos.r === r && s.cluePos.c === c);
      if (seg) setActiveSeg({ seg, index: 0 });
      return;
    }
    const candidates = segments.filter(s => s.cells.some(cc => cc.r === r && cc.c === c));
    if (candidates.length === 0) return;
    const chosen = candidates.length === 1 ? candidates[0] : candidates[Math.random() < 0.5 ? 0 : 1];
    const idx = chosen.cells.findIndex(cc => cc.r === r && cc.c === c);
    setActiveSeg({ seg: chosen, index: Math.max(idx, 0) });
  }

  function onModalOk() {
    const { r, c, text, variant } = modal;
    setGrid(g => {
      const g2 = cloneGrid(g);
      const cell = g2[r][c];
      cell.type = 'clue';
      cell.clue = { text: text.trim(), variant, answer: normalizeAnswer(modal.answer) };
      return g2;
    });
    setTimeout(() => setGrid(g2 => mapExpected(g2)), 0);
    setModal(m => ({ ...m, open: false }));
  }

  function onDeleteClue() {
    const { r, c } = modal;
    setGrid(g => {
      const segs = buildSegments(g);
      const seg = segs.find(s => s.cluePos.r === r && s.cluePos.c === c);
      const g2 = cloneGrid(g);
      if (seg) for (const pos of seg.cells) g2[pos.r][pos.c].solutionIndex = null;
      g2[r][c].type = 'empty'; delete g2[r][c].clue;
      return mapExpected(g2);
    });
    setModal(m => ({ ...m, open: false }));
  }

  // Volllöschen: auch lokalen Entwurf entfernen
  function onClearAll() {
    if (!confirm('Rätsel wirklich komplett löschen (inkl. Entwurf)?')) return;
    try { localStorage.removeItem(LS_KEY); } catch {}
    setGrid(emptyGrid());
    setSolutionMode(false); setSolutionNext(1); setActiveSeg(null);
    history.replaceState(null, '', ' ');
    setTimerRunning(false); setTimerStart(null); setElapsedMs(0);
    setShowWin(false); setWinTimeMs(null); setShowStart(false); setStartStage(0);
    setMode('edit'); setLocked(false);
  }

  function onResetSolutionNumbers() {
    setGrid(g => {
      const g2 = cloneGrid(g);
      g2.forEach(row => row.forEach(c => (c.solutionIndex = null)));
      return g2;
    });
    setSolutionNext(1);
  }

  function resetTimer() {
    setTimerRunning(false);
    setTimerStart(null);
    setElapsedMs(0);
    setWinTimeMs(null);
    setShowStart(false);
  }
  function clearAnswers() {
    setGrid(g => {
      const g2 = cloneGrid(g);
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (g2[r][c].type === 'empty') {
            g2[r][c].letter = '';
          }
        }
      }
      return g2; // expected bleibt wie ist
    });
  }

  function makeUrl(lock: boolean) {
    const gridForShare = lock
      ? grid.map(row => row.map(cell => (cell.type === 'empty' ? { ...cell, letter: '' } : { ...cell })))
      : grid;
    const payload = { grid: gridForShare };
    const base = `${location.origin}${location.pathname}`;
    const p = encodePayload(payload);
    const suffix = lock ? `#p=${p}&lock=1` : `#p=${p}`;
    return `${base}${suffix}`;
  }

  function onCopyLink()       { navigator.clipboard.writeText(makeUrl(false)); alert('Link kopiert! (Editor)'); }
  function onCopySolveOnly()  { navigator.clipboard.writeText(makeUrl(true));  alert('Spiel-Link kopiert! (Nur Lösen)'); }

  // Countdown-Start (letzter START-Button)
  function beginCountdown() {
    playStart(); // Sound beim Start des Countdowns
    setPreCount(5);
  }

  // Countdown-Logik
  useEffect(() => {
    if (preCount === null) return;
    if (preCount > 0) {
      const id = setTimeout(() => setPreCount(p => (p ?? 1) - 1), 1000);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => {
      setPreCount(null);
      onStartGame();
    }, 1500);
    return () => clearTimeout(id);
  }, [preCount]);

  function onStartGame() {
    setShowStart(false);
    setTimerStart(Date.now());
    setElapsedMs(0);
    setTimerRunning(true);
  }

  // --- Speichern/Laden (JSON) ---
  function saveLocalJson() {
    const data = {
      version: 1,
      n: N,
      createdAt: new Date().toISOString(),
      grid: grid.map(row =>
        row.map(({ type, clue, letter, solutionIndex }) => ({ type, clue, letter, solutionIndex }))
      ),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raetsel-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleFileChosen(f: File) {
    try {
      const text = await f.text();
      const obj = JSON.parse(text) as { version: number; n: number; grid: any[][] };
      if (!obj || obj.version !== 1 || obj.n !== N || !Array.isArray(obj.grid)) {
        alert('Ungültige Datei.');
        return;
      }
      const g: Cell[][] = obj.grid.map(row =>
        row.map((cell: any) => ({
          type: cell.type === 'clue' ? 'clue' : 'empty',
          clue: cell.clue,
          letter: cell.letter ?? '',
          solutionIndex: cell.solutionIndex ?? null,
          expected: null,
        }))
      );
      setGrid(g);
      setTimeout(() => setGrid(g2 => mapExpected(g2)), 0);
      setMode('edit'); setLocked(false);
      resetTimer();
      saveDraft(g);
    } catch {
      alert('Konnte Datei nicht lesen.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function askLoadJson() {
    fileInputRef.current?.click();
  }

  // Clues ausblenden, solange Start offen (nur im Play-Modus)
  const hideClues = mode === 'play' && showStart;

  // --- Render ---
  return (
    <div className={`app ${showWin || showStart || modal.open || settingsOpen ? 'modal-open' : ''}`}>
      <style>{`
        @keyframes flashCorrect { 0%{background:#0f141b}25%{background:#065f46}50%{background:#059669}100%{background:#0f141b} }
        .cell.flash-correct { animation: flashCorrect 600ms ease-in-out; }

        /* Overlays (Bar über Backdrop, unter Modal-Fenster) */
        .modalBackdrop { z-index: 10000; position: fixed; inset: 0; background: rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; }
        .modal { position: relative; z-index: 10002; background:#111827; border:1px solid #253046; border-radius:12px; padding:16px; color:#e5e7eb; max-width: min(92vw, 900px); box-shadow: 0 20px 60px rgba(0,0,0,.45); }
        .app.modal-open .grid { pointer-events: none; }

        /* Header: sticky ganz oben, klickbar trotz Backdrop */
        .bar { position: sticky; top: 0; z-index: 10001; background:#0f141b; border-bottom:1px solid #253046; padding:10px 12px; display:flex; align-items:center; justify-content:space-between; gap:12px; }

        .countOverlay {
          position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
          pointer-events:none; font-weight:800; text-align:center;
        }
        .countNum { font-size: 96px; line-height: 1; }
        .countGo  { font-size: 36px; line-height: 1.2; }

        /* Settings layout */
        .settingsWrap { display:grid; grid-template-columns: 180px minmax(320px, 1fr); gap:14px; min-width: 560px; }
        .settingsNav { border-right:1px solid #2a3442; padding-right:10px; display:flex; flex-direction:column; gap:6px; }
        .settingsTabBtn { text-align:left; background:transparent; border:1px solid transparent; color:#e5e7eb; padding:8px 10px; border-radius:8px; cursor:pointer; }
        .settingsTabBtn:hover { background:#1d2430; border-color:#2a3442; }
        .settingsTabBtn.active { background:#243043; border-color:#324156; }
        .settingsBody { padding-left:4px; display:flex; flex-direction:column; gap:10px; }

        .lab { display:block; font-size:13px; opacity:.9; margin-top:8px; }
        .variantRow { display:flex; gap:8px; flex-wrap:wrap; }
        .variant { display:flex; align-items:center; gap:6px; }

        .actions { display:flex; gap:8px; flex-wrap:wrap; }
        .btn { background:#1f2937; border:1px solid #334155; color:#e5e7eb; padding:6px 10px; border-radius:8px; cursor:pointer; }
        .btn:hover { background:#243041; }
        .btn.active { background:#334155; }
        .btn.danger { background:#3b1f24; border-color:#5b2630; }
        .btn.danger:hover { background:#4a232a; }

        .center { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
        .right { display:flex; align-items:center; gap:8px; }

        /* Bühne mittig; Breite kommt per inline-style (boardW) */
        .board { margin: 0 auto; }

        /* Lösungswort-Slots */
        .solutionBar { display:flex; gap:6px; margin-top:12px; flex-wrap:wrap; }
        .slot { min-width:36px; height:40px; border:1px dashed #2a3442; border-radius:8px; display:flex; align-items:center; justify-content:center; padding:0 6px; background:#0f141b; }
        .slotNum { font-size:10px; opacity:.7; margin-right:6px; }
        .slotChar { font-weight:700; font-size:18px; }

        /* === Fancy Select (dark) === */
        .selectGroup{
          display:flex; align-items:center; gap:10px;
          border:1px solid #2a3442; background:#1d2430;
          padding:6px 10px; border-radius:10px;
        }
        .selectLabel{ opacity:.9; }

        .selectBox{ position:relative; }
        .selectEl{
          appearance:none; -webkit-appearance:none; -moz-appearance:none;
          background:#0f141b; color:#e5e7eb;
          border:1px solid #2a3442; border-radius:8px;
          padding:6px 28px 6px 10px;
          min-width:120px; font-weight:600;
        }
        .selectEl:hover{ border-color:#3a4a62; }
        .selectEl:focus{ outline:none; border-color:#60a5fa;
          box-shadow:0 0 0 3px rgba(96,165,250,.18);
        }

        .selectBox::after{
          content:""; pointer-events:none;
          position:absolute; right:10px; top:50%; margin-top:-5px;
          width:8px; height:8px;
          border-right:2px solid #94a3b8; border-bottom:2px solid #94a3b8;
          transform:rotate(45deg); transition:transform .15s ease;
        }
        .selectBox:focus-within::after{ transform:rotate(225deg); margin-top:-3px; }

        .selectEl option[disabled]{ color:#64748b; }

        .iconBtn{
          background:#0f141b; border:1px solid #2a3442; color:#e5e7eb;
          padding:6px 10px; border-radius:8px; cursor:pointer;
        }
        .iconBtn:hover{ background:#1a2331; border-color:#3a4a62; }
        
        /* Zellen sind Anker */
        .grid .cell { position: relative; }
        
        /* gemeinsame Basis */
        .arrow {
          position: absolute;
          width: 0; height: 0;
          pointer-events: none;
        }
        
        /* ► oben-links */
        .arrow.right {
          top: 4px; left: 4px;
          border-top: 7px solid transparent;
          border-bottom: 7px solid transparent;
          border-left: 12px solid #fff;
        }
        
        /* ▼ oben-rechts */
        .arrow.down {
          top: 4px; right: 4px; left: auto;
          border-left: 7px solid transparent;
          border-right: 7px solid transparent;
          border-top: 12px solid #fff;
        }
      `}</style>

      {showWin && <ConfettiCanvas />}

      <div className="board" style={{ width: boardW ? `${boardW}px` : undefined }}>
        <header className="bar">
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div className="selectGroup">
              <span className="selectLabel">Miau-Radio🐈</span>
              <div className="selectBox">
                <select
                  className="selectEl"
                  value={playlist}
                  onChange={e => setPlaylist(e.target.value as PlaylistKey)}
                >
                  <option value="lofi">Lofi</option>
                  <option value="rock">Rock</option>
                  <option value="techno">Techno</option>
                </select>
              </div>

              {/* Play/Pause */}
              <button
                className="iconBtn"
                type="button"
                onClick={togglePlayPause}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                ⏯️
              </button>

              {/* Nächstes Lied */}
              <button
                className="iconBtn"
                type="button"
                onClick={nextTrack}
                title="Nächstes Lied"
              >
                ⏭️
              </button>
            </div>
          </div>

          <div className="center">
            <span style={{ opacity:.9, padding:'6px 10px', border:'1px solid #2a3442', borderRadius:8, background:'#1d2430' }}>
              ⏱ {formatTime(winTimeMs ?? elapsedMs)}
            </span>

            {!locked ? (
              <>
                <button className={mode === 'edit' ? 'btn active' : 'btn'} onClick={() => setMode('edit')}>Editor</button>
                <button className={mode === 'play' ? 'btn active' : 'btn'} onClick={() => setMode('play')}>Lösen</button>

                {mode === 'edit' && (
                  <>
                    <label className="toggle" style={{display:'flex',alignItems:'center',gap:6}}>
                      <input type="checkbox" checked={solutionMode} onChange={e => setSolutionMode(e.target.checked)} />
                      Lösungswort-Modus
                    </label>
                    {solutionMode && (
                      <button className="btn" onClick={onResetSolutionNumbers}>Nummern zurücksetzen</button>
                    )}
                  </>
                )}

                <button className="btn" onClick={resetTimer}>Timer zurücksetzen</button>
              </>
            ) : (
              <span style={{opacity:.9}}>MinimalMB's Kreuzworträtsel</span>
            )}
          </div>

          <div className="right">
            <button className="btn" onClick={openSettings}>Einstellungen</button>
            {/* Für Laden (lokal) */}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileChosen(f);
              }}
            />
          </div>
        </header>

        {/* Grid */}
        <div className="grid" ref={gridRef}>
          {grid.map((row, r) => (
            <div className="row" key={r}>
              {row.map((cell, c) => {
                const isActive = !!activeSeg?.seg.cells.find(cc => cc.r === r && cc.c === c) &&
                                 activeSeg?.seg.cells[activeSeg.index]?.r === r &&
                                 activeSeg?.seg.cells[activeSeg.index]?.c === c;

                const segForCell = segmentByCell.get(`${r}-${c}`);
                const isFlashing = !!(segForCell && flashingSegs.has(segForCell.id));

                const wrongNow = !!(
                  segForCell && completedSegIds.has(segForCell.id) &&
                  cell.expected && cell.letter && cell.letter !== cell.expected
                );

                const classNames = [
                  'cell',
                  cell.type === 'clue' ? 'clue' : '',
                  wrongNow ? 'wrong' : '',
                  isActive ? 'active' : '',
                  isFlashing ? 'flash-correct' : ''
                ].filter(Boolean).join(' ');

                const startDirs = arrowStarts.get(`${r}-${c}`);

                return (
                  <div className={classNames} key={`${r}-${c}`} onClick={() => onCellClick(r, c)}>
                    {cell.type === 'clue' && cell.clue && (
                      <div className="clueText">{hideClues ? '' : cell.clue.text}</div>
                    )}
                    {cell.type === 'empty' && (cell.letter ?? '')}
                    {startDirs?.has('RIGHT') && <div className="arrow right" />}
                    {startDirs?.has('DOWN')  && <div className="arrow down"  />}
                    {cell.solutionIndex ? <div className="mini">{cell.solutionIndex}</div> : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {solutionSlots.length > 0 && (
          <div className="solutionBar">
            {solutionSlots.map((ch, i) => (
              <div className="slot" key={i}>
                <span className="slotNum">{i + 1}</span>
                <span className="slotChar">{ch}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hinweis-Modal */}
      {modal.open && !locked && (
        <div className="modalBackdrop" onClick={() => setModal(m => ({ ...m, open: false }))}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Hinweis anlegen</h3>

            <label className="lab">Frage / Hinweis</label>
            <textarea rows={4}
              value={modal.text}
              onChange={e => setModal(m => ({ ...m, text: e.target.value }))}
            />

            <label className="lab">Pfeil-Variante</label>
            <div className="variantRow">
              <label className="variant">
                <input type="radio" name="v" checked={modal.variant === 'LEFT_CLUE_RIGHT'}
                  onChange={() => setModal(m => ({ ...m, variant: 'LEFT_CLUE_RIGHT' }))} />
                <span>links Hinweis, Pfeil →</span>
              </label>
              <label className="variant">
                <input type="radio" name="v" checked={modal.variant === 'ABOVE_CLUE_DOWN'}
                  onChange={() => setModal(m => ({ ...m, variant: 'ABOVE_CLUE_DOWN' }))} />
                <span>oben Hinweis, Pfeil ↓</span>
              </label>
              <label className="variant">
                <input type="radio" name="v" checked={modal.variant === 'LEFT_CLUE_DOWN'}
                  onChange={() => setModal(m => ({ ...m, variant: 'LEFT_CLUE_DOWN' }))} />
                <span>links Hinweis, Pfeil ↓ (Start rechts, dann runter)</span>
              </label>
              <label className="variant">
                <input
                  type="radio" name="v" checked={modal.variant === 'ABOVE_CLUE_RIGHT'}
                  onChange={() => setModal(m => ({ ...m, variant: 'ABOVE_CLUE_RIGHT' }))}/>
                <span>oben Hinweis, Pfeil → (Start unten, dann rechts)</span>
              </label>
              <label className="variant">
                <input
                  type="radio" name="v" checked={modal.variant === 'LEFT_OF_CLUE_DOWN'}
                  onChange={() => setModal(m => ({ ...m, variant: 'LEFT_OF_CLUE_DOWN' }))}/>
                <span>links vom Hinweis, Pfeil ↓ (Start links, dann runter)</span>
              </label>
            </div>

            <label className="lab">Antwort (optional, für Prüfung)</label>
            <input type="text" placeholder="z.B. LAVA"
              value={modal.answer}
              onChange={e => setModal(m => ({ ...m, answer: e.target.value }))} />

            <div style={{ display:'flex', justifyContent:'space-between', gap:8, marginTop:12 }}>
              <div>
                <button className="btn danger" disabled={!grid[modal.r][modal.c].clue} onClick={onDeleteClue}>
                  Löschen
                </button>
              </div>
              <div className="actions">
                <button className="btn" onClick={onModalOk}>OK</button>
                <button className="btn" onClick={() => setModal(m => ({ ...m, open: false }))}>Abbrechen</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Start-Modal mit Minigame + Countdown */}
      {showStart && (
        <div className="modalBackdrop">
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{marginTop:0, textAlign:'center'}}>🐪EY! Bist du Bereit?🐪</h2>
            <p style={{ opacity:.9, marginTop:8, textAlign:'center' }}>
              Klicke doch ganz einfach auf den  <strong>START</strong> Button, um den Timer zu starten.
            </p>
            <p style={{ opacity:.9, marginTop:8, textAlign:'center' }}>
              <strong>🤭Hö Hö.. Hihihihi🤓</strong>
            </p>

            <div className="startArea" style={{ position:'relative', marginTop:12, height: 220, borderRadius: 10 }}>
            {startStage === 0 && preCount === null && (
              <div style={{position:'absolute', left:'50%', transform:'translateX(-50%)', bottom:10, textAlign:'center'}}>
                <button
                  className="btn"
                  onClick={() => {
                    startBgMusic();
                    setStartStage(1);
                  }}
                >
                  START
                </button>
              </div>
            )}

              {startStage === 1 && preCount === null && (
                <>
                  <div style={{position:'absolute', right:8, top:8}}>
                    <button className="btn" onClick={() => setStartStage(2)}>START</button>
                  </div>
                  <div style={{position:'absolute', right:8, top:52, opacity:.9}}>Los klick ihn doch ⬆️</div>
                </>
              )}
              {startStage === 2 && preCount === null && (
                <>
                  <div style={{position:'absolute', left:8, bottom:52, opacity:.9}}>
                    ⬇️Warum drückst du ihn nicht?
                  </div>
                  <div style={{position:'absolute', left:8, bottom:8}}>
                    <button className="btn" onClick={() => setStartStage(3)}>START</button>
                  </div>
                </>
              )}
              {startStage === 3 && preCount === null && (
                <>
                  <div style={{position:'absolute', right:20, top:'50%', transform:'translateY(-50%)'}}>
                    <button className="btn" onClick={() => setStartStage(4)}>START</button>
                  </div>
                  <div style={{position:'absolute', right:10, top:'calc(50% + 36px)', opacity:.9}}>
                    kannst du überhaupt BUTTONS drücken? 🧌
                  </div>
                </>
              )}
              {startStage === 4 && preCount === null && (
                <>
                  <div style={{position:'absolute', left:'50%', transform:'translateX(-50%)', bottom:52, opacity:.9}}>
                    Hö höö,⬇️hihihihi
                  </div>
                  <div style={{position:'absolute', left:'50%', transform:'translateX(-50%)', bottom:8}}>
                    <button className="btn" onClick={beginCountdown}>START</button>
                  </div>
                </>
              )}

              {/* Countdown-Overlay */}
              {preCount !== null && (
                <div className="countOverlay">
                  {preCount > 0 ? (
                    <div className="countNum">{preCount}</div>
                  ) : (
                    <div className="countGo">LOS GEHTS DIE WILDE FAHRT!</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settings-Modal */}
      {settingsOpen && (
        <div className="modalBackdrop" onClick={() => setSettingsOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{marginTop:0}}>Einstellungen</h3>
            <div className="settingsWrap">
              <aside className="settingsNav">
                {mode === 'edit' && !locked ? (
                  <>
                    <button className={`settingsTabBtn ${settingsTab==='file'?'active':''}`} onClick={() => setSettingsTab('file')}>Datei</button>
                    <button className={`settingsTabBtn ${settingsTab==='sound'?'active':''}`} onClick={() => setSettingsTab('sound')}>Soundeinstellungen</button>
                    <button className={`settingsTabBtn ${settingsTab==='share'?'active':''}`} onClick={() => setSettingsTab('share')}>Teilen</button>
                  </>
                ) : (
                  <>
                    <button className="settingsTabBtn active" onClick={() => setSettingsTab('sound')}>Soundeinstellungen</button>
                  </>
                )}
              </aside>

              <section className="settingsBody">
                {settingsTab === 'file' && (
                  <>
                    <div className="actions">
                      <button className="btn" onClick={saveLocalJson}>Speichern (Lokal)</button>
                      <button className="btn" onClick={askLoadJson}>Laden (Lokal)</button>
                      <button className="btn" onClick={clearAnswers}>Antworten löschen</button>
                      <button className="btn danger" onClick={onClearAll}>Löschen</button>
                    </div>
                  </>
                )}

                {settingsTab === 'sound' && (
                  <>
                    <label className="lab">Sound</label>
                    <label style={{display:'flex', alignItems:'center', gap:8}}>
                      <input
                        type="checkbox"
                        checked={soundMuted}
                        onChange={e => setSoundMuted(e.target.checked)}
                      />
                      Stumm schalten
                    </label>

                    {/* Effekte */}
                    <div style={{display:'grid', gridTemplateColumns:'80px 1fr 28px', alignItems:'center', gap:10}}>
                      <div>Effekte:</div>
                      <input
                        type="range"
                        min={0.5}
                        max={10}
                        step={0.5}
                        value={soundVolume}
                        onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
                        aria-label="Effekte-Lautstärke"
                        style={{width:'100%'}}
                      />
                      <span style={{textAlign:'right'}}>{soundVolume}</span>
                    </div>

                    {/* Musik */}
                    <div style={{display:'grid', gridTemplateColumns:'80px 1fr 28px', alignItems:'center', gap:10}}>
                      <div>Musik:</div>
                      <input
                        type="range"
                        min={0.5}
                        max={10}
                        step={0.5}
                        value={musicVolume}
                        onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                        aria-label="Musik-Lautstärke"
                        style={{width:'100%'}}
                      />
                      <span style={{textAlign:'right'}}>{musicVolume}</span>
                    </div>
                  </>
                )}

                {settingsTab === 'share' && (
                  <>
                    <div className="actions">
                      <button className="btn" onClick={onCopyLink}>Edit Link kopieren</button>
                      <button className="btn" onClick={onCopySolveOnly}>Spiel Link kopieren</button>
                    </div>
                  </>
                )}
              </section>
            </div>

            <div className="actions" style={{justifyContent:'flex-end', marginTop:14}}>
              <button className="btn" onClick={() => setSettingsOpen(false)}>Schließen</button>
            </div>
          </div>
        </div>
      )}

      {/* Win-Modal */}
      {showWin && (
        <div className="modalBackdrop" onClick={() => setShowWin(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{marginTop:0, textAlign:'center'}}>🎉 Glückwunsch du wundervoller Mensch!</h2>
            <p style={{ opacity:.9, marginTop:8, textAlign:'center' }}>
              Benötigte Zeit: <strong>{formatTime(winTimeMs ?? elapsedMs)}</strong>
            </p>
            {solutionWord && (
              <p style={{ opacity:.9, marginTop:8, textAlign:'center' }}>
                Lösungswort: <strong style={{ letterSpacing: '0.06em' }}>{solutionWord}</strong>
              </p>
            )}
            <div className="actions" style={{justifyContent:'center', marginTop:16}}>
              <button className="btn" onClick={() => setShowWin(false)}>Schließen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
