import { getCurrentUser } from './_utils'

// 下划线转驼峰
function toCamel(obj) {
  if (!obj) return obj
  const ret = {}
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    ret[camelKey] = obj[key]
  }
  return ret
}

// 驼峰转下划线
function toSnake(obj) {
  if (!obj) return obj
  const ret = {}
  for (const key in obj) {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
    ret[snakeKey] = obj[key]
  }
  return ret
}

// 写入操作日志
async function addLog(db, taskId, userId, action, detail = null) {
  const now = new Date().toISOString()
  const detailStr = detail ? JSON.stringify(detail) : null

  await db.prepare(`
    INSERT INTO task_logs (task_id, user_id, action, detail, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    Number(taskId) || 0,
    Number(userId) || 0,
    action || '',
    detailStr,
    now
  ).run()
}

export async function onRequest({ request, env }) {
  const userId = await getCurrentUser(request, env)
  if (!userId) {
    return Response.json({ error: '未登录，请先登录' }, { status: 401 })
  }

  const db = env.DB
  const url = new URL(request.url)
  const path = url.pathname

  try {
    // 获取任务列表
    if (request.method === 'GET' && path === '/api/tasks') {
      const { results } = await db.prepare(
        'SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC'
      ).bind(userId).all()
      return Response.json(results.map(toCamel))
    }

    // 新增任务
    if (request.method === 'POST' && path === '/api/tasks') {
      const body = await request.json()
      const data = toSnake(body)
      const now = new Date().toISOString()

      const res = await db.prepare(`
        INSERT INTO tasks (user_id, title, description, status, priority, due_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        userId,
        data.title,
        data.description || '',
        data.status || 'todo',
        data.priority || 'medium',
        data.due_date || null,
        now
      ).run()

      // 兼容本地和线上的自增ID属性名
      const taskId = res.lastRowId ?? res.lastInsertRowid

      await addLog(db, taskId, userId, 'create', { title: data.title })

      return Response.json({ ok: true, id: taskId })
    }

    // 更新任务
    if (request.method === 'PUT' && path === '/api/tasks') {
      const body = await request.json()
      const data = toSnake(body)

      // 越权校验
      const task = await db.prepare(
        'SELECT * FROM tasks WHERE id = ? AND user_id = ?'
      ).bind(data.id, userId).first()
      if (!task) {
        return Response.json({ error: '无权限操作此任务' }, { status: 403 })
      }

      await db.prepare(`
        UPDATE tasks
        SET title = ?, description = ?, status = ?, priority = ?, due_date = ?
        WHERE id = ? AND user_id = ?
      `).bind(
        data.title,
        data.description,
        data.status,
        data.priority,
        data.due_date,
        data.id,
        userId
      ).run()

      await addLog(db, data.id, userId, 'update', { before: task, after: data })
      return Response.json({ ok: true })
    }

    // 删除任务
    if (request.method === 'DELETE' && path === '/api/tasks') {
      const taskIdStr = url.searchParams.get('id')
      const taskId = Number(taskIdStr)

      if (!taskId || isNaN(taskId)) {
        return Response.json({ error: '无效的任务ID' }, { status: 400 })
      }

      // 越权校验：拿到要删除的任务信息
      const task = await db.prepare(
        'SELECT * FROM tasks WHERE id = ? AND user_id = ?'
      ).bind(taskId, userId).first()
      if (!task) {
        return Response.json({ error: '无权限操作此任务' }, { status: 403 })
      }

      // ========== 重点：先写操作日志 ==========
      await addLog(db, taskId, userId, 'delete', { title: task.title })

      // ========== 再执行删除 ==========
      await db.prepare(
        'DELETE FROM tasks WHERE id = ? AND user_id = ?'
      ).bind(taskId, userId).run()

      return Response.json({ ok: true })
    }

    // 获取任务操作日志
    if (request.method === 'GET' && path === '/api/tasks/logs') {
      const taskId = url.searchParams.get('taskId')

      const { results } = await db.prepare(`
        SELECT * FROM task_logs
        WHERE task_id = ?
        ORDER BY created_at DESC
      `).bind(taskId).all()

      return Response.json(results.map(toCamel))
    }

    return new Response('Not Found', { status: 404 })
  } catch (err) {
    console.error(err)
    return Response.json({ error: '数据库错误' }, { status: 500 })
  }
}
