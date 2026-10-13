import { hashPassword, generateToken } from '../_utils'

export async function onRequest({ request, env }) {
  try {
    const body = await request.json()
    const { username, password } = body

    // 基础校验
    if (!username || !password) {
      return Response.json({ error: '用户名和密码不能为空' }, { status: 400 })
    }
    if (username.length < 2 || username.length > 20) {
      return Response.json({ error: '用户名长度 2-20 位' }, { status: 400 })
    }
    if (password.length < 6) {
      return Response.json({ error: '密码至少 6 位' }, { status: 400 })
    }

    // 检查用户名是否已存在
    const exist = await env.DB.prepare(
      'SELECT id FROM users WHERE username = ?'
    ).bind(username).first()
    if (exist) {
      return Response.json({ error: '用户名已被注册' }, { status: 409 })
    }

    // 加密密码
    const passwordHash = await hashPassword(password)
    const now = new Date().toISOString()

    // 创建用户
    const res = await env.DB.prepare(`
      INSERT INTO users (username, password_hash, created_at)
      VALUES (?, ?, ?)
    `).bind(username, passwordHash, now).run()

    const userId = res.lastRowId
    const token = await generateToken(userId, env.JWT_SECRET)

    return Response.json({
      ok: true,
      token,
      user: { id: userId, username }
    })
  } catch (err) {
    console.error(err)
    return Response.json({ error: '服务器错误' }, { status: 500 })
  }
}
