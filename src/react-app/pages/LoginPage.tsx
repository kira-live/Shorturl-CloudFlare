import { useState } from "react";
import { useNavigate } from "react-router";
import api from "../lib/api";
import axios from "axios";

export function LoginPage() {
    const navigate = useNavigate();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function handleLogin() {
        setLoading(true);
        setError("");

        try {
            const res = await api.post("/api/auth/login", { username, password });
            const body = res.data;

            const token = body?.data?.token;
            if (!token) {
                setError("登录失败：未收到 token");
                return;
            }

            localStorage.setItem("auth_token", token);
            navigate("/", { replace: true });
        } catch (e) {
            let msg = "登录失败";
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
                        <span className="text-4xl">🔐</span>
                        <h1 className="text-3xl font-extrabold tracking-tight">
                            欢迎回来
                        </h1>
                        <p className="text-sm text-base-content/60">
                            请登录你的账号以继续
                        </p>
                    </div>

                    <div className="divider my-0" />

                    <label className="form-control w-full">
                        <span className="label-text font-medium mb-1">账号</span>
                        <input
                            className="input input-bordered input-lg w-full focus:input-primary transition-all"
                            placeholder="请输入账号"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                        />
                    </label>

                    <label className="form-control w-full">
                        <span className="label-text font-medium mb-1">密码</span>
                        <input
                            type="password"
                            className="input input-bordered input-lg w-full focus:input-primary transition-all"
                            placeholder="请输入密码"
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
                                登录中...
                            </>
                        ) : (
                            "登录"
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}