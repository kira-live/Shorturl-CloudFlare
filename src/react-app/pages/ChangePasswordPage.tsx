
import { useState } from "react";
import { userApi } from "../lib/api";
import axios from "axios";
import { useNavigate } from "react-router";

export function ChangePasswordPage() {
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage("");
        setError("");

        if (newPassword !== confirmPassword) {
            setError("新密码与确认密码不一致");
            return;
        }

        if (newPassword.length < 6) {
            setError("新密码长度至少为 6 位");
            return;
        }

        try {
            setLoading(true);
            const response = await userApi.changePassword({
                oldPassword,
                newPassword,
            });

            if (response.data.code === 0) {
                setMessage("密码修改成功,即将跳转到登录页...");
                setOldPassword("");
                setNewPassword("");
                setConfirmPassword("");
                
                // 延迟 1.5 秒后登出并跳转
                setTimeout(() => {
                    localStorage.removeItem("auth_token");
                    navigate("/login", { replace: true });
                }, 1500);
            } else {
                setError(response.data.message || "修改失败");
            }
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.message || "修改密码失败,请稍后重试");
            } else {
                setError("修改密码失败,请稍后重试");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container mx-auto p-6">
            <h1 className="text-2xl font-bold mb-6">修改密码</h1>
            
            <div className="max-w-md">
                <form onSubmit={handleSubmit} className="space-y-4">
                    {message && (
                        <div className="alert alert-success">
                            <span>{message}</span>
                        </div>
                    )}
                    
                    {error && (
                        <div className="alert alert-error">
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">旧密码</span>
                        </label>
                        <input
                            type="password"
                            className="input input-bordered w-full"
                            value={oldPassword}
                            onChange={(e) => setOldPassword(e.target.value)}
                            required
                            disabled={loading}
                        />
                    </div>

                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">新密码</span>
                        </label>
                        <input
                            type="password"
                            className="input input-bordered w-full"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                            disabled={loading}
                        />
                    </div>

                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">确认新密码</span>
                        </label>
                        <input
                            type="password"
                            className="input input-bordered w-full"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            disabled={loading}
                        />
                    </div>

                    <button 
                        type="submit" 
                        className="btn btn-primary w-full"
                        disabled={loading}
                    >
                        {loading ? "修改中..." : "修改密码"}
                    </button>
                </form>
            </div>
        </div>
    );
}