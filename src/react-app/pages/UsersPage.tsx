import { useEffect, useState } from "react";
import { userApi, User, CreateUserRequest, UpdateUserRequest } from "../lib/api";

type MessageType = 'success' | 'error' | 'info';

interface Message {
    type: MessageType;
    text: string;
}

export function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(10);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(0);

    // Message state
    const [message, setMessage] = useState<Message | null>(null);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
    const [editingUser, setEditingUser] = useState<User | null>(null);

    // Delete confirmation modal
    const [deletingUser, setDeletingUser] = useState<User | null>(null);

    // Form data
    const [formData, setFormData] = useState<CreateUserRequest>({
        email: '',
        username: '',
        password: '',
        role: 'user',
        status: 0,
    });

    // Show message
    const showMessage = (type: MessageType, text: string) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 5000);
    };

    // Load users list
    const loadUsers = async () => {
        try {
            setLoading(true);
            const res = await userApi.getList(page, pageSize);
            if (res.data.code === 0) {
                setUsers(res.data.data.results);
                setTotal(res.data.data.pagination.total);
                setTotalPages(res.data.data.pagination.totalPages);
            }
        } catch (error) {
            console.error('Failed to load users:', error);
            showMessage('error', 'Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadUsers();
    }, [page]);

    // Open create modal
    const handleCreate = () => {
        setModalMode('create');
        setFormData({
            email: '',
            username: '',
            password: '',
            role: 'user',
            status: 0,
        });
        setShowModal(true);
    };

    // Open edit modal
    const handleEdit = (user: User) => {
        setModalMode('edit');
        setEditingUser(user);
        setFormData({
            email: user.email || '',
            username: user.username || '',
            password: '', // Leave empty to update only when filled
            role: user.role,
            status: user.status,
        });
        setShowModal(true);
    };

    // Submit form
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.email?.trim() && !formData.username?.trim()) {
            showMessage('error', 'Please provide at least an email or username');
            return;
        }

        if (modalMode === 'create' && !formData.password?.trim()) {
            showMessage('error', 'Please enter a password');
            return;
        }

        try {
            setLoading(true);

            if (modalMode === 'create') {
                const res = await userApi.create(formData);
                if (res.data.code === 0) {
                    showMessage('success', 'Created successfully');
                    setShowModal(false);
                    loadUsers();
                } else {
                    showMessage('error', res.data.message || 'Create failed');
                }
            } else if (editingUser) {
                const updateData: UpdateUserRequest = {
                    email: formData.email || undefined,
                    username: formData.username || undefined,
                    password: formData.password || undefined,
                    role: formData.role,
                    status: formData.status,
                };
                const res = await userApi.update(editingUser.id, updateData);
                if (res.data.code === 0) {
                    showMessage('success', 'Updated successfully');
                    setShowModal(false);
                    loadUsers();
                } else {
                    showMessage('error', res.data.message || 'Update failed');
                }
            }
        } catch (error: unknown) {
            const message = error && typeof error === 'object' && 'response' in error
                ? (error.response as { data?: { message?: string } })?.data?.message || 'Operation failed'
                : 'Operation failed';
            showMessage('error', message);
        } finally {
            setLoading(false);
        }
    };

    // Delete user
    const handleDelete = async (user: User) => {
        try {
            setLoading(true);
            const res = await userApi.delete(user.id);
            if (res.data.code === 0) {
                showMessage('success', 'Deleted successfully');
                setDeletingUser(null);
                loadUsers();
            } else {
                showMessage('error', res.data.message || 'Delete failed');
            }
        } catch (error: unknown) {
            const message = error && typeof error === 'object' && 'response' in error
                ? (error.response as { data?: { message?: string } })?.data?.message || 'Delete failed'
                : 'Delete failed';
            showMessage('error', message);
        } finally {
            setLoading(false);
        }
    };

    // Format time
    const formatTime = (timestamp: number) => {
        return new Date(timestamp * 1000).toLocaleString('en-US');
    };

    // Role display
    const getRoleBadge = (role: string) => {
        switch (role) {
            case 'admin':
                return <span className="badge badge-error">Admin</span>;
            case 'user':
                return <span className="badge badge-primary">User</span>;
            default:
                return <span className="badge">{role}</span>;
        }
    };

    return (
        <div className="p-6">
            {/* 消息提示 */}
            {message && (
                <div className="toast toast-top toast-center z-50">
                    <div className={`alert ${
                        message.type === 'success' ? 'alert-success' :
                            message.type === 'error' ? 'alert-error' :
                                'alert-info'
                    } shadow-lg`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                            {message.type === 'success' ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            ) : message.type === 'error' ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            )}
                        </svg>
                        <span>{message.text}</span>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold">User Management</h1>
                    <p className="text-sm text-gray-500 mt-1">Total {total} users</p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={handleCreate}
                    disabled={loading}
                >
                    + Add User
                </button>
            </div>

            {/* 用户列表 */}
            <div className="overflow-x-auto bg-base-100 rounded-lg shadow">
                <table className="table table-zebra w-full">
                    <thead>
                    <tr>
                        <th>ID</th>
                        <th>Email</th>
                        <th>Username</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Created At</th>
                        <th>Actions</th>
                    </tr>
                    </thead>
                    <tbody>
                    {loading && users.length === 0 ? (
                        <tr>
                            <td colSpan={7} className="text-center py-8">
                                <span className="loading loading-spinner loading-lg"></span>
                            </td>
                        </tr>
                    ) : users.length === 0 ? (
                        <tr>
                            <td colSpan={7} className="text-center py-8 text-gray-500">
                                No users found
                            </td>
                        </tr>
                    ) : (
                        users.map((user) => (
                            <tr key={user.id}>
                                <td>{user.id}</td>
                                <td>{user.email || '-'}</td>
                                <td>{user.username || '-'}</td>
                                <td>{getRoleBadge(user.role)}</td>
                                <td>
                                        <span className={`badge ${user.status === 0 ? 'badge-success' : 'badge-error'}`}>
                                            {user.status === 0 ? 'Active' : 'Disabled'}
                                        </span>
                                </td>
                                <td className="text-sm text-gray-500">
                                    {formatTime(user.created_at)}
                                </td>
                                <td>
                                    <div className="flex gap-2">
                                        <button
                                            className="btn btn-sm btn-ghost"
                                            onClick={() => handleEdit(user)}
                                            disabled={loading}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            className="btn btn-sm btn-ghost text-error hover:bg-error hover:text-white"
                                            onClick={() => setDeletingUser(user)}
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
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1 || loading}
                        >
                            «
                        </button>
                        <button className="join-item btn">
                            Page {page} / {totalPages}
                        </button>
                        <button
                            className="join-item btn"
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages || loading}
                        >
                            »
                        </button>
                    </div>
                </div>
            )}

            {/* 删除确认弹窗 */}
            {deletingUser && (
                <div className="modal modal-open">
                    <div className="modal-box">
                        <h3 className="font-bold text-lg mb-4">Confirm Delete</h3>
                        <p className="py-4">
                            Are you sure you want to delete user <span className="font-bold">"{deletingUser.email || deletingUser.username}"</span>?
                        </p>
                        <div className="modal-action">
                            <button
                                className="btn btn-ghost"
                                onClick={() => setDeletingUser(null)}
                                disabled={loading}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-error"
                                onClick={() => handleDelete(deletingUser)}
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <span className="loading loading-spinner loading-sm"></span>
                                        Deleting...
                                    </>
                                ) : (
                                    'Confirm Delete'
                                )}
                            </button>
                        </div>
                    </div>
                    <div className="modal-backdrop" onClick={() => !loading && setDeletingUser(null)}></div>
                </div>
            )}

            {/* 创建/编辑弹窗 */}
            {showModal && (
                <div className="modal modal-open">
                    <div className="modal-box max-w-lg">
                        <h3 className="font-bold text-lg mb-6">
                            {modalMode === 'create' ? 'Add User' : 'Edit User'}
                        </h3>

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text font-medium">Email</span>
                                </label>
                                <input
                                    type="email"
                                    placeholder="user@example.com"
                                    className="input input-bordered w-full focus:input-primary"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    autoFocus
                                />
                            </div>

                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text font-medium">Username</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="username"
                                    className="input input-bordered w-full focus:input-primary"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                />
                                <label className="label">
                                    <span className="label-text-alt text-gray-500">Provide at least an email or username</span>
                                </label>
                            </div>

                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text font-medium">
                                        Password {modalMode === 'create' && <span className="text-error">*</span>}
                                    </span>
                                </label>
                                <input
                                    type="password"
                                    placeholder={modalMode === 'edit' ? 'Leave blank to keep unchanged' : 'Enter password'}
                                    className="input input-bordered w-full focus:input-primary"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                />
                                {modalMode === 'edit' && (
                                    <label className="label">
                                        <span className="label-text-alt text-gray-500">Leave blank to keep password unchanged</span>
                                    </label>
                                )}
                            </div>

                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text font-medium">Role</span>
                                </label>
                                <select
                                    className="select select-bordered w-full focus:select-primary"
                                    value={formData.role}
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                >
                                    <option value="user">User</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>

                            <div className="divider my-2"></div>

                            <div className="form-control">
                                <label className="label cursor-pointer justify-start gap-3 py-3 px-4 rounded-lg hover:bg-base-200 transition-colors">
                                    <input
                                        type="checkbox"
                                        className="checkbox checkbox-primary"
                                        checked={formData.status === 0}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            status: e.target.checked ? 0 : 1
                                        })}
                                    />
                                    <div className="flex flex-col">
                                        <span className="label-text font-medium">Enable this user</span>
                                        <span className="label-text-alt text-gray-500">Enabled users can log in normally</span>
                                    </div>
                                </label>
                            </div>

                            <div className="modal-action mt-6">
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={() => setShowModal(false)}
                                    disabled={loading}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <>
                                            <span className="loading loading-spinner loading-sm"></span>
                                            Submitting...
                                        </>
                                    ) : (
                                        modalMode === 'create' ? 'Create' : 'Save'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                    <div className="modal-backdrop" onClick={() => !loading && setShowModal(false)}></div>
                </div>
            )}
        </div>
    );
}