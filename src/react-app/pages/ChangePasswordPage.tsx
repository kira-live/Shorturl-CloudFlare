
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
            setError("new password different with confirm password");
            return;
        }

        if (newPassword.length < 6) {
            setError("password less than 6 characters long");
            return;
        }

        try {
            setLoading(true);
            const response = await userApi.changePassword({
                oldPassword,
                newPassword,
            });

            if (response.data.code === 0) {
                setMessage("success, will redirect to login page");
                setOldPassword("");
                setNewPassword("");
                setConfirmPassword("");
                
                // 延迟 1.5 秒后登出并跳转
                setTimeout(() => {
                    localStorage.removeItem("auth_token");
                    navigate("/login", { replace: true });
                }, 1500);
            } else {
                setError(response.data.message || "Failed to change password");
            }
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.message || "Failed to change password");
            } else {
                setError("Failed to change password");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container mx-auto p-6">
            <h1 className="text-2xl font-bold mb-6">Change password</h1>
            
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
                            <span className="label-text">old password</span>
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
                            <span className="label-text">new password</span>
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
                            <span className="label-text">confirm password</span>
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
                        {loading ? "changing..." : "change password"}
                    </button>
                </form>
            </div>
        </div>
    );
}