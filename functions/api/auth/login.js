import { verifyPassword, generateToken } from '../_utils'

export async function onRequest({ request, env }) {
  try {
    const body = await request.json()
    const { username, password } = body

    const user = await env.DB.prepare(
      'SELECT * FROM users WHERE username = ?'
    ).bind(username).first()
    if (!user) {
      return Response.json({ error: '用户名或密码错误' }, { status: 401 })
    }

    const valid = await verifyPassword(password, user.password_hash)
    if (!valid) {
      return Response.json({ error: '用户名或密码错误' }, { status: 401 })
    }

    const token = await generateToken(user.id, env.JWT_SECRET)
    return Response.json({
      ok: true,
      token,
      user: { id: user.id, username: user.username }
    })
  } catch (err) {
    console.error(err)
    return Response.json({ error: '服务器错误' }, { status: 500 })
  }
}
