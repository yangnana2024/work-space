import type { Task } from '../types/task'

// 从D1云端获取全部任务
export async function loadTasks(): Promise<Task[]> {
  const res = await fetch('/api/tasks')
  if (!res.ok) {
    throw new Error('读取任务失败')
  }
  const data = await res.json()
  return data as Task[]
}

// 新增任务：剔除 createdAt，后端自动生成
export async function addTask(task: Omit<Task, 'id'>): Promise<void> {
  // 解构去掉 createdAt，只把剩下字段发给后端
  const { createdAt, ...submitData } = task
  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(submitData)
  })
  if (!res.ok) throw new Error('新增任务失败')
}

// 更新任务（修改状态/字段）
export async function updateTask(task: Partial<Task> & { id: number }): Promise<void> {
  const res = await fetch('/api/tasks', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(task)
  })
  if (!res.ok) throw new Error('更新任务失败')
}

// 删除任务
export async function deleteTask(id: number): Promise<void> {
  const res = await fetch('/api/tasks', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ id })
  })
  if (!res.ok) throw new Error('删除任务失败')
}
