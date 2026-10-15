import { getCurrentUser } from '../_utils'
import { checkTaskPermission } from '../_taskAccess'
import { recordTaskShareEvent } from '../_taskShareEvents'

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
  const taskIdNum = Number(taskId)
  const userIdNum = Number(userId)
  if (!taskIdNum || !userIdNum || isNaN(taskIdNum) || isNaN(userIdNum)) {
    console.warn('无效日志参数，跳过写入', { taskId, userId, action })
    return
  }
  const now = new Date().toISOString()
  const detailStr = detail ? JSON.stringify(detail) : null
  await db.prepare(`
    INSERT INTO task_logs (task_id, user_id, action, detail, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(taskIdNum, userIdNum, action || '', detailStr, now).run()
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
    // 1. 获取任务列表（自己创建的 + 共享给我的）
    if (request.method === 'GET' && path === '/api/tasks') {
      const { results } = await db.prepare(`
        SELECT
          tasks.*,
          owner.username AS owner_username,
          CASE WHEN tasks.user_id = ? THEN 'owner' ELSE task_shares.permission END AS current_role,
          (SELECT COUNT(*) FROM task_shares AS share_count WHERE share_count.task_id = tasks.id) AS share_count
        FROM tasks
        LEFT JOIN task_shares
          ON tasks.id = task_shares.task_id
          AND task_shares.shared_with_user_id = ?
        LEFT JOIN users AS owner ON tasks.user_id = owner.id
        WHERE
          tasks.user_id = ?
          OR task_shares.shared_with_user_id = ?
        ORDER BY tasks.created_at DESC
      `).bind(userId, userId, userId, userId).all()
      const { results: sharedUsers } = await db.prepare(`
        SELECT task_shares.task_id, users.username, task_shares.permission
        FROM task_shares
        INNER JOIN tasks ON tasks.id = task_shares.task_id
        INNER JOIN users ON users.id = task_shares.shared_with_user_id
        WHERE tasks.user_id = ?
        ORDER BY task_shares.task_id, users.username
      `).bind(userId).all()
      const usernamesByTask = new Map()
      for (const share of sharedUsers) {
        const members = usernamesByTask.get(share.task_id) ?? []
        if (members.length < 3) members.push({ username: share.username, permission: share.permission })
        usernamesByTask.set(share.task_id, members)
      }
      return Response.json(results.map((task) => ({
        ...toCamel(task),
        shareMembers: usernamesByTask.get(task.id) ?? [],
      })))
    }

    // 2. 新增任务
    if (request.method === 'POST' && path === '/api/tasks') {
      const body = await request.json()
      const data = toSnake(body)
      const now = new Date().toISOString()

      const createdTask = await db.prepare(`
        INSERT INTO tasks (user_id, title, description, status, priority, due_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `).bind(
        userId,
        data.title,
        data.description || '',
        data.status || 'todo',
        data.priority || 'medium',
        data.due_date || null,
        now
      ).first()

      const taskId = createdTask?.id
      if (taskId == null) {
        throw new Error('创建任务后未返回任务 ID')
      }
      await addLog(db, taskId, userId, 'create', { title: data.title })
      return Response.json({ ok: true, id: taskId })
    }

    // 3. 更新任务（需编辑权限）
    if (request.method === 'PUT' && path === '/api/tasks') {
      const body = await request.json()
      const data = toSnake(body)

      const task = await checkTaskPermission(db, data.id, userId, 'edit')
      if (!task) {
        return Response.json({ error: '无权限操作此任务' }, { status: 403 })
      }

      const nextTask = {
        title: data.title ?? task.title,
        description: data.description ?? task.description,
        status: data.status ?? task.status,
        priority: data.priority ?? task.priority,
        due_date: Object.prototype.hasOwnProperty.call(data, 'due_date') ? data.due_date : task.due_date,
      }
      const fields = ['title', 'description', 'status', 'priority', 'due_date']
      const changes = Object.fromEntries(
        fields.flatMap((field) => {
          const before = task[field] ?? null
          const after = nextTask[field] ?? null
          return before === after ? [] : [[field.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), { before, after }]]
        })
      )
      if (Object.keys(changes).length === 0) {
        return Response.json({ ok: true, changed: false })
      }

      await db.prepare(`
        UPDATE tasks
        SET title = ?, description = ?, status = ?, priority = ?, due_date = ?
        WHERE id = ?
      `).bind(
        nextTask.title,
        nextTask.description,
        nextTask.status,
        nextTask.priority,
        nextTask.due_date,
        data.id
      ).run()

      await addLog(db, data.id, userId, 'update', { changes })
      return Response.json({ ok: true })
    }

    // 4. 删除任务（仅创建者可操作）
    if (request.method === 'DELETE' && path === '/api/tasks') {
      const taskIdStr = url.searchParams.get('id')
      const taskId = Number(taskIdStr)

      if (!taskId || isNaN(taskId)) {
        return Response.json({ error: '无效的任务ID' }, { status: 400 })
      }

      const task = await checkTaskPermission(db, taskId, userId, 'owner')
      if (!task) {
        return Response.json({ error: '无权限删除此任务' }, { status: 403 })
      }

      const { results: shares } = await db.prepare(`
        SELECT shared_with_user_id, permission FROM task_shares WHERE task_id = ?
      `).bind(taskId).all()
      await db.batch([
        db.prepare('DELETE FROM task_logs WHERE task_id = ?').bind(taskId),
        db.prepare('DELETE FROM task_shares WHERE task_id = ?').bind(taskId),
        db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').bind(taskId, userId),
      ])
      for (const share of shares) {
        await recordTaskShareEvent(db, {
          taskId,
          taskTitle: task.title,
          actorUserId: userId,
          targetUserId: share.shared_with_user_id,
          permission: share.permission,
          action: 'revoked',
          createdAt: new Date().toISOString(),
        })
      }

      return Response.json({ ok: true })
    }

    // 5. 获取任务操作日志（需查看权限）
    if (request.method === 'GET' && path === '/api/tasks/logs') {
      const taskId = url.searchParams.get('taskId')
      const taskIdNum = Number(taskId)

      if (!taskIdNum || isNaN(taskIdNum)) {
        return Response.json({ error: '无效的任务ID' }, { status: 400 })
      }

      const task = await checkTaskPermission(db, taskIdNum, userId, 'view')
      if (!task) {
        return Response.json({ error: '无权限查看' }, { status: 403 })
      }

      const { results } = await db.prepare(`
        SELECT
          task_logs.*,
          users.username as user_name,
          share_target.username as target_user_name
        FROM task_logs
        LEFT JOIN users ON task_logs.user_id = users.id
        LEFT JOIN users AS share_target
          ON share_target.id = json_extract(task_logs.detail, '$.targetUserId')
        WHERE task_id = ?
        ORDER BY created_at DESC
      `).bind(taskIdNum).all()

      return Response.json(results.map(toCamel))
    }

    // ========== 新增：共享相关接口 ==========
    // 6. 获取任务共享列表（仅创建者）
    if (request.method === 'GET' && path === '/api/tasks/shares') {
      const taskId = url.searchParams.get('taskId')
      const taskIdNum = Number(taskId)

      if (!taskIdNum || isNaN(taskIdNum)) {
        return Response.json({ error: '无效的任务ID' }, { status: 400 })
      }

      const task = await checkTaskPermission(db, taskIdNum, userId, 'owner')
      if (!task) {
        return Response.json({ error: '无权限管理共享' }, { status: 403 })
      }

      const { results } = await db.prepare(`
        SELECT
          task_shares.*,
          users.username as shared_with_username
        FROM task_shares
        LEFT JOIN users ON task_shares.shared_with_user_id = users.id
        WHERE task_id = ?
        ORDER BY created_at DESC
      `).bind(taskIdNum).all()

      return Response.json(results.map(toCamel))
    }

    // 7. 添加/更新共享（仅创建者）
    if (request.method === 'POST' && path === '/api/tasks/share') {
      const body = await request.json()
      const { taskId, sharedWithUserId, permission = 'viewer' } = body

      const taskIdNum = Number(taskId)
      const sharedUserIdNum = Number(sharedWithUserId)

      if (!taskIdNum || !sharedUserIdNum || isNaN(taskIdNum) || isNaN(sharedUserIdNum)) {
        return Response.json({ error: '参数无效' }, { status: 400 })
      }

      const task = await checkTaskPermission(db, taskIdNum, userId, 'owner')
      if (!task) {
        return Response.json({ error: '无权限管理共享' }, { status: 403 })
      }

      if (sharedUserIdNum === userId) {
        return Response.json({ error: '不能共享给自己' }, { status: 400 })
      }
      if (!['viewer', 'editor'].includes(permission)) {
        return Response.json({ error: '共享权限无效' }, { status: 400 })
      }

      const targetUser = await db.prepare('SELECT username FROM users WHERE id = ?').bind(sharedUserIdNum).first()
      if (!targetUser) {
        return Response.json({ error: '目标用户不存在' }, { status: 404 })
      }

      const lowUserId = Math.min(Number(userId), sharedUserIdNum)
      const highUserId = Math.max(Number(userId), sharedUserIdNum)
      const trust = await db.prepare(
        'SELECT 1 AS trusted FROM user_trusts WHERE user_low_id = ? AND user_high_id = ?',
      ).bind(lowUserId, highUserId).first()
      if (!trust) {
        return Response.json({ error: '请先建立信任关系，或发送任务邀请' }, { status: 403 })
      }

      const existingShare = await db.prepare(`
        SELECT permission FROM task_shares WHERE task_id = ? AND shared_with_user_id = ?
      `).bind(taskIdNum, sharedUserIdNum).first()
      const now = new Date().toISOString()
      try {
        await db.prepare(`
          INSERT INTO task_shares (task_id, shared_with_user_id, permission, created_at)
          VALUES (?, ?, ?, ?)
        `).bind(taskIdNum, sharedUserIdNum, permission, now).run()
      } catch (e) {
        // 唯一约束冲突，更新权限
        await db.prepare(`
          UPDATE task_shares SET permission = ? WHERE task_id = ? AND shared_with_user_id = ?
        `).bind(permission, taskIdNum, sharedUserIdNum).run()
      }

      await addLog(db, taskIdNum, userId, 'share', {
        targetUser: targetUser.username,
        permission
      })
      if (!existingShare || existingShare.permission !== permission) {
        await recordTaskShareEvent(db, {
          taskId: taskIdNum,
          taskTitle: task.title,
          actorUserId: userId,
          targetUserId: sharedUserIdNum,
          permission,
          action: 'shared',
          createdAt: now,
        })
      }

      return Response.json({ ok: true })
    }

    // 8. 创建者可撤销共享，接收者可退出共享
    if (request.method === 'DELETE' && path === '/api/tasks/share') {
      const taskIdNum = Number(url.searchParams.get('taskId'))
      if (!Number.isSafeInteger(taskIdNum) || taskIdNum <= 0) {
        return Response.json({ error: '参数无效' }, { status: 400 })
      }

      const task = await db.prepare(`
        SELECT tasks.user_id, tasks.title, owner.username AS owner_username
        FROM tasks
        JOIN users AS owner ON owner.id = tasks.user_id
        WHERE tasks.id = ?
      `).bind(taskIdNum).first()
      if (!task) return Response.json({ error: '任务不存在' }, { status: 404 })

      const isOwner = Number(task.user_id) === Number(userId)
      const requestedUserId = url.searchParams.get('userId')
      let sharedUserIdNum = Number(userId)
      if (isOwner) {
        sharedUserIdNum = Number(requestedUserId)
        if (!Number.isSafeInteger(sharedUserIdNum) || sharedUserIdNum <= 0) {
          return Response.json({ error: '共享用户无效' }, { status: 400 })
        }
      } else if (requestedUserId !== null && Number(requestedUserId) !== Number(userId)) {
        return Response.json({ error: '无权限移除其他用户的共享' }, { status: 403 })
      }

      const targetUser = await db.prepare(`
        SELECT users.username, task_shares.permission FROM task_shares
        LEFT JOIN users ON users.id = task_shares.shared_with_user_id
        WHERE task_shares.task_id = ? AND task_shares.shared_with_user_id = ?
      `).bind(taskIdNum, sharedUserIdNum).first()
      if (!targetUser) return Response.json({ error: '共享关系不存在' }, { status: 404 })

      await db.prepare(`
        DELETE FROM task_shares WHERE task_id = ? AND shared_with_user_id = ?
      `).bind(taskIdNum, sharedUserIdNum).run()
      await recordTaskShareEvent(db, {
        taskId: taskIdNum,
        taskTitle: task.title,
        actorUserId: userId,
        targetUserId: isOwner ? sharedUserIdNum : Number(task.user_id),
        permission: targetUser.permission,
        action: isOwner ? 'revoked' : 'left',
        createdAt: new Date().toISOString(),
      })
      if (isOwner) {
        await db.prepare(`
          UPDATE task_share_invites SET status = 'revoked'
          WHERE task_id = ? AND recipient_user_id = ? AND status = 'pending'
        `).bind(taskIdNum, sharedUserIdNum).run()
      }

      await addLog(db, taskIdNum, userId, 'unshare', {
        targetUser: isOwner ? targetUser.username : task.owner_username,
      })

      return Response.json({ ok: true })
    }

    return new Response('Not Found', { status: 404 })
  } catch (err) {
    console.error(err)
    return Response.json({ error: '数据库错误' }, { status: 500 })
  }
}
