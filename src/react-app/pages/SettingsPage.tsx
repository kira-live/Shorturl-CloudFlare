
import { useState, useEffect } from "react";
import { userApi, type User } from "../lib/api";
import axios from "axios";

export function SettingsPage() {
    const [user, setUser] = useState<User | null>(null);
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);

    useEffect(() => {
        loadUserInfo();
    }, []);

    const loadUserInfo = async () => {
        try {
            setFetching(true);
            const response = await userApi.getCurrentUser();
            if (response.data.code === 0 && response.data.data) {
                setUser(response.data.data);
                setEmail(response.data.data.email || "");
            } else {
                setError("Failed to fetch user information");
            }
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.message || "Failed to fetch user information");
            } else {
                setError("Failed to fetch user information");
            }
        } finally {
            setFetching(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage("");
        setError("");

        try {
            setLoading(true);
            const response = await userApi.updateProfile({
                email: email || undefined,
            });

            if (response.data.code === 0) {
                setMessage("Profile updated successfully");
                if (response.data.data) {
                    setUser(response.data.data);
                }
            } else {
                setError(response.data.message || "Update failed");
            }
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.message || "Failed to update profile, please try again later");
            } else {
                setError("Failed to update profile, please try again later");
            }
        } finally {
            setLoading(false);
        }
    };

    if (fetching) {
        return (
            <div className="container mx-auto p-6">
                <div className="flex justify-center items-center">
                    <span className="loading loading-spinner loading-lg"></span>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6">
            <h1 className="text-2xl font-bold mb-6">Settings</h1>
            
            <div className="max-w-md">
                {user && (
                    <div className="mb-6 p-4 bg-base-200 rounded-lg">
                        <p className="text-sm opacity-70">Username</p>
                        <p className="font-semibold">{user.username || "Not set"}</p>
                        <p className="text-sm opacity-70 mt-2">Role</p>
                        <p className="font-semibold">{user.role}</p>
                    </div>
                )}

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
                            <span className="label-text">Email</span>
                        </label>
                        <input
                            type="email"
                            className="input input-bordered w-full"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={loading}
                        />
                    </div>

                    <button 
                        type="submit" 
                        className="btn btn-primary w-full"
                        disabled={loading}
                    >
                        {loading ? "Saving..." : "Save Settings"}
                    </button>
                </form>
            </div>
        </div>
    );
}