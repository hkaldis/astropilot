import * as React from "react";
import type { ToastActionElement, ToastProps } from "@/components/ui/toast";

const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 5000;

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

let count = 0;
const genId = () => (count = (count + 1) % Number.MAX_SAFE_INTEGER).toString();

type State = { toasts: ToasterToast[] };
type Action =
  | { type: "ADD"; toast: ToasterToast }
  | { type: "UPDATE"; toast: Partial<ToasterToast> }
  | { type: "DISMISS"; toastId?: string }
  | { type: "REMOVE"; toastId?: string };

const timeouts = new Map<string, ReturnType<typeof setTimeout>>();
const queueRemove = (id: string) => {
  if (timeouts.has(id)) return;
  timeouts.set(
    id,
    setTimeout(() => {
      timeouts.delete(id);
      dispatch({ type: "REMOVE", toastId: id });
    }, TOAST_REMOVE_DELAY),
  );
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD":
      return { toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) };
    case "UPDATE":
      return { toasts: state.toasts.map((t) => (t.id === action.toast.id ? { ...t, ...action.toast } : t)) };
    case "DISMISS": {
      const { toastId } = action;
      if (toastId) queueRemove(toastId);
      else state.toasts.forEach((t) => queueRemove(t.id));
      return { toasts: state.toasts.map((t) => (toastId === undefined || t.id === toastId ? { ...t, open: false } : t)) };
    }
    case "REMOVE":
      return { toasts: action.toastId === undefined ? [] : state.toasts.filter((t) => t.id !== action.toastId) };
  }
}

const listeners: Array<(s: State) => void> = [];
let memory: State = { toasts: [] };
function dispatch(action: Action) {
  memory = reducer(memory, action);
  listeners.forEach((l) => l(memory));
}

type Toast = Omit<ToasterToast, "id">;

function toast(props: Toast) {
  const id = genId();
  const dismiss = () => dispatch({ type: "DISMISS", toastId: id });
  dispatch({
    type: "ADD",
    toast: { ...props, id, open: true, onOpenChange: (open) => !open && dismiss() },
  });
  return { id, dismiss, update: (p: ToasterToast) => dispatch({ type: "UPDATE", toast: { ...p, id } }) };
}

function useToast() {
  const [state, setState] = React.useState<State>(memory);
  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const i = listeners.indexOf(setState);
      if (i > -1) listeners.splice(i, 1);
    };
  }, []);
  return { ...state, toast, dismiss: (toastId?: string) => dispatch({ type: "DISMISS", toastId }) };
}

export { useToast, toast };
