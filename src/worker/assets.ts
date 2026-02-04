import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();


app.get("/:prefix/*", async (c) => {
  const prefix = c.req.param("prefix");
  const path = c.req.path;
  
  // 从路径中提取文件名：/assets/a3f8x9k2/css/style.css -> css/style.css
  const prefixPath = `/assets/${prefix}/`;
  const filename = path.startsWith(prefixPath)
    ? path.slice(prefixPath.length)
    : path.split(`/${prefix}/`).pop();

  if (!filename) {
    return c.notFound();
  }

  // 从数据库查询资源
  const asset = await c.env.shorturl
    .prepare(
      `SELECT storage_type, content, r2_key, content_type, size, is_public
       FROM template_assets
       WHERE asset_prefix = ? AND filename = ? AND is_public = 1`
    )
    .bind(prefix, "/"+filename)
    .first<{
      storage_type: number;
      content: ArrayBuffer | null;
      r2_key: string | null;
      content_type: string | null;
      size: number | null;
      is_public: number;
    }>();

  if (!asset) {
    return c.notFound();
  }

  const contentType = asset.content_type || getMimeType(filename);

  // 根据存储类型获取内容
  if (asset.storage_type === 0) {
    // 从数据库读取
    if (!asset.content) {
      return c.notFound();
    }
    return new Response(asset.content, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(asset.content.byteLength),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } else if (asset.storage_type === 1) {
    // 从 R2 读取
    if (!asset.r2_key || !c.env.R2_BUCKET) {
      return c.notFound();
    }
    
    const object = await c.env.R2_BUCKET.get(asset.r2_key);
    if (!object) {
      return c.notFound();
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", "public, max-age=86400");
    headers.set("ETag", object.httpEtag);

    return new Response(object.body, { headers });
  }

  return c.notFound();
});

/**
 * 根据文件扩展名获取 MIME 类型
 */
function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    // 图片
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    // 样式/脚本
    css: "text/css",
    js: "application/javascript",
    mjs: "application/javascript",
    // 字体
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    otf: "font/otf",
    eot: "application/vnd.ms-fontobject",
    // 其他
    json: "application/json",
    xml: "application/xml",
    txt: "text/plain",
    html: "text/html",
    pdf: "application/pdf",
  };
  return mimeTypes[ext || ""] || "application/octet-stream";
}

export default app;