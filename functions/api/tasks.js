// 下划线转驼峰
function toCamel(obj) {
  if (!obj) return obj
  const ret = {}
  for (const key in obj) {
    const newKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    ret[newKey] = obj[key]
  }
  return ret
}

// 驼峰转下划线
function toSnake(obj) {
  if (!obj) return obj
  const ret = {}
  for (const key in obj) {
    const newKey = key.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)
    ret[newKey] = obj[key]
  }
  return ret
}

// Pages Functions 标准入口
export async function onRequest({ request, env }) {
  const db = env.DB

  try {
    // GET 获取全部任务
    if (request.method === 'GET') {
      const { results } = await db.prepare('SELECT * FROM tasks ORDER BY id').all()
      const list = results.map(row => toCamel(row))
      return Response.json(list)
    }

    // POST 新增任务
    if (request.method === 'POST') {
      const body = await request.json()
      const data = toSnake(body)
      const now = new Date().toISOString()
      await db.prepare(`
        INSERT INTO tasks (title, description, status, priority, due_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        data.title,
        data.description,
        data.status,
        data.priority,
        data.due_date,
        now
      ).run()
      return Response.json({ ok: true })
    }

    // PUT 更新任务
    if (request.method === 'PUT') {
      const body = await request.json()
      const data = toSnake(body)
      await db.prepare(`
        UPDATE tasks
        SET title=?, description=?, status=?, priority=?, due_date=?
        WHERE id = ?
      `).bind(
        data.title,
        data.description,
        data.status,
        data.priority,
        data.due_date,
        data.id
      ).run()
      return Response.json({ ok: true })
    }

    // DELETE 删除任务
    if (request.method === 'DELETE') {
      const body = await request.json()
      await db.prepare('DELETE FROM tasks WHERE id = ?').bind(body.id).run()
      return Response.json({ ok: true })
    }

    // 不支持的方法返回 405
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET, POST, PUT, DELETE' }
    })
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'database error' }, { status: 500 })
  }
}
