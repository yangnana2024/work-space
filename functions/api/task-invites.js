import { getCurrentUser } from './_utils'
import { checkTaskPermission } from './_taskAccess'
import { recordTaskShareEvent } from './_taskShareEvents'

const toCamel = (row) => {
  if (!row) return row
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_, character) => character.toUpperCase()),
    value,
  ]))
}

async function hashCode(code) {
  const bytes = new TextEncoder().encode(code)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function createCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function trustPair(firstUserId, secondUserId) {
  return [Math.min(Number(firstUserId), Number(secondUserId)), Math.max(Number(firstUserId), Number(secondUserId))]
}

async function writeTaskShare(db, taskId, userId, permission, actorUserId, now) {
  const targetUser = await db.prepare('SELECT username FROM users WHERE id = ?').bind(userId).first()
  const existingShare = await db.prepare(`
    SELECT permission FROM task_shares WHERE task_id = ? AND shared_with_user_id = ?
  `).bind(taskId, userId).first()

  await db.prepare(`
    INSERT INTO task_shares (task_id, shared_with_user_id, permission, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(task_id, shared_with_user_id) DO UPDATE SET permission = excluded.permission
  `).bind(taskId, userId, permission, now).run()

  const logDetail = JSON.stringify({
    targetUser: targetUser?.username ?? '未知用户',
    targetUserId: userId,
    permission,
  })
  await db.prepare(`
    INSERT INTO task_logs (task_id, user_id, action, detail, created_at)
    VALUES (?, ?, 'share', ?, ?)
  `).bind(taskId, actorUserId, logDetail, now).run()

  if (!existingShare || existingShare.permission !== permission) {
    const task = await db.prepare('SELECT title FROM tasks WHERE id = ?').bind(taskId).first()
    if (task) {
      await recordTaskShareEvent(db, {
        taskId,
        taskTitle: task.title,
        actorUserId,
        targetUserId: userId,
        permission,
        action: 'shared',
        createdAt: now,
      })
    }
  }
}

export async function onRequest({ request, env }) {
  const currentUserId = await getCurrentUser(request, env)
  if (!currentUserId) return Response.json({ error: '未登录' }, { status: 401 })

  const db = env.DB
  const url = new URL(request.url)
  const now = new Date().toISOString()

  try {
    if (request.method === 'GET') {
      const taskIdValue = url.searchParams.get('taskId')
      const scope = url.searchParams.get('scope')

      if (taskIdValue) {
        const taskId = Number(taskIdValue)
        if (!Number.isSafeInteger(taskId) || taskId <= 0) {
          return Response.json({ error: '任务无效' }, { status: 400 })
        }

        const task = await checkTaskPermission(db, taskId, currentUserId, 'owner')
        if (!task) return Response.json({ error: '无权限查看邀请' }, { status: 403 })

        const { results } = await db.prepare(`
          SELECT task_share_invites.id, task_share_invites.recipient_user_id,
            task_share_invites.permission, task_share_invites.status,
            task_share_invites.created_at, task_share_invites.expires_at,
            users.username AS recipient_username
          FROM task_share_invites
          LEFT JOIN users ON users.id = task_share_invites.recipient_user_id
          WHERE task_share_invites.task_id = ?
            AND task_share_invites.inviter_user_id = ?
            AND task_share_invites.status = 'pending'
            AND task_share_invites.expires_at > ?
          ORDER BY task_share_invites.created_at DESC
        `).bind(taskId, currentUserId, now).all()

        return Response.json(results.map(toCamel))
      }

      if (scope === 'sent') {
        const { results } = await db.prepare(`
          SELECT task_share_invites.id, task_share_invites.task_id,
            task_share_invites.recipient_user_id, task_share_invites.permission,
            task_share_invites.created_at, task_share_invites.expires_at,
            tasks.title AS task_title, recipient.username AS recipient_username
          FROM task_share_invites
          JOIN tasks ON tasks.id = task_share_invites.task_id
          LEFT JOIN users AS recipient ON recipient.id = task_share_invites.recipient_user_id
          WHERE task_share_invites.inviter_user_id = ?
            AND task_share_invites.status = 'pending'
            AND task_share_invites.expires_at > ?
          ORDER BY task_share_invites.created_at DESC
        `).bind(currentUserId, now).all()

        return Response.json(results.map(toCamel))
      }

      const { results } = await db.prepare(`
        SELECT task_share_invites.id, task_share_invites.task_id,
          task_share_invites.inviter_user_id, task_share_invites.permission,
          task_share_invites.created_at, task_share_invites.expires_at,
          tasks.title AS task_title, users.username AS inviter_username
        FROM task_share_invites
        JOIN tasks ON tasks.id = task_share_invites.task_id
        JOIN users ON users.id = task_share_invites.inviter_user_id
        WHERE task_share_invites.recipient_user_id = ?
          AND task_share_invites.status = 'pending'
          AND task_share_invites.expires_at > ?
        ORDER BY task_share_invites.created_at DESC
      `).bind(currentUserId, now).all()

      return Response.json(results.map(toCamel))
    }

    if (request.method === 'POST') {
      const body = await request.json()
      const permission = body.permission || 'viewer'

      if (!['viewer', 'editor'].includes(permission)) {
        return Response.json({ error: '共享权限无效' }, { status: 400 })
      }

      if (body.action === 'invite') {
        const taskId = Number(body.taskId)
        const username = typeof body.username === 'string' ? body.username.trim() : ''

        if (!Number.isSafeInteger(taskId) || taskId <= 0 || !username) {
          return Response.json({ error: '任务或用户名无效' }, { status: 400 })
        }

        const task = await checkTaskPermission(db, taskId, currentUserId, 'owner')
        if (!task) return Response.json({ error: '只有任务创建者可以共享' }, { status: 403 })

        const recipient = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first()
        if (!recipient) return Response.json({ error: '没有找到该用户名' }, { status: 404 })

        if (Number(recipient.id) === Number(currentUserId)) {
          return Response.json({ error: '不能共享给自己' }, { status: 400 })
        }

        const [lowUserId, highUserId] = trustPair(currentUserId, recipient.id)
        const trust = await db.prepare(
          'SELECT 1 AS trusted FROM user_trusts WHERE user_low_id = ? AND user_high_id = ?',
        ).bind(lowUserId, highUserId).first()

        if (trust) {
          await writeTaskShare(db, taskId, recipient.id, permission, currentUserId, now)
          return Response.json({ ok: true, shared: true })
        }

        // 修复：status 加表前缀，避免歧义
        const duplicate = await db.prepare(`
          SELECT id FROM task_share_invites
          WHERE task_id = ? AND recipient_user_id = ?
            AND task_share_invites.status = 'pending' AND expires_at > ?
        `).bind(taskId, recipient.id, now).first()

        if (duplicate) return Response.json({ error: '该用户已有待处理邀请' }, { status: 409 })

        await db.prepare(`
          INSERT INTO task_share_invites
            (task_id, inviter_user_id, recipient_user_id, permission, status, created_at, expires_at)
          VALUES (?, ?, ?, ?, 'pending', ?, ?)
        `).bind(
          taskId,
          currentUserId,
          recipient.id,
          permission,
          now,
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        ).run()

        // 新增 create_invite 操作日志
        await db.prepare(`
          INSERT INTO task_logs (task_id, user_id, action, detail, created_at)
          VALUES (?, ?, 'create_invite', ?, ?)
        `).bind(
          taskId,
          currentUserId,
          JSON.stringify({
            recipientUserId: recipient.id,
            recipientUser: username,
            permission
          }),
          now
        ).run()

        return Response.json({ ok: true, shared: false, invited: true })
      }

      if (body.action === 'create-code') {
        const taskId = Number(body.taskId)
        if (!Number.isSafeInteger(taskId) || taskId <= 0) {
          return Response.json({ error: '任务无效' }, { status: 400 })
        }

        const task = await checkTaskPermission(db, taskId, currentUserId, 'owner')
        if (!task) return Response.json({ error: '只有任务创建者可以共享' }, { status: 403 })

        const code = createCode()
        const codeHash = await hashCode(code)
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

        await db.prepare(`
          INSERT INTO task_share_invites
            (task_id, inviter_user_id, invite_code_hash, permission, status, created_at, expires_at)
          VALUES (?, ?, ?, ?, 'pending', ?, ?)
        `).bind(taskId, currentUserId, codeHash, permission, now, expiresAt).run()

        return Response.json({ ok: true, code, expiresAt })
      }

      if (body.action === 'redeem-code') {
        const code = typeof body.code === 'string' ? body.code.trim() : ''
        if (!/^[A-Za-z0-9_-]{16}$/.test(code)) {
          return Response.json({ error: '共享码无效或已过期' }, { status: 400 })
        }

        // 核心修复：status 加表前缀 task_share_invites，解决多表关联字段歧义
        const invite = await db.prepare(`
          SELECT task_share_invites.id, task_share_invites.task_id,
            task_share_invites.inviter_user_id,
            users.username AS inviter_username,
            task_share_invites.permission,
            tasks.title AS task_title
          FROM task_share_invites
          JOIN tasks ON tasks.id = task_share_invites.task_id
          JOIN users ON users.id = task_share_invites.inviter_user_id
          WHERE invite_code_hash = ? AND task_share_invites.status = 'pending'
            AND recipient_user_id IS NULL AND expires_at > ?
        `).bind(await hashCode(code), now).first()

        if (!invite) return Response.json({ error: '共享码无效或已过期' }, { status: 404 })

        if (Number(invite.inviter_user_id) === Number(currentUserId)) {
          return Response.json({ error: '不能兑换自己创建的共享码' }, { status: 400 })
        }

        const updateResult = await db.prepare(`
          UPDATE task_share_invites
          SET status = 'accepted', recipient_user_id = ?, accepted_at = ?
          WHERE id = ? AND status = 'pending' AND recipient_user_id IS NULL AND expires_at > ?
        `).bind(currentUserId, now, invite.id, now).run()

        if (updateResult.meta.changes !== 1) {
          return Response.json({ error: '共享码已被使用' }, { status: 409 })
        }

        await db.prepare(`
          INSERT INTO task_shares (task_id, shared_with_user_id, permission, created_at)
          SELECT task_id, ?, permission, ? FROM task_share_invites
          WHERE id = ? AND status = 'accepted' AND recipient_user_id = ? AND accepted_at = ?
          ON CONFLICT(task_id, shared_with_user_id) DO NOTHING
        `).bind(currentUserId, now, invite.id, currentUserId, now).run()

        // 兑换共享码，action改为 accept_invite
        await db.prepare(`
          INSERT INTO task_logs (task_id, user_id, action, detail, created_at)
          SELECT task_id, ?, 'accept_invite', ?, ? FROM task_share_invites
          WHERE id = ? AND status = 'accepted' AND recipient_user_id = ? AND accepted_at = ?
        `).bind(
          currentUserId,
          JSON.stringify({
            source: 'code',
            permission: invite.permission,
            inviterUserId: invite.inviter_user_id,
            inviterUser: invite.inviter_username
          }),
          now,
          invite.id,
          currentUserId,
          now
        ).run()

        await recordTaskShareEvent(db, {
          taskId: invite.task_id,
          taskTitle: invite.task_title,
          actorUserId: invite.inviter_user_id,
          targetUserId: currentUserId,
          permission: invite.permission,
          action: 'shared',
          createdAt: now,
          readAt: now,
        })

        return Response.json({ ok: true, taskId: invite.task_id })
      }

      if (body.action === 'accept' || body.action === 'reject') {
        const inviteId = Number(body.inviteId)
        if (!Number.isSafeInteger(inviteId) || inviteId <= 0) {
          return Response.json({ error: '邀请无效' }, { status: 400 })
        }

        // 增加 JOIN users 获取邀请人用户名
        const invite = await db.prepare(`
          SELECT task_share_invites.id, task_share_invites.task_id,
            task_share_invites.inviter_user_id,
            users.username AS inviter_username,
            task_share_invites.permission,
            tasks.title AS task_title
          FROM task_share_invites
          JOIN tasks ON tasks.id = task_share_invites.task_id
          JOIN users ON users.id = task_share_invites.inviter_user_id
          WHERE task_share_invites.id = ?
            AND task_share_invites.recipient_user_id = ?
            AND task_share_invites.status = 'pending'
            AND task_share_invites.expires_at > ?
        `).bind(inviteId, currentUserId, now).first()

        if (!invite) return Response.json({ error: '邀请不存在或已过期' }, { status: 404 })

        if (body.action === 'accept') {
          const updateResult = await db.prepare(`
            UPDATE task_share_invites SET status = 'accepted', accepted_at = ?
            WHERE id = ? AND recipient_user_id = ? AND status = 'pending' AND expires_at > ?
          `).bind(now, inviteId, currentUserId, now).run()

          if (updateResult.meta.changes !== 1) {
            return Response.json({ error: '邀请已被处理' }, { status: 409 })
          }

          await db.prepare(`
            INSERT INTO task_shares (task_id, shared_with_user_id, permission, created_at)
            SELECT task_id, ?, permission, ? FROM task_share_invites
            WHERE id = ? AND status = 'accepted' AND recipient_user_id = ? AND accepted_at = ?
            ON CONFLICT(task_id, shared_with_user_id) DO UPDATE SET permission = excluded.permission
          `).bind(currentUserId, now, inviteId, currentUserId, now).run()

          await db.prepare(`
            INSERT INTO task_logs (task_id, user_id, action, detail, created_at)
            SELECT task_id, ?, 'accept_invite', ?, ? FROM task_share_invites
            WHERE id = ? AND status = 'accepted' AND recipient_user_id = ? AND accepted_at = ?
          `).bind(
            currentUserId,
            JSON.stringify({
              source: 'accepted-invite',
              permission: invite.permission,
              inviterUserId: invite.inviter_user_id,
              inviterUser: invite.inviter_username
            }),
            now,
            inviteId,
            currentUserId,
            now
          ).run()

          await recordTaskShareEvent(db, {
            taskId: invite.task_id,
            taskTitle: invite.task_title,
            actorUserId: invite.inviter_user_id,
            targetUserId: currentUserId,
            permission: invite.permission,
            action: 'shared',
            createdAt: now,
            readAt: now,
          })
        } else {
          // reject 分支，新增 reject_invite 日志
          const result = await db.prepare(`
            UPDATE task_share_invites SET status = 'rejected'
            WHERE id = ? AND recipient_user_id = ? AND status = 'pending' AND expires_at > ?
          `).bind(inviteId, currentUserId, now).run()

          if (result.meta.changes !== 1) return Response.json({ error: '邀请已被处理' }, { status: 409 })

          await db.prepare(`
            INSERT INTO task_logs (task_id, user_id, action, detail, created_at)
            VALUES (?, ?, 'reject_invite', ?, ?)
          `).bind(
            invite.task_id,
            currentUserId,
            JSON.stringify({
              inviterUserId: invite.inviter_user_id,
              inviterUser: invite.inviter_username
            }),
            now
          ).run()
        }

        return Response.json({ ok: true })
      }

      return Response.json({ error: '不支持的操作' }, { status: 400 })
    }

    if (request.method === 'DELETE') {
      const inviteId = Number(url.searchParams.get('inviteId'))
      if (!Number.isSafeInteger(inviteId) || inviteId <= 0) {
        return Response.json({ error: '邀请无效' }, { status: 400 })
      }

      // 先查询邀请，拿到任务ID、接收人信息
      const invite = await db.prepare(`
        SELECT task_share_invites.task_id, task_share_invites.recipient_user_id,
          users.username AS recipient_username
        FROM task_share_invites
        LEFT JOIN users ON users.id = task_share_invites.recipient_user_id
        WHERE task_share_invites.id = ?
          AND task_share_invites.inviter_user_id = ?
          AND task_share_invites.status = 'pending'
      `).bind(inviteId, currentUserId).first()

      if (!invite) {
        return Response.json({ error: '邀请不存在或者不是待处理状态'}, { status: 404 })
      }

      await db.prepare(`
        UPDATE task_share_invites SET status = 'revoked'
        WHERE id = ? AND inviter_user_id = ? AND status = 'pending'
      `).bind(inviteId, currentUserId).run()

      // 写入撤销邀请日志 revoke_invite
      await db.prepare(`
        INSERT INTO task_logs (task_id, user_id, action, detail, created_at)
        VALUES (?, ?, 'revoke_invite', ?, ?)
      `).bind(
        invite.task_id,
        currentUserId,
        JSON.stringify({
          recipientUserId: invite.recipient_user_id,
          recipientUser: invite.recipient_username ?? '匿名共享码'
        }),
        now
      ).run()

      return Response.json({ ok: true })
    }

    return new Response('Method Not Allowed', { status: 405 })
  } catch (error) {
    let bodySnapshot = null
    try {
      bodySnapshot = await request.clone().json()
    } catch {
      bodySnapshot = null
    }

    console.error('task invite operation failed', {
      currentUserId,
      path: url.pathname,
      method: request.method,
      body: bodySnapshot,
      error,
    })

    return Response.json({ error: '任务邀请操作失败' }, { status: 500 })
  }
}
