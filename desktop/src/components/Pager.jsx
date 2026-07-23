import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

import { IconChevron } from './Icons.jsx';

/**
 * Paging, not scrolling. Lists that can outgrow their card are cut into pages
 * so the window is always the frame -- an app, not a web page.
 *
 * The page size is measured rather than fixed, because the window is resizable:
 * a constant that fits at 780px tall would clip rows at 620px and waste half
 * the card at 1080px. Row heights are pinned in CSS so the arithmetic matches
 * what is actually painted.
 *
 * Returns a ref for the list container, the visible slice, and the control to
 * render in the card header.
 */
export function usePager(items, { rowHeight, gap = 0, minColWidth = null }) {
  // A callback ref rather than useRef: pages commonly render `null` until their
  // settings arrive, so the container mounts long after the first effect ran.
  // Keeping the node in state re-runs the measurement the moment it appears.
  const [node, setNode] = useState(null);
  const ref = useCallback((el) => setNode(el), []);
  const [perPage, setPerPage] = useState(1);
  const [page, setPage] = useState(0);

  useLayoutEffect(() => {
    if (!node) return undefined;

    const measure = () => {
      const height = node.clientHeight;
      if (!height) return;
      const rows = Math.max(1, Math.floor((height + gap) / (rowHeight + gap)));
      // A grid wall (minColWidth set) holds rows x columns per page, not one
      // item per row. Match the CSS auto-fill so the page fills the wall
      // instead of leaving most of it blank.
      const cols = minColWidth
        ? Math.max(1, Math.floor((node.clientWidth + gap) / (minColWidth + gap)))
        : 1;
      setPerPage(rows * cols);
    };

    // Three triggers, because any one of them can miss on its own:
    //  - now, for the common case where layout is already settled;
    //  - next frame, because on a cold load the card has no height yet;
    //  - on resize, for the window being dragged.
    measure();
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [node, rowHeight, gap, minColWidth]);

  const pages = Math.max(1, Math.ceil(items.length / perPage));

  // Completing or filtering items can leave the current page past the end.
  useEffect(() => {
    if (page > pages - 1) setPage(pages - 1);
  }, [page, pages]);

  const current = Math.min(page, pages - 1);
  return {
    ref,
    slice: items.slice(current * perPage, current * perPage + perPage),
    control: pages > 1 ? <Pager page={current} pages={pages} onChange={setPage} /> : null,
  };
}

function Pager({ page, pages, onChange }) {
  return (
    <span className="pager">
      <button className="icon-btn" disabled={page === 0} onClick={() => onChange(page - 1)} title="Previous">
        <IconChevron width={13} height={13} style={{ transform: 'rotate(180deg)' }} />
      </button>
      <span>
        {page + 1} / {pages}
      </span>
      <button className="icon-btn" disabled={page >= pages - 1} onClick={() => onChange(page + 1)} title="Next">
        <IconChevron width={13} height={13} />
      </button>
    </span>
  );
}

/** Row heights, kept in step with the values pinned in styles.css. */
export const ROW = { task: 74, taskCompact: 68, session: 52, check: 62, person: 52, live: 46, shot: 128 };
