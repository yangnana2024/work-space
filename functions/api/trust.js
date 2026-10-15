import { getCurrentUser } from './_utils'

const toCamel = (row) => {
  if (!row) return row
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_, character) => character.toUpperCase()),
    value,
  ]))
}

function trustPair(firstUserId, secondUserId) {
  return [Math.min(Number(firstUserId), Number(secondUserId)), Math.max(Number(firstUserId), Number(secondUserId))]
}

export async function onRequest({ request, env }) {
  const currentUserId = await getCurrentUser(request, env)
  if (!currentUserId) return Response.json({ error: '未登录' }, { status: 401 })

  const db = env.DB
  const url = new URL(request.url)

  try {
    if (request.method === 'GET') {
      const [trustResult, receivedResult, sentResult] = await Promise.all([
        db.prepare(`
          SELECT users.id AS user_id, users.username, user_trusts.created_at
          FROM user_trusts
          JOIN users ON users.id = CASE
            WHEN user_trusts.user_low_id = ? THEN user_trusts.user_high_id
            ELSE user_trusts.user_low_id
          END
          WHERE user_trusts.user_low_id = ? OR user_trusts.user_high_id = ?
          ORDER BY users.username
        `).bind(currentUserId, currentUserId, currentUserId).all(),
        db.prepare(`
          SELECT trust_requests.id, trust_requests.requester_user_id, users.username, trust_requests.created_at
          FROM trust_requests
          JOIN users ON users.id = trust_requests.requester_user_id
          WHERE trust_requests.recipient_user_id = ?
          ORDER BY trust_requests.created_at DESC
        `).bind(currentUserId).all(),
        db.prepare(`
          SELECT trust_requests.id, trust_requests.recipient_user_id, users.username, trust_requests.created_at
          FROM trust_requests
          JOIN users ON users.id = trust_requests.recipient_user_id
          WHERE trust_requests.requester_user_id = ?
          ORDER BY trust_requests.created_at DESC
        `).bind(currentUserId).all(),
      ])
      return Response.json({
        trustedUsers: trustResult.results.map(toCamel),
        receivedRequests: receivedResult.results.map(toCamel),
        sentRequests: sentResult.results.map(toCamel),
      })
    }

    if (request.method === 'POST') {
      const body = await request.json()
      const now = new Date().toISOString()

      if (body.action === 'request') {
        const username = typeof body.username === 'string' ? body.username.trim() : ''
        if (!username) return Response.json({ error: '请输入用户名' }, { status: 400 })
        const target = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first()
        if (!target) return Response.json({ error: '没有找到该用户名' }, { status: 404 })
        if (Number(target.id) === Number(currentUserId)) {
          return Response.json({ error: '不能向自己发送信任申请' }, { status: 400 })
        }

        const [lowUserId, highUserId] = trustPair(currentUserId, target.id)
        const existingTrust = await db.prepare(
          'SELECT 1 AS trusted FROM user_trusts WHERE user_low_id = ? AND user_high_id = ?',
        ).bind(lowUserId, highUserId).first()
        if (existingTrust) return Response.json({ error: '你们已经建立信任关系' }, { status: 409 })

        const reverseRequest = await db.prepare(`
          SELECT id FROM trust_requests
          WHERE requester_user_id = ? AND recipient_user_id = ?
        `).bind(target.id, currentUserId).first()
        if (reverseRequest) {
          return Response.json({ error: '对方已向你发送申请，请先处理收到的申请' }, { status: 409 })
        }

        const duplicateRequest = await db.prepare(`
          SELECT id FROM trust_requests
          WHERE requester_user_id = ? AND recipient_user_id = ?
        `).bind(currentUserId, target.id).first()
        if (duplicateRequest) return Response.json({ error: '信任申请已发送，等待对方确认' }, { status: 409 })

        await db.prepare(`
          INSERT INTO trust_requests (requester_user_id, recipient_user_id, created_at)
          VALUES (?, ?, ?)
        `).bind(currentUserId, target.id, now).run()
        return Response.json({ ok: true })
      }

      if (body.action === 'accept' || body.action === 'reject') {
        const requestId = Number(body.requestId)
        if (!Number.isSafeInteger(requestId) || requestId <= 0) {
          return Response.json({ error: '信任申请无效' }, { status: 400 })
        }
        const trustRequest = await db.prepare(`
          SELECT requester_user_id FROM trust_requests
          WHERE id = ? AND recipient_user_id = ?
        `).bind(requestId, currentUserId).first()
        if (!trustRequest) return Response.json({ error: '信任申请不存在' }, { status: 404 })

        if (body.action === 'accept') {
          const [lowUserId, highUserId] = trustPair(currentUserId, trustRequest.requester_user_id)
          await db.batch([
            db.prepare(`
              INSERT OR IGNORE INTO user_trusts (user_low_id, user_high_id, created_at)
              VALUES (?, ?, ?)
            `).bind(lowUserId, highUserId, now),
            db.prepare('DELETE FROM trust_requests WHERE id = ?').bind(requestId),
          ])
        } else {
          await db.prepare('DELETE FROM trust_requests WHERE id = ?').bind(requestId).run()
        }
        return Response.json({ ok: true })
      }

      if (body.action === 'cancel') {
        const requestId = Number(body.requestId)
        if (!Number.isSafeInteger(requestId) || requestId <= 0) {
          return Response.json({ error: '信任申请无效' }, { status: 400 })
        }
        await db.prepare(`
          DELETE FROM trust_requests WHERE id = ? AND requester_user_id = ?
        `).bind(requestId, currentUserId).run()
        return Response.json({ ok: true })
      }

      return Response.json({ error: '不支持的操作' }, { status: 400 })
    }

    if (request.method === 'DELETE') {
      const otherUserId = Number(url.searchParams.get('userId'))
      if (!Number.isSafeInteger(otherUserId) || otherUserId <= 0 || otherUserId === Number(currentUserId)) {
        return Response.json({ error: '用户无效' }, { status: 400 })
      }
      const [lowUserId, highUserId] = trustPair(currentUserId, otherUserId)
      await db.prepare(
        'DELETE FROM user_trusts WHERE user_low_id = ? AND user_high_id = ?',
      ).bind(lowUserId, highUserId).run()
      return Response.json({ ok: true })
    }

    return new Response('Method Not Allowed', { status: 405 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: '信任关系操作失败' }, { status: 500 })
  }
}