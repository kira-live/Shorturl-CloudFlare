import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
const WEB_LOCATION = "web";
export default defineConfig({
	define: {
		__WEB_LOCATION__: JSON.stringify(WEB_LOCATION)
	},
	base: "/"+WEB_LOCATION+"/",
	plugins: [tailwindcss(),react(), cloudflare()],

});
