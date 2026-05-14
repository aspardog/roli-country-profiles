/**
 * useRoliData — loads the parsed WJP ROLI data once and caches it.
 *
 * The data file is fetched from /data/roli.json (served from /public).
 * The payload includes the year, so the dashboard automatically reflects
 * whatever release the parser most recently produced.
 */
import { useEffect, useState } from 'react';

const DATA_URL = `${import.meta.env.BASE_URL}data/roli.json`;

export function useRoliData() {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(DATA_URL, { credentials: 'omit', cache: 'force-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setState({ status: 'ready', data: json, error: null });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', data: null, error: err });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
