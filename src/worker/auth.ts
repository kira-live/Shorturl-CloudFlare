import { Hono } from 'hono'
import {CurrentUser, ErrorCode, HttpResponseJsonBody, Variables} from './util'
import {sign, verify} from 'hono/jwt'
import { createMiddleware } from 'hono/factory'


const app = new Hono<{Bindings: Env}>()
interface LoginRequest {
    username?: string
    password?: string
}
app.post('/login', async (c) => {
    let userInfo: LoginRequest
    try {
        userInfo = await c.req.json()
    } catch {
        const response: HttpResponseJsonBody = {data:null,  message: 'login data error', code: ErrorCode.DATA_INPUT_ERROR }
        return c.json(response, 400)
    }

    if (userInfo == null || userInfo.username == null || userInfo.password == null) {
        const response: HttpResponseJsonBody = {data:null,  message: 'login data error', code: ErrorCode.DATA_INPUT_ERROR }
        return c.json(response, 400)
    }

    const username = String(userInfo.username)
    const password = String(userInfo.password)

    const row = await c.env.shorturl
        .prepare(
            `
      SELECT id, username, password_hash, role, status, deleted_at
      FROM users
      WHERE username = ?
      LIMIT 1
    `.trim()
        )
        .bind(username)
        .first<{
            id: number
            username: string | null
            password_hash: string | null
            role: string | null
            status: number
            deleted_at: number | null
        }>()

    if (!row) {
        const response: HttpResponseJsonBody = {data:null,  message: 'username or password incorrect', code: ErrorCode.DATA_INPUT_ERROR }
        return c.json(response, 401)
    }



    const hash = row.password_hash ?? ''
    let ok = false
    try {
        const { compareSync } = await import('bcryptjs')
        ok = compareSync(password, hash)
    } catch {
        ok = false
    }

    if (!ok) {
        const response: HttpResponseJsonBody = {data:null,  message: 'username or password incorrect', code: ErrorCode.DATA_INPUT_ERROR }
        return c.json(response, 401)
    }
    if (row.status !== 0 && row.status !== null) {
        const response: HttpResponseJsonBody = {data:null, message: 'user disabled', code: ErrorCode.DATA_INPUT_ERROR }
        return c.json(response, 403)
    }
    // 检查用户是否被软删除
    if (row.deleted_at != null) {
        const response: HttpResponseJsonBody = {data:null,  message: 'username or password incorrect', code: ErrorCode.DATA_INPUT_ERROR }
        return c.json(response, 401)
    }

    const now = Math.floor(Date.now() / 1000)
    const exp = now + 7 * 24 * 60 * 60 // 7 days

    const token = await sign({
        sub: row.id,
        username: row.username ?? username,
        role: row.role ?? 'user',
        iat: now,
        exp: exp
    },c.env.JWT_SECRET)
    const response:HttpResponseJsonBody<{token:string}>= {message:'',code:ErrorCode.SUCCESS,data:{token:token}}
    return c.json(
        response,
        200
    )
})

const authVerify = createMiddleware<{Variables: Variables ;Bindings:Env}>(async (c, next) => {
    const path = c.req.path
    if (path === '/api/auth/login'||!path.startsWith("/api/")) {
        await next()
        return
    }


    const jwtToken = c.req.header('Authorization')


    if (jwtToken === undefined || jwtToken === '' || !jwtToken.startsWith('Bearer ')) {
        const response: HttpResponseJsonBody = { data: null, message: 'token not found', code: ErrorCode.UNAUTHORIZED }
        return c.json(response, 401)
    }

    const token = jwtToken.substring(7)


    try {
        const decodedVerify = await verify(token, c.env.JWT_SECRET, 'HS256')
        // token 校验通过后，查库确认用户是否被禁用
        const userId = decodedVerify?.sub
        const iat = decodedVerify?.iat as number | undefined
        const username = decodedVerify?.username as string | undefined
        const role = decodedVerify?.role as string | undefined
        
        if (userId == null || iat == null || !username || !role) {
            const response: HttpResponseJsonBody = { data: null, message: 'token error', code: ErrorCode.UNAUTHORIZED }
            return c.json(response, 401)
        }

        const row = await c.env.shorturl
            .prepare(
                `
      SELECT status, deleted_at, updated_at
      FROM users
      WHERE id = ?
      LIMIT 1
    `.trim()
            )
            .bind(Number(userId))
            .first<{ status: number; deleted_at: number | null; updated_at: number }>()

        // 用户不存在
        if (!row) {
            const response: HttpResponseJsonBody = { data: null, message: 'user not found', code: ErrorCode.UNAUTHORIZED }
            return c.json(response, 401)
        }

        // 用户被禁用
        if (row.status !== 0) {
            const response: HttpResponseJsonBody = { data: null, message: 'user disabled', code: ErrorCode.UNAUTHORIZED }
            return c.json(response, 401)
        }

        // 用户已被软删除
        if (row.deleted_at != null) {
            const response: HttpResponseJsonBody = { data: null, message: 'user deleted', code: ErrorCode.UNAUTHORIZED }
            return c.json(response, 401)
        }

        // 用户修改过密码（updated_at 晚于 token 签发时间）
        if (row.updated_at > iat) {
            const response: HttpResponseJsonBody = { data: null, message: 'token expired due to password change', code: ErrorCode.UNAUTHORIZED }
            return c.json(response, 401)
        }

        // 将用户信息注入到上下文中
        c.set('currentUser', {
            id: Number(userId),
            username,
            role
        } as CurrentUser)

        await next()
    } catch  {
        const response: HttpResponseJsonBody = { data: null, message: 'token error', code: ErrorCode.UNAUTHORIZED }
        return c.json(response, 401)
    }


})
export default app
export {authVerify}