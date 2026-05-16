"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

export type ChatPageContext = {
  pathname: string;
  jobId?: string | null;
  summary?: string | null;
  extras?: Record<string, string | number | null | undefined>;
};

type ChatCtxValue = {
  /** Current snapshot the drawer will send with the next message. */
  context: ChatPageContext;
  /** Pages call this to publish their own contextual hints. The
   *  `pathname` is always overridden by the live path. */
  setPageContext: (patch: Omit<ChatPageContext, "pathname">) => void;
  /** Whether the chat drawer is currently visible. */
  open: boolean;
  setOpen: (v: boolean) => void;
};

const ChatCtx = createContext<ChatCtxValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [pageBits, setPageBits] = useState<Omit<ChatPageContext, "pathname">>({});
  const [open, setOpen] = useState(false);

  const setPageContext = useCallback(
    (patch: Omit<ChatPageContext, "pathname">) => {
      setPageBits((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  // Reset page bits on navigation — each page sets its own.
  useEffect(() => {
    setPageBits({});
  }, [pathname]);

  // Cmd+J / Ctrl+J toggles the drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const context = useMemo<ChatPageContext>(
    () => ({ pathname, ...pageBits }),
    [pathname, pageBits],
  );

  const value = useMemo(
    () => ({ context, setPageContext, open, setOpen }),
    [context, setPageContext, open],
  );

  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>;
}

export function useChat(): ChatCtxValue {
  const v = useContext(ChatCtx);
  if (!v) throw new Error("useChat must be used inside <ChatProvider>");
  return v;
}

/** Pages call this to register a contextual snapshot. The hook keeps the
 *  context fresh whenever its inputs change. Wrap the call's data in a
 *  `useMemo` if you're constructing it inline. */
export function usePageContext(patch: Omit<ChatPageContext, "pathname">) {
  const { setPageContext } = useChat();
  // Stringify to detect deep changes cheaply.
  const key = JSON.stringify(patch);
  useEffect(() => {
    setPageContext(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
