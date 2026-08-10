import { useEffect, useState } from "react";
import { api } from "../api";
import type { BookmarkRecord } from "./types";

export function bookmarkId(bookmark: Pick<BookmarkRecord, "kind" | "key">): string {
  return `${bookmark.kind}:${bookmark.key}`;
}

export function useBookmarks() {
  const [items, setItems] = useState<BookmarkRecord[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    api.bookmarks().then((payload) => setItems(payload.items)).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load bookmarks");
    });
  }, []);
  const isBookmarked = (kind: BookmarkRecord["kind"], key: string) =>
    items.some((item) => item.kind === kind && item.key === key);
  const toggle = async (bookmark: BookmarkRecord) => {
    const id = bookmarkId(bookmark);
    setBusy(id); setError("");
    try {
      const result = await api.toggleBookmark(bookmark);
      setItems(result.items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update bookmark");
    } finally {
      setBusy("");
    }
  };
  return { items, busy, error, isBookmarked, toggle };
}

export function BookmarkButton({ active, busy, label, onClick }: {
  active: boolean;
  busy?: boolean;
  label: string;
  onClick: () => void;
}) {
  return <button
    type="button"
    className={`dashboard-bookmark-button ${active ? "active" : ""}`}
    aria-pressed={active}
    aria-label={`${active ? "Remove bookmark from" : "Bookmark"} ${label}`}
    title={`${active ? "Remove bookmark" : "Bookmark"}: ${label}`}
    disabled={busy}
    onClick={onClick}
  ><span aria-hidden="true">{active ? "★" : "☆"}</span></button>;
}
