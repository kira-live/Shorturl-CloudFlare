// src/react-app/pages/TemplateResourcesPage.tsx
import { useEffect, useState, useCallback, useRef } from "react";
import {
    templateAssetsApi,
    PrefixInfo,
    TreeNode,
    TemplateAssetListItem,
} from "../lib/api";

type MessageType = "success" | "error" | "info";
interface Message {
    type: MessageType;
    text: string;
}

// ==================== 格式化工具 ====================
function formatSize(bytes: number | null): string {
    if (bytes == null || bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + " " + units[i];
}
// ==================== 上传弹窗组件 ====================

const PART_SIZE = 10 * 1024 * 1024; // 10 MB per part
const DB_MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const MULTIPART_THRESHOLD = 50 * 1024 * 1024; // 50 MB

interface UploadModalProps {
    defaultPrefix?: string;
    defaultDirectory?: string;
    onClose: () => void;
    onSuccess: () => void;
    showMessage: (type: MessageType, text: string) => void;
}

function UploadModal({ defaultPrefix, defaultDirectory, onClose, onSuccess, showMessage }: UploadModalProps) {
    const [prefix, setPrefix] = useState(defaultPrefix || "");
    const [filename, setFilename] = useState("");
    const [storageType, setStorageType] = useState<"r2" | "db">("r2");
    const [isPublic, setIsPublic] = useState(0);
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setFile(f);
        // 自动填入文件名（保留用户自定义目录前缀）
        const dir = defaultDirectory ? defaultDirectory + "/" : "";
        setFilename(dir + f.name);
    };

    const handleUpload = async () => {
        if (!file || !prefix.trim() || !filename.trim()) {
            showMessage("error", "Please fill in prefix and filename, and select a file.");
            return;
        }

        // Check DB upload 2MB limit
        if (storageType === "db" && file.size > DB_MAX_SIZE) {
            showMessage("error", "Files uploaded to the database must be <= 2 MB. Please choose R2 storage.");
            return;
        }

        setUploading(true);
        setProgress(0);

        try {
            const cleanFilename = filename.replace(/^\/+|\/+$/g, "");

            if (storageType === "db") {
                await templateAssetsApi.uploadToDb(file, prefix.trim(), cleanFilename, isPublic);
                setProgress(100);
                showMessage("success", "Upload successful (DB storage)");
            } else if (file.size >= MULTIPART_THRESHOLD) {
                // 分片上传
                const createRes = await templateAssetsApi.multipartCreate(
                    prefix.trim(),
                    cleanFilename,
                    file.type || undefined
                );
                if (createRes.data.code !== 0) throw new Error(createRes.data.message);

                const { uploadId, r2Key } = createRes.data.data;
                const totalParts = Math.ceil(file.size / PART_SIZE);
                const parts: { partNumber: number; etag: string }[] = [];

                for (let i = 0; i < totalParts; i++) {
                    const start = i * PART_SIZE;
                    const end = Math.min(start + PART_SIZE, file.size);
                    const chunk = await file.slice(start, end).arrayBuffer();

                    const partRes = await templateAssetsApi.multipartUploadPart(
                        r2Key, uploadId, i + 1, chunk
                    );
                    if (partRes.data.code !== 0) throw new Error(partRes.data.message);

                    parts.push(partRes.data.data);
                    setProgress(Math.round(((i + 1) / totalParts) * 95));
                }

                const completeRes = await templateAssetsApi.multipartComplete({
                    prefix: prefix.trim(),
                    filename: cleanFilename,
                    r2Key,
                    uploadId,
                    parts,
                    size: file.size,
                    content_type: file.type || undefined,
                    is_public: isPublic,
                });
                if (completeRes.data.code !== 0) throw new Error(completeRes.data.message);

                setProgress(100);
                showMessage("success", "Multipart upload completed (R2 storage)");
            } else {
                // Normal R2 upload
                await templateAssetsApi.uploadToR2(file, prefix.trim(), cleanFilename, isPublic);
                setProgress(100);
                showMessage("success", "Upload successful (R2 storage)");
            }

            onSuccess();
            onClose();
        } catch (error: unknown) {
            const msg = error && typeof error === "object" && "response" in error
                ? (error.response as { data?: { message?: string } })?.data?.message || "Upload failed"
                : error instanceof Error ? error.message : "Upload failed";
            showMessage("error", msg);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="modal modal-open">
            <div className="modal-box max-w-lg">
                <h3 className="font-bold text-lg mb-6">Upload Asset File</h3>

                <div className="space-y-4">
                    {/* Prefix */}
                    <div className="form-control">
                        <label className="label">
                            <span className="label-text font-medium">Prefix <span className="text-error">*</span></span>
                        </label>
                        <input
                            type="text"
                            className="input input-bordered w-full"
                            placeholder="e.g. my-template"
                            value={prefix}
                            onChange={(e) => setPrefix(e.target.value)}
                            disabled={!!defaultPrefix || uploading}
                        />
                    </div>

                    {/* File selection */}
                    <div className="form-control">
                        <label className="label">
                            <span className="label-text font-medium">Select File <span className="text-error">*</span></span>
                        </label>
                        <input
                            type="file"
                            className="file-input file-input-bordered w-full"
                            onChange={handleFileChange}
                            disabled={uploading}
                        />
                        {file && (
                            <label className="label">
                                <span className="label-text-alt text-gray-500">
                                    Size: {formatSize(file.size)}
                                    {file.size >= MULTIPART_THRESHOLD && " (multipart upload will be used)"}
                                </span>
                            </label>
                        )}
                    </div>

                    {/* Filename */}
                    <div className="form-control">
                        <label className="label">
                            <span className="label-text font-medium">Filename <span className="text-error">*</span></span>
                        </label>
                        <input
                            type="text"
                            className="input input-bordered w-full"
                            placeholder="e.g. css/style.css"
                            value={filename}
                            onChange={(e) => setFilename(e.target.value)}
                            disabled={uploading}
                        />
                        <label className="label">
                            <span className="label-text-alt text-gray-500">Supports directories, e.g. images/logo.png</span>
                        </label>
                    </div>

                    {/* 存储方式 */}
                    <div className="form-control">
                        <label className="label">
                            <span className="label-text font-medium">Storage Type</span>
                        </label>
                        <div className="flex gap-4">
                            <label className="label cursor-pointer gap-2">
                                <input
                                    type="radio"
                                    name="storageType"
                                    className="radio radio-primary"
                                    checked={storageType === "r2"}
                                    onChange={() => setStorageType("r2")}
                                    disabled={uploading}
                                />
                                <span className="label-text">R2 Storage</span>
                            </label>
                            <label className="label cursor-pointer gap-2">
                                <input
                                    type="radio"
                                    name="storageType"
                                    className="radio radio-primary"
                                    checked={storageType === "db"}
                                    onChange={() => setStorageType("db")}
                                    disabled={uploading || (file != null && file.size > DB_MAX_SIZE)}
                                />
                                <span className={`label-text ${file && file.size > DB_MAX_SIZE ? "text-gray-400" : ""}`}>
                                    Database Storage
                                    {file && file.size > DB_MAX_SIZE && " (file exceeds 2MB)"}
                                </span>
                            </label>
                        </div>
                    </div>

                    {/* Public access */}
                    <div className="form-control">
                        <label className="label cursor-pointer justify-start gap-3">
                            <input
                                type="checkbox"
                                className="checkbox checkbox-primary"
                                checked={isPublic === 1}
                                onChange={(e) => setIsPublic(e.target.checked ? 1 : 0)}
                                disabled={uploading}
                            />
                            <span className="label-text">Public Access</span>
                        </label>
                    </div>

                    {/* Upload progress */}
                    {uploading && (
                        <div className="w-full">
                            <progress
                                className="progress progress-primary w-full"
                                value={progress}
                                max="100"
                            />
                            <p className="text-sm text-center mt-1 text-gray-500">{progress}%</p>
                        </div>
                    )}
                </div>

                <div className="modal-action">
                    <button className="btn btn-ghost" onClick={onClose} disabled={uploading}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" onClick={handleUpload} disabled={uploading || !file}>
                        {uploading ? (
                            <>
                                <span className="loading loading-spinner loading-sm" />
                                Uploading...
                            </>
                        ) : (
                            "Upload"
                        )}
                    </button>
                </div>
            </div>
            <div className="modal-backdrop" onClick={() => !uploading && onClose()} />
        </div>
    );
}

// ==================== 树节点渲染组件 ====================

interface TreeViewProps {
    nodes: TreeNode[];
    onDownload: (asset: TemplateAssetListItem) => void;
    onDelete: (asset: TemplateAssetListItem) => void;
    onCopyUrl: (asset: TemplateAssetListItem) => void;
    onEdit: (asset: TemplateAssetListItem) => void;
    level?: number;
}

function TreeView({ nodes, onDownload, onDelete, onCopyUrl, onEdit, level = 0 }: TreeViewProps) {
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const toggle = (path: string) => {
        setExpanded((prev) => ({ ...prev, [path]: !prev[path] }));
    };

    if (!nodes.length) {
        return level === 0 ? (
            <p className="text-gray-500 text-center py-8">No files</p>
        ) : null;
    }

    // 排序：文件夹在前，文件在后
    const sorted = [...nodes].sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
    });

    return (
        <ul className={`${level > 0 ? "ml-5 border-l border-base-300 pl-3" : ""}`}>
            {sorted.map((node) => (
                <li key={node.path} className="py-0.5">
                    {node.type === "folder" ? (
                        <>
                            <button
                                className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-base-200 w-full text-left transition-colors"
                                onClick={() => toggle(node.path)}
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className={`h-4 w-4 transition-transform ${expanded[node.path] ? "rotate-90" : ""}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                </svg>
                                <span className="font-medium">{node.name}</span>
                            </button>
                            {expanded[node.path] && node.children && (
                                <TreeView
                                    nodes={node.children}
                                    onDownload={onDownload}
                                    onDelete={onDelete}
                                    onCopyUrl={onCopyUrl}
                                    onEdit={onEdit}
                                    level={level + 1}
                                />
                            )}
                        </>
                    ) : (
                        <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-base-200 group transition-colors">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-info shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                <span className="truncate">{node.name}</span>
                                <span className="text-xs text-gray-400 shrink-0">
                                    {formatSize(node.asset?.size ?? null)}
                                </span>
                                <span className={`badge badge-xs ${node.asset?.storage_type === 1 ? "badge-primary" : "badge-secondary"}`}>
                                    {node.asset?.storage_type === 1 ? "R2" : "DB"}
                                </span>
                                {node.asset?.is_public === 1 && (
                                    <span className="badge badge-xs badge-success">Public</span>
                                )}
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                {node.asset && (
                                    <>
                                        {node.asset.is_public === 1 && (
                                            <button
                                                className="btn btn-xs btn-ghost"
                                                title="Copy public URL"
                                                onClick={() => onCopyUrl(node.asset!)}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 17H6a2 2 0 01-2-2V7a2 2 0 012-2h8a2 2 0 012 2v2M16 17h2a2 2 0 002-2v-6a2 2 0 00-2-2h-2m-6 8h6a2 2 0 002-2v-6a2 2 0 00-2-2H10a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                                </svg>
                                            </button>
                                        )}
                                        <button
                                            className="btn btn-xs btn-ghost"
                                            title="Edit"
                                            onClick={() => onEdit(node.asset!)}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5h2m-1 0v2m-6 4h12m-9 4h6m-3 4h2M16.5 3.5a2.121 2.121 0 113 3L8 18l-4 1 1-4 11.5-11.5z" />
                                            </svg>
                                        </button>
                                        <button
                                            className="btn btn-xs btn-ghost"
                                            title="Download"
                                            onClick={() => onDownload(node.asset!)}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                        </button>
                                        <button
                                            className="btn btn-xs btn-ghost text-error"
                                            title="Delete"
                                            onClick={() => onDelete(node.asset!)}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </li>
            ))}
        </ul>
    );
}

// ==================== 主页面组件 ====================

export function TemplateResourcesPage() {
    // 视图状态：prefix 列表 or prefix 详情
    const [currentPrefix, setCurrentPrefix] = useState<string | null>(null);

    // Prefix 列表
    const [prefixes, setPrefixes] = useState<PrefixInfo[]>([]);
    const [prefixLoading, setPrefixLoading] = useState(false);

    // 树数据
    const [tree, setTree] = useState<TreeNode[]>([]);
    const [treeTotal, setTreeTotal] = useState(0);
    const [treeLoading, setTreeLoading] = useState(false);

    // 上传弹窗
    const [showUpload, setShowUpload] = useState(false);
    const [uploadDirectory, setUploadDirectory] = useState("");

    // 删除确认
    const [deletingAsset, setDeletingAsset] = useState<TemplateAssetListItem | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    // 删除整个 prefix
    const [deletingPrefix, setDeletingPrefix] = useState<PrefixInfo | null>(null);
    const [deletePrefixLoading, setDeletePrefixLoading] = useState(false);

    // 编辑资源
    const [editingAsset, setEditingAsset] = useState<TemplateAssetListItem | null>(null);
    const [editLoading, setEditLoading] = useState(false);
    const [editFilename, setEditFilename] = useState("");
    const [editContentType, setEditContentType] = useState("");
    const [editIsPublic, setEditIsPublic] = useState(0);
    const [editAltText, setEditAltText] = useState("");

    // 消息
    const [message, setMessage] = useState<Message | null>(null);
    const messageTimer = useRef<number>(0);

    const showMessage = useCallback((type: MessageType, text: string) => {
        clearTimeout(messageTimer.current);
        setMessage({ type, text });
        messageTimer.current = window.setTimeout(() => setMessage(null), 5000);
    }, []);

    // 加载 prefix 列表
    const loadPrefixes = useCallback(async () => {
        try {
            setPrefixLoading(true);
            const res = await templateAssetsApi.getPrefixes();
            if (res.data.code === 0) {
                setPrefixes(res.data.data.prefixes);
            } else {
                showMessage("error", res.data.message);
            }
        } catch {
            showMessage("error", "Failed to load prefix list");
        } finally {
            setPrefixLoading(false);
        }
    }, [showMessage]);

    // 加载树
    const loadTree = useCallback(async (prefix: string) => {
        try {
            setTreeLoading(true);
            const res = await templateAssetsApi.getTree(prefix);
            if (res.data.code === 0) {
                setTree(res.data.data.tree);
                setTreeTotal(res.data.data.total);
            } else {
                showMessage("error", res.data.message);
            }
        } catch {
            showMessage("error", "Failed to load file tree");
        } finally {
            setTreeLoading(false);
        }
    }, [showMessage]);

    useEffect(() => {
        if (currentPrefix === null) {
            loadPrefixes();
        } else {
            loadTree(currentPrefix);
        }
    }, [currentPrefix, loadPrefixes, loadTree]);

    // 下载
    const handleDownload = async (asset: TemplateAssetListItem) => {
        try {
            const res = await templateAssetsApi.download(asset.id);
            const blob = new Blob([res.data]);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = asset.filename.split("/").pop() || asset.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch {
            showMessage("error", "Download failed");
        }
    };

    // 删除
    const handleDelete = async () => {
        if (!deletingAsset) return;
        try {
            setDeleteLoading(true);
            const res = await templateAssetsApi.delete(deletingAsset.id);
            if (res.data.code === 0) {
                showMessage("success", "Deleted successfully");
                setDeletingAsset(null);
                if (currentPrefix) loadTree(currentPrefix);
            } else {
                showMessage("error", res.data.message);
            }
        } catch {
            showMessage("error", "Delete failed");
        } finally {
            setDeleteLoading(false);
        }
    };

    // 复制公开资源 URL
    const handleCopyUrl = async (asset: TemplateAssetListItem) => {
        if (asset.is_public !== 1) return;
        try {
            const cleanFilename = asset.filename.replace(/^\/+/, "");
            const prefix = (asset as TemplateAssetListItem & { asset_prefix?: string }).asset_prefix || currentPrefix || "";
            const cleanPrefix = prefix.replace(/^\/+|\/+$/g, "");
            const base = `${window.location.origin}/assets`;
            const url = cleanPrefix
                ? `${base}/${cleanPrefix}/${cleanFilename}`
                : `${base}/${cleanFilename}`;

            await navigator.clipboard.writeText(url);
            showMessage("success", "Public URL copied");
        } catch {
            showMessage("error", "Failed to copy URL");
        }
    };

    // 打开编辑弹窗
    const openEdit = (asset: TemplateAssetListItem) => {
        setEditingAsset(asset);
        setEditFilename(asset.filename || "");
        setEditContentType(asset.content_type || "");
        setEditIsPublic(asset.is_public || 0);
        setEditAltText(asset.alt_text || "");
    };

    // 提交编辑
    const handleEditSave = async () => {
        if (!editingAsset) return;
        if (!editFilename.trim()) {
            showMessage("error", "Filename is required");
            return;
        }
        try {
            setEditLoading(true);
            const res = await templateAssetsApi.update(editingAsset.id, {
                filename: editFilename.trim(),
                content_type: editContentType.trim() || undefined,
                is_public: editIsPublic,
                alt_text: editAltText.trim() || null,
            });
            if (res.data.code === 0) {
                showMessage("success", "Asset updated");
                setEditingAsset(null);
                if (currentPrefix) loadTree(currentPrefix);
            } else {
                showMessage("error", res.data.message);
            }
        } catch (error: unknown) {
            const msg = error && typeof error === "object" && "response" in error
                ? (error.response as { data?: { message?: string } })?.data?.message || "Update failed"
                : error instanceof Error ? error.message : "Update failed";
            showMessage("error", msg);
        } finally {
            setEditLoading(false);
        }
    };

    // 进入 prefix 详情
    const enterPrefix = (prefix: string) => {
        setCurrentPrefix(prefix);
    };

    // 返回 prefix 列表
    const goBack = () => {
        setCurrentPrefix(null);
        setTree([]);
        setTreeTotal(0);
    };

    // 删除整个 prefix
    const handleDeletePrefix = async () => {
        if (!deletingPrefix) return;
        try {
            setDeletePrefixLoading(true);
            const res = await templateAssetsApi.deleteByPrefix(deletingPrefix.asset_prefix);
            if (res.data.code === 0) {
                showMessage("success", `Deleted all assets under "${deletingPrefix.asset_prefix}"`);
                setDeletingPrefix(null);
                // 如果当前正在查看该 prefix 的详情，则返回列表
                if (currentPrefix === deletingPrefix.asset_prefix) {
                    goBack();
                }
                loadPrefixes();
            } else {
                showMessage("error", res.data.message);
            }
        } catch {
            showMessage("error", "Failed to delete prefix");
        } finally {
            setDeletePrefixLoading(false);
        }
    };

    // 打开上传弹窗
    const openUpload = (directory?: string) => {
        setUploadDirectory(directory || "");
        setShowUpload(true);
    };

    return (
        <div className="p-6">
            {/* Toast message */}
            {message && (
                <div className="toast toast-top toast-center z-50">
                    <div className={`alert ${
                        message.type === "success" ? "alert-success" :
                            message.type === "error" ? "alert-error" : "alert-info"
                    } shadow-lg`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                            {message.type === "success" ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            ) : message.type === "error" ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            )}
                        </svg>
                        <span>{message.text}</span>
                    </div>
                </div>
            )}

            {/* ========= Prefix List View ========= */}
            {currentPrefix === null ? (
                <>
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h1 className="text-2xl font-bold">Template Asset Manager</h1>
                            <p className="text-sm text-gray-500 mt-1">Total {prefixes.length} asset groups</p>
                        </div>
                        <button className="btn btn-primary" onClick={() => openUpload()}>
                            + Upload Asset
                        </button>
                    </div>

                    {prefixLoading ? (
                        <div className="flex justify-center py-16">
                            <span className="loading loading-spinner loading-lg" />
                        </div>
                    ) : prefixes.length === 0 ? (
                        <div className="text-center py-16 text-gray-500">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                            </svg>
                            <p className="text-lg">No assets yet. Click the button above to upload.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                            {prefixes.map((p) => (
                                <div
                                    key={p.asset_prefix}
                                    className="card bg-base-100 shadow hover:shadow-md transition-shadow cursor-pointer border border-base-300 group"
                                    onClick={() => enterPrefix(p.asset_prefix)}
                                >
                                    <div className="card-body py-5">
                                        <div className="flex items-center gap-3">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                            </svg>
                                            <div className="min-w-0 flex-1">
                                                <h2 className="card-title text-base truncate" title={p.asset_prefix}>
                                                    {p.asset_prefix}
                                                </h2>
                                                <p className="text-sm text-gray-500">
                                                    {p.file_count} files · {formatSize(p.total_size)}
                                                </p>
                                            </div>
                                            <button
                                                className="btn btn-ghost btn-sm text-error opacity-0 group-hover:opacity-100 hover:bg-error/10"
                                                title="Delete entire prefix"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setDeletingPrefix(p);
                                                }}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            ) : (
                /* ========= Prefix Detail View (Tree) ========= */
                <>
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <button className="btn btn-ghost btn-sm" onClick={goBack}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                                Back
                            </button>
                            <div>
                                <h1 className="text-2xl font-bold font-mono">{currentPrefix}</h1>
                                <p className="text-sm text-gray-500 mt-0.5">Total {treeTotal} files</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                className="btn btn-error btn-outline"
                                onClick={() => {
                                    const info = prefixes.find(p => p.asset_prefix === currentPrefix);
                                    setDeletingPrefix(info || {
                                        asset_prefix: currentPrefix,
                                        file_count: treeTotal,
                                        total_size: null,
                                    });
                                }}
                            >
                                Delete All
                            </button>
                            <button className="btn btn-primary" onClick={() => openUpload()}>
                                + Upload Asset
                            </button>
                        </div>
                    </div>

                    <div className="bg-base-100 rounded-lg shadow border border-base-300 p-4 min-h-[300px]">
                        {treeLoading ? (
                            <div className="flex justify-center py-16">
                                <span className="loading loading-spinner loading-lg" />
                            </div>
                        ) : (
                            <TreeView
                                nodes={tree}
                                onDownload={handleDownload}
                                onDelete={setDeletingAsset}
                                onCopyUrl={handleCopyUrl}
                                onEdit={openEdit}
                            />
                        )}
                    </div>
                </>
            )}

            {/* Upload modal */}
            {showUpload && (
                <UploadModal
                    defaultPrefix={currentPrefix || undefined}
                    defaultDirectory={uploadDirectory}
                    onClose={() => setShowUpload(false)}
                    onSuccess={() => {
                        if (currentPrefix) {
                            loadTree(currentPrefix);
                        } else {
                            loadPrefixes();
                        }
                    }}
                    showMessage={showMessage}
                />
            )}

            {/* Edit modal */}
            {editingAsset && (
                <div className="modal modal-open">
                    <div className="modal-box max-w-lg">
                        <h3 className="font-bold text-lg mb-4">Edit Asset</h3>

                        <div className="space-y-4">
                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text font-medium">Filename <span className="text-error">*</span></span>
                                </label>
                                <input
                                    type="text"
                                    className="input input-bordered w-full"
                                    value={editFilename}
                                    onChange={(e) => setEditFilename(e.target.value)}
                                    disabled={editLoading}
                                />
                            </div>

                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text font-medium">Content-Type</span>
                                </label>
                                <input
                                    type="text"
                                    className="input input-bordered w-full"
                                    placeholder="e.g. text/css"
                                    value={editContentType}
                                    onChange={(e) => setEditContentType(e.target.value)}
                                    disabled={editLoading}
                                />
                            </div>

                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text font-medium">Alt Text</span>
                                </label>
                                <input
                                    type="text"
                                    className="input input-bordered w-full"
                                    placeholder="Optional description"
                                    value={editAltText}
                                    onChange={(e) => setEditAltText(e.target.value)}
                                    disabled={editLoading}
                                />
                            </div>

                            <div className="form-control">
                                <label className="label cursor-pointer justify-start gap-3">
                                    <input
                                        type="checkbox"
                                        className="checkbox checkbox-primary"
                                        checked={editIsPublic === 1}
                                        onChange={(e) => setEditIsPublic(e.target.checked ? 1 : 0)}
                                        disabled={editLoading}
                                    />
                                    <span className="label-text">Public Access</span>
                                </label>
                            </div>
                        </div>

                        <div className="modal-action">
                            <button
                                className="btn btn-ghost"
                                onClick={() => setEditingAsset(null)}
                                disabled={editLoading}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleEditSave}
                                disabled={editLoading}
                            >
                                {editLoading ? (
                                    <>
                                        <span className="loading loading-spinner loading-sm" />
                                        Saving...
                                    </>
                                ) : (
                                    "Save"
                                )}
                            </button>
                        </div>
                    </div>
                    <div className="modal-backdrop" onClick={() => !editLoading && setEditingAsset(null)} />
                </div>
            )}

            {/* Delete confirmation modal */}
            {deletingAsset && (
                <div className="modal modal-open">
                    <div className="modal-box">
                        <h3 className="font-bold text-lg mb-4">Confirm Deletion</h3>
                        <p className="py-2">
                            Are you sure you want to delete file <span className="font-mono font-bold">"{deletingAsset.filename}"</span>?
                        </p>
                        <p className="text-sm text-gray-500">
                            Storage: {deletingAsset.storage_type === 1 ? "R2" : "Database"} · Size: {formatSize(deletingAsset.size)}
                        </p>
                        <div className="modal-action">
                            <button
                                className="btn btn-ghost"
                                onClick={() => setDeletingAsset(null)}
                                disabled={deleteLoading}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-error"
                                onClick={handleDelete}
                                disabled={deleteLoading}
                            >
                                {deleteLoading ? (
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
                    <div className="modal-backdrop" onClick={() => !deleteLoading && setDeletingAsset(null)} />
                </div>
            )}

            {/* Delete prefix confirmation modal */}
            {deletingPrefix && (
                <div className="modal modal-open">
                    <div className="modal-box">
                        <h3 className="font-bold text-lg mb-4 text-error">⚠️ Delete Entire Asset Group</h3>
                        <p className="py-2">
                            Are you sure you want to delete all files under <span className="font-mono font-bold">"{deletingPrefix.asset_prefix}"</span>?
                        </p>
                        <p className="text-sm text-gray-500">
                            Total {deletingPrefix.file_count} files
                            {deletingPrefix.total_size != null && ` · Total size: ${formatSize(deletingPrefix.total_size)}`}
                        </p>
                        <p className="text-sm text-error mt-2">This action cannot be undone!</p>
                        <div className="modal-action">
                            <button
                                className="btn btn-ghost"
                                onClick={() => setDeletingPrefix(null)}
                                disabled={deletePrefixLoading}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-error"
                                onClick={handleDeletePrefix}
                                disabled={deletePrefixLoading}
                            >
                                {deletePrefixLoading ? (
                                    <>
                                        <span className="loading loading-spinner loading-sm" />
                                        Deleting...
                                    </>
                                ) : (
                                    "Confirm Delete All"
                                )}
                            </button>
                        </div>
                    </div>
                    <div className="modal-backdrop" onClick={() => !deletePrefixLoading && setDeletingPrefix(null)} />
                </div>
            )}
        </div>
    );
}