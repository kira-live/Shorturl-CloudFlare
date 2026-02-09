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

// 域名相关接口类型定义
export interface Domain {
    id: number;
    host: string;
    is_active: number;
    is_default: number;
    notes: string | null;
    error_template_id: number | null;
    password_template_id: number | null;
    interstitial_template_id: number | null;
    created_at: number;
    updated_at: number;
}

export interface DomainWithLinkCount extends Domain {
    link_count: number;
}

export interface DomainListResponse {
    results: Domain[];
    pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
}

export interface CreateDomainRequest {
    host: string;
    is_active?: number;
    is_default?: number;
    notes?: string;
    error_template_id?: number;
    password_template_id?: number;
    interstitial_template_id?: number;
}

export interface UpdateDomainRequest {
    host?: string;
    is_active?: number;
    is_default?: number;
    notes?: string;
    error_template_id?: number | null;
    password_template_id?: number | null;
    interstitial_template_id?: number | null;
}

// 域名 API 方法
export const domainApi = {
    // 获取域名列表
    getList: (page: number = 1, pageSize: number = 10) => 
        api.get<{ code: number; message: string; data: DomainListResponse }>(
            `/api/domain/list?page=${page}&pageSize=${pageSize}`
        ),
    
    // 获取域名详情
    getDetail: (id: number) =>
        api.get<{ code: number; message: string; data: DomainWithLinkCount }>(
            `/api/domain/detail/${id}`
        ),
    
    // 创建域名
    create: (data: CreateDomainRequest) =>
        api.post<{ code: number; message: string; data?: Domain }>(
            '/api/domain/create',
            data
        ),
    
    // 更新域名
    update: (id: number, data: UpdateDomainRequest) =>
        api.put<{ code: number; message: string; data?: Domain }>(
            `/api/domain/update/${id}`,
            data
        ),
    
    // 删除域名
    delete: (id: number) =>
        api.delete<{ code: number; message: string }>(
            `/api/domain/delete/${id}`
        ),
};

// 用户相关接口类型定义
export interface User {
    id: number;
    email: string | null;
    username: string | null;
    role: string;
    status: number;
    deleted_at: number | null;
    created_at: number;
    updated_at: number;
}

export interface UserListResponse {
    results: User[];
    pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
}

export interface CreateUserRequest {
    email?: string;
    username?: string;
    password: string;
    role?: string;
    status?: number;
}

export interface UpdateUserRequest {
    email?: string;
    username?: string;
    password?: string;
    role?: string;
    status?: number;
}

// 新增：更新个人信息请求类型
export interface UpdateProfileRequest {
    email?: string;
}

// 新增：修改密码请求类型
export interface ChangePasswordRequest {
    oldPassword: string;
    newPassword: string;
}

// ==================== 模板资源相关类型 ====================

export interface TemplateAssetListItem {
    id: number;
    asset_prefix: string;
    filename: string;
    content_type: string | null;
    size: number | null;
    checksum: string | null;
    storage_type: number; // 0=数据库, 1=R2
    r2_key: string | null;
    is_public: number;
    alt_text: string | null;
    created_at: number;
    updated_at: number | null;
}

export interface TreeNode {
    name: string;
    type: "folder" | "file";
    path: string;
    children?: TreeNode[];
    asset?: TemplateAssetListItem;
}

export interface TreeResponse {
    prefix: string;
    tree: TreeNode[];
    total: number;
}

export interface PrefixInfo {
    asset_prefix: string;
    file_count: number;
    total_size: number | null;
}

// 模板资源 API 方法
export const templateAssetsApi = {
    // 获取所有 prefix 列表
    getPrefixes: () =>
        api.get<{ code: number; message: string; data: { prefixes: PrefixInfo[] } }>(
            '/api/template-assets/prefixes'
        ),

    // 获取树结构
    getTree: (prefix: string) =>
        api.get<{ code: number; message: string; data: TreeResponse }>(
            `/api/template-assets/tree?prefix=${encodeURIComponent(prefix)}`
        ),

    // 下载文件 — 返回 blob
    download: (id: number) =>
        api.get<Blob>(`/api/template-assets/download/${id}`, { responseType: 'blob' as never }),

    // 删除单个资源
    delete: (id: number) =>
        api.delete<{ code: number; message: string }>(`/api/template-assets/delete/${id}`),

    // 删除整个 prefix 下的所有资源
    deleteByPrefix: (prefix: string) =>
        api.delete<{ code: number; message: string }>('/api/template-assets/delete-by-prefix', {
            data: { prefix },
        }),

    // 上传到数据库（< 2MB）
    uploadToDb: (file: File, prefix: string, filename: string, isPublic: number = 0) => {
        const form = new FormData();
        form.append('file', file);
        form.append('prefix', prefix);
        form.append('filename', filename);
        form.append('is_public', String(isPublic));
        return api.post<{ code: number; message: string; data: TemplateAssetListItem }>(
            '/api/template-assets/upload/db',
            form,
            { headers: { 'Content-Type': 'multipart/form-data' } }
        );
    },

    // 上传到 R2（< 50MB 单次上传）
    uploadToR2: (file: File, prefix: string, filename: string, isPublic: number = 0) => {
        const form = new FormData();
        form.append('file', file);
        form.append('prefix', prefix);
        form.append('filename', filename);
        form.append('is_public', String(isPublic));
        return api.post<{ code: number; message: string; data: TemplateAssetListItem }>(
            '/api/template-assets/upload/r2',
            form,
            { headers: { 'Content-Type': 'multipart/form-data' } }
        );
    },

    // 分片上传 — 创建会话
    multipartCreate: (prefix: string, filename: string, contentType?: string) =>
        api.post<{ code: number; message: string; data: { uploadId: string; r2Key: string } }>(
            '/api/template-assets/upload/r2/multipart/create',
            { prefix, filename, content_type: contentType }
        ),

    // 分片上传 — 上传分片
    multipartUploadPart: (r2Key: string, uploadId: string, partNumber: number, data: ArrayBuffer) =>
        api.post<{ code: number; message: string; data: { partNumber: number; etag: string } }>(
            `/api/template-assets/upload/r2/multipart/part?r2Key=${encodeURIComponent(r2Key)}&uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`,
            data,
            { headers: { 'Content-Type': 'application/octet-stream' } }
        ),

    // 分片上传 — 完成
    multipartComplete: (body: {
        prefix: string;
        filename: string;
        r2Key: string;
        uploadId: string;
        parts: { partNumber: number; etag: string }[];
        size: number;
        content_type?: string;
        is_public?: number;
    }) =>
        api.post<{ code: number; message: string; data: TemplateAssetListItem }>(
            '/api/template-assets/upload/r2/multipart/complete',
            body
        ),
};

// 用户 API 方法
export const userApi = {
    // 获取用户列表
    getList: (page: number = 1, pageSize: number = 10) => 
        api.get<{ code: number; message: string; data: UserListResponse }>(
            `/api/user/list?page=${page}&pageSize=${pageSize}`
        ),

    // 获取用户详情
    getDetail: (id: number) =>
        api.get<{ code: number; message: string; data: User }>(
            `/api/user/detail/${id}`
        ),

    // 创建用户
    create: (data: CreateUserRequest) =>
        api.post<{ code: number; message: string; data?: User }>(
            '/api/user/create',
            data
        ),

    // 更新用户
    update: (id: number, data: UpdateUserRequest) =>
        api.put<{ code: number; message: string; data?: User }>(
            `/api/user/update/${id}`,
            data
        ),

    // 删除用户
    delete: (id: number) =>
        api.delete<{ code: number; message: string }>(
            `/api/user/delete/${id}`
        ),

    // 新增：获取当前用户信息
    getCurrentUser: () =>
        api.get<{ code: number; message: string; data: User }>(
            '/api/user/me'
        ),

    // 新增：更新当前用户个人信息
    updateProfile: (data: UpdateProfileRequest) =>
        api.put<{ code: number; message: string; data?: User }>(
            '/api/user/me',
            data
        ),

    // 新增：修改当前用户密码
    changePassword: (data: ChangePasswordRequest) =>
        api.put<{ code: number; message: string }>(
            '/api/user/me/password',
            data
        ),
};
export interface RedirectTemplate {
    id: number;
    name: string;
    content_type: number;       // 0=HTML content, 1=文件
    html_content: string | null;
    main_file: string | null;
    asset_prefix: string | null;
    is_active: number;
    type: number | null;        // 0=普通模板, 1=密码页, 2=错误页, 3=未找到页
    created_by: number | null;
    created_at: number;
    updated_at: number | null;
}

export type RedirectTemplateListItem = Omit<RedirectTemplate, "html_content">;

export interface TemplateListResponse {
    results: RedirectTemplateListItem[];
    pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
}

export interface CreateTemplateRequest {
    name: string;
    content_type?: number;
    html_content?: string;
    main_file?: string;
    asset_prefix?: string;
    is_active?: number;
    type?: number;
}

export interface UpdateTemplateRequest {
    name?: string;
    content_type?: number;
    html_content?: string | null;
    main_file?: string | null;
    asset_prefix?: string | null;
    is_active?: number;
    type?: number | null;
}

// 模板 API 方法
export const templateApi = {
    // 获取模板列表
    getList: (page: number = 1, pageSize: number = 10, params?: { name?: string; type?: string; is_active?: string }) => {
        const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        if (params?.name) query.set("name", params.name);
        if (params?.type !== undefined && params.type !== "") query.set("type", params.type);
        if (params?.is_active !== undefined && params.is_active !== "") query.set("is_active", params.is_active);
        return api.get<{ code: number; message: string; data: TemplateListResponse }>(
            `/api/template/list?${query.toString()}`
        );
    },

    // 获取模板详情
    getDetail: (id: number) =>
        api.get<{ code: number; message: string; data: RedirectTemplate }>(
            `/api/template/detail/${id}`
        ),

    // 创建模板
    create: (data: CreateTemplateRequest) =>
        api.post<{ code: number; message: string; data?: RedirectTemplate }>(
            '/api/template/create',
            data
        ),

    // 更新模板
    update: (id: number, data: UpdateTemplateRequest) =>
        api.put<{ code: number; message: string; data?: RedirectTemplate }>(
            `/api/template/update/${id}`,
            data
        ),

    // 删除模板
    delete: (id: number) =>
        api.delete<{ code: number; message: string }>(
            `/api/template/delete/${id}`
        ),

    // 切换启用/禁用
    toggleActive: (id: number) =>
        api.post<{ code: number; message: string; data?: { is_active: number } }>(
            `/api/template/toggle-active/${id}`
        ),

    // 获取模板选择选项
    getSelectOptions: (type?: number) => {
        const query = type !== undefined ? `?type=${type}` : '';
        return api.get<{ code: number; message: string; data: Array<{id: number; name: string; type: number | null; content_type: number; is_active: number}> }>(
            `/api/template/select-options${query}`
        );
    },
};
export interface TagInfo {
    id: number;
    name: string;
}

export interface ShortLink {
    id: number;
    domain_id: number;
    code: string;
    target_url: string;
    owner_user_id: number;
    redirect_http_code: number;
    use_interstitial: number;
    interstitial_delay: number;
    force_interstitial: number;
    template_id: number | null;
    error_template_id: number | null;
    password_template_id: number | null;
    password: string | null;
    max_visits: number | null;
    expire_at: number | null;
    is_disabled: number;
    deleted_at: number | null;
    remark: string | null;
    created_at: number;
    updated_at: number | null;
    total_clicks: number;
    last_access_at: number | null;
}

export interface ShortLinkWithDomain extends ShortLink {
    domain_host: string;
    tags: TagInfo[];
}

export interface ShortLinkListResponse {
    results: ShortLinkWithDomain[];
    pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
}

export interface CreateShortLinkRequest {
    domain_id: number;
    code?: string;
    target_url: string;
    redirect_http_code?: number;
    use_interstitial?: number;
    interstitial_delay?: number;
    force_interstitial?: number;
    template_id?: number | null;
    error_template_id?: number | null;
    password_template_id?: number | null;
    password?: string | null;
    max_visits?: number | null;
    expire_at?: number | null;
    remark?: string | null;
    tags?: string[];
}

export interface UpdateShortLinkRequest {
    domain_id?: number;
    code?: string;
    target_url?: string;
    redirect_http_code?: number;
    use_interstitial?: number;
    interstitial_delay?: number;
    force_interstitial?: number;
    template_id?: number | null;
    error_template_id?: number | null;
    password_template_id?: number | null;
    password?: string | null;
    max_visits?: number | null;
    expire_at?: number | null;
    is_disabled?: number;
    remark?: string | null;
    tags?: string[];
}

// 短链接 API 方法
export const shortLinkApi = {
    // 获取短链接列表
    getList: (params: {
        page?: number;
        pageSize?: number;
        domain_id?: string;
        keyword?: string;
        tag?: string;
        is_disabled?: string;
        order_by?: string;
        order_dir?: string;
    } = {}) => {
        const query = new URLSearchParams();
        query.set('page', String(params.page || 1));
        query.set('pageSize', String(params.pageSize || 10));
        if (params.domain_id) query.set('domain_id', params.domain_id);
        if (params.keyword) query.set('keyword', params.keyword);
        if (params.tag) query.set('tag', params.tag);
        if (params.is_disabled !== undefined && params.is_disabled !== '') query.set('is_disabled', params.is_disabled);
        if (params.order_by) query.set('order_by', params.order_by);
        if (params.order_dir) query.set('order_dir', params.order_dir);
        return api.get<{ code: number; message: string; data: ShortLinkListResponse }>(
            `/api/shortlink/list?${query.toString()}`
        );
    },

    // 获取短链接详情
    getDetail: (id: number) =>
        api.get<{ code: number; message: string; data: ShortLinkWithDomain }>(
            `/api/shortlink/detail/${id}`
        ),

    // 创建短链接
    create: (data: CreateShortLinkRequest) =>
        api.post<{ code: number; message: string; data?: ShortLinkWithDomain }>(
            '/api/shortlink/create',
            data
        ),

    // 更新短链接
    update: (id: number, data: UpdateShortLinkRequest) =>
        api.put<{ code: number; message: string; data?: ShortLinkWithDomain }>(
            `/api/shortlink/update/${id}`,
            data
        ),

    // 删除短链接
    delete: (id: number) =>
        api.delete<{ code: number; message: string }>(
            `/api/shortlink/delete/${id}`
        ),

    // 切换启用/禁用状态
    toggleStatus: (id: number) =>
        api.put<{ code: number; message: string; data?: { is_disabled: number } }>(
            `/api/shortlink/toggle-status/${id}`
        ),
};
export default api;