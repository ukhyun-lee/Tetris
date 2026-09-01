import { useState, useRef, useEffect } from "react";

/* ── 필드 규격 ───────────────────────────────────────── */
const COLS = 10;
const ROWS = 20;

/* ── 조각 정의 (스폰 상태) ───────────────────────────── */
const BASE = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
};

/* 에나멜 도장 느낌으로 살짝 채도를 낮춘 색 */
const COLORS = {
  I: "#4cc9d6",
  J: "#4a72d4",
  L: "#e88b3c",
  O: "#e0bf34",
  S: "#5fbf68",
  T: "#a86fd1",
  Z: "#dc5a5a",
};

const PALETTE = {
  ink: "#0e1218",
  cabinet: "#232a33",
  panel: "#1a2028",
  edge: "#39424e",
  bone: "#e8e3d8",
  dim: "#8b939e",
  signal: "#e5484d",
};

const FONT =
  '"Helvetica Neue", "Segoe UI", Roboto, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

const rotateCW = (m) => m[0].map((_, i) => m.map((r) => r[i]).reverse());

const ROTS = {};
for (const k of Object.keys(BASE)) {
  ROTS[k] = [BASE[k]];
  for (let i = 1; i < 4; i++) ROTS[k].push(rotateCW(ROTS[k][i - 1]));
}

const KICKS = [0, -1, 1, -2, 2];
const emptyBoard = () =>
  Array.from({ length: ROWS }, () => Array(COLS).fill(null));

function shuffled() {
  const bag = ["I", "J", "L", "O", "S", "T", "Z"];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

const spawn = (type) => ({
  type,
  rot: 0,
  x: Math.floor((COLS - BASE[type][0].length) / 2),
  y: type === "I" ? -1 : 0,
});

function cellsOf(p) {
  const m = ROTS[p.type][p.rot];
  const out = [];
  for (let r = 0; r < m.length; r++)
    for (let c = 0; c < m[r].length; c++)
      if (m[r][c]) out.push([p.x + c, p.y + r]);
  return out;
}

function collides(board, p) {
  for (const [x, y] of cellsOf(p)) {
    if (x < 0 || x >= COLS || y >= ROWS) return true;
    if (y >= 0 && board[y][x]) return true;
  }
  return false;
}

const dropInterval = (level) => Math.max(70, 800 - (level - 1) * 68);

function newGame() {
  const g = {
    board: emptyBoard(),
    cur: null,
    queue: [],
    hold: null,
    canHold: true,
    score: 0,
    lines: 0,
    level: 1,
    status: "ready", // ready | playing | paused | over
    dropAcc: 0,
    lockAcc: 0,
    lockResets: 0,
    softDrop: false,
    dir: 0,
    dasAcc: 0,
    dasDir: 0,
    charged: false,
    flash: 0,
    lastClear: null,
    dirty: true,
  };
  fill(g);
  return g;
}

function fill(g) {
  while (g.queue.length < 7) g.queue.push(...shuffled());
}

function next(g) {
  fill(g);
  g.cur = spawn(g.queue.shift());
  g.canHold = true;
  g.lockAcc = 0;
  g.lockResets = 0;
  g.dropAcc = 0;
  if (collides(g.board, g.cur)) {
    g.status = "over";
    g.cur = null;
  }
}

function tryMove(g, dx, dy) {
  if (!g.cur) return false;
  const p = { ...g.cur, x: g.cur.x + dx, y: g.cur.y + dy };
  if (collides(g.board, p)) return false;
  g.cur = p;
  g.dirty = true;
  return true;
}

function tryRotate(g, dir) {
  if (!g.cur) return false;
  const rot = (g.cur.rot + (dir > 0 ? 1 : 3)) % 4;
  for (const k of KICKS) {
    const p = { ...g.cur, rot, x: g.cur.x + k };
    if (!collides(g.board, p)) {
      g.cur = p;
      g.dirty = true;
      return true;
    }
  }
  return false;
}

function ghostY(g) {
  if (!g.cur) return 0;
  let p = { ...g.cur };
  while (!collides(g.board, { ...p, y: p.y + 1 })) p = { ...p, y: p.y + 1 };
  return p.y;
}

function lock(g) {
  if (!g.cur) return;
  for (const [x, y] of cellsOf(g.cur)) {
    if (y < 0) {
      g.status = "over";
      g.cur = null;
      g.dirty = true;
      return;
    }
    g.board[y][x] = g.cur.type;
  }

  const kept = g.board.filter((row) => row.some((c) => !c));
  const cleared = ROWS - kept.length;
  if (cleared > 0) {
    while (kept.length < ROWS) kept.unshift(Array(COLS).fill(null));
    g.board = kept;
    g.lines += cleared;
    g.score += [0, 100, 300, 500, 800][cleared] * g.level;
    g.level = Math.floor(g.lines / 10) + 1;
    g.flash = 220;
    g.lastClear = cleared;
  }
  next(g);
  g.dirty = true;
}

function hardDrop(g) {
  if (!g.cur) return;
  const y = ghostY(g);
  g.score += (y - g.cur.y) * 2;
  g.cur = { ...g.cur, y };
  lock(g);
}

function doHold(g) {
  if (!g.cur || !g.canHold) return;
  const cur = g.cur.type;
  if (g.hold) {
    g.cur = spawn(g.hold);
    g.hold = cur;
  } else {
    g.hold = cur;
    fill(g);
    g.cur = spawn(g.queue.shift());
  }
  g.canHold = false;
  g.lockAcc = 0;
  g.dropAcc = 0;
  g.dirty = true;
  if (collides(g.board, g.cur)) {
    g.status = "over";
    g.cur = null;
  }
}

function step(g, dt) {
  if (g.flash > 0) {
    g.flash = Math.max(0, g.flash - dt);
    g.dirty = true;
  }
  if (!g.cur) return;

  /* 좌우 자동 반복 (DAS 150ms / ARR 40ms) */
  if (g.dir !== 0) {
    if (g.dasDir !== g.dir) {
      g.dasDir = g.dir;
      g.dasAcc = 0;
      g.charged = false;
      tryMove(g, g.dir, 0);
    } else {
      g.dasAcc += dt;
      const gate = g.charged ? 40 : 150;
      if (g.dasAcc >= gate) {
        g.dasAcc = 0;
        g.charged = true;
        tryMove(g, g.dir, 0);
      }
    }
  } else {
    g.dasDir = 0;
    g.charged = false;
  }

  const base = dropInterval(g.level);
  const interval = g.softDrop ? Math.min(45, base) : base;
  g.dropAcc += dt;
  while (g.dropAcc >= interval) {
    g.dropAcc -= interval;
    if (tryMove(g, 0, 1)) {
      if (g.softDrop) g.score += 1;
      g.lockAcc = 0;
    } else break;
  }

  const grounded = collides(g.board, { ...g.cur, y: g.cur.y + 1 });
  if (grounded) {
    g.lockAcc += dt;
    if (g.lockAcc >= 500) lock(g);
  } else {
    g.lockAcc = 0;
  }
}

/* ── 미리보기용 조각 트리밍 ──────────────────────────── */
function trimmed(type) {
  const m = BASE[type];
  const rows = m.filter((r) => r.some(Boolean));
  const keep = [];
  for (let c = 0; c < m[0].length; c++)
    if (m.some((r) => r[c])) keep.push(c);
  return rows.map((r) => keep.map((c) => r[c]));
}

/* ── 타일 ────────────────────────────────────────────── */
function Tile({ type, ghost, size }) {
  if (!type)
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 2,
          background: "rgba(255,255,255,0.02)",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.03)",
        }}
      />
    );
  const c = COLORS[type];
  if (ghost)
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 2,
          boxShadow: `inset 0 0 0 2px ${c}55`,
        }}
      />
    );
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 2,
        background: c,
        boxShadow: `inset 2px 2px 0 rgba(255,255,255,0.42), inset -2px -2px 0 rgba(0,0,0,0.34)`,
      }}
    />
  );
}

function MiniPiece({ type, size = 14, faded }) {
  if (!type)
    return (
      <div
        style={{ height: size * 2, opacity: 0.35, color: PALETTE.dim, fontSize: 12 }}
      >
        비어 있음
      </div>
    );
  const m = trimmed(type);
  return (
    <div style={{ display: "grid", gap: 2, opacity: faded ? 0.35 : 1 }}>
      {m.map((row, i) => (
        <div key={i} style={{ display: "flex", gap: 2 }}>
          {row.map((v, j) => (
            <div key={j}>
              {v ? (
                <Tile type={type} size={size} />
              ) : (
                <div style={{ width: size, height: size }} />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Readout({ label, value, accent }) {
  return (
    <div>
      <div style={{ color: PALETTE.dim, fontSize: 11, letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div
        style={{
          color: accent ? PALETTE.signal : PALETTE.bone,
          fontSize: 26,
          fontWeight: 700,
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Panel({ children, style }) {
  return (
    <div
      style={{
        background: PALETTE.panel,
        border: `1px solid ${PALETTE.edge}`,
        borderRadius: 4,
        padding: 12,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function PadButton({ label, onPress, wide }) {
  return (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        onPress(true);
      }}
      onPointerUp={() => onPress(false)}
      onPointerLeave={() => onPress(false)}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        flex: wide ? 2 : 1,
        padding: "14px 0",
        background: PALETTE.cabinet,
        border: `1px solid ${PALETTE.edge}`,
        borderRadius: 4,
        color: PALETTE.bone,
        fontSize: 13,
        fontWeight: 600,
        touchAction: "none",
        userSelect: "none",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

/* ── 메인 ────────────────────────────────────────────── */
export default function Tetris() {
  const [, force] = useState(0);
  const gameRef = useRef(null);
  if (!gameRef.current) gameRef.current = newGame();
  const g = gameRef.current;

  const [cell, setCell] = useState(24);
  useEffect(() => {
    const fit = () => {
      const w = Math.min(window.innerWidth - 32, 460);
      setCell(Math.max(14, Math.min(26, Math.floor((w * 0.62) / COLS))));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  /* 게임 루프 */
  useEffect(() => {
    let raf;
    let last = performance.now();
    const loop = (t) => {
      const dt = Math.min(t - last, 100);
      last = t;
      const s = gameRef.current;
      if (s.status === "playing") step(s, dt);
      if (s.dirty) {
        s.dirty = false;
        force((n) => n + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const start = () => {
    gameRef.current = newGame();
    const s = gameRef.current;
    s.status = "playing";
    next(s);
    force((n) => n + 1);
  };

  const togglePause = () => {
    const s = gameRef.current;
    if (s.status === "playing") s.status = "paused";
    else if (s.status === "paused") s.status = "playing";
    s.dirty = true;
  };

  /* 키 입력 */
  useEffect(() => {
    const down = (e) => {
      const s = gameRef.current;
      const k = e.key;
      if (
        ["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " "].includes(k)
      )
        e.preventDefault();

      if (s.status === "ready" || s.status === "over") {
        if (k === "Enter" || k === " " || k.toLowerCase() === "r") start();
        return;
      }
      if (k.toLowerCase() === "p" || k === "Escape") return togglePause();
      if (k.toLowerCase() === "r") return start();
      if (s.status !== "playing") return;

      switch (k) {
        case "ArrowLeft":
          s.dir = -1;
          break;
        case "ArrowRight":
          s.dir = 1;
          break;
        case "ArrowDown":
          s.softDrop = true;
          break;
        case "ArrowUp":
        case "x":
        case "X":
          if (tryRotate(s, 1)) resetLock(s);
          break;
        case "z":
        case "Z":
          if (tryRotate(s, -1)) resetLock(s);
          break;
        case " ":
          hardDrop(s);
          break;
        case "c":
        case "C":
        case "Shift":
          doHold(s);
          break;
        default:
          break;
      }
    };
    const up = (e) => {
      const s = gameRef.current;
      if (e.key === "ArrowLeft" && s.dir === -1) s.dir = 0;
      if (e.key === "ArrowRight" && s.dir === 1) s.dir = 0;
      if (e.key === "ArrowDown") s.softDrop = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const resetLock = (s) => {
    if (s.lockResets < 15) {
      s.lockAcc = 0;
      s.lockResets++;
    }
  };

  /* 표시용 그리드 */
  const view = g.board.map((row) => row.map((c) => (c ? { type: c } : null)));
  if (g.cur) {
    const gy = ghostY(g);
    for (const [x, y] of cellsOf({ ...g.cur, y: gy }))
      if (y >= 0 && !view[y][x]) view[y][x] = { type: g.cur.type, ghost: true };
    for (const [x, y] of cellsOf(g.cur))
      if (y >= 0) view[y][x] = { type: g.cur.type };
  }

  const overlay =
    g.status === "ready"
      ? { title: "테트리스", body: "스페이스바를 누르면 시작합니다", cta: "시작" }
      : g.status === "paused"
      ? { title: "일시정지", body: "P를 눌러 이어서 하세요", cta: "이어하기" }
      : g.status === "over"
      ? {
          title: "게임 종료",
          body: `${g.score.toLocaleString()}점 · ${g.lines}줄`,
          cta: "다시 하기",
        }
      : null;

  const boardW = cell * COLS + 9 * 2;

  return (
    <div
      style={{
        fontFamily: FONT,
        background: PALETTE.ink,
        minHeight: "100%",
        padding: "20px 16px 28px",
        display: "flex",
        justifyContent: "center",
        color: PALETTE.bone,
      }}
    >
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "0.22em",
              margin: 0,
            }}
          >
            테트리스
          </h1>
          <span style={{ color: PALETTE.dim, fontSize: 12 }}>
            {g.status === "playing" ? "진행 중" : g.status === "paused" ? "멈춤" : ""}
          </span>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          {/* 왼쪽: 홀드 + 스탯 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              flex: 1,
              minWidth: 0,
            }}
          >
            <Panel>
              <div
                style={{ color: PALETTE.dim, fontSize: 11, marginBottom: 8 }}
              >
                홀드
              </div>
              <MiniPiece type={g.hold} size={Math.round(cell * 0.55)} faded={!g.canHold} />
            </Panel>
            <Panel style={{ display: "grid", gap: 12 }}>
              <Readout label="점수" value={g.score.toLocaleString()} />
              <Readout label="줄" value={g.lines} />
              <Readout label="레벨" value={g.level} accent={g.level > 1} />
            </Panel>
          </div>

          {/* 가운데: 필드 */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div
              style={{
                width: boardW,
                padding: 8,
                background: "#080b10",
                border: `1px solid ${PALETTE.edge}`,
                borderRadius: 4,
                boxShadow:
                  g.flash > 0
                    ? `0 0 0 2px ${PALETTE.signal}${g.flash > 110 ? "cc" : "55"}`
                    : "inset 0 2px 12px rgba(0,0,0,0.6)",
                display: "grid",
                gap: 1,
              }}
            >
              {view.map((row, y) => (
                <div key={y} style={{ display: "flex", gap: 1 }}>
                  {row.map((c, x) => (
                    <Tile
                      key={x}
                      type={c?.type}
                      ghost={c?.ghost}
                      size={cell - 1}
                    />
                  ))}
                </div>
              ))}
            </div>

            {overlay && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(8,11,16,0.9)",
                  borderRadius: 4,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  padding: 16,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 700 }}>
                  {overlay.title}
                </div>
                <div style={{ color: PALETTE.dim, fontSize: 13 }}>
                  {overlay.body}
                </div>
                <button
                  onClick={g.status === "paused" ? togglePause : start}
                  style={{
                    marginTop: 4,
                    padding: "10px 22px",
                    background: PALETTE.signal,
                    border: "none",
                    borderRadius: 3,
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {overlay.cta}
                </button>
              </div>
            )}
          </div>

          {/* 오른쪽: 다음 조각 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Panel>
              <div
                style={{ color: PALETTE.dim, fontSize: 11, marginBottom: 8 }}
              >
                다음
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                {g.queue.slice(0, 3).map((t, i) => (
                  <MiniPiece
                    key={i}
                    type={g.status === "ready" ? null : t}
                    size={Math.round(cell * (i === 0 ? 0.55 : 0.42))}
                  />
                ))}
              </div>
            </Panel>
          </div>
        </div>

        {/* 터치 조작 */}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <PadButton
            label="←"
            onPress={(on) => {
              g.dir = on ? -1 : 0;
              g.dirty = true;
            }}
          />
          <PadButton
            label="→"
            onPress={(on) => {
              g.dir = on ? 1 : 0;
              g.dirty = true;
            }}
          />
          <PadButton
            label="회전"
            onPress={(on) => on && (tryRotate(g, 1), resetLock(g))}
          />
          <PadButton
            label="↓"
            onPress={(on) => {
              g.softDrop = on;
              g.dirty = true;
            }}
          />
          <PadButton
            label="바닥까지"
            wide
            onPress={(on) => on && g.status === "playing" && hardDrop(g)}
          />
          <PadButton label="홀드" onPress={(on) => on && doHold(g)} />
        </div>

        <div
          style={{
            marginTop: 14,
            color: PALETTE.dim,
            fontSize: 12,
            lineHeight: 1.8,
          }}
        >
          <div>←→ 이동 · ↓ 빠르게 내리기 · ↑ 또는 X 시계방향 회전 · Z 반시계방향</div>
          <div>스페이스바 바닥까지 · C 홀드 · P 일시정지 · R 새 게임</div>
        </div>
      </div>
    </div>
  );
}
