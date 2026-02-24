# shorturl
one click to use shorturl in cloudflare workers
# feature
* password
* visit count limit
* middle page

# how to
click this button

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/qwx/shorturl-cloudflare-workers.git)

JWT_TOKEN：at least 10 characters long and upper,lowercase, numbers, special characters.
LANG: English uses "en" and Chinese use "cn".
Then you can bind your domain in the cloudflare workers config page.
First visit you can create an account.

# Template Replacement Logic
Templates support placeholder replacement using `{{key}}` syntax.  
When rendering, the system replaces **all** `{{key}}` occurrences globally.

**Supported keys**
- **Middle page (interstitial)**
  - `{{delay}}` — wait seconds
  - `{{timestamp}}` — unix timestamp used for HMAC
  - `{{sign}}` — HMAC signature
- **Password page**
  - `{{errorpassword}}` — `"true"` or `"false"`
- **Error page**
  - `{{error_message}}`
  - `{{error_code}}`
  - `{{http_status}}`
  - `{{code}}` — short code (only for "not found" case)

**Notes**
- Templates must be **active** to be used.
- If template is missing or invalid, the system falls back to default responses.

# Template Resource Management (Asset Manager)
Use **Template Resources Management** to upload assets (HTML/CSS/JS/images) for file-based templates.

**Concepts**
- **asset_prefix**: a logical folder/group name for assets (e.g. `my-template`)
- **main_file**: the entry HTML file under the prefix (e.g. `index.html`)
- **content_type**
  - `0`: inline HTML content
  - `1`: file-based template (requires `asset_prefix` + `main_file`)

**Storage Types**
- **DB** (≤ 2MB per file)
- **R2** (recommended for larger files, supports multipart upload)

**Typical workflow**
1. Open **Template Resources Management**
2. Create or select a **prefix**
3. Upload files under that prefix (supports subfolders, e.g. `css/style.css`)
4. Create a template with `content_type = 1`, set:
   - `asset_prefix` = your prefix
   - `main_file` = entry HTML file path
5. Apply the template to domains or short links

**Public assets**
- Mark asset as **Public** to enable URL access:
  - `https://<your-domain>/assets/<prefix>/<filename>`