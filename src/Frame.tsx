import type { Sel } from "./render";
import type { View } from "./view";

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;

type Props = { sel: Sel; view: View; onNudge: (dx: number, dy: number) => void };

/**
 * The frame lives outside the transformed stage, in screen coordinates, so its
 * outline stays 1.5px and its handles stay tappable at every zoom level.
 */
export default function Frame({ sel, view, onNudge }: Props) {
  return (
    <div
      data-frame
      className="frame"
      tabIndex={0}
      role="group"
      aria-label="Region. Arrow keys move it, shift and arrow moves ten pixels."
      style={{
        left: view.tx + sel.x * view.s,
        top: view.ty + sel.y * view.s,
        width: sel.w * view.s,
        height: sel.h * view.s,
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 10 : 1;
        const move: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        };
        const d = move[e.key];
        if (!d) return;
        e.preventDefault();
        onNudge(d[0], d[1]);
      }}
    >
      {HANDLES.map((h) => (
        <div key={h} data-handle={h} className={`handle handle-${h}`} />
      ))}
    </div>
  );
}
