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
                    placeholder="Press Enter to add a tag"
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
                    Add
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
            console.error("Failed to load domains:", e);
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
            console.error("Failed to load template options:", e);
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
            console.error("Failed to load short links list:", e);
            showMessage("error", "Failed to load short links list");
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
            showMessage("error", "Please enter the target URL");
            return;
        }
        if (!formData.domain_id) {
            showMessage("error", "Please select a domain");
            return;
        }

        try {
            setLoading(true);
            if (modalMode === "create") {
                const res = await shortLinkApi.create(formData);
                if (res.data.code === 0) {
                    showMessage("success", "Short link created successfully");
                    setShowModal(false);
                    loadLinks();
                } else {
                    showMessage("error", res.data.message || "Create failed");
                }
            } else if (editingLink) {
                const updateData: UpdateShortLinkRequest = { ...formData };
                const res = await shortLinkApi.update(editingLink.id, updateData);
                if (res.data.code === 0) {
                    showMessage("success", "Short link updated successfully");
                    setShowModal(false);
                    loadLinks();
                } else {
                    showMessage("error", res.data.message || "Update failed");
                }
            }
        } catch (error: unknown) {
            const msg =
                error && typeof error === "object" && "response" in error
                    ? (error.response as { data?: { message?: string } })?.data?.message || "Operation failed"
                    : "Operation failed";
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
                showMessage("success", "Deleted successfully");
                setDeletingLink(null);
                loadLinks();
            } else {
                showMessage("error", res.data.message || "Delete failed");
            }
        } catch (error: unknown) {
            const msg =
                error && typeof error === "object" && "response" in error
                    ? (error.response as { data?: { message?: string } })?.data?.message || "Delete failed"
                    : "Delete failed";
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
                showMessage("error", res.data.message || "Operation failed");
            }
        } catch {
            showMessage("error", "Operation failed");
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
        return new Date(timestamp * 1000).toLocaleString("en-US");
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
            {/* Message */}
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

            {/* Title & Create button */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Short Link Management</h1>
                    <p className="text-sm text-gray-500 mt-1">{total} short links total</p>
                </div>
                <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
                    + New Short Link
                </button>
            </div>

            {/* Filters */}
            <div className="bg-base-100 rounded-lg shadow p-4 mb-4">
                <div className="flex flex-wrap gap-3 items-end">
                    {/* Keyword search */}
                    <div className="form-control">
                        <label className="label py-1">
                            <span className="label-text text-xs">Search</span>
                        </label>
                        <input
                            type="text"
                            className="input input-bordered input-sm w-48 ml-2"
                            placeholder="Short code / Target URL / Notes"
                            value={filterKeyword}
                            onChange={(e) => setFilterKeyword(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                        />
                    </div>

                    {/* Domain filter */}
                    <div className="form-control">
                        <label className="label py-1">
                            <span className="label-text text-xs">Domain</span>
                        </label>
                        <select
                            className="select select-bordered select-sm w-40 ml-2"
                            value={filterDomainId}
                            onChange={(e) => {
                                setFilterDomainId(e.target.value);
                                setPage(1);
                            }}
                        >
                            <option value="">All domains</option>
                            {domains.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.host}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Tag filter */}
                    <div className="form-control">
                        <label className="label py-1">
                            <span className="label-text text-xs">Tags</span>
                        </label>
                        <select
                            className="select select-bordered select-sm w-36 ml-2"
                            value={filterTag}
                            onChange={(e) => {
                                setFilterTag(e.target.value);
                                setPage(1);
                            }}
                        >
                            <option value="">All tags</option>
                            {allTags.map((tag) => (
                                <option key={tag} value={tag}>
                                    {tag}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Status filter */}
                    <div className="form-control">
                        <label className="label py-1">
                            <span className="label-text text-xs">Status</span>
                        </label>
                        <select
                            className="select select-bordered select-sm w-28 ml-2"
                            value={filterStatus}
                            onChange={(e) => {
                                setFilterStatus(e.target.value);
                                setPage(1);
                            }}
                        >
                            <option value="">All</option>
                            <option value="0">Enabled</option>
                            <option value="1">Disabled</option>
                        </select>
                    </div>

                    {/* Sort */}
                    <div className="form-control">
                        <label className="label py-1">
                            <span className="label-text text-xs">Sort</span>
                        </label>
                        <div className="flex gap-1">
                            <select
                                className="select select-bordered select-sm w-32 ml-2"
                                value={orderBy}
                                onChange={(e) => setOrderBy(e.target.value)}
                            >
                                <option value="created_at">Created time</option>
                                <option value="updated_at">Updated time</option>
                                <option value="total_clicks">Clicks</option>
                                <option value="last_access_at">Last access</option>
                            </select>
                            <button
                                className="btn btn-sm btn-outline"
                                onClick={() => setOrderDir((d) => (d === "desc" ? "asc" : "desc"))}
                                title={orderDir === "desc" ? "Descending" : "Ascending"}
                            >
                                {orderDir === "desc" ? "↓" : "↑"}
                            </button>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 ml-auto">
                        <button className="btn btn-sm btn-ghost" onClick={handleResetFilters}>
                            Reset
                        </button>
                        <button className="btn btn-sm btn-primary" onClick={handleSearch}>
                            Search
                        </button>
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="bg-base-100 rounded-lg shadow">
                {loading && links.length === 0 ? (
                    <div className="text-center py-12">
                        <span className="loading loading-spinner loading-lg"></span>
                    </div>
                ) : links.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">No short links</div>
                ) : (
                    <div className="divide-y divide-base-200">
                        {links.map((link) => (
                            <div key={link.id} className="px-5 py-5 hover:bg-base-200/50 transition-colors">
                                {/* Row 1: short link + status + actions */}
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
                                        <span className={`badge badge-sm ${link.is_disabled === 0 ? "badge-success" : "badge-error"}`}>
                                            {link.is_disabled === 0 ? "Enabled" : "Disabled"}
                                        </span>
                                        {link.password && (
                                            <span className="badge badge-sm badge-warning">🔒 Password protected</span>
                                        )}
                                        {link.expire_at && link.expire_at < Date.now() / 1000 && (
                                            <span className="badge badge-sm badge-error">Expired</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <label className="cursor-pointer" title={link.is_disabled === 0 ? "Click to disable" : "Click to enable"}>
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
                                            Edit
                                        </button>
                                        <button
                                            className="btn btn-sm btn-ghost text-error hover:bg-error hover:text-white"
                                            onClick={() => setDeletingLink(link)}
                                            disabled={loading}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>

                                {/* Row 2: Target URL */}
                                <div className="text-sm text-gray-600 mb-3 truncate" title={link.target_url}>
                                    <span className="text-gray-400 mr-1">→</span>
                                    {link.target_url}
                                </div>

                                {/* Row 3: Core attributes */}
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-8 gap-y-2 text-sm mb-3">
                                    <div>
                                        <span className="text-gray-400">Redirect code:</span>
                                        <span className="font-medium">{link.redirect_http_code}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">Clicks:</span>
                                        <span className="font-semibold text-primary">{link.total_clicks}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">Interstitial:</span>
                                        <span>{link.use_interstitial === 1 ? `✅ ${link.interstitial_delay}s` : "Off"}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">Force interstitial:</span>
                                        <span>{link.force_interstitial === 1 ? "Yes" : "No"}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">Max visits:</span>
                                        <span>{link.max_visits ?? "Unlimited"}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">Expiration:</span>
                                        <span>{link.expire_at ? formatTime(link.expire_at) : "Never"}</span>
                                    </div>
                                </div>

                                {/* Row 4: Templates */}
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2 text-sm mb-3">
                                    <div>
                                        <span className="text-gray-400">Redirect template:</span>
                                        <span>{getTemplateName(link.template_id)}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">Error template:</span>
                                        <span>{getTemplateName(link.error_template_id)}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">Password template:</span>
                                        <span>{getTemplateName(link.password_template_id)}</span>
                                    </div>
                                </div>

                                {/* Row 5: Tags + notes + time */}
                                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-400 mt-1">
                                    {/* Tags */}
                                    {link.tags.length > 0 && (
                                        <div className="flex items-center gap-1">
                                            <span>Tags:</span>
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
                                        <span title={link.remark}>Notes: {link.remark}</span>
                                    )}
                                    <span>Created: {formatTime(link.created_at)}</span>
                                    {link.updated_at && <span>Updated: {formatTime(link.updated_at)}</span>}
                                    {link.last_access_at && (
                                        <span>Last access: {formatTime(link.last_access_at)}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 0 && (
                <div className="flex flex-col sm:flex-row justify-between items-center mt-6 gap-3">
                    <div className="text-sm text-gray-500">
                        {total} records, page {page}/{totalPages}, {pageSize} per page
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

            {/* Delete confirmation modal */}
            {deletingLink && (
                <div className="modal modal-open">
                    <div className="modal-box">
                        <h3 className="font-bold text-lg mb-4">Confirm delete</h3>
                        <p className="py-4">
                            Are you sure you want to delete the short link{" "}
                            <span className="font-mono font-bold">
                                {deletingLink.domain_host}/{deletingLink.code}
                            </span>{" "}
                            ? This action cannot be undone.
                        </p>
                        <div className="modal-action">
                            <button
                                className="btn btn-ghost"
                                onClick={() => setDeletingLink(null)}
                                disabled={loading}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-error"
                                onClick={() => handleDelete(deletingLink)}
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <span className="loading loading-spinner loading-sm"></span>
                                        Deleting...
                                    </>
                                ) : (
                                    "Confirm delete"
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

            {/* Create/Edit modal */}
            {showModal && (
                <div className="modal modal-open">
                    <div className="modal-box max-w-2xl max-h-[90vh]">
                        <h3 className="font-bold text-lg mb-6">
                            {modalMode === "create" ? "Create Short Link" : "Edit Short Link"}
                        </h3>

                        <form onSubmit={handleSubmit} className="space-y-5 overflow-y-auto pr-2 pl-2">
                            {/* Target URL */}
                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text font-medium">
                                        Target URL <span className="text-error">*</span>
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

                            {/* Domain & short code */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-control">
                                    <label className="label">
                                        <span className="label-text font-medium">
                                            Domain <span className="text-error">*</span>
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
                                            Select a domain
                                        </option>
                                        {domains.map((d) => (
                                            <option key={d.id} value={d.id}>
                                                {d.host}
                                                {d.is_default === 1 ? " (Default)" : ""}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-control">
                                    <label className="label">
                                        <span className="label-text font-medium">Custom short code</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="input input-bordered w-full focus:input-primary"
                                        placeholder="Leave blank to auto-generate"
                                        value={formData.code || ""}
                                        onChange={(e) =>
                                            setFormData({ ...formData, code: e.target.value })
                                        }
                                    />
                                    <label className="label">
                                        <span className="label-text-alt text-gray-500">
                                            Only letters, numbers, hyphens, and underscores are allowed
                                        </span>
                                    </label>
                                </div>
                            </div>

                            {/* Redirect status code */}
                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text font-medium">Redirect status code</span>
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
                                    <option value={302}>302 - Temporary redirect (recommended)</option>
                                    <option value={301}>301 - Permanent redirect</option>
                                    <option value={307}>307 - Temporary redirect (method preserved)</option>
                                    <option value={308}>308 - Permanent redirect (method preserved)</option>
                                </select>
                            </div>

                            {/* Tags */}
                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text font-medium">Tags</span>
                                </label>
                                <TagInput
                                    tags={formData.tags || []}
                                    onChange={(tags) => setFormData({ ...formData, tags })}
                                />
                            </div>

                            {/* Notes */}
                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text font-medium">Notes</span>
                                </label>
                                <textarea
                                    className="textarea textarea-bordered w-full focus:textarea-primary resize-none"
                                    placeholder="Optional notes"
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

                            {/* Advanced options toggle */}
                            <div className="divider my-2">
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => setShowAdvanced(!showAdvanced)}
                                >
                                    {showAdvanced ? "▲ Collapse advanced options" : "▼ Expand advanced options"}
                                </button>
                            </div>

                            {showAdvanced && (
                                <div className="space-y-5">
                                    {/* Template selection */}
                                    <h4 className="font-medium text-base-content">Template settings</h4>
                                    <p className="text-sm text-gray-500">
                                        Configure templates for this link; leave blank to use domain/system defaults
                                    </p>

                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="form-control">
                                            <label className="label">
                                                <span className="label-text font-medium">
                                                    Interstitial page template
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
                                                <option value="">Use default</option>
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
                                                    Error page template
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
                                                <option value="">Use default</option>
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
                                                            {t.type === 2 ? " (Error page)" : ""}
                                                        </option>
                                                    ))}
                                            </select>
                                        </div>

                                        <div className="form-control">
                                            <label className="label">
                                                <span className="label-text font-medium">
                                                    Password page template
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
                                                <option value="">Use default</option>
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
                                                            {t.type === 1 ? " (Password page)" : ""}
                                                        </option>
                                                    ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="divider my-2"></div>

                                    {/* Interstitial settings */}
                                    <h4 className="font-medium text-base-content">Interstitial settings</h4>

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
                                            <span className="label-text">Enable interstitial page</span>
                                        </label>
                                    </div>

                                    {formData.use_interstitial === 1 && (
                                        <>
                                            <div className="form-control">
                                                <label className="label">
                                                    <span className="label-text font-medium">
                                                        Interstitial delay (seconds)
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
                                                        Force interstitial (cannot be skipped)
                                                    </span>
                                                </label>
                                            </div>
                                        </>
                                    )}

                                    <div className="divider my-2"></div>

                                    {/* Access restrictions */}
                                    <h4 className="font-medium text-base-content">Access restrictions</h4>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="form-control">
                                            <label className="label">
                                                <span className="label-text font-medium">
                                                    Access password
                                                </span>
                                            </label>
                                            <input
                                                type="text"
                                                className="input input-bordered w-full"
                                                placeholder="Leave blank for no password"
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
                                                    Max visits
                                                </span>
                                            </label>
                                            <input
                                                type="number"
                                                min={0}
                                                className="input input-bordered w-full"
                                                placeholder="Leave blank for unlimited"
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
                                            <span className="label-text font-medium">Expiration time</span>
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
                                                Leave blank for no expiration
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
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={loading}>
                                    {loading ? (
                                        <>
                                            <span className="loading loading-spinner loading-sm"></span>
                                            Submitting...
                                        </>
                                    ) : modalMode === "create" ? (
                                        "Create"
                                    ) : (
                                        "Save"
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