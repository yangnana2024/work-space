export async function checkTaskPermission(db, taskId, userId, level = 'view') {
  const task = await db.prepare('SELECT * FROM tasks WHERE id = ?').bind(taskId).first()
  if (!task) return null

  if (Number(task.user_id) === Number(userId)) return task

  if (level === 'view') {
    const share = await db.prepare(
      'SELECT * FROM task_shares WHERE task_id = ? AND shared_with_user_id = ?',
    ).bind(taskId, userId).first()
    if (share) return task
  }

  if (level === 'edit') {
    const share = await db.prepare(
      'SELECT * FROM task_shares WHERE task_id = ? AND shared_with_user_id = ? AND permission = ?',
    ).bind(taskId, userId, 'editor').first()
    if (share) return task
  }

  return null
}