import { useEffect, useState } from "react";

export function useReservationCountdown(createdAt?: string, pending = false) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!createdAt || !pending) return;
    const refresh = () => setNow(Date.now());
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, [createdAt, pending]);

  const deadline = Date.parse(createdAt ?? "") + 2 * 60 * 60 * 1000;
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  if (!pending || !Number.isFinite(seconds)) return null;
  const time = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, "0")).join(":");
  return { expired: seconds === 0, time };
}
