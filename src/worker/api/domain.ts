
import {Hono} from "hono";
import {ErrorCode, HttpResponseJsonBody} from "../util";

// 定义类型
interface Domain {
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

interface DomainWithLinkCount extends Domain {
    link_count: number;
}

interface DomainListResponse {
    results: Domain[];
    pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
}

interface CreateDomainRequest {
    host: string;
    is_active?: number;
    is_default?: number;
    notes?: string;
    error_template_id?: number;
    password_template_id?: number;
    interstitial_template_id?: number;
}

interface UpdateDomainRequest {
    host?: string;
    is_active?: number;
    is_default?: number;
    notes?: string;
    error_template_id?: number | null;
    password_template_id?: number | null;
    interstitial_template_id?: number | null;
}

type DBParam = string | number | null;

const app = new Hono<{ Bindings: Env }>()

// 获取域名列表
app.get('/list', async (c) => {
    try {
        const db = c.env.shorturl;

        // 获取分页参数
        const page = parseInt(c.req.query('page') || '1');
        const pageSize = parseInt(c.req.query('pageSize') || '10');
        const offset = (page - 1) * pageSize;

        // 查询总数
        const countResult = await db.prepare(`
            SELECT COUNT(*) as total FROM domains
        `).first<{ total: number }>();

        const total = countResult?.total || 0;

        // 查询分页数据
        const result = await db.prepare(`
            SELECT
                id,
                host,
                is_active,
                is_default,
                notes,
                error_template_id,
                password_template_id,
                interstitial_template_id,
                created_at,
                updated_at
            FROM domains
            ORDER BY is_default DESC, created_at DESC
            LIMIT ? OFFSET ?
        `).bind(pageSize, offset).all();

        const response: HttpResponseJsonBody<DomainListResponse> = {
            code: ErrorCode.SUCCESS,
            message: '查询成功',
            data: {
                results: result.results as unknown as Domain[],
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
        console.error('查询域名列表失败:', error);
        const response: HttpResponseJsonBody = {
            code: ErrorCode.UNKNOWN_ERROR,
            message: '查询域名列表失败'
        };
        return c.json(response, 500);
    }
})

// 创建域名
app.post('/create', async (c) => {
    try {
        const db = c.env.shorturl;
        const body = await c.req.json<CreateDomainRequest>();

        // 参数验证
        if (!body.host || !body.host.trim()) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '域名不能为空'
            };
            return c.json(response, 400);
        }

        // 检查域名是否已存在
        const existing = await db.prepare(`
            SELECT id FROM domains WHERE host = ?
        `).bind(body.host.trim()).first();

        if (existing) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '域名已存在'
            };
            return c.json(response, 409);
        }

        const now = Math.floor(Date.now() / 1000);
        const isDefault = body.is_default || 0;

        // 如果设置为默认域名，需要先取消其他默认域名
        if (isDefault === 1) {
            await db.prepare(`
                UPDATE domains SET is_default = 0 WHERE is_default = 1
            `).run();
        }

        // 插入新域名
        const result = await db.prepare(`
            INSERT INTO domains (
                host,
                is_active,
                is_default,
                notes,
                error_template_id,
                password_template_id,
                interstitial_template_id,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            body.host.trim(),
            body.is_active ?? 0,
            isDefault,
            body.notes || null,
            body.error_template_id || null,
            body.password_template_id || null,
            body.interstitial_template_id || null,
            now,
            now
        ).run();

        // 查询新创建的域名
        const newDomain = await db.prepare(`
            SELECT * FROM domains WHERE id = ?
        `).bind(result.meta.last_row_id).first<Domain>();

        const response: HttpResponseJsonBody<Domain> = {
            code: ErrorCode.SUCCESS,
            message: '域名创建成功',
            data: newDomain || undefined
        };

        return c.json(response, 201);
    } catch (error) {
        console.error('创建域名失败:', error);
        const response: HttpResponseJsonBody = {
            code: ErrorCode.UNKNOWN_ERROR,
            message: '创建域名失败'
        };
        return c.json(response, 500);
    }
})

// 更新域名
app.put('/update/:id', async (c) => {
    try {
        const db = c.env.shorturl;
        const id = parseInt(c.req.param('id'));
        const body = await c.req.json<UpdateDomainRequest>();

        if (isNaN(id)) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '无效的域名 ID'
            };
            return c.json(response, 400);
        }

        // 检查域名是否存在
        const existing = await db.prepare(`
            SELECT * FROM domains WHERE id = ?
        `).bind(id).first<Domain>();

        if (!existing) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '域名不存在'
            };
            return c.json(response, 404);
        }

        // 如果修改 host，检查新域名是否重复
        if (body.host && body.host.trim() !== existing.host) {
            const duplicate = await db.prepare(`
                SELECT id FROM domains WHERE host = ? AND id != ?
            `).bind(body.host.trim(), id).first();

            if (duplicate) {
                const response: HttpResponseJsonBody = {
                    code: ErrorCode.DATA_INPUT_ERROR,
                    message: '域名已存在'
                };
                return c.json(response, 409);
            }
        }

        // 如果设置为默认域名，取消其他默认域名
        if (body.is_default === 1) {
            await db.prepare(`
                UPDATE domains SET is_default = 0 WHERE is_default = 1 AND id != ?
            `).bind(id).run();
        }

        const now = Math.floor(Date.now() / 1000);

        // 构建更新语句
        const updates: string[] = [];
        const params: DBParam[] = [];

        if (body.host !== undefined) {
            updates.push('host = ?');
            params.push(body.host.trim());
        }
        if (body.is_active !== undefined) {
            updates.push('is_active = ?');
            params.push(body.is_active);
        }
        if (body.is_default !== undefined) {
            updates.push('is_default = ?');
            params.push(body.is_default);
        }
        if (body.notes !== undefined) {
            updates.push('notes = ?');
            params.push(body.notes || null);
        }
        if (body.error_template_id !== undefined) {
            updates.push('error_template_id = ?');
            params.push(body.error_template_id);
        }
        if (body.password_template_id !== undefined) {
            updates.push('password_template_id = ?');
            params.push(body.password_template_id);
        }
        if (body.interstitial_template_id !== undefined) {
            updates.push('interstitial_template_id = ?');
            params.push(body.interstitial_template_id);
        }

        updates.push('updated_at = ?');
        params.push(now);
        params.push(id);

        await db.prepare(`
            UPDATE domains SET ${updates.join(', ')} WHERE id = ?
        `).bind(...params).run();

        // 查询更新后的数据
        const updated = await db.prepare(`
            SELECT * FROM domains WHERE id = ?
        `).bind(id).first<Domain>();

        const response: HttpResponseJsonBody<Domain> = {
            code: ErrorCode.SUCCESS,
            message: '域名更新成功',
            data: updated || undefined
        };

        return c.json(response);
    } catch (error) {
        console.error('更新域名失败:', error);
        const response: HttpResponseJsonBody = {
            code: ErrorCode.UNKNOWN_ERROR,
            message: '更新域名失败'
        };
        return c.json(response, 500);
    }
})

// 删除域名
app.delete('/delete/:id', async (c) => {
    try {
        const db = c.env.shorturl;
        const id = parseInt(c.req.param('id'));

        if (isNaN(id)) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '无效的域名 ID'
            };
            return c.json(response, 400);
        }

        // 检查域名是否存在
        const existing = await db.prepare(`
            SELECT * FROM domains WHERE id = ?
        `).bind(id).first<Domain>();

        if (!existing) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '域名不存在'
            };
            return c.json(response, 404);
        }

        // 检查是否为默认域名
        if (existing.is_default === 1) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '不能删除默认域名，请先设置其他域名为默认'
            };
            return c.json(response, 400);
        }

        // 检查是否有关联的短链接
        const linkCount = await db.prepare(`
            SELECT COUNT(*) as count FROM short_links WHERE domain_id = ? AND deleted_at IS NULL
        `).bind(id).first<{ count: number }>();

        if (linkCount && linkCount.count > 0) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: `该域名下还有 ${linkCount.count} 个短链接，无法删除`
            };
            return c.json(response, 400);
        }

        // 删除域名
        await db.prepare(`
            DELETE FROM domains WHERE id = ?
        `).bind(id).run();

        const response: HttpResponseJsonBody = {
            code: ErrorCode.SUCCESS,
            message: '域名删除成功'
        };

        return c.json(response);
    } catch (error) {
        console.error('删除域名失败:', error);
        const response: HttpResponseJsonBody = {
            code: ErrorCode.UNKNOWN_ERROR,
            message: '删除域名失败'
        };
        return c.json(response, 500);
    }
})

// 获取单个域名详情
app.get('/detail/:id', async (c) => {
    try {
        const db = c.env.shorturl;
        const id = parseInt(c.req.param('id'));

        if (isNaN(id)) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '无效的域名 ID'
            };
            return c.json(response, 400);
        }

        const domain = await db.prepare(`
            SELECT * FROM domains WHERE id = ?
        `).bind(id).first<Domain>();

        if (!domain) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '域名不存在'
            };
            return c.json(response, 404);
        }

        // 查询关联的短链接数量
        const linkCount = await db.prepare(`
            SELECT COUNT(*) as count FROM short_links WHERE domain_id = ? AND deleted_at IS NULL
        `).bind(id).first<{ count: number }>();

        const domainWithCount: DomainWithLinkCount = {
            ...domain,
            link_count: linkCount?.count || 0
        };

        const response: HttpResponseJsonBody<DomainWithLinkCount> = {
            code: ErrorCode.SUCCESS,
            message: '查询成功',
            data: domainWithCount
        };

        return c.json(response);
    } catch (error) {
        console.error('查询域名详情失败:', error);
        const response: HttpResponseJsonBody = {
            code: ErrorCode.UNKNOWN_ERROR,
            message: '查询域名详情失败'
        };
        return c.json(response, 500);
    }
})

export default app;