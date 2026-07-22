import { useEffect, useLayoutEffect, useRef, useState } from 'react';

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
export function usePager(items, { rowHeight, gap = 0 }) {
  const ref = useRef(null);
  const [perPage, setPerPage] = useState(1);
  const [page, setPage] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const measure = () => {
      const height = el.clientHeight;
      if (!height) return;
      setPerPage(Math.max(1, Math.floor((height + gap) / (rowHeight + gap))));
    };

    // Three triggers, because any one of them can miss on its own:
    //  - now, for the common case where layout is already settled;
    //  - next frame, because on a cold load the card has no height yet;
    //  - on resize, for the window being dragged.
    measure();
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
    // items.length matters: the container can only be measured meaningfully
    // once the data it holds has arrived.
  }, [rowHeight, gap, items.length]);

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
export const ROW = { task: 74, taskCompact: 68, session: 52 };
