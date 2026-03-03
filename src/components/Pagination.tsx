"use client";

import Link from "next/link";

type Props = {
  /** Current page (1-indexed) */
  page: number;
  /** Total number of pages */
  totalPages: number;
  /** Client-side mode: called on page change */
  onPageChange?: (page: number) => void;
  /** Server-side mode: base path for Link hrefs (e.g. "/continent/EU") */
  basePath?: string;
  /** Extra searchParams to preserve when in server-side mode */
  extraParams?: Record<string, string>;
};

export function Pagination({ page, totalPages, onPageChange, basePath, extraParams = {} }: Props) {
  if (totalPages <= 1) return null;

  /* Build visible page numbers: always show first, last, and 2 around current */
  const pages: (number | "…")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  function href(p: number) {
    const params = new URLSearchParams(extraParams);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }

  return (
    <nav className="pagination" aria-label="Pagination">
      {/* ← Previous */}
      {basePath ? (
        <Link
          className={`pagination__btn${page <= 1 ? " pagination__btn--disabled" : ""}`}
          href={page > 1 ? href(page - 1) : "#"}
          aria-disabled={page <= 1}
        >
          ←
        </Link>
      ) : (
        <button
          type="button"
          className="pagination__btn"
          disabled={page <= 1}
          onClick={() => onPageChange?.(page - 1)}
        >
          ←
        </button>
      )}

      {/* Page numbers */}
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="pagination__ellipsis">…</span>
        ) : basePath ? (
          <Link
            key={p}
            className={`pagination__btn${p === page ? " pagination__btn--active" : ""}`}
            href={href(p)}
          >
            {p}
          </Link>
        ) : (
          <button
            key={p}
            type="button"
            className={`pagination__btn${p === page ? " pagination__btn--active" : ""}`}
            onClick={() => onPageChange?.(p)}
          >
            {p}
          </button>
        )
      )}

      {/* → Next */}
      {basePath ? (
        <Link
          className={`pagination__btn${page >= totalPages ? " pagination__btn--disabled" : ""}`}
          href={page < totalPages ? href(page + 1) : "#"}
          aria-disabled={page >= totalPages}
        >
          →
        </Link>
      ) : (
        <button
          type="button"
          className="pagination__btn"
          disabled={page >= totalPages}
          onClick={() => onPageChange?.(page + 1)}
        >
          →
        </button>
      )}
    </nav>
  );
}

/** Helper: paginate an array client-side */
export function paginate<T>(items: T[], page: number, perPage: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    page: safePage,
    totalPages,
    total: items.length,
  };
}
