/* eslint-disable react-hooks/exhaustive-deps */
declare global { interface Window { LZString: any } }

function encodePayload(obj: unknown): string {
  return window.LZString.compressToEncodedURIComponent(JSON.stringify(obj));
}
function decodePayload<T>(s: string): T {
  const raw = window.LZString.decompressFromEncodedURIComponent(s);
  if (!raw) throw new Error('Decode failed');
  return JSON.parse(raw) as T;
}

import { useEffect, useMemo, useRef, useState } from 'react';

// --- Types ---
type Dir = 'RIGHT' | 'DOWN';
export type Variant = 'LEFT_CLUE_RIGHT' | 'ABOVE_CLUE_DOWN' | 'LEFT_CLUE_DOWN';

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

      let start: { r: number; c: number };
      let dir: Dir;
      if (clue.variant === 'LEFT_CLUE_RIGHT') {
        start = { r, c: c + 1 }; dir = 'RIGHT';
      } else if (clue.variant === 'ABOVE_CLUE_DOWN') {
        start = { r: r + 1, c }; dir = 'DOWN';
      } else { // LEFT_CLUE_DOWN
        start = { r, c: c + 1 }; dir = 'DOWN';
      }

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
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    function resize() {
      const w = innerWidth, h = innerHeight;
      cnv.width = Math.floor(w*dpr); cnv.height = Math.floor(h*dpr);
      cnv.style.width = `${w}px`; cnv.style.height = `${h}px`;
      ctx.setTransform(1,0,0,1,0,0); ctx.scale(dpr,dpr);
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
  const [startStage, setStartStage] = useState<number>(0);  // 0..4 (4 = final klick startet)
  const [showWin, setShowWin] = useState(false);

  const prevAllCorrect = useRef(false);

  // Flashing für korrekt gelöste Segmente
  const [flashingSegs, setFlashingSegs] = useState<Set<string>>(new Set());
  const prevSolvedRef = useRef<Set<string>>(new Set());

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

  // URL-Hash laden
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
      setGrid(g); setMode('play'); setLocked(isLocked);
      setShowWin(false); setWinTimeMs(null);
      setTimeout(() => setGrid(g2 => mapExpected(g2)), 0);
      // Timer & Startdialog zurücksetzen
      setTimerRunning(false); setTimerStart(null); setElapsedMs(0);
      setShowStart(true); setStartStage(0);
    }
  }, []);

  // Wenn aus Editor zu Play gewechselt wird: Startdialog zeigen
  useEffect(() => {
    if (mode === 'play' && timerStart === null && !showStart && !showWin) {
      setShowStart(true); setStartStage(0);
    }
  }, [mode]);

  // Segmente
  const segments = useMemo(() => buildSegments(grid), [grid]);

  // Startpfeile
  const arrowStarts = useMemo(() => {
    const m = new Map<string, Dir>();
    segments.forEach(s => m.set(`${s.start.r}-${s.start.c}`, s.dir));
    return m;
  }, [segments]);

  // Map Zelle -> Segment
  const segmentByCell = useMemo(() => {
    const m = new Map<string, Segment>();
    for (const s of segments) for (const pos of s.cells) m.set(`${pos.r}-${pos.c}`, s);
    return m;
  }, [segments]);

  // Voll befüllte Segmente
  const completedSegIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of segments) {
      if (s.cells.length && s.cells.every(({ r, c }) => (grid[r][c].letter ?? '') !== '')) {
        ids.add(s.id);
      }
    }
    return ids;
  }, [segments, grid]);

  // expected neu mappen bei Segment-Änderung
  useEffect(() => { setGrid(g => mapExpected(g, segments)); }, [segments.length]);

  // Timer-Intervall
  useEffect(() => {
    if (!timerRunning || !timerStart) return;
    const id = setInterval(() => setElapsedMs(Date.now() - timerStart), 33);
    return () => clearInterval(id);
  }, [timerRunning, timerStart]);

  // Alle erwarteten Buchstaben korrekt?
  const allCorrect = useMemo(() => {
    let hasExpected = false;
    for (const row of grid) for (const cell of row) {
      if (cell.expected) {
        hasExpected = true;
        if (cell.letter !== cell.expected) return false;
      }
    }
    return hasExpected;
  }, [grid]);

  // gelöste Segmente (korrekt & keine Extra-Buchstaben)
  const solvedSegIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of segments) {
      let hasAnyExpected = false; let ok = true;
      for (const { r, c } of s.cells) {
        const cell = grid[r][c];
        if (cell.expected) {
          hasAnyExpected = true;
          if (cell.letter !== cell.expected) { ok = false; break; }
        } else {
          if ((cell.letter ?? '') !== '') { ok = false; break; }
        }
      }
      if (hasAnyExpected && ok) ids.add(s.id);
    }
    return ids;
  }, [segments, grid]);

  // Flash triggern
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

  // Auto-Stop & Win-Popup
  useEffect(() => {
    if (allCorrect && !prevAllCorrect.current) {
      setTimerRunning(false);
      setWinTimeMs(elapsedMs);
      setActiveSeg(null);          // Markierung entfernen (verhindert Overlay über Modal)
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

  // Events
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

  function onClearAll() {
    if (!confirm('Rätsel wirklich komplett leeren?')) return;
    setGrid(emptyGrid());
    setSolutionMode(false); setSolutionNext(1); setActiveSeg(null);
    history.replaceState(null, '', ' ');
    setTimerRunning(false); setTimerStart(null); setElapsedMs(0);
    setShowWin(false); setWinTimeMs(null); setShowStart(false); setStartStage(0);
  }

  function onResetSolutionNumbers() {
    setGrid(g => {
      const g2 = cloneGrid(g);
      g2.forEach(row => row.forEach(c => (c.solutionIndex = null)));
      return g2;
    });
    setSolutionNext(1);
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

  function onCopyLink()       { navigator.clipboard.writeText(makeUrl(false)); alert('Link kopiert! (Editor & Lösen)'); }
  function onCopySolveOnly()  { navigator.clipboard.writeText(makeUrl(true));  alert('Teil-Link kopiert! (Nur Lösen)'); }

  function onStartGame() {
    setShowStart(false);
    setTimerStart(Date.now());
    setElapsedMs(0);
    setTimerRunning(true);
  }

  // Clues ausblenden, solange Start offen (nur im Play-Modus)
  const hideClues = mode === 'play' && showStart;

  // --- Render ---
  return (
    <div className={`app ${showWin || showStart || modal.open ? 'modal-open' : ''}`}>
      {/* Kleine Styles: Flash, Z-Index, Modal-Blocker */}
      <style>{`
        @keyframes flashCorrect { 0%{background:#0f141b}25%{background:#065f46}50%{background:#059669}100%{background:#0f141b} }
        .cell.flash-correct { animation: flashCorrect 600ms ease-in-out; }
        .modalBackdrop { z-index: 10000; }
        .modal { position: relative; z-index: 10001; }
        .app.modal-open .grid { pointer-events: none; }
      `}</style>

      {showWin && <ConfettiCanvas />}

      <header className="bar">
        <div className="left"><strong>Schwedenrätsel</strong></div>
        <div className="center" style={{ gap: 12 }}>
          <span style={{ opacity:.9, padding:'6px 10px', border:'1px solid #2a3442', borderRadius:8, background:'#1d2430' }}>
            ⏱ {formatTime(winTimeMs ?? elapsedMs)}
          </span>
          {!locked ? (
            <>
              <button className={mode === 'edit' ? 'btn active' : 'btn'} onClick={() => setMode('edit')}>Editor</button>
              <button className={mode === 'play' ? 'btn active' : 'btn'} onClick={() => setMode('play')}>Lösen</button>
              {mode === 'edit' && (
                <>
                  <label className="toggle">
                    <input type="checkbox" checked={solutionMode} onChange={e => setSolutionMode(e.target.checked)} />
                    Lösungswort-Modus
                  </label>
                  {solutionMode && <button className="btn" onClick={onResetSolutionNumbers}>Nummern zurücksetzen</button>}
                </>
              )}
            </>
          ) : (<span style={{opacity:.9}}>Lösen · <small>Nur-Ansicht</small></span>)}
        </div>
        <div className="right">
          {!locked ? (
            <>
              <button className="btn" onClick={onCopySolveOnly}>Teilen (Nur Lösen)</button>
              <button className="btn" onClick={onCopyLink}>Link kopieren</button>
              <button className="btn danger" onClick={onClearAll}>Alles löschen</button>
            </>
          ) : null}
        </div>
      </header>

      <div className="grid">
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

              const startDir = arrowStarts.get(`${r}-${c}`);

              return (
                <div className={classNames} key={`${r}-${c}`} onClick={() => onCellClick(r, c)}>
                  {cell.type === 'clue' && cell.clue && (
                    <div className="clueText">{hideClues ? '' : cell.clue.text}</div>
                  )}
                  {cell.type === 'empty' && (cell.letter ?? '')}
                  {startDir === 'RIGHT' && <div className="arrow right" />}
                  {startDir === 'DOWN'  && <div className="arrow down"  />}
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

      {/* Start-Modal mit „Schnitzeljagd“ */}
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

            {/* Spielwiese für die Buttons */}
            <div
              className="startArea"
              style={{
                position:'relative',
                marginTop:12,
                height: 220,
                borderRadius: 10,
              }}
            >
              {/* Stage 0: normal unten zentriert */}
              {startStage === 0 && (
                <div style={{position:'absolute', left:'50%', transform:'translateX(-50%)', bottom:10, textAlign:'center'}}>
                  <button className="btn" onClick={() => setStartStage(1)}>START</button>
                </div>
              )}

              {/* Stage 1: oben rechts + Text darunter */}
              {startStage === 1 && (
                <>
                  <div style={{position:'absolute', right:8, top:8}}>
                    <button className="btn" onClick={() => setStartStage(2)}>START</button>
                  </div>
                  <div style={{position:'absolute', right:8, top:52, opacity:.9}}>Los klick ihn doch ⬆️</div>
                </>
              )}

              {/* Stage 2: unten links + Text darüber */}
              {startStage === 2 && (
                <>
                  <div style={{position:'absolute', left:8, bottom:52, opacity:.9}}>
                    ⬇️Warum drückst du ihn nicht?
                  </div>
                  <div style={{position:'absolute', left:8, bottom:8}}>
                    <button className="btn" onClick={() => setStartStage(3)}>START</button>
                  </div>
                </>
              )}

              {/* Stage 3: rechts mittig + Text darunter */}
              {startStage === 3 && (
                <>
                  <div style={{position:'absolute', right:20, top:'50%', transform:'translateY(-50%)'}}>
                    <button className="btn" onClick={() => setStartStage(4)}>START</button>
                  </div>
                  <div style={{position:'absolute', right:10, top:'calc(50% + 36px)', opacity:.9}}>
                    kannst du überhaupt BUTTONS drücken? 🧌
                  </div>
                </>
              )}

              {/* Stage 4: final unten mittig + Text darüber -> startet Spiel */}
              {startStage === 4 && (
                <>
                  <div style={{position:'absolute', left:'50%', transform:'translateX(-50%)', bottom:52, opacity:.9}}>
                    Hö höö,⬇️hihihihi
                  </div>
                  <div style={{position:'absolute', left:'50%', transform:'translateX(-50%)', bottom:8}}>
                    <button className="btn" onClick={onStartGame}>START</button>
                  </div>
                </>
              )}
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
            <div className="actions" style={{justifyContent:'center', marginTop:16}}>
              <button className="btn" onClick={() => setShowWin(false)}>Schließen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
