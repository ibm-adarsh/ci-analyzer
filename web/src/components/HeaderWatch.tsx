import { useEffect, useState } from 'react';

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatParts(now: Date) {
  const time = now.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const date = now.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const tz =
    new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
      .formatToParts(now)
      .find((p) => p.type === 'timeZoneName')?.value || '';
  return {
    greeting: greetingForHour(now.getHours()),
    time,
    date,
    tz,
  };
}

/** Compact live clock for the topbar — greeting, local time, date. */
export function HeaderWatch() {
  const [parts, setParts] = useState(() => formatParts(new Date()));

  useEffect(() => {
    const id = window.setInterval(() => setParts(formatParts(new Date())), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="header-watch" aria-live="off" title={`${parts.date} · ${parts.tz}`}>
      <span className="header-watch-greeting">{parts.greeting}</span>
      <span className="header-watch-time">
        <span className="header-watch-clock mono">{parts.time}</span>
        {parts.tz ? <span className="header-watch-tz">{parts.tz}</span> : null}
      </span>
      <span className="header-watch-date mono">{parts.date}</span>
    </div>
  );
}
