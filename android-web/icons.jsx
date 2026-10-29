import React from 'react';

const paths = {
  track: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />,
  tasks: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="m8 9 1.5 1.5L12 8m2 2h3M8 16h9" /></>,
  activity: <><path d="M4 19V9m5 10V5m6 14v-7m5 7V3" /></>,
  checkins: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18m-13 5 2 2 5-5" /></>,
  team: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2" /></>,
  config: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="2.5" /><circle cx="15" cy="17" r="2.5" /></>,
  settings: <><path d="m9 3-1 3-3 1-1 3 2 2-1 3 2 3 3-1 2 2 3-1 1-3 3-1 1-3-2-2 1-3-2-3-3 1-2-2Z" /><circle cx="12" cy="11" r="3" /></>,
};
export function NavIcon({ name }) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.track}</svg>; }
export function BrandMark() { return <svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect width="48" height="48" rx="16" fill="#322445" /><circle cx="24" cy="24" r="14" stroke="#B99AFF" strokeWidth="3" /><path d="M24 15v10l7 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" /><circle cx="35" cy="12" r="3" fill="#DFD1FF" /></svg>; }
