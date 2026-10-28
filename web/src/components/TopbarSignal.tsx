/**
 * Calm header ambient: soft breath glow + slow drifting hairline.
 * Purely visual (aria-hidden); disabled under prefers-reduced-motion via CSS.
 */
export function TopbarSignal() {
  return (
    <div className="topbar-signal" aria-hidden>
      <div className="topbar-signal-glow" />
      <div className="topbar-signal-line">
        <span className="topbar-signal-line-fill" />
      </div>
    </div>
  );
}
