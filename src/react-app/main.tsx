import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<button className={"btn btn-primary"}>Click Me1</button>
	</StrictMode>,
);
