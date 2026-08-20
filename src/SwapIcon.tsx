import { useEffect, useState } from "react";
import { MorphIcon, type IconInput } from "morphicons/react";

/* Icon data lifted from lucide v1.33.0 (ISC, © Lucide Contributors). Three arrays
   inline beats a dependency on the whole set for one button. */
const IMAGE: IconInput = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", ry: "2" }],
  ["circle", { cx: "9", cy: "9", r: "2" }],
  ["path", { d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" }],
];
const FOLDER: IconInput = [
  ["path", { d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" }],
];
const FOLDER_OPEN: IconInput = [
  ["path", { d: "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" }],
];

const CYCLE = [IMAGE, FOLDER, FOLDER_OPEN];
const STEP_MS = 1200;
const LOOPS = 5;

/** Picture → folder → folder open, five times round, then still on the picture. */
export default function SwapIcon() {
  const [i, setI] = useState(0);

  useEffect(() => {
    // A loop that never stops is motion nobody asked for, so honour the OS setting
    // by not starting one — an instant-swap loop would still flicker.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let step = 0;
    const t = setInterval(() => {
      step += 1;
      setI(step % CYCLE.length);
      // A whole number of laps lands back on the picture, which is where it rests.
      if (step >= CYCLE.length * LOOPS) clearInterval(t);
    }, STEP_MS);
    return () => clearInterval(t);
  }, []);

  return <MorphIcon icon={CYCLE[i]} size={13} strokeWidth={1.75} spring="snappy" className="swapicon" />;
}
