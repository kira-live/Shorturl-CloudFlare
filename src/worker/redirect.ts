import { Hono } from "hono";
import { UAParser } from 'ua-parser-js';

const app = new Hono<{ Bindings: Env }>();

interface ShortLink {
    id: number;
    domain_id: number;
    code: string;
    target_url: string;
    redirect_http_code: number;
    use_interstitial: number;
    template_id: number | null;
    password_hash: string | null;
    max_visits: number | null;
    expire_at: number | null;
    is_disabled: number;
    deleted_at: number | null;
    total_clicks: number;
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

app.get("/:code", async (c) => {
    c.header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    c.header("Pragma", "no-cache");
    c.header("Expires", "0");
    const code = c.req.param("code");
    const host = c.req.header("host") || "";
    const now = Math.floor(Date.now() / 1000);

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
            SELECT sl.*, d.host as domain_host
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
        return c.json("no short url");
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
        return c.text("Link expired", 410);
    }

    // 检查访问次数限制
    if (result.max_visits && result.total_clicks >= result.max_visits) {
        c.executionCtx.waitUntil(
            recordVisitEvent(c.env.shorturl, { ...baseEvent, is_blocked: 1, block_reason: "limit", http_status: 410 })
        );
        return c.text("Link visit limit reached", 410);
    }

    // 如果需要密码验证
    if (result.password_hash) {
        c.executionCtx.waitUntil(
            recordVisitEvent(c.env.shorturl, { ...baseEvent, is_blocked: 1, block_reason: "password", http_status: 401 })
        );
        return c.text("Password required", 401);
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

    // 如果使用中转页
    if (result.use_interstitial && result.template_id) {
        const template = await c.env.shorturl
            .prepare("SELECT html_content FROM redirect_templates WHERE id = ? AND is_active = 1")
            .bind(result.template_id)
            .first<{ html_content: string }>();

        if (template) {
            const html = template.html_content.replace(/\{\{target_url\}\}/g, result.target_url);
            return c.html(html);
        }
    }

    // 执行跳转
    return c.redirect(result.target_url, result.redirect_http_code as 301 | 302 | 307 | 308);
});

export default app;
