import type { Mode } from "./render";

type Props = {
  mode: Mode;
  radius: number;
  maxRadius: number;
  onMode: (m: Mode) => void;
  onRadius: (r: number) => void;
  onReset: () => void;
  onSave: () => void;
};

export default function Dock({ mode, radius, maxRadius, onMode, onRadius, onReset, onSave }: Props) {
  return (
    <div className="dock">
      <div className="panel">
        <div className="row">
          <div className="modes">
            {(["blur", "redact"] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => onMode(m)}>
                {m === "blur" ? "Blur" : "Redact"}
              </button>
            ))}
          </div>
          <button type="button" className="ghost" onClick={onReset}>
            Reset region
          </button>
        </div>

        {mode === "blur" && (
          <>
            <input
              type="range"
              className="radius"
              min={0}
              max={maxRadius}
              step={1}
              value={radius}
              aria-label="Blur radius in image pixels"
              onChange={(e) => onRadius(Number(e.target.value))}
            />
            <div className="row">
              <span className="num">Radius {radius} px</span>
              <button type="button" className="primary" onClick={onSave}>
                Save
              </button>
            </div>
          </>
        )}

        {mode === "redact" && (
          <div className="row">
            <span className="num">Region filled with black</span>
            <button type="button" className="primary" onClick={onSave}>
              Save
            </button>
          </div>
        )}

        <p className="note">
          {mode === "redact" ? (
            <>
              <b>Fill is permanent.</b> The region is replaced with black — nothing of it survives in the
              saved file.
            </>
          ) : (
            <>
              <b>Blur may be recoverable.</b> It softens the surround and keeps the region sharp. For
              anything secret, use Redact.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
