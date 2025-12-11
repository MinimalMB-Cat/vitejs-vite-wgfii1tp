/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useRef, useState } from 'react';

// einmal "React" als Wert benutzen, damit TS nicht meckert
void React;

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
export type Variant = 'LEFT_CLUE_RIGHT' | 'ABOVE_CLUE_DOWN' | 'LEFT_CLUE_DOWN' | 'ABOVE_CLUE_RIGHT' | 'ABOVE_OF_CLUE_RIGHT' | 'LEFT_OF_CLUE_DOWN';

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
const LS_LOCK_KEY = 'schwedenraetsel_v1_lock';
const NICKNAME_KEY = 'player_nickname';
const LS_RUN_KEY = 'schwedenraetsel_v1_run';

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

        case 'ABOVE_OF_CLUE_RIGHT':
          start = { r: r - 1, c };
          dir = 'RIGHT';
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
type StartMode = 'choose' | 'action' | 'boring';
type MiniGameId = 'prankButtons' | 'slot' | 'findCat';

// hier kannst du später einfach weitere Spiele ergänzen:
const MINI_GAMES: MiniGameId[] = ['prankButtons', 'slot', 'findCat'];

// Slot-Emojis
const SLOT_SYMBOLS = ['🐈', '☕', '🎧', '🐪', '⭐'] as const;
type SlotSymbol = (typeof SLOT_SYMBOLS)[number];

function randomSlotSymbol(): SlotSymbol {
  const idx = Math.floor(Math.random() * SLOT_SYMBOLS.length);
  return SLOT_SYMBOLS[idx];
}

// 🐈 „Finde die Katze“-Konfiguration
const FIND_CAT_SIZE = 3; // 3x3
const FIND_CAT_CELLS = FIND_CAT_SIZE * FIND_CAT_SIZE;
function randomCatPos() {
  return Math.floor(Math.random() * FIND_CAT_CELLS);
}

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

    // ---- Highscore-Typen & State ----
  type HighscoreRow = {
    id: number;
    nickname: string;
    time_ms: number;
    created_at: string;
  };

  type HighscoreMode = 'today' | 'date' | 'best';

  const [highscores, setHighscores] = useState<HighscoreRow[]>([]);
  const [highscoreMode, setHighscoreMode] = useState<HighscoreMode>('today');
  const [highscoreDate, setHighscoreDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  );
  const [highscoreLoading, setHighscoreLoading] = useState(false);
  const [highscoreError, setHighscoreError] = useState<string | null>(null);
    // Suche + Pagination
    const PAGE_SIZE = 10;
    const [hsPage, setHsPage] = useState(0);          // 0-basiert
    const [hsSearch, setHsSearch] = useState('');
    const [hsSearchResult, setHsSearchResult] = useState<number | null>(null); // Platz oder -1
  
    // Bei Modus- oder Datumswechsel wieder auf Seite 0 springen & Suchergebnis zurücksetzen
    useEffect(() => {
      setHsPage(0);
      setHsSearchResult(null);
    }, [highscoreMode, highscoreDate]);  

  // Nickname des Spielers (wird im Start-Dialog gesetzt)
  const [nicknameInput, setNicknameInput] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_RUN_KEY);
      if (raw) {
        const data = JSON.parse(raw) as { nickname?: string };
        if (data.nickname) return data.nickname;
      }
    } catch {
      // ignorieren, falls localStorage nicht geht
    }
    return '';
  });  

  // Nickname persistent speichern (falls möglich)
  useEffect(() => {
    try {
      const trimmed = nicknameInput.trim();
      if (trimmed.length > 0) {
        localStorage.setItem(NICKNAME_KEY, trimmed);
      } else {
        localStorage.removeItem(NICKNAME_KEY);
      }
    } catch {
      // ignore LS errors
    }
  }, [nicknameInput]);

  const [scoreSaving, setScoreSaving] = useState(false);
  const [scoreSaved, setScoreSaved] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const MIN_NICKNAME_LENGTH = 3;
  const canStart = nicknameInput.trim().length >= MIN_NICKNAME_LENGTH;
  const highscoreSubmittedRef = useRef(false);

  function markRunStarted(nickname: string) {
    const nick = nickname.trim();
    if (!nick) return;
    try {
      const payload = {
        nickname: nick,
        startedAt: Date.now(),
      };
      localStorage.setItem(LS_RUN_KEY, JSON.stringify(payload));
    } catch {
      // wenn localStorage nicht geht, ist es halt ohne Reload-Tracking
    }
  }
  
  function clearRunMarker() {
    try {
      localStorage.removeItem(LS_RUN_KEY);
    } catch {
      // egal
    }
  }
  
  // Spezieller Highscore-Eintrag für "Reload"
  async function submitReloadMarker(nickname: string) {
    const nick = nickname.trim();
    if (!nick) return;
  
    try {
      setHighscoreError(null);
      setHighscoreLoading(true);
  
      const body = {
        nickname: nick.slice(0, 18),
        timeMs: 0,        // Reload = 0 ms
      };
  
      const res = await fetch('/api/highscores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
  
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }
  
      await loadHighscores();
    } catch (err) {
      console.error('Reload-Marker-Fehler', err);
      setHighscoreError('Konnte Reload-Highscore nicht speichern.');
    } finally {
      setHighscoreLoading(false);
    }
  }  

  // Beim ersten Laden prüfen, ob ein Run im letzten Tab "offen" war.
  // Wenn ja: Reload-Marker speichern und den Marker löschen.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_RUN_KEY);
      if (!raw) return;

      const data = JSON.parse(raw) as { nickname?: string; startedAt?: number };
      const nick = data.nickname?.trim();
      if (!nick) {
        clearRunMarker();
        return;
      }

      void (async () => {
        await submitReloadMarker(nick);
        clearRunMarker();
      })();
    } catch (err) {
      console.warn('Konnte Reload-Marker nicht prüfen', err);
      clearRunMarker();
    }
  }, []);

  // Start-/Win-Popups
  const [showStart, setShowStart] = useState(false);
  const [startStage, setStartStage] = useState<number>(0);
  const [showWin, setShowWin] = useState(false);

  // Start-Modus / Minigame
  const [startMode, setStartMode] = useState<StartMode>('choose');
  const [miniGame, setMiniGame] = useState<MiniGameId | null>(null);

    // 🎰 Slot-Minispiel
    const [slots, setSlots] = useState<SlotSymbol[]>([
      randomSlotSymbol(),
      randomSlotSymbol(),
      randomSlotSymbol(),
    ] );
    const [isSpinning, setIsSpinning] = useState(false);
    const [spinCount, setSpinCount] = useState(0);
  
    // Anzeige: Jackpot-Chance für den NÄCHSTEN Spin in %
    const nextJackpotChance = useMemo(() => {
      const nextSpinNumber = spinCount + 1;
      if (nextSpinNumber < 5) return 0;
      const p = Math.min(1, 0.3 + (nextSpinNumber - 5) * 0.1);
      return Math.round(p * 100);
    }, [spinCount]);
  
    // ---- Highscores vom Backend laden ----
    async function loadHighscores() {
      try {
        setHighscoreLoading(true);
        setHighscoreError(null);
  
        const res = await fetch('/api/highscores');
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
  
        const data = (await res.json()) as { rows?: HighscoreRow[] };
        setHighscores(data.rows ?? []);
      } catch (err) {
        console.error('Highscore-Load-Fehler', err);
        setHighscoreError('Konnte Highscores nicht laden.');
      } finally {
        setHighscoreLoading(false);
      }
    }

    function handleHighscoreSearch() {
      const term = hsSearch.trim().toLowerCase();
      if (!term) {
        setHsSearchResult(null);
        return;
      }
  
      // In der aktuell gefilterten Liste suchen (abhängig vom Tab)
      const list = filteredHighscores;
      const idx = list.findIndex(row =>
        row.nickname.toLowerCase().includes(term)
      );
  
      if (idx === -1) {
        setHsSearchResult(-1);
        return;
      }
  
      const rank = idx + 1; // 1-basiert
      setHsSearchResult(rank);
  
      const page = Math.floor(idx / PAGE_SIZE);
      setHsPage(page);
    }  
  
    // Beim ersten Laden der Seite einmal Highscores holen
    useEffect(() => {
      void loadHighscores();
    }, []);
  
      // Voll gefilterte Liste (ohne Seitenlimit)
      const filteredHighscores = useMemo(() => {
        const list = [...highscores];
      
        const byDate = (row: HighscoreRow, dateStr: string) =>
          row.created_at.slice(0, 10) === dateStr;
      
        const todayStr = new Date().toISOString().slice(0, 10);
      
        let base: HighscoreRow[];
      
        if (highscoreMode === 'today') {
          // Alle Einträge von heute (inkl. Reload), sortiert nach Zeit
          base = list.filter(r => byDate(r, todayStr));
        } else if (highscoreMode === 'date') {
          // Alle Einträge für ausgewähltes Datum
          base = list.filter(r => byDate(r, highscoreDate));
        } else {
          // 'best' → Beste Zeit pro Nickname für den ausgewählten Tag
          const dayRows = list
            .filter(r => byDate(r, highscoreDate))
            .filter(r => r.time_ms > 0); // Reloads NICHT für "beste Zeit"
      
          const bestByNick = new Map<string, HighscoreRow>();
      
          for (const row of dayRows) {
            const key = row.nickname.trim().toLowerCase() || '(leer)';
            const prev = bestByNick.get(key);
      
            if (!prev || row.time_ms < prev.time_ms || prev.time_ms === 0) {
              bestByNick.set(key, row);
            }
          }
      
          base = Array.from(bestByNick.values());
        }
      
        // Sortierung: beste Zeit zuerst, Reloads nach hinten
        base.sort((a, b) => {
          const ta = a.time_ms === 0 ? Number.POSITIVE_INFINITY : a.time_ms;
          const tb = b.time_ms === 0 ? Number.POSITIVE_INFINITY : b.time_ms;
          return ta - tb;
        });
        return base;
      }, [highscores, highscoreMode, highscoreDate]);      

  // Seiteninfos aus der gefilterten Liste ableiten
  const totalPages = Math.max(1, Math.ceil(filteredHighscores.length / PAGE_SIZE));
  const currentPage = Math.min(hsPage, totalPages - 1);

  const pageHighscores = useMemo(
    () =>
      filteredHighscores.slice(
        currentPage * PAGE_SIZE,
        (currentPage + 1) * PAGE_SIZE
      ),
    [filteredHighscores, currentPage]
  );
  
    // ---- Highscore per POST speichern ----
    async function submitHighscore() {
      if (highscoreSubmittedRef.current) return;
    
      const timeToSave = winTimeMs ?? elapsedMs;
      const nick = nicknameInput.trim();
    
      if (!nick || !timeToSave) return;
      if (scoreSaving || scoreSaved) return;
    
      // <<< NEU: direkt hier setzen
      highscoreSubmittedRef.current = true;
    
      try {
        setScoreSaving(true);
        setScoreError(null);
    
        const body = {
          nickname: nick.slice(0, 20),
          timeMs: Math.round(timeToSave),   // <- hier gleich noch von time_ms auf timeMs ändern
        };
    
        const res = await fetch('/api/highscores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
    
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `HTTP ${res.status}`);
        }
    
        setScoreSaved(true);
        await loadHighscores();
      } catch (err) {
        console.error('Highscore-Save-Fehler', err);
        setScoreError('Konnte Highscore nicht speichern.');
      } finally {
        setScoreSaving(false);
      }
    }    

  useEffect(() => {
    if (!showWin) return;

    const nick = nicknameInput.trim();
    const timeToSave = winTimeMs ?? elapsedMs;

    if (!nick || timeToSave <= 0) return;
    if (scoreSaved || scoreSaving || scoreError) return;

    void submitHighscore();
  }, [showWin, nicknameInput, winTimeMs, elapsedMs, scoreSaved, scoreSaving, scoreError]);
  
    // 🐈 „Finde die Katze“-Minispiel
  const [catPos, setCatPos] = useState<number>(() => randomCatPos());
  const [catAttempts, setCatAttempts] = useState(0);
  const [catHighlight, setCatHighlight] = useState<'none' | 'hint' | 'success'>('none');
  const [catFound, setCatFound] = useState(false);
  const [catRevealed, setCatRevealed] = useState<boolean[]>(
    () => Array(FIND_CAT_CELLS).fill(false)
  );

  // Countdown vorm Start
  const [preCount, setPreCount] = useState<number | null>(null);

  const prevAllCorrect = useRef(false);
  const [warnedLS, setWarnedLS] = useState(false);

  // Flashing
  const [flashingSegs, setFlashingSegs] = useState<Set<string>>(new Set());
  const prevSolvedRef = useRef<Set<string>>(new Set());
  
  // dauerhaft falsch markierte Zellen (bis geändert/gelöscht)
  const [incorrectCells, setIncorrectCells] = useState<Set<string>>(
    () => new Set()
  );  

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

  useEffect(() => {
    try {
      const t = '__ls_test__';
      localStorage.setItem(t, '1');
      localStorage.removeItem(t);
      canLSRef.current = true;
    } catch {
      canLSRef.current = false;
      if (!warnedLS) {
        setWarnedLS(true);
        console.warn('localStorage nicht verfügbar – Autosave deaktiviert.');
      }
    }
  }, []);

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
    const isLockedFromUrl = params.get('lock') === '1';
  
    if (p) {
      const payload = decodePayload<{ grid: Cell[][] }>(p);
      const g = payload.grid.map(row =>
        row.map(cell => ({
          type: cell.type,
          clue: cell.clue,
          letter: cell.letter ?? '',
          solutionIndex: cell.solutionIndex ?? null,
          expected: null,
        }))
      );
  
      setGrid(g);
      setLocked(isLockedFromUrl);
      setMode(isLockedFromUrl ? 'play' : 'edit');
      setShowWin(false);
      setWinTimeMs(null);
      setTimerRunning(false);
      setTimerStart(null);
      setElapsedMs(0);
  
      setTimeout(() => setGrid(g2 => mapExpected(g2)), 0);
  
      // 🔒 Lock-Status auch im localStorage merken
      try {
        if (isLockedFromUrl) {
          localStorage.setItem(LS_LOCK_KEY, '1');
        } else {
          localStorage.removeItem(LS_LOCK_KEY);
        }
      } catch {
        // ignorieren
      }
  
      // Edit-Link -> Hash entfernen
      if (!isLockedFromUrl) {
        history.replaceState(null, '', location.pathname);
      }
    } else {
      // Prüfen, ob wir aus der Vergangenheit wissen,
      // dass dieses Rätsel "nur lösen" sein soll.
      let forceLock = false;
      try {
        forceLock = localStorage.getItem(LS_LOCK_KEY) === '1';
      } catch {
        forceLock = false;
      }
  
      // Entwurf aus localStorage
      try {
        const rawLs = localStorage.getItem(LS_KEY);
        if (rawLs) {
          const saved = JSON.parse(rawLs) as { grid: Cell[][] };
          if (saved?.grid?.length === N) {
            const g: Cell[][] = saved.grid.map(row =>
              row.map(cell => ({
                type: cell.type,
                clue: cell.clue,
                letter: cell.letter ?? '',
                solutionIndex: cell.solutionIndex ?? null,
                expected: null,
              }))
            );
            setGrid(g);
            setTimeout(() => setGrid(g2 => mapExpected(g2)), 0);
            setIncorrectCells(new Set());
  
            // ⬅️ hier Lock erzwingen, falls nötig
            setLocked(forceLock);
            setMode(forceLock ? 'play' : 'edit');
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
      setShowStart(true);
      setStartStage(0);
      setPreCount(null);
      setStartMode('choose');
      setMiniGame(null);

      // Minigames zurücksetzen
      setSpinCount(0);
      setIsSpinning(false);
      setSlots([
        randomSlotSymbol(),
        randomSlotSymbol(),
        randomSlotSymbol(),
      ]);
      setCatPos(randomCatPos());
      setCatAttempts(0);
      setCatHighlight('none');
      setCatFound(false);
      setCatRevealed(Array(FIND_CAT_CELLS).fill(false));
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

  const segmentsByCell = useMemo(() => {
    const m = new Map<string, Segment[]>();
    for (const s of segments) {
      for (const pos of s.cells) {
        const key = `${pos.r}-${pos.c}`;
        const arr = m.get(key);
        if (arr) arr.push(s);
        else m.set(key, [s]);
      }
    }
    return m;
  }, [segments]);

  useEffect(() => { setGrid(g => mapExpected(g, segments)); }, [segments.length]);

    useEffect(() => {
      setIncorrectCells(prev => {
        const next = new Set(prev);

        for (const seg of segments) {
          if (!seg.clue.answer) continue;

          let hasAnyExpected = false;
          let allFilled = true;
          let anyWrong = false;
          let anyExtra = false;

          // 1. Prüfen, ob dieses Wort überhaupt "fertig" ist
          for (const { r, c } of seg.cells) {
            const cell = grid[r][c];

            if (cell.expected) {
              hasAnyExpected = true;
              if (!cell.letter) {
                allFilled = false;
                break;
              }
              if (cell.letter !== cell.expected) {
                anyWrong = true;
              }
            } else {
              // Zelle ohne expected sollte eigentlich leer sein
              if (cell.letter) {
                anyExtra = true;
              }
            }
          }

          // Noch nicht vollständig ausgefüllt → nichts an den bisherigen Fehlern ändern.
          // So bleiben rote Buchstaben erhalten, bis man genau diese Zelle ändert/löscht.
          if (!hasAnyExpected || !allFilled) continue;

          const segmentIsCorrect = !anyWrong && !anyExtra;

          if (segmentIsCorrect) {
            // Wort ist jetzt korrekt → alle Fehler-Markierungen für dieses Wort löschen
            for (const { r, c } of seg.cells) {
              next.delete(`${r}-${c}`);
            }
          } else {
            // Wort ist komplett, aber falsch:
            // 1) Erst mal alle Zellen dieses Segments aus "next" entfernen
            for (const { r, c } of seg.cells) {
              next.delete(`${r}-${c}`);
            }
            // 2) Dann NUR falsche / "zu viel" gesetzte Buchstaben wieder hinzufügen
            for (const { r, c } of seg.cells) {
              const cell = grid[r][c];

              if (cell.expected) {
                if (cell.letter && cell.letter !== cell.expected) {
                  next.add(`${r}-${c}`);
                }
              } else if (cell.letter) {
                // Buchstabe an einer Stelle, wo eigentlich keiner hingehört
                next.add(`${r}-${c}`);
              }
            }
          }
        }
        return next;
      });
    }, [grid, segments]);

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
  
      // Run wurde sauber beendet → Reload-Marker entfernen
      clearRunMarker();
    }
    prevAllCorrect.current = allCorrect;
  }, [allCorrect, elapsedMs]);
  

  // Tastatur
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (mode !== 'play' || !activeSeg) return;
      const { seg, index } = activeSeg;

      // BACKSPACE
      if (e.key === 'Backspace') {
        e.preventDefault();
        setGrid(g => {
          const g2 = cloneGrid(g);
          let target = seg.cells[index];
          const { r, c } = target;

          if (g2[r][c].letter) {
            g2[r][c].letter = '';
          } else if (index > 0) {
            const prevPos = seg.cells[index - 1];
            g2[prevPos.r][prevPos.c].letter = '';
            target = prevPos;
            setActiveSeg({ seg, index: index - 1 });
          }

          // Buchstabe in target-Zelle wurde geändert/gelöscht -> Fehler-Markierung dort entfernen
          setIncorrectCells(prev => {
            const next = new Set(prev);
            next.delete(`${target.r}-${target.c}`);
            return next;
          });

          return g2;
        });
        return;
      }

      // NORMALER BUCHSTABE
      const L = letterFromKey(e);
      if (L) {
        e.preventDefault();
        const { r, c } = seg.cells[index];

        setGrid(g => {
          const g2 = cloneGrid(g);
          g2[r][c].letter = L;
          return g2;
        });

        // Bei neuer Eingabe in dieser Zelle: alte Fehl-Markierung löschen
        setIncorrectCells(prev => {
          const next = new Set(prev);
          next.delete(`${r}-${c}`);
          return next;
        });

        if (index < seg.cells.length - 1) {
          setActiveSeg({ seg, index: index + 1 });
        }
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
    setIncorrectCells(new Set());
    setPreCount(null);
    setStartMode('choose');
    setMiniGame(null);

    highscoreSubmittedRef.current = false;
    setScoreSaved(false);
    setScoreSaving(false);
    setScoreError(null);
    clearRunMarker();

    // Minigames zurücksetzen
    setSpinCount(0);
    setIsSpinning(false);
    setSlots([
      randomSlotSymbol(),
      randomSlotSymbol(),
      randomSlotSymbol(),
    ]);
    setCatPos(randomCatPos());
    setCatAttempts(0);
    setCatHighlight('none');
    setCatFound(false);
    setCatRevealed(Array(FIND_CAT_CELLS).fill(false));

    try { localStorage.removeItem(LS_LOCK_KEY); } catch {}
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
    setPreCount(null);
    setStartStage(0);
    setStartMode('choose');
    setMiniGame(null);

    highscoreSubmittedRef.current = false;
    setScoreSaved(false);
    setScoreSaving(false);
    setScoreError(null);
    clearRunMarker();
  

    // Minigames zurücksetzen
    setSpinCount(0);
    setIsSpinning(false);
    setSlots([
      randomSlotSymbol(),
      randomSlotSymbol(),
      randomSlotSymbol(),
    ]);
    setCatPos(randomCatPos());
    setCatAttempts(0);
    setCatHighlight('none');
    setCatFound(false);
    setCatRevealed(Array(FIND_CAT_CELLS).fill(false));
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
      return g2;
    });
    setIncorrectCells(new Set());
  }

  function makeUrl(lock: boolean) {
    const gridForShare = lock
      ? grid.map(row =>
          row.map(cell =>
            cell.type === 'empty' ? { ...cell, letter: '' } : { ...cell }
          )
        )
      : grid;
  
    const payload = { grid: gridForShare };
    const isLocalhost =
      location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  
    const base = isLocalhost
      ? `${location.origin}${location.pathname}`
      : 'https://minis-kreuzi.vercel.app/';
  
    const p = encodePayload(payload);
    const suffix = lock ? `#p=${p}&lock=1` : `#p=${p}`;
    return `${base}${suffix}`;
  }  

  function onCopyLink()       { navigator.clipboard.writeText(makeUrl(false)); alert('Link kopiert! (Editor)'); }
  function onCopySolveOnly()  { navigator.clipboard.writeText(makeUrl(true));  alert('Spiel-Link kopiert! (Nur Lösen)'); }

  const pickRandomMiniGame = (): MiniGameId => {
    const idx = Math.floor(Math.random() * MINI_GAMES.length);
    return MINI_GAMES[idx];
  };

  function chooseActionMode() {
    if (!canStart) return;
    setStartMode('action');
    setMiniGame(pickRandomMiniGame());
    setStartStage(0);
    setPreCount(null);

    // Minigames zurücksetzen
    setSpinCount(0);
    setIsSpinning(false);
    setSlots([
      randomSlotSymbol(),
      randomSlotSymbol(),
      randomSlotSymbol(),
    ]);
    setCatPos(randomCatPos());
    setCatAttempts(0);
    setCatHighlight('none');
    setCatFound(false);
    setCatRevealed(Array(FIND_CAT_CELLS).fill(false));
  }

  function chooseBoringMode() {
    if (!canStart) return;
    setStartMode('boring');
    setMiniGame(null);
    setStartStage(0);
    setPreCount(null);

    // Minigames zurücksetzen
    setSpinCount(0);
    setIsSpinning(false);
    setSlots([
      randomSlotSymbol(),
      randomSlotSymbol(),
      randomSlotSymbol(),
    ]);
    setCatPos(randomCatPos());
    setCatAttempts(0);
    setCatHighlight('none');
    setCatFound(false);
    setCatRevealed(Array(FIND_CAT_CELLS).fill(false));
  }

  function handleSlotSpin() {
    if (isSpinning) return;

    startBgMusic();
    setIsSpinning(true);

    // Spin-Nummer für diese Runde
    const thisSpinNumber = spinCount + 1;
    setSpinCount(thisSpinNumber);

    // 1–3: 0%, ab 4: 50%, dann +10% pro Spin, max. 100%
    const tripleChance =
      thisSpinNumber < 4 ? 0 : Math.min(1, 0.5 + (thisSpinNumber - 4) * 0.1);

    const forceTriple = Math.random() < tripleChance;

    const finalSlots: SlotSymbol[] = forceTriple
      ? (() => {
          const sym = randomSlotSymbol();
          return [sym, sym, sym];
        })()
      : [randomSlotSymbol(), randomSlotSymbol(), randomSlotSymbol()];

    // kleine Fake-Animation
    const ANIM_STEPS = 10;
    const ANIM_INTERVAL = 70;

    let step = 0;
    const animId = window.setInterval(() => {
      step += 1;

      if (step < ANIM_STEPS) {
        // während der Animation zufällige Symbole rattern lassen
        setSlots([
          randomSlotSymbol(),
          randomSlotSymbol(),
          randomSlotSymbol(),
        ]);
      } else {
        window.clearInterval(animId);
        setSlots(finalSlots);
        setIsSpinning(false);

        const isTriple =
          finalSlots[0] === finalSlots[1] &&
          finalSlots[1] === finalSlots[2];

        if (isTriple) {
          // kurzer Moment, dann Countdown starten
          setTimeout(() => {
            beginCountdown();
          }, 400);
        }
      }
    }, ANIM_INTERVAL);
  }

  function handleCatClick(idx: number) {
    if (preCount !== null) return;
    if (startMode !== 'action' || miniGame !== 'findCat') return;
    if (catFound) return; // nach Fund nichts mehr machen

    startBgMusic();

    // Feld als "aufgedeckt" markieren
    setCatRevealed(prev => {
      const next = [...prev];
      next[idx] = true;
      return next;
    });

    if (idx === catPos) {
      // Gefunden – kurz grün, dann Countdown
      setCatFound(true);
      setCatHighlight('success');
      setTimeout(() => {
        setCatHighlight('none');
        beginCountdown();
      }, 350);
    } else {
      // Falsches Feld
      setCatAttempts(prev => {
        const next = prev + 1;

        // Ab dem 4. Fehlversuch: Katze kurz grün hervorheben
        if (next >= 4) {
          setCatHighlight('hint');
          setTimeout(() => setCatHighlight('none'), 450);
        }
        return next;
      });
    }
  }

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
    // Run als "aktiv" markieren (für Reload-Tracking)
    if (nicknameInput.trim()) {
    markRunStarted(nicknameInput);
    }
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
      setIncorrectCells(new Set()); 
      try { localStorage.removeItem(LS_LOCK_KEY); } catch {}
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
          @keyframes flashCorrect {
            25%, 75% {
              background-color: #065f46; /* kräftiges Grün */
              color: #bbf7d0;            /* hellgrüne Schrift */
            }
          }
        
          .cell.flash-correct {
            animation: flashCorrect 600ms ease-in-out;
          }
        
          .cell.incorrect {
            color: #fca5a5; /* rot */
          }     

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
        .btn:disabled {
          opacity: .45;
          cursor: not-allowed;
          background: #111827;
          border-color: #1f2937;
        }
        .btn:disabled:hover {
          background: #111827;
        }        

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

        /* Schreiblinie (aktuelles Wort) leicht hervorheben */
        .cell.active-line:not(.active) {
          background-color: rgba(117, 229, 210, 0.08);
        }
        
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

        .mainLayout{
          display:flex;
          gap:20px;
          align-items:flex-start;
          justify-content:center;
          padding:12px 0 24px;
        }
        @media (max-width: 960px){
          .mainLayout{
            flex-direction:column;
            align-items:stretch;
          }
          .highscorePanel{
            width:100%;
          }
        }

        .highscorePanel{
          position: relative;
          z-index: 10003;  /* über dem dunklen Backdrop & Popup */
          width:310px;
          background:#020617;
          border-radius:12px;
          border:1px solid #1f2937;
          padding:10px 12px;
          color:#e5e7eb;
          box-shadow:0 10px 30px rgba(0,0,0,.35);
          font-size:13px;
        }
        
        .highscorePanel h3{
          margin:0 0 6px;
          font-size:15px;
          display:flex;
          align-items:center;
          justify-content:space-between;
        }

        .hsReloadBtn{
          background:#0b1120;
          border-radius:999px;
          border:1px solid #9ca3af;
          width:24px;
          height:24px;
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:24px;
          cursor:pointer;
          padding:0;
          color:#e5e7eb;
          box-shadow:0 0 4px rgba(148,163,184,.6);
        }
        .hsReloadBtn:hover{
          background:#1f2937;
          border-color:#e5e7eb;
          box-shadow:0 0 6px rgba(248,250,252,.9);
        }
        .hsReloadIcon{
          display:block;
          transform: translateX(1.4px);  /* nach Geschmack 0.5–2px testen */
        }
        .hsTabs{
          display:flex;
          gap:6px;
          margin-bottom:6px;
          flex-wrap:wrap;
        }
        .hsTabBtn{
          flex:1 0 auto;
          font-size:11px;
          padding:4px 8px;
          border-radius:999px;
          border:1px solid #374151;
          background:#020617;
          color:#e5e7eb;
          cursor:pointer;
        }
        .hsTabBtn.active{
          background:#4b5563;
          border-color:#93c5fd;
        }
        .hsDateRow{
          display:flex;
          align-items:center;
          gap:6px;
          font-size:11px;
          margin-bottom:4px;
        }
        .hsDateRow input[type="date"]{
          flex:1;
          background:#020617;
          color:#e5e7eb;
          border-radius:8px;
          border:1px solid #374151;
          padding:4px 6px;
        }
        .hsList{
          margin-top:6px;
          overflow:auto;
          padding-right:2px;
        }
        .hsSearchRow{
          display:flex;
          gap:6px;
          margin:6px 0 2px;
        }
        .hsSearchRow input{
          flex:1;
          background:#020617;
          color:#e5e7eb;
          border-radius:8px;
          border:1px solid #374151;
          padding:4px 6px;
          font-size:12px;
        }
        .hsSearchBtn{
          font-size:11px;
          padding:4px 8px;
          border-radius:999px;
          border:1px solid #4b5563;
          background:#020617;
          color:#e5e7eb;
          cursor:pointer;
        }
        .hsSearchBtn:hover{
          background:#1f2937;
          border-color:#6b7280;
        }
        .hsSearchBtn:disabled{
          opacity:.5;
          cursor:not-allowed;
        }
        .hsSearchInfo{
          font-size:11px;
          opacity:.85;
          margin-bottom:2px;
        }
        .hsPager{
          display:flex;
          align-items:center;
          justify-content:space-between;
          margin-top:6px;
          font-size:11px;
          opacity:.85;
        }
        .hsPagerBtn{
          min-width:28px;
          height:22px;
          border-radius:999px;
          border:1px solid #374151;
          background:#020617;
          color:#e5e7eb;
          cursor:pointer;
        }
        .hsPagerBtn:disabled{
          opacity:.4;
          cursor:not-allowed;
        }
        .hsPagerBtn:not(:disabled):hover{
          background:#111827;
        }
        .hsList ol{
          list-style:none;
          margin:0;
          padding:0;
          display:flex;
          flex-direction:column;
          gap:4px;
        }
        .hsRow{
          display:flex;
          justify-content:space-between;
          align-items:center;
        }
        .hsRank{
          width:18px;
          opacity:.7;
        }
        .hsNick{
          flex:1;
          margin-right:8px;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .hsTime{
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        }
        .hsDate{
          font-size:11px;
          opacity:.65;
        }
        .hsEmpty{
          font-size:12px;
          opacity:.75;
          margin-top:4px;
        }
        .hsError{
          font-size:12px;
          color:#fecaca;
          margin-top:4px;
        }
        .hsLoading{
          font-size:12px;
          opacity:.8;
          margin-top:4px;
        }
      `}</style>

      {showWin && <ConfettiCanvas />}
      <div className="mainLayout">
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
        {/* Grid */}
        <div className="grid" ref={gridRef}>
          {grid.map((row, r) => (
            <div className="row" key={r}>
              {row.map((cell, c) => {
                const activeCell = activeSeg?.seg.cells[activeSeg.index];
                const isActive = !!(activeCell && activeCell.r === r && activeCell.c === c);
                const isInActiveSeg = !!activeSeg?.seg.cells.some(cc => cc.r === r && cc.c === c);

                const segmentsForCell = segmentsByCell.get(`${r}-${c}`) ?? [];

                const isIncorrect = incorrectCells.has(`${r}-${c}`);
                const isFlashing = segmentsForCell.some(seg => flashingSegs.has(seg.id));

                const classNames = [
                  'cell',
                  cell.type === 'clue' ? 'clue' : '',
                  isIncorrect ? 'incorrect' : '',
                  isInActiveSeg ? 'active-line' : '',
                  isActive ? 'active' : '',
                  isFlashing ? 'flash-correct' : ''
                ].filter(Boolean).join(' ');

                const startDirs = arrowStarts.get(`${r}-${c}`);

                return (
                  <div
                    className={classNames}
                    key={`${r}-${c}`}
                    onClick={() => onCellClick(r, c)}
                  >
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
                </div>{/* Ende .board */}

      {/* Rechte Seite: Highscore-Liste */}
      <aside className="highscorePanel">
        <h3>
          <span>🏆 Highscores</span>
          <button
            type="button"
            className="hsReloadBtn"
            onClick={() => {
              setHsPage(0);
              setHsSearchResult(null);
              void loadHighscores();
            }}
            title="Highscores aktualisieren"
          >
            <span className="hsReloadIcon">⟳</span>
          </button>

        </h3>

        <div className="hsTabs">
        <button
            type="button"
            className={`hsTabBtn ${highscoreMode === 'today' ? 'active' : ''}`}
            onClick={() => {
              setHighscoreMode('today');
              setHighscoreDate(new Date().toISOString().slice(0, 10)); // Datum auf heute setzen
            }}
          >
            Heute
          </button>
          <button
            type="button"
            className={`hsTabBtn ${highscoreMode === 'best' ? 'active' : ''}`}
            onClick={() => setHighscoreMode('best')}
          >
            Beste Zeit
          </button>
        </div>

        <div className="hsDateRow">
          <span>Datum:</span>
          <input
            type="date"
            value={highscoreDate}
            onChange={e => {
              const value = e.target.value;
              setHighscoreDate(value);

              // Wenn du im "Heute"-Tab bist und ein Datum auswählst,
              // wechseln wir in den "date"-Modus (alle Zeiten für diesen Tag).
              if (highscoreMode === 'today') {
                setHighscoreMode('date');
              }
              // Wenn du im "best"-Tab bist, bleiben wir im best-Modus,
              // aber mit neuem Datum.
            }}
          />
        </div>

        <div className="hsSearchRow">
          <input
            type="text"
            placeholder="Nickname suchen…"
            value={hsSearch}
            onChange={e => setHsSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleHighscoreSearch();
            }}
          />
          <button
            type="button"
            className="hsSearchBtn"
            onClick={handleHighscoreSearch}
          >
            Suchen
          </button>
        </div>

        {hsSearchResult !== null && (
          <div className="hsSearchInfo">
            {hsSearchResult === -1
              ? 'Kein Eintrag mit diesem Nickname in dieser Liste.'
              : `Platz ${hsSearchResult} in der aktuellen Ansicht.`}
          </div>
        )}

        <div className="hsList">
          {highscoreLoading && <div className="hsLoading">Lade Highscores…</div>}
          {highscoreError && <div className="hsError">{highscoreError}</div>}

          {!highscoreLoading &&
            !highscoreError &&
            filteredHighscores.length === 0 && (
              <div className="hsEmpty">Keine Einträge für diese Auswahl.</div>
            )}

          {!highscoreLoading &&
            !highscoreError &&
            filteredHighscores.length > 0 && (
              <>
                <ol>
                  {pageHighscores.map((row, idx) => (
                    <li key={row.id ?? `${row.nickname}-${idx}`}>
                      <div className="hsRow">
                        {/* globale Platznummer: Index in Gesamtliste, nicht nur Seite */}
                        <span className="hsRank">
                          {currentPage * PAGE_SIZE + idx + 1}.
                        </span>
                        <span className="hsNick">{row.nickname}</span>
                        <span className="hsTime">
                          {row.time_ms === 0 ? 'Reload' : formatTime(row.time_ms)}
                        </span>
                      </div>
                      <div className="hsDate">
                        {new Date(row.created_at).toLocaleString('de-DE', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </div>
                    </li>
                  ))}
                </ol>

                {/* Pager */}
                <div className="hsPager">
                  <button
                    type="button"
                    className="hsPagerBtn"
                    disabled={currentPage === 0}
                    onClick={() =>
                      setHsPage(p => Math.max(0, p - 1))
                    }
                  >
                    ◀
                  </button>
                  <span>
                    Seite {currentPage + 1} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="hsPagerBtn"
                    disabled={currentPage >= totalPages - 1}
                    onClick={() =>
                      setHsPage(p => Math.min(totalPages - 1, p + 1))
                    }
                  >
                    ▶
                  </button>
                </div>
              </>
            )}
        </div>
      </aside>
      </div>{/* Ende .mainLayout */}

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
                  type="radio" name="v" checked={modal.variant === 'ABOVE_OF_CLUE_RIGHT'}
                  onChange={() =>setModal(m => ({ ...m, variant: 'ABOVE_OF_CLUE_RIGHT' }))}/>
                <span>über dem Hinweis, Pfeil → (Start oben, dann rechts)</span>
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

      {/* Start-Modal mit Moduswahl + Minigames */}
      {showStart && (
        <div className="modalBackdrop">
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, textAlign: 'center' }}>🐪EY! Bist du Bereit?🐪</h2>

            {/* Text nur solange man den Modus auswählt */}
            {startMode === 'choose' && preCount === null && (
              <>
                <p style={{ opacity: 0.9, marginTop: 8, textAlign: 'center' }}>
                  Wähle deinen Start-Modus:
                </p>
                <p style={{ opacity: 0.9, marginTop: 8, textAlign: 'center' }}>
                  <strong>🚀 Action-Mini-Modus</strong>oder{' '}
                  <strong>😴 Langweiliger Modus</strong>
                </p>
                <p style={{ opacity: 0.9, marginTop: 8, textAlign: 'center' }}>
                  <strong>ACHTUNG</strong>
                </p>
                <p style={{ opacity: 0.9, marginTop: 8, textAlign: 'center' }}>
                  Wenn du keine Musik hörst dann bitte reloaden.
                  Solltest du nach dem klicken auf <strong>Start</strong> deine Seite neu laden,
                  dann wird das in der Liste gespeichert und es kann zum Ausschluss führen!
                </p>
              </>
            )}

            <div
              className="startArea"
              style={{ position: 'relative', marginTop: 12, height: 240, borderRadius: 10 }}
            >
              {/* 1) Modus-Auswahl */}
              {startMode === 'choose' && preCount === null && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    gap: 16,
                  }}
                >
                  {/* Nickname-Eingabe */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 4,
                    }}
                  >
                    <label style={{ fontSize: 13, opacity: 0.9 }}>
                      Dein Nickname:
                    </label>
                    <input
                      type="text"
                      value={nicknameInput}
                      maxLength={20}
                      onChange={e => setNicknameInput(e.target.value)}
                      placeholder="z.B. MinimalMB"
                      style={{
                        minWidth: 220,
                        padding: '6px 10px',
                        borderRadius: 8,
                        border: '1px solid #374151',
                        background: '#020617',
                        color: '#e5e7eb',
                        textAlign: 'center',
                      }}
                    />
                    <div
                      style={{
                        fontSize: 11,
                        marginTop: 4,
                        opacity: 0.9,
                        color: canStart ? '#9ca3af' : '#fca5a5',
                        textAlign: 'center',
                      }}
                    >
                      {canStart
                        ? 'Dieser Nickname wird für die Highscore-Liste verwendet.'
                        : `Mindestens ${MIN_NICKNAME_LENGTH} Zeichen benötigt.`}
                    </div>
                  </div>

                  {/* Modus-Buttons */}
                  <div
                    style={{
                      display: 'flex',
                      gap: 12,
                      flexWrap: 'wrap',
                      justifyContent: 'center',
                    }}
                  >
                    <button
                      className="btn"
                      onClick={chooseActionMode}
                      disabled={!canStart}
                    >
                      🚀 Action-Mini-Modus
                    </button>
                    <button
                      className="btn"
                      onClick={chooseBoringMode}
                      disabled={!canStart}
                    >
                      😴 Langweiliger Modus
                    </button>
                  </div>

                  <div
                    style={{
                      opacity: 0.8,
                      fontSize: 13,
                      textAlign: 'center',
                      maxWidth: 380,
                    }}
                  >
                    Im Action-Mini-Modus musst du erst ein kleines Start-Minigame überstehen.
                    Im langweiligen Modus gibt es nur einen einzigen START-Button mit Countdown.
                  </div>
                </div>
              )}

              {/* 2) Langweiliger Modus: ein Button, der direkt den Countdown startet */}
              {startMode === 'boring' && preCount === null && (
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    bottom: 10,
                    textAlign: 'center',
                  }}
                >
                  <button
                    className="btn"
                    onClick={() => {
                      startBgMusic();
                      beginCountdown();
                    }}
                  >
                    START
                  </button>
                </div>
              )}

              {/* 3a) Action-Mini-Modus: trollige Buttons */}
              {startMode === 'action' && miniGame === 'prankButtons' && preCount === null && (
                <>
                  {startStage === 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        bottom: 10,
                        textAlign: 'center',
                      }}
                    >
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

                  {startStage === 1 && (
                    <>
                      <div style={{ position: 'absolute', right: 8, top: 8 }}>
                        <button className="btn" onClick={() => setStartStage(2)}>
                          START
                        </button>
                      </div>
                      <div style={{ position: 'absolute', right: 8, top: 52, opacity: 0.9 }}>
                        Los klick ihn doch ⬆️
                      </div>
                    </>
                  )}

                  {startStage === 2 && (
                    <>
                      <div style={{ position: 'absolute', left: 8, bottom: 52, opacity: 0.9 }}>
                        ⬇️Warum drückst du ihn nicht?
                      </div>
                      <div style={{ position: 'absolute', left: 8, bottom: 8 }}>
                        <button className="btn" onClick={() => setStartStage(3)}>
                          START
                        </button>
                      </div>
                    </>
                  )}

                  {startStage === 3 && (
                    <>
                      <div
                        style={{
                          position: 'absolute',
                          right: 20,
                          top: '50%',
                          transform: 'translateY(-50%)',
                        }}
                      >
                        <button className="btn" onClick={() => setStartStage(4)}>
                          START
                        </button>
                      </div>
                      <div
                        style={{
                          position: 'absolute',
                          right: 10,
                          top: 'calc(50% + 36px)',
                          opacity: 0.9,
                        }}
                      >
                        kannst du überhaupt BUTTONS drücken? 🧌
                      </div>
                    </>
                  )}

                  {startStage === 4 && (
                    <>
                      <div
                        style={{
                          position: 'absolute',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          bottom: 52,
                          opacity: 0.9,
                        }}
                      >
                        Hö höö,⬇️hihihihi
                      </div>
                      <div
                        style={{
                          position: 'absolute',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          bottom: 8,
                        }}
                      >
                        <button className="btn" onClick={beginCountdown}>
                          START
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* 3b) Action-Mini-Modus: Slot-Minispiel */}
              {startMode === 'action' && miniGame === 'slot' && preCount === null && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    gap: 16,
                  }}
                >
                  <div style={{ display: 'flex', gap: 12 }}>
                    {slots.map((sym, idx) => (
                      <div
                        key={idx}
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: 12,
                          border: '2px solid #4b5563',
                          background: '#020617',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 36,
                          boxShadow: '0 6px 18px rgba(0,0,0,.45)',
                        }}
                      >
                        {sym}
                      </div>
                    ))}
                  </div>

                  <button className="btn" disabled={isSpinning} onClick={handleSlotSpin}>
                    {isSpinning ? '...' : 'SPIN'}
                  </button>

                  <div
                    style={{
                      opacity: 0.85,
                      fontSize: 13,
                      textAlign: 'center',
                      maxWidth: 380,
                    }}
                  >
                    <div>Du gewinnst, wenn alle drei Symbole gleich sind.</div>
                    <div style={{ marginTop: 4 }}>
                      Ab dem 5. Spin steigt deine Jackpot-Chance – jedes Mal um 10%.
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 12,
                        opacity: 0.8,
                      }}
                    >
                      Nächster Spin: ca. <strong>{nextJackpotChance}%</strong> Jackpot-Chance.
                    </div>
                  </div>
                </div>
              )}

              {/* 3c) Action-Mini-Modus: „Finde die Katze“ */}
              {startMode === 'action' && miniGame === 'findCat' && preCount === null && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    gap: 16,
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${FIND_CAT_SIZE}, 1fr)`,
                      gap: 8,
                    }}
                  >
                    {Array.from({ length: FIND_CAT_CELLS }).map((_, idx) => {
                    const isCat = idx === catPos;
                    const isHighlighted = isCat && catHighlight !== 'none';
                    const isRevealed = catRevealed[idx];

                    const showCat = isCat && (catHighlight !== 'none' || isRevealed);
                    const showCoffee = !isCat && isRevealed;

                    const icon = showCat ? '🐈' : showCoffee ? '☕' : '❓';

                    const bg = !isHighlighted
                      ? '#020617'
                      : catHighlight === 'success'
                      ? '#166534'
                      : '#14532d';

                    const border = isHighlighted ? '#22c55e' : '#4b5563';

                    return (
                      <button
                        key={idx}
                        type="button"
                        className="btn"
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: 12,
                          border: `2px solid ${border}`,
                          background: bg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 0,
                          fontSize: 32,
                        }}
                        onClick={() => handleCatClick(idx)}
                      >
                        {icon}
                      </button>
                    );
                  })}

                  </div>

                  <div
                    style={{
                      opacity: 0.9,
                      fontSize: 13,
                      textAlign: 'center',
                      maxWidth: 360,
                    }}
                  >
                    Finde die versteckte Katze 🐈 zwischen all dem Kaffee ☕.
                    {catAttempts >= 4 && (
                      <div style={{ marginTop: 4 }}>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Countdown-Overlay (für beide Modi) */}
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
        <div
          className="modalBackdrop"
          onClick={() => {
            setShowWin(false);
            setScoreError(null);
          }}          
        >
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, textAlign: 'center' }}>
              🎉 Glückwunsch du wundervoller Mensch!
            </h2>
            <p style={{ opacity: 0.9, marginTop: 8, textAlign: 'center' }}>
              Benötigte Zeit:{' '}
              <strong>{formatTime(winTimeMs ?? elapsedMs)}</strong>
            </p>
            {solutionWord && (
              <p style={{ opacity: 0.9, marginTop: 8, textAlign: 'center' }}>
                Lösungswort:{' '}
                <strong style={{ letterSpacing: '0.06em' }}>
                  {solutionWord}
                </strong>
              </p>
            )}

            {/* Info zur Highscore-Speicherung */}
              <div
              style={{
                marginTop: 14,
                textAlign: 'center',
                fontSize: 13,
                opacity: 0.9,
              }}
            >
              <div>
                Dein Nickname:{' '}
                <strong>{nicknameInput.trim() || 'Unbekannt'}</strong>
              </div>
              <div style={{ marginTop: 6 }}>
                {scoreSaving && (
                  <span>Dein Eintrag wird in die Highscore-Liste eingetragen…</span>
                )}
                {!scoreSaving && scoreSaved && !scoreError && (
                  <span>
                    Dein Eintrag ist jetzt rechts in der Highscore-Liste. 🏆
                  </span>
                )}
                {!scoreSaving && !scoreSaved && !scoreError && (
                  <span>
                    Versuche, deinen Eintrag in der Highscore-Liste zu speichern…
                  </span>
                )}
                {scoreError && (
                  <span
                    style={{
                      color: '#fecaca',
                      display: 'block',
                      marginTop: 4,
                    }}
                  >
                    Konnte Highscore nicht speichern.
                  </span>
                )}
              </div>
            </div>

            <div
              className="actions"
              style={{ justifyContent: 'center', marginTop: 16 }}
            >
              <button
                className="btn"
                onClick={() => {
                  setShowWin(false);
                  setScoreError(null);
                }}                
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}