import { Hono } from "hono";
import { ErrorCode, HttpResponseJsonBody, Variables } from "../util";

// 短链接接口
interface ShortLink {
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

interface ShortLinkWithDomain extends ShortLink {
    domain_host: string;
    tags: TagInfo[];
}

interface TagInfo {
    id: number;
    name: string;
}

interface ShortLinkListResponse {
    results: ShortLinkWithDomain[];
    pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
}

interface CreateShortLinkRequest {
    domain_id: number;
    code?: string;             // 可选，不传则随机生成
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
    tags?: string[];           // 标签名数组
}

interface UpdateShortLinkRequest {
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

type DBParam = string | number | null;

// 生成随机短码
function generateCode(length: number = 6): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);
    for (let i = 0; i < length; i++) {
        result += chars[randomValues[i] % chars.length];
    }
    return result;
}

// 同步标签：确保标签存在并关联到短链接
async function syncTags(db: D1Database, shortLinkId: number, tagNames: string[]) {
    // 删除旧关联
    await db.prepare(`DELETE FROM short_link_tags WHERE short_link_id = ?`).bind(shortLinkId).run();

    if (tagNames.length === 0) return;

    const now = Math.floor(Date.now() / 1000);

    for (const name of tagNames) {
        const trimmed = name.trim();
        if (!trimmed) continue;

        // 确保标签存在（INSERT OR IGNORE）
        await db.prepare(`INSERT OR IGNORE INTO tags (name, created_at) VALUES (?, ?)`)
            .bind(trimmed, now).run();

        // 获取标签 ID
        const tag = await db.prepare(`SELECT id FROM tags WHERE name = ?`)
            .bind(trimmed).first<{ id: number }>();

        if (tag) {
            await db.prepare(`INSERT OR IGNORE INTO short_link_tags (short_link_id, tag_id, created_at) VALUES (?, ?, ?)`)
                .bind(shortLinkId, tag.id, now).run();
        }
    }
}

// 获取短链接的标签列表
async function getTagsForLink(db: D1Database, shortLinkId: number): Promise<TagInfo[]> {
    const result = await db.prepare(`
        SELECT t.id, t.name 
        FROM tags t 
        JOIN short_link_tags slt ON t.id = slt.tag_id 
        WHERE slt.short_link_id = ?
        ORDER BY t.name
    `).bind(shortLinkId).all<TagInfo>();
    return result.results || [];
}

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// 获取短链接列表
app.get('/list', async (c) => {
    try {
        const db = c.env.shorturl;

        const page = parseInt(c.req.query('page') || '1');
        const pageSize = parseInt(c.req.query('pageSize') || '10');
        const offset = (page - 1) * pageSize;

        // 筛选参数
        const domainId = c.req.query('domain_id');
        const keyword = c.req.query('keyword');       // 搜索短码/目标URL/备注
        const tagName = c.req.query('tag');
        const isDisabled = c.req.query('is_disabled');
        const orderBy = c.req.query('order_by') || 'created_at'; // created_at | total_clicks | last_access_at
        const orderDir = c.req.query('order_dir') === 'asc' ? 'ASC' : 'DESC';

        // 构建条件
        const conditions: string[] = ['sl.deleted_at IS NULL'];
        const params: DBParam[] = [];

        if (domainId) {
            conditions.push('sl.domain_id = ?');
            params.push(parseInt(domainId));
        }

        if (keyword) {
            conditions.push('(sl.code LIKE ? OR sl.target_url LIKE ? OR sl.remark LIKE ?)');
            const kw = `%${keyword}%`;
            params.push(kw, kw, kw);
        }

        if (tagName) {
            conditions.push(`sl.id IN (
                SELECT slt.short_link_id FROM short_link_tags slt
                JOIN tags t ON slt.tag_id = t.id
                WHERE t.name = ?
            )`);
            params.push(tagName);
        }

        if (isDisabled !== undefined && isDisabled !== '') {
            conditions.push('sl.is_disabled = ?');
            params.push(parseInt(isDisabled));
        }

        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        // 允许的排序字段白名单
        const allowedOrderFields: Record<string, string> = {
            'created_at': 'sl.created_at',
            'total_clicks': 'sl.total_clicks',
            'last_access_at': 'sl.last_access_at',
            'updated_at': 'sl.updated_at',
        };
        const orderField = allowedOrderFields[orderBy] || 'sl.created_at';

        // 查询总数
        const countResult = await db.prepare(
            `SELECT COUNT(*) as total FROM short_links sl ${whereClause}`
        ).bind(...params).first<{ total: number }>();

        const total = countResult?.total || 0;

        // 查询分页数据
        const result = await db.prepare(`
            SELECT sl.*, d.host as domain_host
            FROM short_links sl
            LEFT JOIN domains d ON sl.domain_id = d.id
            ${whereClause}
            ORDER BY ${orderField} ${orderDir}
            LIMIT ? OFFSET ?
        `).bind(...params, pageSize, offset).all<ShortLink & { domain_host: string }>();

        // 为每个短链接获取标签
        const linksWithTags: ShortLinkWithDomain[] = [];
        for (const link of result.results || []) {
            const tags = await getTagsForLink(db, link.id);
            linksWithTags.push({ ...link, tags });
        }

        const response: HttpResponseJsonBody<ShortLinkListResponse> = {
            code: ErrorCode.SUCCESS,
            message: '查询成功',
            data: {
                results: linksWithTags,
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
        console.error('查询短链接列表失败:', error);
        const response: HttpResponseJsonBody = {
            code: ErrorCode.UNKNOWN_ERROR,
            message: '查询短链接列表失败'
        };
        return c.json(response, 500);
    }
});

// 获取短链接详情
app.get('/detail/:id', async (c) => {
    try {
        const db = c.env.shorturl;
        const id = parseInt(c.req.param('id'));

        if (isNaN(id)) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '无效的短链接 ID'
            };
            return c.json(response, 400);
        }

        const link = await db.prepare(`
            SELECT sl.*, d.host as domain_host
            FROM short_links sl
            LEFT JOIN domains d ON sl.domain_id = d.id
            WHERE sl.id = ? AND sl.deleted_at IS NULL
        `).bind(id).first<ShortLink & { domain_host: string }>();

        if (!link) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '短链接不存在'
            };
            return c.json(response, 404);
        }

        const tags = await getTagsForLink(db, link.id);
        const linkWithTags: ShortLinkWithDomain = { ...link, tags };

        const response: HttpResponseJsonBody<ShortLinkWithDomain> = {
            code: ErrorCode.SUCCESS,
            message: '查询成功',
            data: linkWithTags
        };

        return c.json(response);
    } catch (error) {
        console.error('查询短链接详情失败:', error);
        const response: HttpResponseJsonBody = {
            code: ErrorCode.UNKNOWN_ERROR,
            message: '查询短链接详情失败'
        };
        return c.json(response, 500);
    }
});

// 创建短链接
app.post('/create', async (c) => {
    try {
        const db = c.env.shorturl;
        const body = await c.req.json<CreateShortLinkRequest>();
        const currentUser = c.get('currentUser');

        // 参数验证
        if (!body.target_url || !body.target_url.trim()) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '目标 URL 不能为空'
            };
            return c.json(response, 400);
        }

        if (!body.domain_id) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '域名 ID 不能为空'
            };
            return c.json(response, 400);
        }

        // 验证域名是否存在且启用
        const domain = await db.prepare(`
            SELECT id FROM domains WHERE id = ? AND is_active = 1
        `).bind(body.domain_id).first();

        if (!domain) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '域名不存在或已停用'
            };
            return c.json(response, 400);
        }

        // 验证跳转状态码
        const validHttpCodes = [301, 302, 307, 308];
        const httpCode = body.redirect_http_code || 302;
        if (!validHttpCodes.includes(httpCode)) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '无效的跳转状态码，仅支持 301/302/307/308'
            };
            return c.json(response, 400);
        }

        // 生成或使用自定义短码
        let code = body.code?.trim();
        if (code) {
            // 检查短码格式（只允许字母、数字、连字符、下划线）
            if (!/^[A-Za-z0-9_-]+$/.test(code)) {
                const response: HttpResponseJsonBody = {
                    code: ErrorCode.DATA_INPUT_ERROR,
                    message: '短码只能包含字母、数字、连字符和下划线'
                };
                return c.json(response, 400);
            }

            // 检查短码唯一性（同一域名下）
            const existing = await db.prepare(`
                SELECT id FROM short_links WHERE domain_id = ? AND code = ? AND deleted_at IS NULL
            `).bind(body.domain_id, code).first();

            if (existing) {
                const response: HttpResponseJsonBody = {
                    code: ErrorCode.DATA_INPUT_ERROR,
                    message: '该短码在此域名下已被使用'
                };
                return c.json(response, 409);
            }
        } else {
            // 自动生成短码，重试最多 10 次
            let attempts = 0;
            do {
                code = generateCode(6);
                const exists = await db.prepare(`
                    SELECT id FROM short_links WHERE domain_id = ? AND code = ?
                `).bind(body.domain_id, code).first();
                if (!exists) break;
                attempts++;
            } while (attempts < 10);

            if (attempts >= 10) {
                const response: HttpResponseJsonBody = {
                    code: ErrorCode.UNKNOWN_ERROR,
                    message: '短码生成失败，请重试'
                };
                return c.json(response, 500);
            }
        }

        const now = Math.floor(Date.now() / 1000);

        const result = await db.prepare(`
            INSERT INTO short_links (
                domain_id, code, target_url, owner_user_id,
                redirect_http_code, use_interstitial, interstitial_delay, force_interstitial,
                template_id, error_template_id, password_template_id,
                password, max_visits, expire_at,
                is_disabled, remark,
                created_at, updated_at, total_clicks
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 0)
        `).bind(
            body.domain_id,
            code,
            body.target_url.trim(),
            currentUser.id,
            httpCode,
            body.use_interstitial ?? 0,
            body.interstitial_delay ?? 0,
            body.force_interstitial ?? 0,
            body.template_id ?? null,
            body.error_template_id ?? null,
            body.password_template_id ?? null,
            body.password ?? null,
            body.max_visits ?? null,
            body.expire_at ?? null,
            body.remark ?? null,
            now,
            now
        ).run();

        const newId = result.meta.last_row_id;

        // 处理标签
        if (body.tags && body.tags.length > 0) {
            await syncTags(db, newId, body.tags);
        }

        // 查询新创建的短链接
        const newLink = await db.prepare(`
            SELECT sl.*, d.host as domain_host
            FROM short_links sl
            LEFT JOIN domains d ON sl.domain_id = d.id
            WHERE sl.id = ?
        `).bind(newId).first<ShortLink & { domain_host: string }>();

        const tags = await getTagsForLink(db, newId);

        const response: HttpResponseJsonBody<ShortLinkWithDomain> = {
            code: ErrorCode.SUCCESS,
            message: '短链接创建成功',
            data: newLink ? { ...newLink, tags } : undefined
        };

        return c.json(response, 201);
    } catch (error) {
        console.error('创建短链接失败:', error);
        const response: HttpResponseJsonBody = {
            code: ErrorCode.UNKNOWN_ERROR,
            message: '创建短链接失败'
        };
        return c.json(response, 500);
    }
});

// 更新短链接
app.put('/update/:id', async (c) => {
    try {
        const db = c.env.shorturl;
        const id = parseInt(c.req.param('id'));
        const body = await c.req.json<UpdateShortLinkRequest>();

        if (isNaN(id)) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '无效的短链接 ID'
            };
            return c.json(response, 400);
        }

        // 检查短链接是否存在
        const existing = await db.prepare(`
            SELECT * FROM short_links WHERE id = ? AND deleted_at IS NULL
        `).bind(id).first<ShortLink>();

        if (!existing) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '短链接不存在'
            };
            return c.json(response, 404);
        }

        // 如果修改了域名，验证新域名
        const targetDomainId = body.domain_id ?? existing.domain_id;
        if (body.domain_id !== undefined && body.domain_id !== existing.domain_id) {
            const domain = await db.prepare(`
                SELECT id FROM domains WHERE id = ? AND is_active = 0
            `).bind(body.domain_id).first();

            if (!domain) {
                const response: HttpResponseJsonBody = {
                    code: ErrorCode.DATA_INPUT_ERROR,
                    message: '域名不存在或已停用'
                };
                return c.json(response, 400);
            }
        }

        // 如果修改了短码，检查唯一性
        if (body.code !== undefined) {
            const newCode = body.code.trim();
            if (!/^[A-Za-z0-9_-]+$/.test(newCode)) {
                const response: HttpResponseJsonBody = {
                    code: ErrorCode.DATA_INPUT_ERROR,
                    message: '短码只能包含字母、数字、连字符和下划线'
                };
                return c.json(response, 400);
            }

            if (newCode !== existing.code || targetDomainId !== existing.domain_id) {
                const duplicate = await db.prepare(`
                    SELECT id FROM short_links WHERE domain_id = ? AND code = ? AND id != ? AND deleted_at IS NULL
                `).bind(targetDomainId, newCode, id).first();

                if (duplicate) {
                    const response: HttpResponseJsonBody = {
                        code: ErrorCode.DATA_INPUT_ERROR,
                        message: '该短码在此域名下已被使用'
                    };
                    return c.json(response, 409);
                }
            }
        }

        // 验证跳转状态码
        if (body.redirect_http_code !== undefined) {
            const validHttpCodes = [301, 302, 307, 308];
            if (!validHttpCodes.includes(body.redirect_http_code)) {
                const response: HttpResponseJsonBody = {
                    code: ErrorCode.DATA_INPUT_ERROR,
                    message: '无效的跳转状态码，仅支持 301/302/307/308'
                };
                return c.json(response, 400);
            }
        }

        const now = Math.floor(Date.now() / 1000);

        // 构建动态更新语句
        const updates: string[] = [];
        const params: DBParam[] = [];

        if (body.domain_id !== undefined) {
            updates.push('domain_id = ?');
            params.push(body.domain_id);
        }
        if (body.code !== undefined) {
            updates.push('code = ?');
            params.push(body.code.trim());
        }
        if (body.target_url !== undefined) {
            updates.push('target_url = ?');
            params.push(body.target_url.trim());
        }
        if (body.redirect_http_code !== undefined) {
            updates.push('redirect_http_code = ?');
            params.push(body.redirect_http_code);
        }
        if (body.use_interstitial !== undefined) {
            updates.push('use_interstitial = ?');
            params.push(body.use_interstitial);
        }
        if (body.interstitial_delay !== undefined) {
            updates.push('interstitial_delay = ?');
            params.push(body.interstitial_delay);
        }
        if (body.force_interstitial !== undefined) {
            updates.push('force_interstitial = ?');
            params.push(body.force_interstitial);
        }
        if (body.template_id !== undefined) {
            updates.push('template_id = ?');
            params.push(body.template_id);
        }
        if (body.error_template_id !== undefined) {
            updates.push('error_template_id = ?');
            params.push(body.error_template_id);
        }
        if (body.password_template_id !== undefined) {
            updates.push('password_template_id = ?');
            params.push(body.password_template_id);
        }
        if (body.password !== undefined) {
            updates.push('password = ?');
            params.push(body.password);
        }
        if (body.max_visits !== undefined) {
            updates.push('max_visits = ?');
            params.push(body.max_visits);
        }
        if (body.expire_at !== undefined) {
            updates.push('expire_at = ?');
            params.push(body.expire_at);
        }
        if (body.is_disabled !== undefined) {
            updates.push('is_disabled = ?');
            params.push(body.is_disabled);
        }
        if (body.remark !== undefined) {
            updates.push('remark = ?');
            params.push(body.remark);
        }

        updates.push('updated_at = ?');
        params.push(now);
        params.push(id);

        await db.prepare(
            `UPDATE short_links SET ${updates.join(', ')} WHERE id = ?`
        ).bind(...params).run();

        // 处理标签
        if (body.tags !== undefined) {
            await syncTags(db, id, body.tags);
        }

        // 查询更新后的数据
        const updated = await db.prepare(`
            SELECT sl.*, d.host as domain_host
            FROM short_links sl
            LEFT JOIN domains d ON sl.domain_id = d.id
            WHERE sl.id = ?
        `).bind(id).first<ShortLink & { domain_host: string }>();

        const tags = await getTagsForLink(db, id);

        const response: HttpResponseJsonBody<ShortLinkWithDomain> = {
            code: ErrorCode.SUCCESS,
            message: '短链接更新成功',
            data: updated ? { ...updated, tags } : undefined
        };

        return c.json(response);
    } catch (error) {
        console.error('更新短链接失败:', error);
        const response: HttpResponseJsonBody = {
            code: ErrorCode.UNKNOWN_ERROR,
            message: '更新短链接失败'
        };
        return c.json(response, 500);
    }
});

// 删除短链接（软删除）
app.delete('/delete/:id', async (c) => {
    try {
        const db = c.env.shorturl;
        const id = parseInt(c.req.param('id'));

        if (isNaN(id)) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '无效的短链接 ID'
            };
            return c.json(response, 400);
        }

        const existing = await db.prepare(`
            SELECT id FROM short_links WHERE id = ? AND deleted_at IS NULL
        `).bind(id).first();

        if (!existing) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '短链接不存在'
            };
            return c.json(response, 404);
        }

        const now = Math.floor(Date.now() / 1000);

        await db.prepare(`
            UPDATE short_links SET deleted_at = ?, updated_at = ? WHERE id = ?
        `).bind(now, now, id).run();

        const response: HttpResponseJsonBody = {
            code: ErrorCode.SUCCESS,
            message: '短链接删除成功'
        };

        return c.json(response);
    } catch (error) {
        console.error('删除短链接失败:', error);
        const response: HttpResponseJsonBody = {
            code: ErrorCode.UNKNOWN_ERROR,
            message: '删除短链接失败'
        };
        return c.json(response, 500);
    }
});

// 批量删除短链接（软删除）
app.post('/batch-delete', async (c) => {
    try {
        const db = c.env.shorturl;
        const { ids } = await c.req.json<{ ids: number[] }>();

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '请提供要删除的短链接 ID 列表'
            };
            return c.json(response, 400);
        }

        const now = Math.floor(Date.now() / 1000);
        const placeholders = ids.map(() => '?').join(',');

        await db.prepare(`
            UPDATE short_links SET deleted_at = ?, updated_at = ? 
            WHERE id IN (${placeholders}) AND deleted_at IS NULL
        `).bind(now, now, ...ids).run();

        const response: HttpResponseJsonBody = {
            code: ErrorCode.SUCCESS,
            message: `已删除 ${ids.length} 个短链接`
        };

        return c.json(response);
    } catch (error) {
        console.error('批量删除短链接失败:', error);
        const response: HttpResponseJsonBody = {
            code: ErrorCode.UNKNOWN_ERROR,
            message: '批量删除短链接失败'
        };
        return c.json(response, 500);
    }
});

// 切换启用/禁用状态
app.put('/toggle-status/:id', async (c) => {
    try {
        const db = c.env.shorturl;
        const id = parseInt(c.req.param('id'));

        if (isNaN(id)) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '无效的短链接 ID'
            };
            return c.json(response, 400);
        }

        const existing = await db.prepare(`
            SELECT id, is_disabled FROM short_links WHERE id = ? AND deleted_at IS NULL
        `).bind(id).first<{ id: number; is_disabled: number }>();

        if (!existing) {
            const response: HttpResponseJsonBody = {
                code: ErrorCode.DATA_INPUT_ERROR,
                message: '短链接不存在'
            };
            return c.json(response, 404);
        }

        const now = Math.floor(Date.now() / 1000);
        const newStatus = existing.is_disabled === 0 ? 1 : 0;

        await db.prepare(`
            UPDATE short_links SET is_disabled = ?, updated_at = ? WHERE id = ?
        `).bind(newStatus, now, id).run();

        const response: HttpResponseJsonBody<{ is_disabled: number }> = {
            code: ErrorCode.SUCCESS,
            message: newStatus === 1 ? '短链接已禁用' : '短链接已启用',
            data: { is_disabled: newStatus }
        };

        return c.json(response);
    } catch (error) {
        console.error('切换短链接状态失败:', error);
        const response: HttpResponseJsonBody = {
            code: ErrorCode.UNKNOWN_ERROR,
            message: '切换短链接状态失败'
        };
        return c.json(response, 500);
    }
});

export default app;