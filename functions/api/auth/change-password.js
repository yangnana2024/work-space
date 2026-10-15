import { getCurrentUser, hashPassword, verifyPassword } from '../_utils'

export async function onRequest({ request, env }) {
  try {
    const currentUserId = await getCurrentUser(request, env)
    if (!currentUserId) return Response.json({ error: '未登录' }, { status: 401 })

    const body = await request.json()
    const { oldPassword, newPassword } = body

    // 基础校验
    if (!oldPassword || !newPassword) {
      return Response.json({ error: '原密码和新密码不能为空' }, { status: 400 })
    }
    if (newPassword.length < 6) {
      return Response.json({ error: '新密码至少 6 位' }, { status: 400 })
    }

    // 查询用户原密码哈希
    const user = await env.DB.prepare(
      'SELECT password_hash FROM users WHERE id = ?'
    ).bind(currentUserId).first()

    if (!user) {
      return Response.json({ error: '用户不存在' }, { status: 404 })
    }

    // 校验原密码（使用项目自带的校验函数，自动处理盐值）
    const valid = await verifyPassword(oldPassword, user.password_hash)
    if (!valid) {
      return Response.json({ error: '原密码错误' }, { status: 400 })
    }

    // 生成新密码哈希并更新
    const newPasswordHash = await hashPassword(newPassword)
    await env.DB.prepare(`
      UPDATE users SET password_hash = ? WHERE id = ?
    `).bind(newPasswordHash, currentUserId).run()

    return Response.json({ ok: true })
  } catch (err) {
    console.error(err)
    return Response.json({ error: '服务器错误' }, { status: 500 })
  }
}
