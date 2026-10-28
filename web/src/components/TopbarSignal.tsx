/**
 * Decorative header motion: log-scan sweep + faint CI pipeline pulse.
 * Purely visual (aria-hidden); disabled under prefers-reduced-motion via CSS.
 */
export function TopbarSignal() {
  return (
    <div className="topbar-signal" aria-hidden>
      <div className="topbar-signal-scan" />
      <div className="topbar-signal-rail">
        <span className="topbar-signal-step is-pre">PRE</span>
        <span className="topbar-signal-dot" />
        <span className="topbar-signal-step is-test">TEST</span>
        <span className="topbar-signal-dot" />
        <span className="topbar-signal-step is-post">POST</span>
        <span className="topbar-signal-pipe">analyze · lease · junit · diagnose</span>
      </div>
      <div className="topbar-signal-trace">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
