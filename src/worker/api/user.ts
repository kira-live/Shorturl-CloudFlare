
import {Hono} from "hono";
import {ErrorCode, HttpResponseJsonBody, Variables,CurrentUser} from "../util";

// 定义类型
interface User {
    id: number;
    email: string | null;
    username: string | null;
    role: string;
    status: number;
    deleted_at: number | null;
    created_at: number;
    updated_at: number;
}

interface UserListResponse {
    results: User[];
    pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
}

interface CreateUserRequest {
    email?: string;
    username?: string;
    password: string;
    role?: string;
    status?: number;
}

interface UpdateUserRequest {
    email?: string;
    username?: string;
    password?: string;
    role?: string;
    status?: number;
}

type DBParam = string | number | null;

const app = new Hono<{Variables: Variables ; Bindings: Env }>()

// 获取用户列表
app.get('/list', async (c) => {
    try {
        const db = c.env.shorturl;

        // 获取分页参数
        const page = parseInt(c.req.query('page') || '1');
        const pageSize = parseInt(c.req.query('pageSize') || '10');
        const offset = (page - 1) * pageSize;

        // 查询总数（不包括已删除的）
        const countResult = await db.prepare(`
            SELECT COUNT(*) as total FROM users WHERE deleted_at IS NULL
        `).first<{ total: number }>();

        const total = countResult?.total || 0;

        // 查询分页数据（不返回密码哈希）
        const result = await db.prepare(`
            SELECT
                id,
                email,
                username,
                role,
                status,
                deleted_at,
                created_at,
                updated_at
            FROM users
            WHERE deleted_at IS NULL
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `).bind(pageSize, offset).all();

        const response: HttpResponseJsonBody<UserListResponse> = {
            code: ErrorCode.SUCCESS,
            message: '查询成功',
            data: {
                results: result.results as unknown as User[],
                pagination: {
                    page,
                    pageSize,
                    total,
                    totalPages: Math.ceil(total / pageSize)
                }
            }
        };

        return c.json(response);
    } catch (error) {
        console.error('查询用户列表失败:', error);
        const response: HttpResponseJsonBody = {
            code: ErrorCode.UNKNOWN_ERROR,
            message: '查询用户列表失败'
        };
        return c.json(response, 500);
    }
})

// 创建用户
app.post('/create', async (c) => {
    try {
        const db = c.env.shorturl;
        const body = await c.req.json<CreateUserRequest>();

        // 参数验证
        if (!body.password || !body.password.trim()) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '密码不能为空'
            };
            return c.json(response, 400);
        }

        if (!body.email && !body.username) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '邮箱或用户名至少填写一个'
            };
            return c.json(response, 400);
        }

        // 检查邮箱是否已存在
        if (body.email) {
            const existingEmail = await db.prepare(`
                SELECT id FROM users WHERE email = ? AND deleted_at IS NULL
            `).bind(body.email.trim()).first();

            if (existingEmail) {
                const response: HttpResponseJsonBody = {
                    code: ErrorCode.DATA_INPUT_ERROR,
                    message: '邮箱已存在'
                };
                return c.json(response, 409);
            }
        }

        // 检查用户名是否已存在
        if (body.username) {
            const existingUsername = await db.prepare(`
                SELECT id FROM users WHERE username = ? AND deleted_at IS NULL
            `).bind(body.username.trim()).first();

            if (existingUsername) {
                const response: HttpResponseJsonBody = {
                    code: ErrorCode.DATA_INPUT_ERROR,
                    message: '用户名已存在'
                };
                return c.json(response, 409);
            }
        }

        const now = Math.floor(Date.now() / 1000);
        
        // 密码哈希
        const { hashSync } = await import('bcryptjs');
        const passwordHash = hashSync(body.password, 10);

        // 插入新用户
        const result = await db.prepare(`
            INSERT INTO users (
                email,
                username,
                password_hash,
                role,
                status,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
            body.email?.trim() || null,
            body.username?.trim() || null,
            passwordHash,
            body.role || 'user',
            body.status ?? 0,
            now,
            now
        ).run();

        // 查询新创建的用户（不返回密码哈希）
        const newUser = await db.prepare(`
            SELECT id, email, username, role, status, deleted_at, created_at, updated_at 
            FROM users WHERE id = ?
        `).bind(result.meta.last_row_id).first<User>();

        const response: HttpResponseJsonBody<User> = {
            code: ErrorCode.SUCCESS,
            message: '用户创建成功',
            data: newUser || undefined
        };

        return c.json(response, 201);
    } catch (error) {
        console.error('创建用户失败:', error);
        const response: HttpResponseJsonBody = {
            code: ErrorCode.UNKNOWN_ERROR,
            message: '创建用户失败'
        };
        return c.json(response, 500);
    }
})

// 更新用户
app.put('/update/:id', async (c) => {
    try {
        const db = c.env.shorturl;
        const id = parseInt(c.req.param('id'));
        const body = await c.req.json<UpdateUserRequest>();

        if (isNaN(id)) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '无效的用户 ID'
            };
            return c.json(response, 400);
        }

        // 检查用户是否存在
        const existing = await db.prepare(`
            SELECT * FROM users WHERE id = ? AND deleted_at IS NULL
        `).bind(id).first<User & { password_hash: string }>();

        if (!existing) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '用户不存在'
            };
            return c.json(response, 404);
        }

        // 如果修改 email，检查是否重复
        if (body.email && body.email.trim() !== existing.email) {
            const duplicate = await db.prepare(`
                SELECT id FROM users WHERE email = ? AND id != ? AND deleted_at IS NULL
            `).bind(body.email.trim(), id).first();

            if (duplicate) {
                const response: HttpResponseJsonBody = {
                    code: ErrorCode.DATA_INPUT_ERROR,
                    message: '邮箱已存在'
                };
                return c.json(response, 409);
            }
        }

        // 如果修改 username，检查是否重复
        if (body.username && body.username.trim() !== existing.username) {
            const duplicate = await db.prepare(`
                SELECT id FROM users WHERE username = ? AND id != ? AND deleted_at IS NULL
            `).bind(body.username.trim(), id).first();

            if (duplicate) {
                const response: HttpResponseJsonBody = {
                    code: ErrorCode.DATA_INPUT_ERROR,
                    message: '用户名已存在'
                };
                return c.json(response, 409);
            }
        }

        const now = Math.floor(Date.now() / 1000);

        // 构建更新语句
        const updates: string[] = [];
        const params: DBParam[] = [];

        if (body.email !== undefined) {
            updates.push('email = ?');
            params.push(body.email?.trim() || null);
        }
        if (body.username !== undefined) {
            updates.push('username = ?');
            params.push(body.username?.trim() || null);
        }
        if (body.password) {
            updates.push('password_hash = ?');
            const { hashSync } = await import('bcryptjs');
            const passwordHash = hashSync(body.password, 10);
            params.push(passwordHash);
        }
        if (body.role !== undefined) {
            updates.push('role = ?');
            params.push(body.role);
        }
        if (body.status !== undefined) {
            updates.push('status = ?');
            params.push(body.status);
        }

        updates.push('updated_at = ?');
        params.push(now);
        params.push(id);

        await db.prepare(`
            UPDATE users SET ${updates.join(', ')} WHERE id = ?
        `).bind(...params).run();

        // 查询更新后的数据（不返回密码哈希）
        const updated = await db.prepare(`
            SELECT id, email, username, role, status, deleted_at, created_at, updated_at 
            FROM users WHERE id = ?
        `).bind(id).first<User>();

        const response: HttpResponseJsonBody<User> = {
            code: ErrorCode.SUCCESS,
            message: '用户更新成功',
            data: updated || undefined
        };

        return c.json(response);
    } catch (error) {
        console.error('更新用户失败:', error);
        const response: HttpResponseJsonBody = {
            code: ErrorCode.UNKNOWN_ERROR,
            message: '更新用户失败'
        };
        return c.json(response, 500);
    }
})

// 删除用户（软删除）
app.delete('/delete/:id', async (c) => {
    try {
        const db = c.env.shorturl;
        const id = parseInt(c.req.param('id'));

        if (isNaN(id)) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '无效的用户 ID'
            };
            return c.json(response, 400);
        }

        // 检查用户是否存在
        const existing = await db.prepare(`
            SELECT * FROM users WHERE id = ? AND deleted_at IS NULL
        `).bind(id).first<User>();

        if (!existing) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '用户不存在'
            };
            return c.json(response, 404);
        }

        const now = Math.floor(Date.now() / 1000);

        // 软删除用户
        await db.prepare(`
            UPDATE users SET deleted_at = ? WHERE id = ?
        `).bind(now, id).run();

        const response: HttpResponseJsonBody = {
            code: ErrorCode.SUCCESS,
            message: '用户删除成功'
        };

        return c.json(response);
    } catch (error) {
        console.error('删除用户失败:', error);
        const response: HttpResponseJsonBody = {
            code: ErrorCode.UNKNOWN_ERROR,
            message: '删除用户失败'
        };
        return c.json(response, 500);
    }
})

// 获取单个用户详情
app.get('/detail/:id', async (c) => {
    try {
        const db = c.env.shorturl;
        const id = parseInt(c.req.param('id'));

        if (isNaN(id)) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '无效的用户 ID'
            };
            return c.json(response, 400);
        }

        const user = await db.prepare(`
            SELECT id, email, username, role, status, deleted_at, created_at, updated_at 
            FROM users WHERE id = ? AND deleted_at IS NULL
        `).bind(id).first<User>();

        if (!user) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '用户不存在'
            };
            return c.json(response, 404);
        }

        const response: HttpResponseJsonBody<User> = {
            code: ErrorCode.SUCCESS,
            message: '查询成功',
            data: user
        };

        return c.json(response);
    } catch (error) {
        console.error('查询用户详情失败:', error);
        const response: HttpResponseJsonBody = {
            code: ErrorCode.UNKNOWN_ERROR,
            message: '查询用户详情失败'
        };
        return c.json(response, 500);
    }
})

// 获取当前用户信息
app.get('/me', async (c) => {
    try {
        const db = c.env.shorturl;
        // 直接从上下文获取当前用户信息
        const currentUser = c.get('currentUser') as CurrentUser;
        const userId = currentUser.id;

        const user = await db.prepare(`
            SELECT id, email, username, role, status, deleted_at, created_at, updated_at 
            FROM users WHERE id = ? AND deleted_at IS NULL
        `).bind(userId).first<User>();

        if (!user) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '用户不存在'
            };
            return c.json(response, 404);
        }

        const response: HttpResponseJsonBody<User> = {
            code: ErrorCode.SUCCESS,
            message: '查询成功',
            data: user
        };

        return c.json(response);
    } catch (error) {
        console.error('查询当前用户信息失败:', error);
        const response: HttpResponseJsonBody = {
            code: ErrorCode.UNKNOWN_ERROR,
            message: '查询用户信息失败'
        };
        return c.json(response, 500);
    }
})

// 修改当前用户信息(不包括密码)
app.put('/me', async (c) => {
    try {
        const db = c.env.shorturl;
        // 直接从上下文获取当前用户信息
        const currentUser = c.get('currentUser') as CurrentUser;
        const userId = currentUser.id;

        const body = await c.req.json<{ email?: string }>();

        // 检查用户是否存在
        const existing = await db.prepare(`
            SELECT * FROM users WHERE id = ? AND deleted_at IS NULL
        `).bind(userId).first<User>();

        if (!existing) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '用户不存在'
            };
            return c.json(response, 404);
        }

        // 如果修改 email,检查是否重复
        if (body.email && body.email.trim() !== existing.email) {
            const duplicate = await db.prepare(`
                SELECT id FROM users WHERE email = ? AND id != ? AND deleted_at IS NULL
            `).bind(body.email.trim(), userId).first();

            if (duplicate) {
                const response: HttpResponseJsonBody = {
                    code: ErrorCode.DATA_INPUT_ERROR,
                    message: '邮箱已存在'
                };
                return c.json(response, 409);
            }
        }

        const now = Math.floor(Date.now() / 1000);

        // 构建更新语句(不允许修改用户名、密码、角色、状态)
        const updates: string[] = [];
        const params: DBParam[] = [];

        if (body.email !== undefined) {
            updates.push('email = ?');
            params.push(body.email?.trim() || null);
        }

        if (updates.length === 0) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '没有需要更新的字段'
            };
            return c.json(response, 400);
        }

        updates.push('updated_at = ?');
        params.push(now);
        params.push(userId);

        await db.prepare(`
            UPDATE users SET ${updates.join(', ')} WHERE id = ?
        `).bind(...params).run();

        // 查询更新后的数据
        const updated = await db.prepare(`
            SELECT id, email, username, role, status, deleted_at, created_at, updated_at 
            FROM users WHERE id = ?
        `).bind(userId).first<User>();

        const response: HttpResponseJsonBody<User> = {
            code: ErrorCode.SUCCESS,
            message: '信息更新成功',
            data: updated || undefined
        };

        return c.json(response);
    } catch (error) {
        console.error('更新用户信息失败:', error);
        const response: HttpResponseJsonBody = {
            code: ErrorCode.UNKNOWN_ERROR,
            message: '更新用户信息失败'
        };
        return c.json(response, 500);
    }
})

// 修改当前用户密码(需验证旧密码)
app.put('/me/password', async (c) => {
    try {
        const db = c.env.shorturl;
        // 直接从上下文获取当前用户信息
        const currentUser = c.get('currentUser') as CurrentUser;
        const userId = currentUser.id;

        const body = await c.req.json<{
            oldPassword: string;
            newPassword: string;
        }>();

        // 参数验证
        if (!body.oldPassword || !body.newPassword) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '旧密码和新密码不能为空'
            };
            return c.json(response, 400);
        }

        if (body.newPassword.length < 6) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '新密码长度至少为6位'
            };
            return c.json(response, 400);
        }

        // 查询用户信息(包含密码哈希)
        const user = await db.prepare(`
            SELECT id, password_hash, deleted_at, status
            FROM users WHERE id = ?
        `).bind(userId).first<{
            id: number;
            password_hash: string | null;
            deleted_at: number | null;
            status: number;
        }>();

        if (!user || user.deleted_at !== null) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '用户不存在'
            };
            return c.json(response, 404);
        }

        if (user.status !== 0) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '用户已被禁用'
            };
            return c.json(response, 403);
        }

        // 验证旧密码
        const { compareSync } = await import('bcryptjs');
        const passwordHash = user.password_hash ?? '';
        let passwordCorrect = false;
        try {
            passwordCorrect = compareSync(body.oldPassword, passwordHash);
        } catch {
            passwordCorrect = false;
        }

        if (!passwordCorrect) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '旧密码错误'
            };
            return c.json(response, 200);
        }

        // 生成新密码哈希
        const { hashSync } = await import('bcryptjs');
        const newPasswordHash = hashSync(body.newPassword, 10);
        const now = Math.floor(Date.now() / 1000);

        // 更新密码
        await db.prepare(`
            UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?
        `).bind(newPasswordHash, now, userId).run();

        const response: HttpResponseJsonBody = {
            code: ErrorCode.SUCCESS,
            message: '密码修改成功'
        };

        return c.json(response);
    } catch (error) {
        console.error('修改密码失败:', error);
        const response: HttpResponseJsonBody = {
            code: ErrorCode.UNKNOWN_ERROR,
            message: '修改密码失败'
        };
        return c.json(response, 500);
    }
})

export default app;
