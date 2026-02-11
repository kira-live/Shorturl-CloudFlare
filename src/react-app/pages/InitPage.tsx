// src/react-app/pages/InitPage.tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import { authApi } from "../lib/api";
import axios from "axios";

export function InitPage() {
    const navigate = useNavigate();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function handleInit() {
        setError("");

        if (!username.trim()) {
            setError("Please enter a username");
            return;
        }
        if (!password) {
            setError("Please enter a password");
            return;
        }
        if (password !== confirmPassword) {
            setError("The passwords do not match");
            return;
        }

        setLoading(true);
        try {
            await authApi.init({ username: username.trim(), password });
            navigate("/login", { replace: true });
        } catch (e) {
            let msg = "Initialization failed";
            if (axios.isAxiosError(e)) {
                msg = e.response?.data?.message || msg;
            }
            setError(msg);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen grid place-items-center p-6 bg-gradient-to-br from-primary/20 via-base-200 to-secondary/20">
            <div className="card w-full max-w-md bg-base-100/80 backdrop-blur-md shadow-2xl border border-base-300">
                <div className="card-body gap-5">
                    <div className="text-center space-y-1">
                        <span className="text-4xl">🚀</span>
                        <h1 className="text-3xl font-extrabold tracking-tight">
                            System Initialization
                        </h1>
                        <p className="text-sm text-base-content/60">
                            First time use — please create an admin account
                        </p>
                    </div>

                    <div className="divider my-0" />

                    <label className="form-control w-full">
                        <span className="label-text font-medium mb-1">Admin Username</span>
                        <input
                            className="input input-bordered input-lg w-full focus:input-primary transition-all"
                            placeholder="Enter username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleInit()}
                        />
                    </label>

                    <label className="form-control w-full">
                        <span className="label-text font-medium mb-1">Password</span>
                        <input
                            type="password"
                            className="input input-bordered input-lg w-full focus:input-primary transition-all"
                            placeholder="Enter password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleInit()}
                        />
                    </label>

                    <label className="form-control w-full">
                        <span className="label-text font-medium mb-1">Confirm Password</span>
                        <input
                            type="password"
                            className="input input-bordered input-lg w-full focus:input-primary transition-all"
                            placeholder="Re-enter password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleInit()}
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
                        onClick={handleInit}
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <span className="loading loading-spinner loading-sm" />
                                Initializing...
                            </>
                        ) : (
                            "Initialize"
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}