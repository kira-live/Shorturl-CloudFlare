// src/react-app/pages/TemplatesPage.tsx
import { useEffect, useState, useCallback, useRef } from "react";
import {
    templateApi,
    templateAssetsApi,
    RedirectTemplateListItem,
    RedirectTemplate,
    CreateTemplateRequest,
    UpdateTemplateRequest,
    PrefixInfo,
    TreeNode,
} from "../lib/api";

type MessageType = "success" | "error" | "info";
interface Message {
    type: MessageType;
    text: string;
}

// 模板类型映射
const TEMPLATE_TYPE_OPTIONS = [
    { value: 0, label: "Standard template (redirect page)" },
    { value: 1, label: "Password page" },
    { value: 2, label: "Error page" },
    { value: 3, label: "Not found page" },
];

function getTypeLabel(type: number | null): string {
    const found = TEMPLATE_TYPE_OPTIONS.find((o) => o.value === type);
    return found?.label ?? "Not set";
}

function getTypeBadgeClass(type: number | null): string {
    switch (type) {
        case 0: return "badge-primary";
        case 1: return "badge-warning";
        case 2: return "badge-error";
        case 3: return "badge-info";
        default: return "badge-ghost";
    }
}

// ==================== 文件选择器组件 ====================

function flattenFiles(nodes: TreeNode[]): string[] {
    const files: string[] = [];
    for (const node of nodes) {
        if (node.type === "file") {
            files.push(node.path);
        }
        if (node.children) {
            files.push(...flattenFiles(node.children));
        }
    }
    return files;
}

interface FileSelectorProps {
    prefix: string;
    value: string;
    onChange: (filename: string) => void;
}

function FileSelector({ prefix, value, onChange }: FileSelectorProps) {
    // 只存储已完成加载的结果（prefix 维度）
    const [loaded, setLoaded] = useState<{
        prefix: string;
        files: string[];
        error: string;
    } | null>(null);

    useEffect(() => {
        if (!prefix) return;

        let cancelled = false;

        templateAssetsApi
            .getTree(prefix)
            .then((res) => {
                if (cancelled) return;
                if (res.data.code === 0) {
                    const allFiles = flattenFiles(res.data.data.tree);
                    setLoaded({ prefix, files: allFiles, error: "" });
                } else {
                    setLoaded({ prefix, files: [], error: res.data.message });
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setLoaded({ prefix, files: [], error: "Failed to load file list" });
                }
            });

        return () => { cancelled = true; };
    }, [prefix]);

    // 从 loaded 状态和当前 prefix 推导出渲染所需的值，无需同步 setState
    if (!prefix) {
        return <p className="text-sm text-gray-400">Please select an asset prefix first</p>;
    }

    // prefix 有值但尚未加载完成（loaded 为 null 或 loaded 对应的是旧 prefix）
    if (!loaded || loaded.prefix !== prefix) {
        return (
            <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="loading loading-spinner loading-xs" />
                Loading file list...
            </div>
        );
    }

    if (loaded.error) {
        return <p className="text-sm text-error">{loaded.error}</p>;
    }

    if (loaded.files.length === 0) {
        return <p className="text-sm text-gray-400">No files under this prefix</p>;
    }

    return (
        <select
            className="select select-bordered w-full"
            value={value}
            onChange={(e) => onChange(e.target.value)}
        >
            <option value="">-- Please select the main file --</option>
            {loaded.files.map((f) => (
                <option key={f} value={f}>
                    {f}
                </option>
            ))}
        </select>
    );
}

// ==================== 模板表单弹窗组件 ====================

interface TemplateFormData {
    name: string;
    type: number;
    content_type: number;       // 0=HTML内容, 1=文件
    html_content: string;
    asset_prefix: string;
    main_file: string;
    is_active: number;
}

interface TemplateModalProps {
    mode: "create" | "edit";
    initialData?: TemplateFormData;
    prefixes: PrefixInfo[];
    loading: boolean;
    onSubmit: (data: TemplateFormData) => void;
    onClose: () => void;
}

function TemplateModal({ mode, initialData, prefixes, loading, onSubmit, onClose }: TemplateModalProps) {
    const [form, setForm] = useState<TemplateFormData>(
        initialData ?? {
            name: "",
            type: 0,
            content_type: 0,
            html_content: "",
            asset_prefix: "",
            main_file: "",
            is_active: 1,
        }
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(form);
    };

    return (
        <div className="modal modal-open">
            <div className="modal-box max-w-2xl max-h-[90vh]">
                <h3 className="font-bold text-lg mb-6">
                    {mode === "create" ? "Create Template" : "Edit Template"}
                </h3>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* 模板名称 */}
                    <div className="form-control">
                        <label className="label">
                            <span className="label-text font-medium">
                                Template Name <span className="text-error">*</span>
                            </span>
                        </label>
                        <input
                            type="text"
                            className="input input-bordered w-full"
                            placeholder="e.g., Default redirect page template"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            required
                            autoFocus
                        />
                    </div>

                    {/* 模板类型 */}
                    <div className="form-control">
                        <label className="label">
                            <span className="label-text font-medium">Template Type</span>
                        </label>
                        <select
                            className="select select-bordered w-full"
                            value={form.type}
                            onChange={(e) => setForm({ ...form, type: parseInt(e.target.value) })}
                        >
                            {TEMPLATE_TYPE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* 内容来源 */}
                    <div className="form-control">
                        <label className="label">
                            <span className="label-text font-medium">Content Source</span>
                        </label>
                        <div className="flex gap-4">
                            <label className="label cursor-pointer gap-2">
                                <input
                                    type="radio"
                                    name="content_type"
                                    className="radio radio-primary"
                                    checked={form.content_type === 0}
                                    onChange={() =>
                                        setForm({ ...form, content_type: 0, asset_prefix: "", main_file: "" })
                                    }
                                />
                                <span className="label-text">Write HTML directly</span>
                            </label>
                            <label className="label cursor-pointer gap-2">
                                <input
                                    type="radio"
                                    name="content_type"
                                    className="radio radio-primary"
                                    checked={form.content_type === 1}
                                    onChange={() =>
                                        setForm({ ...form, content_type: 1, html_content: "" })
                                    }
                                />
                                <span className="label-text">Use template assets</span>
                            </label>
                        </div>
                    </div>

                    {/* HTML 内容编辑 */}
                    {form.content_type === 0 && (
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text font-medium">
                                    HTML Content <span className="text-error">*</span>
                                </span>
                            </label>
                            <textarea
                                className="textarea textarea-bordered w-full font-mono text-sm"
                                placeholder="<html>&#10;  <body>&#10;    <h1>Hello {{name}}</h1>&#10;  </body>&#10;</html>"
                                value={form.html_content}
                                onChange={(e) => setForm({ ...form, html_content: e.target.value })}
                                rows={12}
                            />
                            <label className="label">
                                <span className="label-text-alt text-gray-500">
                                    Supports template replacement using {"{{variable}}"} syntax
                                </span>
                            </label>
                        </div>
                    )}

                    {/* 文件模式 */}
                    {form.content_type === 1 && (
                        <>
                            {/* 资源前缀选择 */}
                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text font-medium">
                                        Asset Prefix (Prefix) <span className="text-error">*</span>
                                    </span>
                                </label>
                                <select
                                    className="select select-bordered w-full"
                                    value={form.asset_prefix}
                                    onChange={(e) =>
                                        setForm({ ...form, asset_prefix: e.target.value, main_file: "" })
                                    }
                                >
                                    <option value="">-- Please select an asset prefix --</option>
                                    {prefixes.map((p) => (
                                        <option key={p.asset_prefix} value={p.asset_prefix}>
                                            {p.asset_prefix} ({p.file_count} files)
                                        </option>
                                    ))}
                                </select>
                                <label className="label">
                                    <span className="label-text-alt text-gray-500">
                                        Select a resource group uploaded in Template Assets
                                    </span>
                                </label>
                            </div>

                            {/* 主文件选择 */}
                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text font-medium">
                                        Main File <span className="text-error">*</span>
                                    </span>
                                </label>
                                <FileSelector
                                    prefix={form.asset_prefix}
                                    value={form.main_file}
                                    onChange={(f) => setForm({ ...form, main_file: f })}
                                />
                                <label className="label">
                                    <span className="label-text-alt text-gray-500">
                                        Select the HTML file used as the template entry
                                    </span>
                                </label>
                            </div>
                        </>
                    )}

                    <div className="divider my-2" />

                    {/* 启用状态 */}
                    <div className="form-control">
                        <label className="label cursor-pointer justify-start gap-3 py-3 px-4 rounded-lg hover:bg-base-200 transition-colors">
                            <input
                                type="checkbox"
                                className="checkbox checkbox-primary"
                                checked={form.is_active === 1}
                                onChange={(e) =>
                                    setForm({ ...form, is_active: e.target.checked ? 1 : 0 })
                                }
                            />
                            <div className="flex flex-col">
                                <span className="label-text font-medium">Enable this template</span>
                                <span className="label-text-alt text-gray-500">
                                    When disabled, this template will not take effect on domains/short links
                                </span>
                            </div>
                        </label>
                    </div>

                    {/* 操作按钮 */}
                    <div className="modal-action mt-6">
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={onClose}
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? (
                                <>
                                    <span className="loading loading-spinner loading-sm" />
                                    Submitting...
                                </>
                            ) : mode === "create" ? (
                                "Create"
                            ) : (
                                "Save"
                            )}
                        </button>
                    </div>
                </form>
            </div>
            <div className="modal-backdrop" onClick={() => !loading && onClose()} />
        </div>
    );
}

// ==================== 主页面组件 ====================

export function TemplatesPage() {
    const [templates, setTemplates] = useState<RedirectTemplateListItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(10);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(0);

    // 消息
    const [message, setMessage] = useState<Message | null>(null);
    const messageTimer = useRef<number>(0);

    // 弹窗
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState<"create" | "edit">("create");
    const [editingTemplate, setEditingTemplate] = useState<RedirectTemplate | null>(null);
    const [submitLoading, setSubmitLoading] = useState(false);

    // 删除
    const [deletingTemplate, setDeletingTemplate] = useState<RedirectTemplateListItem | null>(null);

    // 资源前缀（用于文件模式选择）
    const [prefixes, setPrefixes] = useState<PrefixInfo[]>([]);

    const showMessage = useCallback((type: MessageType, text: string) => {
        clearTimeout(messageTimer.current);
        setMessage({ type, text });
        messageTimer.current = window.setTimeout(() => setMessage(null), 5000);
    }, []);

    // 加载模板列表
    const loadTemplates = useCallback(async () => {
        try {
            setLoading(true);
            const res = await templateApi.getList(page, pageSize);
            if (res.data.code === 0) {
                setTemplates(res.data.data.results);
                setTotal(res.data.data.pagination.total);
                setTotalPages(res.data.data.pagination.totalPages);
            } else {
                showMessage("error", res.data.message);
            }
        } catch {
            showMessage("error", "Failed to load template list");
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, showMessage]);

    // 加载资源前缀列表
    const loadPrefixes = useCallback(async () => {
        try {
            const res = await templateAssetsApi.getPrefixes();
            if (res.data.code === 0) {
                setPrefixes(res.data.data.prefixes);
            }
        } catch {
            // 静默失败
        }
    }, []);

    useEffect(() => {
        loadTemplates();
    }, [loadTemplates]);

    // 打开创建弹窗
    const handleCreate = async () => {
        await loadPrefixes();
        setModalMode("create");
        setEditingTemplate(null);
        setShowModal(true);
    };

    // 打开编辑弹窗
    const handleEdit = async (item: RedirectTemplateListItem) => {
        try {
            setLoading(true);
            const [detailRes] = await Promise.all([
                templateApi.getDetail(item.id),
                loadPrefixes(),
            ]);
            if (detailRes.data.code === 0) {
                setEditingTemplate(detailRes.data.data);
                setModalMode("edit");
                setShowModal(true);
            } else {
                showMessage("error", detailRes.data.message);
            }
        } catch {
            showMessage("error", "Failed to load template details");
        } finally {
            setLoading(false);
        }
    };

    // 提交表单
    const handleSubmit = async (form: TemplateFormData) => {
        // 验证
        if (!form.name.trim()) {
            showMessage("error", "Please enter a template name");
            return;
        }
        if (form.content_type === 0 && !form.html_content.trim()) {
            showMessage("error", "Please enter HTML content");
            return;
        }
        if (form.content_type === 1 && !form.asset_prefix) {
            showMessage("error", "Please select an asset prefix");
            return;
        }
        if (form.content_type === 1 && !form.main_file) {
            showMessage("error", "Please select the main file");
            return;
        }

        try {
            setSubmitLoading(true);

            if (modalMode === "create") {
                const payload: CreateTemplateRequest = {
                    name: form.name.trim(),
                    type: form.type,
                    content_type: form.content_type,
                    is_active: form.is_active,
                };
                if (form.content_type === 0) {
                    payload.html_content = form.html_content;
                } else {
                    payload.asset_prefix = form.asset_prefix;
                    payload.main_file = form.main_file;
                }
                const res = await templateApi.create(payload);
                if (res.data.code === 0) {
                    showMessage("success", "Template created successfully");
                    setShowModal(false);
                    loadTemplates();
                } else {
                    showMessage("error", res.data.message);
                }
            } else if (editingTemplate) {
                const payload: UpdateTemplateRequest = {
                    name: form.name.trim(),
                    type: form.type,
                    content_type: form.content_type,
                    is_active: form.is_active,
                };
                if (form.content_type === 0) {
                    payload.html_content = form.html_content;
                    payload.main_file = null;
                    payload.asset_prefix = null;
                } else {
                    payload.html_content = null;
                    payload.asset_prefix = form.asset_prefix;
                    payload.main_file = form.main_file;
                }
                const res = await templateApi.update(editingTemplate.id, payload);
                if (res.data.code === 0) {
                    showMessage("success", "Template updated successfully");
                    setShowModal(false);
                    loadTemplates();
                } else {
                    showMessage("error", res.data.message);
                }
            }
        } catch (error: unknown) {
            const msg =
                error && typeof error === "object" && "response" in error
                    ? (error.response as { data?: { message?: string } })?.data?.message || "Operation failed"
                    : "Operation failed";
            showMessage("error", msg);
        } finally {
            setSubmitLoading(false);
        }
    };

    // 切换启用状态
    const handleToggleActive = async (item: RedirectTemplateListItem) => {
        try {
            const res = await templateApi.toggleActive(item.id);
            if (res.data.code === 0) {
                showMessage("success", res.data.message);
                loadTemplates();
            } else {
                showMessage("error", res.data.message);
            }
        } catch {
            showMessage("error", "Failed to toggle status");
        }
    };

    // 删除模板
    const handleDelete = async () => {
        if (!deletingTemplate) return;
        try {
            setLoading(true);
            const res = await templateApi.delete(deletingTemplate.id);
            if (res.data.code === 0) {
                showMessage("success", "Template deleted successfully");
                setDeletingTemplate(null);
                loadTemplates();
            } else {
                showMessage("error", res.data.message);
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

    // 格式化时间
    const formatTime = (timestamp: number) => {
        return new Date(timestamp * 1000).toLocaleString("en-US");
    };

    // 编辑弹窗的初始数据
    const getInitialFormData = (): TemplateFormData | undefined => {
        if (modalMode === "edit" && editingTemplate) {
            return {
                name: editingTemplate.name,
                type: editingTemplate.type ?? 0,
                content_type: editingTemplate.content_type,
                html_content: editingTemplate.html_content ?? "",
                asset_prefix: editingTemplate.asset_prefix ?? "",
                main_file: editingTemplate.main_file ?? "",
                is_active: editingTemplate.is_active,
            };
        }
        return undefined;
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

            {/* 标题栏 */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Template Management</h1>
                    <p className="text-sm text-gray-500 mt-1">Total {total} templates</p>
                </div>
                <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
                    + New Template
                </button>
            </div>

            {/* 模板列表 */}
            <div className="overflow-x-auto bg-base-100 rounded-lg shadow">
                <table className="table table-zebra w-full">
                    <thead>
                    <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Content Source</th>
                        <th>Status</th>
                        <th>Created At</th>
                        <th>Actions</th>
                    </tr>
                    </thead>
                    <tbody>
                    {loading && templates.length === 0 ? (
                        <tr>
                            <td colSpan={7} className="text-center py-8">
                                <span className="loading loading-spinner loading-lg" />
                            </td>
                        </tr>
                    ) : templates.length === 0 ? (
                        <tr>
                            <td colSpan={7} className="text-center py-8 text-gray-500">
                                No templates
                            </td>
                        </tr>
                    ) : (
                        templates.map((tpl) => (
                            <tr key={tpl.id}>
                                <td>{tpl.id}</td>
                                <td className="font-medium">{tpl.name}</td>
                                <td>
                                        <span className={`badge badge-sm ${getTypeBadgeClass(tpl.type)}`}>
                                            {getTypeLabel(tpl.type)}
                                        </span>
                                </td>
                                <td>
                                    {tpl.content_type === 0 ? (
                                        <span className="badge badge-sm badge-outline">HTML</span>
                                    ) : (
                                        <div className="flex flex-col">
                                            <span className="badge badge-sm badge-outline badge-secondary">File</span>
                                            <span className="text-xs text-gray-400 mt-0.5">
                                                    {tpl.asset_prefix}/{tpl.main_file}
                                                </span>
                                        </div>
                                    )}
                                </td>
                                <td>
                                    <input
                                        type="checkbox"
                                        className="toggle toggle-sm toggle-success"
                                        checked={tpl.is_active === 1}
                                        onChange={() => handleToggleActive(tpl)}
                                    />
                                </td>
                                <td className="text-sm text-gray-500">
                                    {formatTime(tpl.created_at)}
                                </td>
                                <td>
                                    <div className="flex gap-2">
                                        <button
                                            className="btn btn-sm btn-ghost"
                                            onClick={() => handleEdit(tpl)}
                                            disabled={loading}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            className="btn btn-sm btn-ghost text-error hover:bg-error hover:text-white"
                                            onClick={() => setDeletingTemplate(tpl)}
                                            disabled={loading}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))
                    )}
                    </tbody>
                </table>
            </div>

            {/* 分页 */}
            {totalPages > 1 && (
                <div className="flex justify-center mt-6">
                    <div className="join">
                        <button
                            className="join-item btn"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page === 1 || loading}
                        >
                            «
                        </button>
                        <button className="join-item btn">
                            Page {page} / {totalPages}
                        </button>
                        <button
                            className="join-item btn"
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages || loading}
                        >
                            »
                        </button>
                    </div>
                </div>
            )}

            {/* 删除确认弹窗 */}
            {deletingTemplate && (
                <div className="modal modal-open">
                    <div className="modal-box">
                        <h3 className="font-bold text-lg mb-4">Confirm Deletion</h3>
                        <p className="py-4">
                            Are you sure you want to delete template{" "}
                            <span className="font-bold">"{deletingTemplate.name}"</span>?
                        </p>
                        <p className="text-sm text-gray-500">
                            If any domains or short links reference this template, deletion will fail.
                        </p>
                        <div className="modal-action">
                            <button
                                className="btn btn-ghost"
                                onClick={() => setDeletingTemplate(null)}
                                disabled={loading}
                            >
                                Cancel
                            </button>
                            <button className="btn btn-error" onClick={handleDelete} disabled={loading}>
                                {loading ? (
                                    <>
                                        <span className="loading loading-spinner loading-sm" />
                                        Deleting...
                                    </>
                                ) : (
                                    "Confirm Delete"
                                )}
                            </button>
                        </div>
                    </div>
                    <div
                        className="modal-backdrop"
                        onClick={() => !loading && setDeletingTemplate(null)}
                    />
                </div>
            )}

            {/* 创建/编辑弹窗 */}
            {showModal && (
                <TemplateModal
                    mode={modalMode}
                    initialData={getInitialFormData()}
                    prefixes={prefixes}
                    loading={submitLoading}
                    onSubmit={handleSubmit}
                    onClose={() => setShowModal(false)}
                />
            )}
        </div>
    );
}