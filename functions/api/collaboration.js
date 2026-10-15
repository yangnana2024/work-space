import { getCurrentUser } from './_utils'

export async function onRequest({ request, env }) {
  const currentUserId = await getCurrentUser(request, env)
  if (!currentUserId) return Response.json({ error: '未登录' }, { status: 401 })

  const db = env.DB

  try {
    if (request.method === 'GET') {
      const [eventsResult, unreadResult] = await Promise.all([
        db.prepare(`
          SELECT
            events.*,
            actor.username AS actor_username,
            target.username AS target_username,
            CASE WHEN events.actor_user_id = ? THEN 'sent' ELSE 'received' END AS direction,
            CASE WHEN current_task.id IS NOT NULL THEN 1 ELSE 0 END AS task_exists,
            CASE
              WHEN current_task.id IS NOT NULL
                AND (current_task.user_id = ? OR current_share.shared_with_user_id IS NOT NULL)
              THEN 1 ELSE 0
            END AS task_available
          FROM task_share_events AS events
          JOIN users AS actor ON actor.id = events.actor_user_id
          JOIN users AS target ON target.id = events.target_user_id
          LEFT JOIN tasks AS current_task ON current_task.id = events.task_id
          LEFT JOIN task_shares AS current_share
            ON current_share.task_id = events.task_id
            AND current_share.shared_with_user_id = ?
          WHERE events.actor_user_id = ? OR events.target_user_id = ?
          ORDER BY events.created_at DESC
        `).bind(currentUserId, currentUserId, currentUserId, currentUserId, currentUserId).all(),
        db.prepare(`
          SELECT COUNT(*) AS unread_count
          FROM task_share_events
          WHERE target_user_id = ? AND action = 'shared' AND read_at IS NULL
        `).bind(currentUserId).first(),
      ])
      const events = eventsResult.results.map((row) => {
        const event = Object.fromEntries(Object.entries(row).map(([key, value]) => [
          key.replace(/_([a-z])/g, (_, character) => character.toUpperCase()),
          value,
        ]))
        return {
          ...event,
          taskAvailable: Boolean(event.taskAvailable),
          taskExists: Boolean(event.taskExists),
        }
      })
      return Response.json({ events, unreadCount: Number(unreadResult?.unread_count ?? 0) })
    }

    if (request.method === 'POST') {
      const body = await request.json()
      const eventId = Number(body.eventId)
      if (body.action !== 'mark-read' || !Number.isSafeInteger(eventId) || eventId <= 0) {
        return Response.json({ error: '通知无效' }, { status: 400 })
      }

      await db.prepare(`
        UPDATE task_share_events SET read_at = ?
        WHERE id = ? AND target_user_id = ? AND action = 'shared' AND read_at IS NULL
      `).bind(new Date().toISOString(), eventId, currentUserId).run()
      return Response.json({ ok: true })
    }

    return new Response('Method Not Allowed', { status: 405 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: '读取协作记录失败' }, { status: 500 })
  }
}
