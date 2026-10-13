import type { Task } from '../types/task'

// 获取 Token
const getToken = (): string => {
  return localStorage.getItem('workspace_token') || ''
}

// 统一请求头
const getHeaders = (): HeadersInit => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const token = getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

// 认证接口
export async function register(username: string, password: string) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '注册失败')
  return data
}

export async function login(username: string, password: string) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '登录失败')
  return data
}

// 登出
export function logout() {
  localStorage.removeItem('workspace_token')
  localStorage.removeItem('workspace_user')
}

// 获取任务列表
export async function loadTasks(): Promise<Task[]> {
  const res = await fetch('/api/tasks', { headers: getHeaders() })
  if (!res.ok) {
    if (res.status === 401) {
      logout()
      throw new Error('未登录')
    }
    throw new Error('读取任务失败')
  }
  return res.json()
}

// 新增任务
export async function addTask(task: Omit<Task, 'id' | 'userId' | 'createdAt'>): Promise<void> {
  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(task)
  })
  if (!res.ok) throw new Error('新增任务失败')
}

// 更新任务
export async function updateTask(task: Partial<Task> & { id: number }): Promise<void> {
  const res = await fetch('/api/tasks', {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(task)
  })
  if (!res.ok) throw new Error('更新任务失败')
}

// 删除任务
export async function deleteTask(id: number): Promise<void> {
  const res = await fetch(`/api/tasks?id=${id}`, {
    method: 'DELETE',
    headers: getHeaders()
  })
  if (!res.ok) throw new Error('删除任务失败')
}

// 获取任务操作日志
export async function getTaskLogs(taskId: number) {
  const res = await fetch(`/api/tasks/logs?taskId=${taskId}`, {
    headers: getHeaders()
  })
  if (!res.ok) throw new Error('获取日志失败')
  return res.json()
}
