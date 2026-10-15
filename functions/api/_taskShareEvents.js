export async function recordTaskShareEvent(db, event) {
  await db.prepare(`
    INSERT INTO task_share_events (
      task_id, task_title, actor_user_id, target_user_id, permission, action, created_at, read_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    event.taskId,
    event.taskTitle,
    event.actorUserId,
    event.targetUserId,
    event.permission,
    event.action,
    event.createdAt,
    event.readAt ?? null,
  ).run()
}
