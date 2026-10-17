import { createRoot } from "react-dom/client";
import PokerTable from "../app/PokerTable";

// The artifact page has no module URLs, so the engine worker is created from source embedded in the page.
declare const __WORKER_SOURCE__: string;
const NativeWorker = window.Worker;
if (NativeWorker) {
  const url = URL.createObjectURL(new Blob([__WORKER_SOURCE__], { type: "text/javascript" }));
  window.Worker = class extends NativeWorker {
    constructor() { super(url); }
  } as typeof Worker;
}

createRoot(document.getElementById("root")!).render(<PokerTable />);
