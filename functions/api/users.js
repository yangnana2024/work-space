import { getCurrentUser } from './_utils'

function toCamel(obj) {
  if (!obj) return obj
  const ret = {}
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    ret[camelKey] = obj[key]
  }
  return ret
}

export async function onRequest({ request, env }) {
  const userId = await getCurrentUser(request, env)
  if (!userId) {
    return Response.json({ error: '未登录' }, { status: 401 })
  }

  try {
    const username = new URL(request.url).searchParams.get('username')?.trim()
    if (!username) return Response.json({ error: '请输入完整用户名' }, { status: 400 })
    const user = await env.DB.prepare(
      'SELECT id, username FROM users WHERE username = ?'
    ).bind(username).first()
    if (!user) return Response.json({ error: '没有找到该用户名' }, { status: 404 })
    return Response.json(toCamel(user))
  } catch (err) {
    console.error(err)
    return Response.json({ error: '服务器错误' }, { status: 500 })
  }
}
