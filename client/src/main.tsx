import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { queryClient } from "./lib/api";
import { startBootCache } from "./lib/bootCache";
import { registerServiceWorker } from "./lib/offline";

// Last visit's account, places and gear, so the first frame is already the right one.
startBootCache(queryClient);
createRoot(document.getElementById("root")!).render(<App />);
registerServiceWorker();
