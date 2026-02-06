import { Hono } from "hono";
import { UAParser } from 'ua-parser-js';
import { ErrorCode } from "./util";
const app = new Hono<{ Bindings: Env }>();

interface ShortLink {
    id: number;
    domain_id: number;
    code: string;
    target_url: string;
    redirect_http_code: number;
    use_interstitial: number;
    interstitial_delay: number;                    // 中转页等待时间（秒），0为不等待
    force_interstitial: number;                    // 是否强制中转页验签：0=不强制，1=强制
    template_id: number | null;
    password: string | null;
    max_visits: number | null;
    expire_at: number | null;
    is_disabled: number;
    deleted_at: number | null;
    total_clicks: number;
    password_template_id: number | null;       // 短链接级别的密码模板
    error_template_id: number | null;          // 短链接级别的错误模板
    domain_password_template_id: number | null; // 域名级别的密码模板
    domain_error_template_id: number | null;    // 域名级别的错误模板
}

interface VisitEventData {
    short_link_id: number;
    domain_id: number;
    code: string;
    visited_at: number;
    ip: string | null;
    ua: string | null;
    referer: string | null;
    country: string | null;
    region: string | null;
    city: string | null;
    device_type: string | null;
    os: string | null;
    browser: string | null;
    is_blocked: number;
    block_reason: string | null;
    http_status: number;
}

// 模板接口
interface RedirectTemplate {
    content_type: number;
    html_content: string | null;
    main_file: string | null;
    asset_prefix: string | null;
}

// 获取模板内容的辅助函数
async function getTemplateContent(
    db: D1Database,
    templateId: number,
    replacements?: Record<string, string>,
    r2Bucket?: R2Bucket
): Promise<{ html: string } | null> {
    const template = await db
        .prepare(`
            SELECT content_type, html_content, main_file, asset_prefix 
            FROM redirect_templates 
            WHERE id = ? AND is_active = 1
        `)
        .bind(templateId)
        .first<RedirectTemplate>();

    if (!template) {
        return null;
    }

    let html: string;

    if (template.content_type === 0) {
        // 使用 HTML 内容
        if (!template.html_content) {
            return null;
        }
        html = template.html_content;
    } else if (template.content_type === 1) {
        // 使用文件
        if (!template.main_file || !template.asset_prefix) {
            return null;
        }

        // 从 template_assets 获取主文件内容
        const asset = await db
            .prepare(`
                SELECT storage_type, content, r2_key
                FROM template_assets
                WHERE asset_prefix = ? AND filename = ?
            `)
            .bind(template.asset_prefix, template.main_file)
            .first<{
                storage_type: number;
                content: ArrayBuffer | null;
                r2_key: string | null;
            }>();

        if (!asset) {
            return null;
        }

        if (asset.storage_type === 0) {
            // 数据库存储
            if (!asset.content) {
                return null;
            }
            html = new TextDecoder().decode(asset.content);
        } else if (asset.storage_type === 1) {
            // R2 存储
            if (!asset.r2_key || !r2Bucket) {
                return null;
            }
            const object = await r2Bucket.get(asset.r2_key);
            if (!object) {
                return null;
            }
            html = await object.text();
        } else {
            return null;
        }
    } else {
        return null;
    }

    // 应用替换
    if (replacements) {
        for (const [key, value] of Object.entries(replacements)) {
            html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
        }
    }

    return { html };
}

// 解析 User-Agent
function parseUserAgent(ua: string | null): { device_type: string; os: string; browser: string } {
    if (!ua) {
        return { device_type: "unknown", os: "unknown", browser: "unknown" };
    }

    const parser = new UAParser(ua);
    const result = parser.getResult();

    // 设备类型
    const device_type = result.device.type || "unknown"; // 默认桌面


    // 操作系统
    const os = result.os.name
        ? `${result.os.name}${result.os.version ? " " + result.os.version : ""}`
        : "unknown";

    // 浏览器
    const browser = result.browser.name
        ? `${result.browser.name}${result.browser.version ? " " + result.browser.version : ""}`
        : "unknown";

    return { device_type, os, browser };
}

// 生成HMAC签名
async function generateHmacSignature(
    secret: string,
    timestamp: number,
    host: string,
    code: string
): Promise<string> {
    const data = `${timestamp}:${host}:${code}`;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(data);

    const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, messageData);
    const signatureArray = Array.from(new Uint8Array(signature));
    return signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyHmacSignature(
    secret: string,
    timestamp: number,
    host: string,
    code: string,
    providedSignature: string
): Promise<boolean> {
    const expectedSignature = await generateHmacSignature(secret, timestamp, host, code);
    return expectedSignature === providedSignature;
}

// 记录访问事件
async function recordVisitEvent(db: D1Database, event: VisitEventData) {
    await db
        .prepare(`
            INSERT INTO link_visit_events
            (short_link_id, domain_id, code, visited_at, ip, ua, referer, country, region, city, device_type, os, browser, is_blocked, block_reason, http_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
            event.short_link_id,
            event.domain_id,
            event.code,
            event.visited_at,
            event.ip,
            event.ua,
            event.referer,
            event.country,
            event.region,
            event.city,
            event.device_type,
            event.os,
            event.browser,
            event.is_blocked,
            event.block_reason,
            event.http_status
        )
        .run();
}

/**
 * 获取错误页面 HTML
 * @param db 数据库连接
 * @param r2Bucket R2 存储桶
 * @param host 域名
 * @param shortLink 短链接信息（如果存在）
 * @param replacements 模板替换变量
 * @returns HTML 字符串，如果没有配置模板则返回 null
 */
async function getErrorPageHtml(
    db: D1Database,
    r2Bucket: R2Bucket | undefined,
    host: string,
    shortLink: ShortLink | null,
    replacements: Record<string, string>
): Promise<string | null> {
    let templateId: number | null = null;

    if (shortLink) {
        // 有短链接：优先使用短链接模板，其次域名模板
        templateId = shortLink.error_template_id ?? shortLink.domain_error_template_id;
    } else {
        // 没有短链接：只能查询域名模板
        const domain = await db
            .prepare(`SELECT error_template_id FROM domains WHERE host = ? AND is_active = 1`)
            .bind(host)
            .first<{ error_template_id: number | null }>();
        templateId = domain?.error_template_id ?? null;
    }

    if (!templateId) {
        return null;
    }

    const templateResult = await getTemplateContent(db, templateId, replacements, r2Bucket);
    return templateResult?.html ?? null;
}

app.get("/:code", async (c) => {
    c.header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    c.header("Pragma", "no-cache");
    c.header("Expires", "0");
    const code = c.req.param("code");
    const host = c.req.header("host") || "";
    const now = Math.floor(Date.now() / 1000);

    // 通过查询参数获取密码（不再使用 path）
    const password = c.req.query("password") || null;

    // 获取中转页签名参数
    const timestampStr = c.req.query("t") || null;
    const sign = c.req.query("s") || null;

    // 获取访问上下文信息
    const ip = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || null;
    const ua = c.req.header("user-agent") || null;
    const referer = c.req.header("referer") || null;
    // Cloudflare 提供的地理位置信息
    const cfData = (c.req.raw).cf;
    const country = String(cfData?.country || "");
    const region = String(cfData?.region || "");
    const city = String(cfData?.city || "");

    // 解析 User-Agent 获取设备信息
    const { device_type, os, browser } = parseUserAgent(ua);

    // 查询短链接（需要同时匹配域名和短码）
    const result = await c.env.shorturl
        .prepare(`
                SELECT sl.*, 
                       d.host as domain_host, 
                       d.password_template_id as domain_password_template_id,
                       d.error_template_id as domain_error_template_id
                FROM short_links sl
                JOIN domains d ON sl.domain_id = d.id
                WHERE sl.code = ? AND d.host = ?
                  AND sl.deleted_at IS NULL
                  AND sl.is_disabled = 0
                  AND d.is_active = 1
            `)
        .bind(code, host)
        .first<ShortLink & { domain_host: string }>();

    if (!result) {
        const html = await getErrorPageHtml(
            c.env.shorturl, c.env.R2_BUCKET, host, null,
            { error_message: "Short link not found", error_code: String(ErrorCode.SHORTURL_NOT_FOUND), http_status: "404", code }
        );
        return html ? c.html(html, 404) : c.json({ error: "not_found", message: "Short link not found" }, 404);
    }

    // 基础事件数据
    const baseEvent: VisitEventData = {
        short_link_id: result.id,
        domain_id: result.domain_id,
        code: result.code,
        visited_at: now,
        ip,
        ua,
        referer,
        country,
        region,
        city,
        device_type,
        os,
        browser,
        is_blocked: 0,
        block_reason: null,
        http_status: result.redirect_http_code,
    };

    // 检查是否过期
    if (result.expire_at && result.expire_at < now) {
        c.executionCtx.waitUntil(
            recordVisitEvent(c.env.shorturl, { ...baseEvent, is_blocked: 1, block_reason: "expired", http_status: 410 })
        );
        const html = await getErrorPageHtml(
            c.env.shorturl, c.env.R2_BUCKET, host, result,
            { error_message: "Link expired", error_code: String(ErrorCode.LINK_EXPIRED), http_status: "410" }
        );
        return html ? c.html(html, 410) : c.json({ error: "expired", message: "Link expired" }, 410);
    }

    // 检查访问次数限制
    if (result.max_visits && result.total_clicks >= result.max_visits) {
        c.executionCtx.waitUntil(
            recordVisitEvent(c.env.shorturl, { ...baseEvent, is_blocked: 1, block_reason: "limit", http_status: 410 })
        );
        const html = await getErrorPageHtml(
            c.env.shorturl, c.env.R2_BUCKET, host, result,
            { error_message: "Link visit limit reached", error_code: String(ErrorCode.LINK_LIMIT_REACHED), http_status: "410" }
        );
        return html ? c.html(html, 410) : c.json({ error: "limit", message: "Link visit limit reached" }, 410);
    }

    // 如果需要密码验证
    if (result.password) {
        const passwordTemplateId = result.password_template_id ?? result.domain_password_template_id;

        // 有传密码但不正确
        if (password && result.password !== password) {
            c.executionCtx.waitUntil(
                recordVisitEvent(c.env.shorturl, { ...baseEvent, is_blocked: 1, block_reason: "password_wrong", http_status: 401 })
            );

            if (passwordTemplateId) {
                const templateResult = await getTemplateContent(
                    c.env.shorturl,
                    passwordTemplateId,
                    { "errorpassword": "true" },
                    c.env.R2_BUCKET
                );

                if (templateResult) {
                    return c.html(templateResult.html, 200);
                }
            }

            return c.text("server error", 500);
        }

        // 没传密码：返回输入页
        if (!password) {
            if (passwordTemplateId) {
                const templateResult = await getTemplateContent(
                    c.env.shorturl,
                    passwordTemplateId,
                    { "errorpassword": "false" },
                    c.env.R2_BUCKET
                );

                if (templateResult) {
                    c.executionCtx.waitUntil(
                        recordVisitEvent(c.env.shorturl, { ...baseEvent, is_blocked: 1, block_reason: "password", http_status: 401 })
                    );
                    return c.html(templateResult.html, 200);
                }
            }

            c.executionCtx.waitUntil(
                recordVisitEvent(c.env.shorturl, { ...baseEvent, is_blocked: 1, block_reason: "password", http_status: 401 })
            );
            return c.text("Password required", 401);
        }
    }

    // 判断是否需要中转页逻辑
    const needsInterstitial = result.use_interstitial && result.template_id;
    const forceVerification = result.force_interstitial === 1;

    // 如果使用中转页
    if (needsInterstitial && result.template_id) {
        const hmacSecret = c.env.JWT_SECRET;
        const maxValiditySeconds = 30 * 60;
        const templateId = result.template_id;  // 此时 TypeScript 知道它不是 null

        // 检查是否带有 t 参数
        if (timestampStr) {
            // 不强制验签：只要有 t 参数就直接跳转
            if (!forceVerification) {
                c.executionCtx.waitUntil(
                    Promise.all([
                        recordVisitEvent(c.env.shorturl, baseEvent),
                        c.env.shorturl
                            .prepare(`
                                UPDATE short_links
                                SET total_clicks = total_clicks + 1, last_access_at = ?
                                WHERE id = ?
                            `)
                            .bind(now, result.id)
                            .run(),
                    ])
                );
                return c.redirect(result.target_url, result.redirect_http_code as 301 | 302 | 307 | 308);
            }

            // 强制验签：需要验证签名和等待时间
            if (sign) {
                const timestamp = parseInt(timestampStr, 10);
                const isValidSignature = await verifyHmacSignature(
                    hmacSecret,
                    timestamp,
                    host,
                    code,
                    sign
                );

                if (isValidSignature) {
                    const elapsedSeconds = now - timestamp;

                    // 检查时间是否已超过中转页等待时间且未超过 30 分钟
                    if (elapsedSeconds >= (result.interstitial_delay - 1) && elapsedSeconds <= maxValiditySeconds) {
                        c.executionCtx.waitUntil(
                            Promise.all([
                                recordVisitEvent(c.env.shorturl, baseEvent),
                                c.env.shorturl
                                    .prepare(`
                                        UPDATE short_links
                                        SET total_clicks = total_clicks + 1, last_access_at = ?
                                        WHERE id = ?
                                    `)
                                    .bind(now, result.id)
                                    .run(),
                            ])
                        );
                        return c.redirect(result.target_url, result.redirect_http_code as 301 | 302 | 307 | 308);
                    }
                }
            }
            // 强制验签但验证失败，继续显示中转页
        }

        // 没有 t 参数 或 强制验签失败：显示中转页
        const newTimestamp = now;
        const newSign = await generateHmacSignature(hmacSecret, newTimestamp, host, code);

        const templateResult = await getTemplateContent(
            c.env.shorturl,
            templateId,
            {
                delay: String(result.interstitial_delay),
                timestamp: String(newTimestamp),
                sign: newSign
            },
            c.env.R2_BUCKET
        );

        if (templateResult) {
            c.executionCtx.waitUntil(
                recordVisitEvent(c.env.shorturl, { ...baseEvent, block_reason: "interstitial", http_status: 200 })
            );
            return c.html(templateResult.html);
        }
    }

    // 记录成功访问事件 + 更新统计
    c.executionCtx.waitUntil(
        Promise.all([
            recordVisitEvent(c.env.shorturl, baseEvent),
            c.env.shorturl
                .prepare(`
                    UPDATE short_links
                    SET total_clicks = total_clicks + 1, last_access_at = ?
                    WHERE id = ?
                `)
                .bind(now, result.id)
                .run(),
        ])
    );

    // 执行跳转
    return c.redirect(result.target_url, result.redirect_http_code as 301 | 302 | 307 | 308);
});

export default app;
