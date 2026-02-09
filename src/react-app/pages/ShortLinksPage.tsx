import { useEffect, useState, useCallback } from "react";
import {
    shortLinkApi,
    domainApi,
    templateApi,
    ShortLinkWithDomain,
    Domain,
    CreateShortLinkRequest,
    UpdateShortLinkRequest,
} from "../lib/api";

type MessageType = "success" | "error" | "info";

interface Message {
    type: MessageType;
    text: string;
}

interface TemplateOption {
    id: number;
    name: string;
    type: number | null;
    content_type: number;
    is_active: number;
}

// ==================== 标签输入组件 ====================
function TagInput({
                      tags,
                      onChange,
                  }: {
    tags: string[];
    onChange: (tags: string[]) => void;
}) {
    const [input, setInput] = useState("");

    const addTag = () => {
        const trimmed = input.trim();
        if (trimmed && !tags.includes(trimmed)) {
            onChange([...tags, trimmed]);
        }
        setInput("");
    };

    const removeTag = (index: number) => {
        onChange(tags.filter((_, i) => i !== index));
    };

    return (
        <div>
            <div className="flex flex-wrap gap-1 mb-2">
                {tags.map((tag, i) => (
                    <span key={i} className="badge badge-primary gap-1">
                        {tag}
                        <button
                            type="button"
                            className="btn btn-ghost btn-xs px-0"
                            onClick={() => removeTag(i)}
                        >
                            ✕
                        </button>
                    </span>
                ))}
            </div>
            <div className="flex gap-2">
                <input
                    type="text"
                    className="input input-bordered input-sm flex-1"
                    placeholder="输入标签后回车"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            addTag();
                        }
                    }}
                />
                <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={addTag}
                >
                    添加
                </button>
            </div>
        </div>
    );
}

// ==================== 主页面 ====================
export function ShortLinksPage() {
    // 列表数据
    const [links, setLinks] = useState<ShortLinkWithDomain[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(10);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(0);

    // 筛选条件
    const [filterDomainId, setFilterDomainId] = useState("");
    const [filterKeyword, setFilterKeyword] = useState("");
    const [filterTag, setFilterTag] = useState("");
    const [filterStatus, setFilterStatus] = useState("");
    const [orderBy, setOrderBy] = useState("created_at");
    const [orderDir, setOrderDir] = useState("desc");

    // 域名 & 模板选项（用于筛选和表单）
    const [domains, setDomains] = useState<Domain[]>([]);
    const [templateOptions, setTemplateOptions] = useState<TemplateOption[]>([]);

    // 消息提示
    const [message, setMessage] = useState<Message | null>(null);

    // 弹窗状态
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState<"create" | "edit">("create");
    const [editingLink, setEditingLink] = useState<ShortLinkWithDomain | null>(null);

    // 删除确认
    const [deletingLink, setDeletingLink] = useState<ShortLinkWithDomain | null>(null);

    // 表单状态
    const [formData, setFormData] = useState<CreateShortLinkRequest>({
        domain_id: 0,
        target_url: "",
        code: "",
        redirect_http_code: 302,
        use_interstitial: 0,
        interstitial_delay: 0,
        force_interstitial: 0,
        template_id: null,
        error_template_id: null,
        password_template_id: null,
        password: null,
        max_visits: null,
        expire_at: null,
        remark: null,
        tags: [],
    });

    // 高级选项展开
    const [showAdvanced, setShowAdvanced] = useState(false);

    const showMessage = (type: MessageType, text: string) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 5000);
    };

    // 获取所有标签（从已有链接中提取，用于筛选下拉）
    const [allTags, setAllTags] = useState<string[]>([]);

    // 加载域名列表（全量）
    const loadDomains = useCallback(async () => {
        try {
            const res = await domainApi.getList(1, 100);
            if (res.data.code === 0) {
                setDomains(res.data.data.results);
            }
        } catch (e) {
            console.error("加载域名失败:", e);
        }
    }, []);

    // 加载模板选项
    const loadTemplateOptions = useCallback(async () => {
        try {
            const res = await templateApi.getSelectOptions();
            if (res.data.code === 0) {
                setTemplateOptions(res.data.data);
            }
        } catch (e) {
            console.error("加载模板选项失败:", e);
        }
    }, []);

    // 加载短链接列表
    const loadLinks = useCallback(async () => {
        try {
            setLoading(true);
            const res = await shortLinkApi.getList({
                page,
                pageSize,
                domain_id: filterDomainId || undefined,
                keyword: filterKeyword || undefined,
                tag: filterTag || undefined,
                is_disabled: filterStatus,
                order_by: orderBy,
                order_dir: orderDir,
            });
            if (res.data.code === 0) {
                setLinks(res.data.data.results);
                setTotal(res.data.data.pagination.total);
                setTotalPages(res.data.data.pagination.totalPages);

                // 收集所有标签用于筛选
                const tagSet = new Set<string>();
                res.data.data.results.forEach((link) =>
                    link.tags.forEach((t) => tagSet.add(t.name))
                );
                setAllTags((prev) => {
                    const merged = new Set([...prev, ...tagSet]);
                    return Array.from(merged).sort();
                });
            }
        } catch (e) {
            console.error("加载短链接列表失败:", e);
            showMessage("error", "加载短链接列表失败");
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, filterDomainId, filterKeyword, filterTag, filterStatus, orderBy, orderDir]);

    useEffect(() => {
        loadDomains();
        loadTemplateOptions();
    }, [loadDomains, loadTemplateOptions]);

    useEffect(() => {
        loadLinks();
    }, [loadLinks]);

    // 获取默认域名
    const getDefaultDomain = (): Domain | undefined =>
        domains.find((d) => d.is_default === 1) || domains[0];

    // 打开创建弹窗
    const handleCreate = () => {
        const defaultDomain = getDefaultDomain();
        setModalMode("create");
        setEditingLink(null);
        setFormData({
            domain_id: defaultDomain?.id || 0,
            target_url: "",
            code: "",
            redirect_http_code: 302,
            use_interstitial: 0,
            interstitial_delay: 0,
            force_interstitial: 0,
            template_id: null,
            error_template_id: null,
            password_template_id: null,
            password: null,
            max_visits: null,
            expire_at: null,
            remark: null,
            tags: [],
        });
        setShowAdvanced(false);
        setShowModal(true);
    };

    // 打开编辑弹窗
    const handleEdit = (link: ShortLinkWithDomain) => {
        setModalMode("edit");
        setEditingLink(link);
        setFormData({
            domain_id: link.domain_id,
            target_url: link.target_url,
            code: link.code,
            redirect_http_code: link.redirect_http_code,
            use_interstitial: link.use_interstitial,
            interstitial_delay: link.interstitial_delay,
            force_interstitial: link.force_interstitial,
            template_id: link.template_id,
            error_template_id: link.error_template_id,
            password_template_id: link.password_template_id,
            password: link.password,
            max_visits: link.max_visits,
            expire_at: link.expire_at,
            remark: link.remark,
            tags: link.tags.map((t) => t.name),
        });
        setShowAdvanced(true);
        setShowModal(true);
    };

    // 提交表单
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.target_url.trim()) {
            showMessage("error", "请输入目标 URL");
            return;
        }
        if (!formData.domain_id) {
            showMessage("error", "请选择域名");
            return;
        }

        try {
            setLoading(true);
            if (modalMode === "create") {
                const res = await shortLinkApi.create(formData);
                if (res.data.code === 0) {
                    showMessage("success", "短链接创建成功");
                    setShowModal(false);
                    loadLinks();
                } else {
                    showMessage("error", res.data.message || "创建失败");
                }
            } else if (editingLink) {
                const updateData: UpdateShortLinkRequest = { ...formData };
                const res = await shortLinkApi.update(editingLink.id, updateData);
                if (res.data.code === 0) {
                    showMessage("success", "短链接更新成功");
                    setShowModal(false);
                    loadLinks();
                } else {
                    showMessage("error", res.data.message || "更新失败");
                }
            }
        } catch (error: unknown) {
            const msg =
                error && typeof error === "object" && "response" in error
                    ? (error.response as { data?: { message?: string } })?.data?.message || "操作失败"
                    : "操作失败";
            showMessage("error", msg);
        } finally {
            setLoading(false);
        }
    };

    // 删除
    const handleDelete = async (link: ShortLinkWithDomain) => {
        try {
            setLoading(true);
            const res = await shortLinkApi.delete(link.id);
            if (res.data.code === 0) {
                showMessage("success", "删除成功");
                setDeletingLink(null);
                loadLinks();
            } else {
                showMessage("error", res.data.message || "删除失败");
            }
        } catch (error: unknown) {
            const msg =
                error && typeof error === "object" && "response" in error
                    ? (error.response as { data?: { message?: string } })?.data?.message || "删除失败"
                    : "删除失败";
            showMessage("error", msg);
        } finally {
            setLoading(false);
        }
    };

    // 切换状态
    const handleToggleStatus = async (link: ShortLinkWithDomain) => {
        try {
            const res = await shortLinkApi.toggleStatus(link.id);
            if (res.data.code === 0) {
                showMessage("success", res.data.message);
                loadLinks();
            } else {
                showMessage("error", res.data.message || "操作失败");
            }
        } catch {
            showMessage("error", "操作失败");
        }
    };

    // 搜索重置到第 1 页
    const handleSearch = () => {
        setPage(1);
        // loadLinks 会被 useEffect 自动触发
    };

    // 重置筛选
    const handleResetFilters = () => {
        setFilterDomainId("");
        setFilterKeyword("");
        setFilterTag("");
        setFilterStatus("");
        setOrderBy("created_at");
        setOrderDir("desc");
        setPage(1);
    };

    const formatTime = (timestamp: number | null) => {
        if (!timestamp) return "-";
        return new Date(timestamp * 1000).toLocaleString("zh-CN");
    };

    // 将 expire_at (Unix 时间戳) 转为 datetime-local 输入值
    const timestampToDatetimeLocal = (ts: number | null): string => {
        if (!ts) return "";
        const d = new Date(ts * 1000);
        const offset = d.getTimezoneOffset();
        const local = new Date(d.getTime() - offset * 60000);
        return local.toISOString().slice(0, 16);
    };

    // 将 datetime-local 值转为 Unix 时间戳
    const datetimeLocalToTimestamp = (val: string): number | null => {
        if (!val) return null;
        return Math.floor(new Date(val).getTime() / 1000);
    };

    const getTemplateName = (templateId: number | null) => {
        if (!templateId) return "-";
        const tmpl = templateOptions.find((t) => t.id === templateId);
        return tmpl ? tmpl.name : `#${templateId}`;
    };

    return (
        <div className="p-6">
            {/* 消息提示 */}
            {message && (
                <div className="toast toast-top toast-center z-50">
                    <div
                        className={`alert ${
                            message.type === "success"
                                ? "alert-success"
                                : message.type === "error"
                                    ? "alert-error"
                                    : "alert-info"
                        } shadow-lg`}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="stroke-current shrink-0 h-6 w-6"
                            fill="none"
                            viewBox="0 0 24 24"
                        >
                            {message.type === "success" ? (
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            ) : message.type === "error" ? (
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            ) : (
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            )}
                        </svg>
                        <span>{message.text}</span>
                    </div>
                </div>
            )}

            {/* 标题 & 新增按钮 */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold">短链接管理</h1>
                    <p className="text-sm text-gray-500 mt-1">共 {total} 条短链接</p>
                </div>
                <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
                    + 新建短链接
                </button>
            </div>

            {/* 筛选栏 */}
            <div className="bg-base-100 rounded-lg shadow p-4 mb-4">
                <div className="flex flex-wrap gap-3 items-end">
                    {/* 关键词搜索 */}
                    <div className="form-control">
                        <label className="label py-1">
                            <span className="label-text text-xs">搜索</span>
                        </label>
                        <input
                            type="text"
                            className="input input-bordered input-sm w-48 ml-2"
                            placeholder="短码/目标URL/备注"
                            value={filterKeyword}
                            onChange={(e) => setFilterKeyword(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                        />
                    </div>

                    {/* 域名筛选 */}
                    <div className="form-control">
                        <label className="label py-1">
                            <span className="label-text text-xs">域名</span>
                        </label>
                        <select
                            className="select select-bordered select-sm w-40 ml-2"
                            value={filterDomainId}
                            onChange={(e) => {
                                setFilterDomainId(e.target.value);
                                setPage(1);
                            }}
                        >
                            <option value="">全部域名</option>
                            {domains.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.host}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* 标签筛选 */}
                    <div className="form-control">
                        <label className="label py-1">
                            <span className="label-text text-xs">标签</span>
                        </label>
                        <select
                            className="select select-bordered select-sm w-36 ml-2"
                            value={filterTag}
                            onChange={(e) => {
                                setFilterTag(e.target.value);
                                setPage(1);
                            }}
                        >
                            <option value="">全部标签</option>
                            {allTags.map((tag) => (
                                <option key={tag} value={tag}>
                                    {tag}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* 状态筛选 */}
                    <div className="form-control">
                        <label className="label py-1">
                            <span className="label-text text-xs">状态</span>
                        </label>
                        <select
                            className="select select-bordered select-sm w-28 ml-2"
                            value={filterStatus}
                            onChange={(e) => {
                                setFilterStatus(e.target.value);
                                setPage(1);
                            }}
                        >
                            <option value="">全部</option>
                            <option value="0">启用</option>
                            <option value="1">禁用</option>
                        </select>
                    </div>

                    {/* 排序 */}
                    <div className="form-control">
                        <label className="label py-1">
                            <span className="label-text text-xs">排序</span>
                        </label>
                        <div className="flex gap-1">
                            <select
                                className="select select-bordered select-sm w-32 ml-2"
                                value={orderBy}
                                onChange={(e) => setOrderBy(e.target.value)}
                            >
                                <option value="created_at">创建时间</option>
                                <option value="updated_at">更新时间</option>
                                <option value="total_clicks">点击量</option>
                                <option value="last_access_at">最后访问</option>
                            </select>
                            <button
                                className="btn btn-sm btn-outline"
                                onClick={() => setOrderDir((d) => (d === "desc" ? "asc" : "desc"))}
                                title={orderDir === "desc" ? "降序" : "升序"}
                            >
                                {orderDir === "desc" ? "↓" : "↑"}
                            </button>
                        </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex gap-2 ml-auto">
                        <button className="btn btn-sm btn-ghost" onClick={handleResetFilters}>
                            重置
                        </button>
                        <button className="btn btn-sm btn-primary" onClick={handleSearch}>
                            搜索
                        </button>
                    </div>
                </div>
            </div>

            {/* 列表 */}
            <div className="bg-base-100 rounded-lg shadow">
                {loading && links.length === 0 ? (
                    <div className="text-center py-12">
                        <span className="loading loading-spinner loading-lg"></span>
                    </div>
                ) : links.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">暂无短链接</div>
                ) : (
                    <div className="divide-y divide-base-200">
                        {links.map((link) => (
                            <div key={link.id} className="px-5 py-5 hover:bg-base-200/50 transition-colors">
                                {/* 第一行：短链接 + 状态 + 操作 */}
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-gray-400 font-mono">#{link.id}</span>
                                        <a
                                            href={`https://${link.domain_host}/${link.code}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="link link-primary font-mono font-semibold"
                                        >
                                            {link.domain_host}/{link.code}
                                        </a>
                                        <span className={`badge badge-sm ${link.is_disabled === 0 ? 'badge-success' : 'badge-error'}`}>
                                            {link.is_disabled === 0 ? '启用' : '禁用'}
                                        </span>
                                        {link.password && (
                                            <span className="badge badge-sm badge-warning">🔒 密码保护</span>
                                        )}
                                        {link.expire_at && link.expire_at < Date.now() / 1000 && (
                                            <span className="badge badge-sm badge-error">已过期</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <label className="cursor-pointer" title={link.is_disabled === 0 ? '点击禁用' : '点击启用'}>
                                            <input
                                                type="checkbox"
                                                className="toggle toggle-success toggle-sm"
                                                checked={link.is_disabled === 0}
                                                onChange={() => handleToggleStatus(link)}
                                            />
                                        </label>
                                        <button
                                            className="btn btn-sm btn-ghost"
                                            onClick={() => handleEdit(link)}
                                            disabled={loading}
                                        >
                                            编辑
                                        </button>
                                        <button
                                            className="btn btn-sm btn-ghost text-error hover:bg-error hover:text-white"
                                            onClick={() => setDeletingLink(link)}
                                            disabled={loading}
                                        >
                                            删除
                                        </button>
                                    </div>
                                </div>

                                {/* 第二行：目标 URL */}
                                <div className="text-sm text-gray-600 mb-3 truncate" title={link.target_url}>
                                    <span className="text-gray-400 mr-1">→</span>
                                    {link.target_url}
                                </div>

                                {/* 第三行：核心属性网格 */}
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-8 gap-y-2 text-sm mb-3">
                                    <div>
                                        <span className="text-gray-400">跳转码：</span>
                                        <span className="font-medium">{link.redirect_http_code}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">点击量：</span>
                                        <span className="font-semibold text-primary">{link.total_clicks}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">中间页：</span>
                                        <span>{link.use_interstitial === 1 ? `✅ ${link.interstitial_delay}s` : '关闭'}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">强制中间页：</span>
                                        <span>{link.force_interstitial === 1 ? '是' : '否'}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">最大访问：</span>
                                        <span>{link.max_visits ?? '无限制'}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">过期时间：</span>
                                        <span>{link.expire_at ? formatTime(link.expire_at) : '永不过期'}</span>
                                    </div>
                                </div>

                                {/* 第四行：模板信息 */}
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2 text-sm mb-3">
                                    <div>
                                        <span className="text-gray-400">跳转模板：</span>
                                        <span>{getTemplateName(link.template_id)}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">错误模板：</span>
                                        <span>{getTemplateName(link.error_template_id)}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">密码模板：</span>
                                        <span>{getTemplateName(link.password_template_id)}</span>
                                    </div>
                                </div>

                                {/* 第五行：标签 + 备注 + 时间 */}
                                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-400 mt-1">
                                    {/* 标签 */}
                                    {link.tags.length > 0 && (
                                        <div className="flex items-center gap-1">
                                            <span>标签：</span>
                                            {link.tags.map((tag) => (
                                                <span
                                                    key={tag.id}
                                                    className="badge badge-outline badge-sm cursor-pointer"
                                                    onClick={() => {
                                                        setFilterTag(tag.name);
                                                        setPage(1);
                                                    }}
                                                >
                                                    {tag.name}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {link.remark && (
                                        <span title={link.remark}>备注：{link.remark}</span>
                                    )}
                                    <span>创建：{formatTime(link.created_at)}</span>
                                    {link.updated_at && <span>更新：{formatTime(link.updated_at)}</span>}
                                    {link.last_access_at && (
                                        <span>最后访问：{formatTime(link.last_access_at)}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 分页 */}
            {totalPages > 0 && (
                <div className="flex flex-col sm:flex-row justify-between items-center mt-6 gap-3">
                    <div className="text-sm text-gray-500">
                        共 {total} 条记录，第 {page}/{totalPages} 页，每页 {pageSize} 条
                    </div>
                    {totalPages > 1 && (
                        <div className="join">
                            <button
                                className="join-item btn btn-sm"
                                onClick={() => setPage(1)}
                                disabled={page === 1 || loading}
                            >
                                ««
                            </button>
                            <button
                                className="join-item btn btn-sm"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1 || loading}
                            >
                                «
                            </button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter((p) => {
                                    if (totalPages <= 7) return true;
                                    if (p === 1 || p === totalPages) return true;
                                    if (Math.abs(p - page) <= 2) return true;
                                    return false;
                                })
                                .reduce<(number | string)[]>((acc, p, i, arr) => {
                                    if (i > 0 && typeof arr[i - 1] === "number" && p - (arr[i - 1] as number) > 1) {
                                        acc.push("...");
                                    }
                                    acc.push(p);
                                    return acc;
                                }, [])
                                .map((item, i) =>
                                    typeof item === "string" ? (
                                        <button key={`ellipsis-${i}`} className="join-item btn btn-sm btn-disabled">
                                            …
                                        </button>
                                    ) : (
                                        <button
                                            key={item}
                                            className={`join-item btn btn-sm ${page === item ? "btn-active" : ""}`}
                                            onClick={() => setPage(item)}
                                            disabled={loading}
                                        >
                                            {item}
                                        </button>
                                    )
                                )}
                            <button
                                className="join-item btn btn-sm"
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages || loading}
                            >
                                »
                            </button>
                            <button
                                className="join-item btn btn-sm"
                                onClick={() => setPage(totalPages)}
                                disabled={page === totalPages || loading}
                            >
                                »»
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* 删除确认弹窗 */}
            {deletingLink && (
                <div className="modal modal-open">
                    <div className="modal-box">
                        <h3 className="font-bold text-lg mb-4">确认删除</h3>
                        <p className="py-4">
                            确定要删除短链接{" "}
                            <span className="font-mono font-bold">
                                {deletingLink.domain_host}/{deletingLink.code}
                            </span>{" "}
                            吗？此操作不可撤销。
                        </p>
                        <div className="modal-action">
                            <button
                                className="btn btn-ghost"
                                onClick={() => setDeletingLink(null)}
                                disabled={loading}
                            >
                                取消
                            </button>
                            <button
                                className="btn btn-error"
                                onClick={() => handleDelete(deletingLink)}
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <span className="loading loading-spinner loading-sm"></span>
                                        删除中...
                                    </>
                                ) : (
                                    "确认删除"
                                )}
                            </button>
                        </div>
                    </div>
                    <div
                        className="modal-backdrop"
                        onClick={() => !loading && setDeletingLink(null)}
                    ></div>
                </div>
            )}

            {/* 创建/编辑弹窗 */}
            {showModal && (
                <div className="modal modal-open">
                    <div className="modal-box max-w-2xl max-h-[90vh]">
                        <h3 className="font-bold text-lg mb-6">
                            {modalMode === "create" ? "新建短链接" : "编辑短链接"}
                        </h3>

                        <form onSubmit={handleSubmit} className="space-y-5 overflow-y-auto pr-2 pl-2">
                            {/* 目标 URL */}
                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text font-medium">
                                        目标 URL <span className="text-error">*</span>
                                    </span>
                                </label>
                                <input
                                    type="url"
                                    className="input input-bordered w-full focus:input-primary"
                                    placeholder="https://example.com/your-long-url"
                                    value={formData.target_url}
                                    onChange={(e) =>
                                        setFormData({ ...formData, target_url: e.target.value })
                                    }
                                    required
                                    autoFocus
                                />
                            </div>

                            {/* 域名 & 短码 */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-control">
                                    <label className="label">
                                        <span className="label-text font-medium">
                                            域名 <span className="text-error">*</span>
                                        </span>
                                    </label>
                                    <select
                                        className="select select-bordered w-full focus:select-primary"
                                        value={formData.domain_id}
                                        onChange={(e) =>
                                            setFormData({
                                                ...formData,
                                                domain_id: Number(e.target.value),
                                            })
                                        }
                                        required
                                    >
                                        <option value={0} disabled>
                                            选择域名
                                        </option>
                                        {domains.map((d) => (
                                            <option key={d.id} value={d.id}>
                                                {d.host}
                                                {d.is_default === 1 ? " (默认)" : ""}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-control">
                                    <label className="label">
                                        <span className="label-text font-medium">自定义短码</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="input input-bordered w-full focus:input-primary"
                                        placeholder="留空则自动生成"
                                        value={formData.code || ""}
                                        onChange={(e) =>
                                            setFormData({ ...formData, code: e.target.value })
                                        }
                                    />
                                    <label className="label">
                                        <span className="label-text-alt text-gray-500">
                                            仅支持字母、数字、连字符、下划线
                                        </span>
                                    </label>
                                </div>
                            </div>

                            {/* 跳转状态码 */}
                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text font-medium">跳转状态码</span>
                                </label>
                                <select
                                    className="select select-bordered w-full focus:select-primary"
                                    value={formData.redirect_http_code}
                                    onChange={(e) =>
                                        setFormData({
                                            ...formData,
                                            redirect_http_code: Number(e.target.value),
                                        })
                                    }
                                >
                                    <option value={302}>302 - 临时重定向（推荐）</option>
                                    <option value={301}>301 - 永久重定向</option>
                                    <option value={307}>307 - 临时重定向（保持方法）</option>
                                    <option value={308}>308 - 永久重定向（保持方法）</option>
                                </select>
                            </div>

                            {/* 标签 */}
                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text font-medium">标签</span>
                                </label>
                                <TagInput
                                    tags={formData.tags || []}
                                    onChange={(tags) => setFormData({ ...formData, tags })}
                                />
                            </div>

                            {/* 备注 */}
                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text font-medium">备注</span>
                                </label>
                                <textarea
                                    className="textarea textarea-bordered w-full focus:textarea-primary resize-none"
                                    placeholder="可选备注信息"
                                    value={formData.remark || ""}
                                    onChange={(e) =>
                                        setFormData({
                                            ...formData,
                                            remark: e.target.value || null,
                                        })
                                    }
                                    rows={2}
                                />
                            </div>

                            {/* 高级选项折叠 */}
                            <div className="divider my-2">
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => setShowAdvanced(!showAdvanced)}
                                >
                                    {showAdvanced ? "▲ 收起高级选项" : "▼ 展开高级选项"}
                                </button>
                            </div>

                            {showAdvanced && (
                                <div className="space-y-5">
                                    {/* 模板选择 */}
                                    <h4 className="font-medium text-base-content">模板设置</h4>
                                    <p className="text-sm text-gray-500">
                                        为该链接配置专用模板，留空则使用域名或系统默认模板
                                    </p>

                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="form-control">
                                            <label className="label">
                                                <span className="label-text font-medium">
                                                    跳转中间页模板
                                                </span>
                                            </label>
                                            <select
                                                className="select select-bordered w-full focus:select-primary"
                                                value={formData.template_id ?? ""}
                                                onChange={(e) =>
                                                    setFormData({
                                                        ...formData,
                                                        template_id: e.target.value
                                                            ? Number(e.target.value)
                                                            : null,
                                                    })
                                                }
                                            >
                                                <option value="">使用默认</option>
                                                {templateOptions
                                                    .filter(
                                                        (t) =>
                                                            t.type === null ||
                                                            t.type === 0
                                                    )
                                                    .map((t) => (
                                                        <option key={t.id} value={t.id}>
                                                            {t.name}
                                                        </option>
                                                    ))}
                                            </select>
                                        </div>

                                        <div className="form-control">
                                            <label className="label">
                                                <span className="label-text font-medium">
                                                    错误页模板
                                                </span>
                                            </label>
                                            <select
                                                className="select select-bordered w-full focus:select-primary"
                                                value={formData.error_template_id ?? ""}
                                                onChange={(e) =>
                                                    setFormData({
                                                        ...formData,
                                                        error_template_id: e.target.value
                                                            ? Number(e.target.value)
                                                            : null,
                                                    })
                                                }
                                            >
                                                <option value="">使用默认</option>
                                                {templateOptions
                                                    .filter(
                                                        (t) =>
                                                            t.type === 2 ||
                                                            t.type === null ||
                                                            t.type === 0
                                                    )
                                                    .map((t) => (
                                                        <option key={t.id} value={t.id}>
                                                            {t.name}
                                                            {t.type === 2 ? " (错误页)" : ""}
                                                        </option>
                                                    ))}
                                            </select>
                                        </div>

                                        <div className="form-control">
                                            <label className="label">
                                                <span className="label-text font-medium">
                                                    密码验证页模板
                                                </span>
                                            </label>
                                            <select
                                                className="select select-bordered w-full focus:select-primary"
                                                value={formData.password_template_id ?? ""}
                                                onChange={(e) =>
                                                    setFormData({
                                                        ...formData,
                                                        password_template_id: e.target.value
                                                            ? Number(e.target.value)
                                                            : null,
                                                    })
                                                }
                                            >
                                                <option value="">使用默认</option>
                                                {templateOptions
                                                    .filter(
                                                        (t) =>
                                                            t.type === 1 ||
                                                            t.type === null ||
                                                            t.type === 0
                                                    )
                                                    .map((t) => (
                                                        <option key={t.id} value={t.id}>
                                                            {t.name}
                                                            {t.type === 1 ? " (密码页)" : ""}
                                                        </option>
                                                    ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="divider my-2"></div>

                                    {/* 中间页设置 */}
                                    <h4 className="font-medium text-base-content">中间页设置</h4>

                                    <div className="form-control">
                                        <label className="label cursor-pointer justify-start gap-3">
                                            <input
                                                type="checkbox"
                                                className="toggle toggle-primary toggle-sm"
                                                checked={formData.use_interstitial === 1}
                                                onChange={(e) =>
                                                    setFormData({
                                                        ...formData,
                                                        use_interstitial: e.target.checked ? 1 : 0,
                                                    })
                                                }
                                            />
                                            <span className="label-text">启用跳转中间页</span>
                                        </label>
                                    </div>

                                    {formData.use_interstitial === 1 && (
                                        <>
                                            <div className="form-control">
                                                <label className="label">
                                                    <span className="label-text font-medium">
                                                        中间页延迟（秒）
                                                    </span>
                                                </label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    className="input input-bordered w-full"
                                                    value={formData.interstitial_delay || 0}
                                                    onChange={(e) =>
                                                        setFormData({
                                                            ...formData,
                                                            interstitial_delay: Number(e.target.value),
                                                        })
                                                    }
                                                />
                                            </div>

                                            <div className="form-control">
                                                <label className="label cursor-pointer justify-start gap-3">
                                                    <input
                                                        type="checkbox"
                                                        className="toggle toggle-sm"
                                                        checked={formData.force_interstitial === 1}
                                                        onChange={(e) =>
                                                            setFormData({
                                                                ...formData,
                                                                force_interstitial: e.target.checked
                                                                    ? 1
                                                                    : 0,
                                                            })
                                                        }
                                                    />
                                                    <span className="label-text">
                                                        强制中间页（无法跳过）
                                                    </span>
                                                </label>
                                            </div>
                                        </>
                                    )}

                                    <div className="divider my-2"></div>

                                    {/* 访问限制 */}
                                    <h4 className="font-medium text-base-content">访问限制</h4>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="form-control">
                                            <label className="label">
                                                <span className="label-text font-medium">
                                                    访问密码
                                                </span>
                                            </label>
                                            <input
                                                type="text"
                                                className="input input-bordered w-full"
                                                placeholder="留空则不需要密码"
                                                value={formData.password || ""}
                                                onChange={(e) =>
                                                    setFormData({
                                                        ...formData,
                                                        password: e.target.value || null,
                                                    })
                                                }
                                            />
                                        </div>

                                        <div className="form-control">
                                            <label className="label">
                                                <span className="label-text font-medium">
                                                    最大访问次数
                                                </span>
                                            </label>
                                            <input
                                                type="number"
                                                min={0}
                                                className="input input-bordered w-full"
                                                placeholder="留空则不限制"
                                                value={formData.max_visits ?? ""}
                                                onChange={(e) =>
                                                    setFormData({
                                                        ...formData,
                                                        max_visits: e.target.value
                                                            ? Number(e.target.value)
                                                            : null,
                                                    })
                                                }
                                            />
                                        </div>
                                    </div>

                                    <div className="form-control">
                                        <label className="label">
                                            <span className="label-text font-medium">过期时间</span>
                                        </label>
                                        <input
                                            type="datetime-local"
                                            className="input input-bordered w-full"
                                            value={timestampToDatetimeLocal(formData.expire_at ?? null)}
                                            onChange={(e) =>
                                                setFormData({
                                                    ...formData,
                                                    expire_at: datetimeLocalToTimestamp(e.target.value),
                                                })
                                            }
                                        />
                                        <label className="label">
                                            <span className="label-text-alt text-gray-500">
                                                留空则永不过期
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            )}

                            {/* 提交按钮 */}
                            <div className="modal-action">
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={() => setShowModal(false)}
                                    disabled={loading}
                                >
                                    取消
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={loading}>
                                    {loading ? (
                                        <>
                                            <span className="loading loading-spinner loading-sm"></span>
                                            提交中...
                                        </>
                                    ) : modalMode === "create" ? (
                                        "创建"
                                    ) : (
                                        "保存"
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                    <div
                        className="modal-backdrop"
                        onClick={() => !loading && setShowModal(false)}
                    ></div>
                </div>
            )}
        </div>
    );
}