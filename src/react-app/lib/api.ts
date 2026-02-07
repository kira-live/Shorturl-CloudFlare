import axios from "axios";

const api = axios.create({
    baseURL: "/",
    headers: {
        "Content-Type": "application/json",
    },
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem("auth_token") || "";
    if (token && config.url?.startsWith("/api/")) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error?.response?.status;
        const url = error?.config?.url || "";
        // 登录接口的 401 属于正常业务响应（如密码错误），不应跳转
        if (status === 401 && !url.includes("auth/login")) {
            localStorage.removeItem("auth_token");
            window.location.href = `${import.meta.env.BASE_URL}login`;
        }
        return Promise.reject(error);
    },
);

export default api;