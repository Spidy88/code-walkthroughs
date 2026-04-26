import { type ReactNode, createContext, useContext, useMemo } from 'react';

/**
 * Lets a CanvasNode's CodeNode body wire its line gutter into the page
 * without passing function callbacks through xyflow's `Node.data`
 * (which RF expects to be plain/serializable).
 *
 * The page that renders the Canvas wraps it in a Provider; the focused
 * code node consumes the context to render a clickable gutter and to
 * highlight the active selection / comment ranges.
 */
export type LineRange = { readonly start: number; readonly end: number };

export type CanvasLineSelection = {
  readonly nodeIdentity: string;
  /** Absolute line number of the first line in bodyPreview. */
  readonly startLine: number;
  /** Currently-selected range, if any (single line counts as start === end). */
  readonly selectedRange: LineRange | null;
  /** Existing line-range comments anchored within this body, for highlighting. */
  readonly commentRanges: ReadonlyArray<LineRange>;
  /**
   * Click on a line number in the gutter. Plain click sets a 1-line
   * selection at that line; shift-click extends the existing
   * selection to span between the original anchor and the new line.
   */
  onLineClick(line: number, shiftKey: boolean): void;
};

const CanvasLineSelectionCtx = createContext<CanvasLineSelection | null>(null);

export function CanvasLineSelectionProvider(props: {
  value: CanvasLineSelection | null;
  children: ReactNode;
}) {
  const memoized = useMemo(() => props.value, [props.value]);
  return (
    <CanvasLineSelectionCtx.Provider value={memoized}>
      {props.children}
    </CanvasLineSelectionCtx.Provider>
  );
}

/**
 * Returns the selection context bound to a specific node identity, or
 * null if no provider is mounted or the focused identity doesn't match
 * (so non-focused nodes never accidentally hijack clicks).
 */
export function useCanvasLineSelection(
  nodeIdentity: string | undefined,
): CanvasLineSelection | null {
  const ctx = useContext(CanvasLineSelectionCtx);
  if (!ctx) return null;
  if (!nodeIdentity || ctx.nodeIdentity !== nodeIdentity) return null;
  return ctx;
}
