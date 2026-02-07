import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";
import "./index.css";
import { LoginPage } from "./pages/LoginPage";
import { AdminLayout } from "./components/AdminLayout";
import { HomePage } from "./pages/HomePage";

const BASE_URL = import.meta.env.BASE_URL;

function isAuthed() {
	return Boolean(localStorage.getItem("auth_token"));
}

function AuthGuard() {
	return isAuthed() ? <Outlet /> : <Navigate to="/login" replace />;
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<BrowserRouter basename={BASE_URL}>
			<Routes>
				<Route path="/login" element={<LoginPage />} />
				<Route element={<AuthGuard />}>
					<Route element={<AdminLayout />}>
						<Route path="/" element={<HomePage />} />
						{/* 后续页面在此添加 */}
						{/* <Route path="/users" element={<UsersPage />} /> */}
						{/* <Route path="/links" element={<LinksPage />} /> */}
						{/* <Route path="/templates" element={<TemplatesPage />} /> */}
						{/* <Route path="/settings" element={<SettingsPage />} /> */}
					</Route>
				</Route>
				<Route path="*" element={<Navigate to="/" replace />} />
			</Routes>
		</BrowserRouter>
	</StrictMode>,
);