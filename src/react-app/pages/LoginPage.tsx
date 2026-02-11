import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import api, { authApi } from "../lib/api";
import axios from "axios";

export function LoginPage() {
    const navigate = useNavigate();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [checking, setChecking] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        authApi.getInitStatus()
            .then((res) => {
                if (!res.data?.data?.initialized) {
                    navigate("/init", { replace: true });
                }
            })
            .catch(() => {
                // Do not block login when the check fails
            })
            .finally(() => setChecking(false));
    }, [navigate]);

    async function handleLogin() {
        setLoading(true);
        setError("");

        try {
            const res = await api.post("/api/auth/login", { username, password });
            const body = res.data;

            const token = body?.data?.token;
            if (!token) {
                setError("Login failed: token not received");
                return;
            }

            localStorage.setItem("auth_token", token);
            navigate("/", { replace: true });
        } catch (e) {
            let msg = "Login failed";
            if (axios.isAxiosError(e)) {
                msg = e.response?.data?.message || msg;
            }
            setError(msg);
        } finally {
            setLoading(false);
        }
    }

    if (checking) {
        return (
            <div className="min-h-screen grid place-items-center">
                <span className="loading loading-spinner loading-lg text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen grid place-items-center p-6 bg-gradient-to-br from-primary/20 via-base-200 to-secondary/20">
            <div className="card w-full max-w-md bg-base-100/80 backdrop-blur-md shadow-2xl border border-base-300">
                <div className="card-body gap-5">
                    <div className="text-center space-y-1">
                        <span className="text-4xl">🔐</span>
                        <h1 className="text-3xl font-extrabold tracking-tight">
                            Welcome back
                        </h1>
                        <p className="text-sm text-base-content/60">
                            Please sign in to continue
                        </p>
                    </div>

                    <div className="divider my-0" />

                    <label className="form-control w-full">
                        <span className="label-text font-medium mb-1">Account</span>
                        <input
                            className="input input-bordered input-lg w-full focus:input-primary transition-all"
                            placeholder="Enter your account"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                        />
                    </label>

                    <label className="form-control w-full">
                        <span className="label-text font-medium mb-1">Password</span>
                        <input
                            type="password"
                            className="input input-bordered input-lg w-full focus:input-primary transition-all"
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                        />
                    </label>

                    {error ? (
                        <div role="alert" className="alert alert-error alert-soft text-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>{error}</span>
                        </div>
                    ) : null}

                    <button
                        className="btn btn-primary btn-lg w-full mt-2 text-base"
                        onClick={handleLogin}
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <span className="loading loading-spinner loading-sm" />
                                Signing in...
                            </>
                        ) : (
                            "Sign in"
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}