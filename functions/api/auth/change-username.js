import { getCurrentUser } from '../_utils'

export async function onRequest({ request, env }) {
  try {
    const currentUserId = await getCurrentUser(request, env)
    if (!currentUserId) return Response.json({ error: '未登录' }, { status: 401 })

    const body = await request.json()
    const { newUsername } = body

    // 基础校验
    if (!newUsername?.trim()) {
      return Response.json({ error: '用户名不能为空' }, { status: 400 })
    }
    const trimmedName = newUsername.trim()
    if (trimmedName.length < 2 || trimmedName.length > 20) {
      return Response.json({ error: '用户名长度需在 2-20 位之间' }, { status: 400 })
    }

    // 检查用户名是否已被其他用户占用（排除当前用户自身）
    const existUser = await env.DB.prepare(
      'SELECT id FROM users WHERE username = ? AND id != ?'
    ).bind(trimmedName, currentUserId).first()

    if (existUser) {
      return Response.json({ error: '该用户名已被使用' }, { status: 409 })
    }

    // 更新用户名
    await env.DB.prepare(`
      UPDATE users SET username = ? WHERE id = ?
    `).bind(trimmedName, currentUserId).run()

    return Response.json({ ok: true })
  } catch (err) {
    console.error(err)
    return Response.json({ error: '服务器错误' }, { status: 500 })
  }
}
