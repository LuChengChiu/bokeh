import { useCallback, useEffect, useRef, useState } from "react";
import Dock from "./Dock";
import SwapIcon from "./SwapIcon";
import Frame from "./Frame";
import { loadPicture, type Picture } from "./load";
import { toPng } from "./png";
import { compose, forgetBlur, type Mode, type Sel } from "./render";
import {
  clampView,
  fitScale,
  minSel,
  moveSel,
  resizeSel,
  toImage,
  zoomAt,
  type View,
} from "./view";

const MAX_SCALE = 4;
const TRUE_SIZE = 1;
const TAP_SLOP = 6;
const DOUBLE_TAP_MS = 320;

type Drag =
  | { kind: "pan"; sx: number; sy: number; tx: number; ty: number }
  | { kind: "move"; ox: number; oy: number }
  | { kind: "resize"; handle: string; start: Sel };

export default function App() {
  const wsRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const points = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<Drag | null>(null);
  const pinch = useRef<{ d: number; s: number } | null>(null);
  const lastTap = useRef(0);
  const warm = useRef<Blob | null>(null);

  const [pic, setPic] = useState<Picture | null>(null);
  const [sel, setSel] = useState<Sel>({ x: 0, y: 0, w: 0, h: 0 });
  const [mode, setMode] = useState<Mode>("blur");
  const [radius, setRadius] = useState(24);
  const [view, setView] = useState<View>({ s: 1, tx: 0, ty: 0 });
  const [minScale, setMinScale] = useState(1);
  const [msg, setMsg] = useState("");

  // A fixed cap means different things on a screenshot and on a camera photo.
  const maxRadius = pic ? Math.max(20, Math.round(Math.min(pic.w, pic.h) / 12)) : 80;
  const blurRadius = Math.min(radius, maxRadius);

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv || !pic) return;
    compose(cv, pic.src, sel, mode, blurRadius);
  }, [pic, sel, mode, blurRadius]);

  /* iOS Safari drops transient activation across an await, so navigator.share must not
     be reached through one — an encoded PNG has to be on hand when the tap arrives.
     ponytail: re-encodes once the picture stops changing. If that idle cost shows up on
     very large pictures, gate it on the Save button being visible. */
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv || !pic) return;
    warm.current = null;
    let live = true;
    const t = setTimeout(() => {
      void toPng(cv).then(
        (blob) => {
          if (live) warm.current = blob;
        },
        () => {},
      );
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [pic, sel, mode, blurRadius]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 4200);
    return () => clearTimeout(t);
  }, [msg]);

  const rect = () => wsRef.current!.getBoundingClientRect();

  const applyView = useCallback(
    (v: View) => {
      if (!pic) return;
      const r = rect();
      setView(clampView(v, pic.w, pic.h, r.width, r.height));
    },
    [pic],
  );

  const zoomTo = (px: number, py: number, next: number) => {
    applyView(zoomAt(view, px, py, Math.max(minScale, Math.min(MAX_SCALE, next))));
  };

  const toggleZoom = (px: number, py: number) =>
    zoomTo(px, py, view.s > minScale * 1.02 ? minScale : TRUE_SIZE);

  const openFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    try {
      const p = await loadPicture(file);
      const r = rect();
      const s = fitScale(p.w, p.h, r.width, r.height);
      forgetBlur(); // otherwise the outgoing picture and its full-size blur are held for the tab's life
      setPic((old) => {
        if (old && old.src !== p.src && "close" in old.src) old.src.close();
        return p;
      });
      setSel({
        x: Math.round(p.w * 0.25),
        y: Math.round(p.h * 0.25),
        w: Math.round(p.w * 0.5),
        h: Math.round(p.h * 0.5),
      });
      setMinScale(s);
      setView(clampView({ s, tx: 0, ty: 0 }, p.w, p.h, r.width, r.height));
      setMsg(`${p.w} × ${p.h}`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }, []);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    void openFile(e.target.files?.[0]);
    e.target.value = ""; // picking the same file again must reload it
  };

  /* ---------- gestures: one finger on the frame moves it, one finger anywhere
       else pans, two fingers always zoom, double tap toggles true size ---------- */

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pic) return;
    const el = e.target as HTMLElement;
    // The controls are children of the workspace. Without this a slider drag also pans
    // the picture, the capture below retargets the events away from the input, and two
    // taps on any button land as a double tap.
    if (el.closest(".dock, .top, .empty, .say")) return;
    points.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);

    if (points.current.size === 2) {
      drag.current = null;
      const [a, b] = [...points.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), s: view.s };
      return;
    }
    if (points.current.size > 2) return;

    const handle = el.closest<HTMLElement>("[data-handle]");
    const r = rect();
    const p = toImage(view, e.clientX - r.left, e.clientY - r.top);

    if (handle) drag.current = { kind: "resize", handle: handle.dataset.handle!, start: sel };
    else if (el.closest("[data-frame]")) drag.current = { kind: "move", ox: p.x - sel.x, oy: p.y - sel.y };
    else drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, tx: view.tx, ty: view.ty };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pic || !points.current.has(e.pointerId)) return;
    points.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = rect();

    if (pinch.current && points.current.size >= 2) {
      const [a, b] = [...points.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomTo((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, pinch.current.s * (d / pinch.current.d));
      return;
    }

    const g = drag.current;
    if (!g) return;
    if (g.kind === "pan") {
      applyView({ s: view.s, tx: g.tx + (e.clientX - g.sx), ty: g.ty + (e.clientY - g.sy) });
      return;
    }

    const p = toImage(view, e.clientX - r.left, e.clientY - r.top);
    const min = minSel(view.s);
    if (g.kind === "move") setSel(moveSel({ ...sel, x: p.x - g.ox, y: p.y - g.oy }, pic.w, pic.h));
    else setSel(resizeSel(g.handle, g.start, p.x, p.y, pic.w, pic.h, min));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    points.current.delete(e.pointerId);
    if (points.current.size < 2) pinch.current = null;
    if (points.current.size > 0) return;

    const g = drag.current;
    drag.current = null;
    if (g?.kind !== "pan") return;
    if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) >= TAP_SLOP) return;

    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      const r = rect();
      toggleZoom(e.clientX - r.left, e.clientY - r.top);
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  };

  // Trackpad pinch arrives as ctrl+wheel; a plain wheel pans. Registered by hand
  // because preventDefault needs a non-passive listener.
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !pic) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = ws.getBoundingClientRect();
      if (e.ctrlKey) zoomTo(e.clientX - r.left, e.clientY - r.top, view.s * Math.exp(-e.deltaY / 220));
      else applyView({ s: view.s, tx: view.tx - e.deltaX, ty: view.ty - e.deltaY });
    };
    ws.addEventListener("wheel", onWheel, { passive: false });
    return () => ws.removeEventListener("wheel", onWheel);
  });

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => void openFile(e.clipboardData?.files?.[0]);
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [openFile]);

  useEffect(() => {
    if (!pic) return;
    const onResize = () => {
      const r = rect();
      const s = fitScale(pic.w, pic.h, r.width, r.height);
      setMinScale(s);
      setView((v) => clampView({ ...v, s: Math.max(s, v.s) }, pic.w, pic.h, r.width, r.height));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pic]);

  const save = async () => {
    const cv = cvRef.current;
    if (!cv) return;
    try {
      const blob = warm.current ?? (await toPng(cv));
      const file = new File([blob], "bokeh.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          setMsg("Shared.");
          return;
        } catch (err) {
          if ((err as Error).name === "AbortError") return;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "bokeh.png";
      document.body.appendChild(a); // a detached anchor click is ignored in some browsers
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000); // revoking now truncates the download
      setMsg("Saved bokeh.png");
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <div
      className="ws"
      ref={wsRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void openFile(e.dataTransfer.files[0]);
      }}
    >
      {pic && (
        <>
          <div
            className="stage"
            style={{
              width: pic.w,
              height: pic.h,
              transform: `translate(${view.tx}px,${view.ty}px) scale(${view.s})`,
            }}
          >
            <canvas ref={cvRef} width={pic.w} height={pic.h} />
          </div>

          <Frame
            sel={sel}
            view={view}
            onNudge={(dx, dy) => setSel(moveSel({ ...sel, x: sel.x + dx, y: sel.y + dy }, pic.w, pic.h))}
          />

          <div className="top">
            <label className="open">
              <SwapIcon />
              Swap
              <input type="file" accept="image/*" onChange={onPick} />
            </label>
            <span className="size">
              {Math.round(sel.w)} × {Math.round(sel.h)} · {Math.round(sel.x)},{Math.round(sel.y)}
            </span>
            <button
              type="button"
              className="zoom"
              onClick={() => {
                const r = rect();
                toggleZoom(r.width / 2, r.height / 2);
              }}
            >
              {Math.round(view.s * 100)}%
            </button>
          </div>

          <Dock
            mode={mode}
            radius={blurRadius}
            maxRadius={maxRadius}
            onMode={setMode}
            onRadius={setRadius}
            onReset={() =>
              setSel({
                x: Math.round(pic.w * 0.25),
                y: Math.round(pic.h * 0.25),
                w: Math.round(pic.w * 0.5),
                h: Math.round(pic.h * 0.5),
              })
            }
            onSave={() => void save()}
          />
        </>
      )}

      {!pic && (
        <div className="empty">
          <h1>Bokeh</h1>
          <p>Bokeh or black out part of a picture. Nothing leaves this device.</p>
          <label className="pick">
            Choose a picture
            <input type="file" accept="image/*" onChange={onPick} />
          </label>
          <p>or drop one here, or paste from the clipboard</p>
        </div>
      )}

      <div className={msg ? "say on" : "say"} role="status" aria-live="polite">
        {msg}
      </div>
    </div>
  );
}
