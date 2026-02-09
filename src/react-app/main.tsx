import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";
import "./index.css";
import { LoginPage } from "./pages/LoginPage";
import { AdminLayout } from "./components/AdminLayout";
import { HomePage } from "./pages/HomePage";
import { DomainsPage } from "./pages/DomainsPage";
import { UsersPage } from "./pages/UsersPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { TemplateResourcesPage } from "./pages/TemplateResourcesPage";
import {TemplatesPage} from "./pages/TemplatesPage.tsx";
import {ShortLinksPage} from "./pages/ShortLinksPage.tsx";

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
						<Route path="/domains" element={<DomainsPage />} />
						<Route path="/users" element={<UsersPage />} />
						<Route path="/user-settings" element={<SettingsPage />} />
						<Route path="/change-password" element={<ChangePasswordPage />} />
						<Route path="/template-resources" element={<TemplateResourcesPage />} />
						<Route path="/templates" element={<TemplatesPage />} />
						<Route path="/links" element={<ShortLinksPage />} />

						{/* 后续页面在此添加 */}
						{/* <Route path="/links" element={<LinksPage />} /> */}
						{/* <Route path="/templates" element={<TemplatesPage />} /> */}
					</Route>
				</Route>
				<Route path="*" element={<Navigate to="/" replace />} />
			</Routes>
		</BrowserRouter>
	</StrictMode>,
);