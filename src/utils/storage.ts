import type { Task, TaskCreateData } from '../types/task'

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
      window.dispatchEvent(new Event('workspace:auth-expired'))
      throw new Error('未登录')
    }
    throw new Error('读取任务失败')
  }
  return res.json()
}

// 新增任务
export async function addTask(task: TaskCreateData): Promise<number> {
  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(task)
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '新增任务失败')
  return data.id
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

export async function getTrustOverview() {
  const res = await fetch('/api/trust', { headers: getHeaders() })
  if (!res.ok) throw new Error('获取信任关系失败')
  return res.json()
}

export async function requestTrust(username: string) {
  const res = await fetch('/api/trust', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ action: 'request', username }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '发送信任申请失败')
  return data
}

export async function respondTrustRequest(requestId: number, action: 'accept' | 'reject' | 'cancel') {
  const res = await fetch('/api/trust', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ action, requestId }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '处理信任申请失败')
  return data
}

export async function removeTrust(userId: number) {
  const res = await fetch(`/api/trust?userId=${userId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '解除信任失败')
  return data
}

// 获取任务共享列表
export async function getTaskShares(taskId: number) {
  const res = await fetch(`/api/tasks/shares?taskId=${taskId}`, { headers: getHeaders() })
  if (!res.ok) throw new Error('获取共享列表失败')
  return res.json()
}

// 添加任务共享
export async function addTaskShare(taskId: number, sharedWithUserId: number, permission: 'viewer' | 'editor') {
  const res = await fetch('/api/tasks/share', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ taskId, sharedWithUserId, permission })
  })
  if (!res.ok) throw new Error('添加共享失败')
  return res.json()
}

// 移除任务共享
export async function removeTaskShare(taskId: number, sharedWithUserId: number) {
  const res = await fetch(`/api/tasks/share?taskId=${taskId}&userId=${sharedWithUserId}`, {
    method: 'DELETE',
    headers: getHeaders()
  })
  if (!res.ok) throw new Error('移除共享失败')
  return res.json()
}

export async function leaveTaskShare(taskId: number) {
  const res = await fetch(`/api/tasks/share?taskId=${taskId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '退出任务共享失败')
  return data
}

export async function getTaskInvites(taskId?: number, scope: 'received' | 'sent' = 'received') {
  const params = new URLSearchParams()
  if (taskId) params.set('taskId', String(taskId))
  if (scope === 'sent') params.set('scope', 'sent')

  const res = await fetch(`/api/task-invites${params.toString() ? `?${params.toString()}` : ''}`, { headers: getHeaders() })
  if (!res.ok) throw new Error('获取任务邀请失败')
  return res.json()
}

export async function getSentTaskInvites() {
  return getTaskInvites(undefined, 'sent')
}

export async function getCollaborationEvents() {
  const res = await fetch('/api/collaboration', { headers: getHeaders() })
  if (!res.ok) throw new Error('获取共享记录失败')
  return res.json()
}

export async function markCollaborationEventRead(eventId: number) {
  const res = await fetch('/api/collaboration', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ action: 'mark-read', eventId }),
  })
  if (!res.ok) throw new Error('标记通知失败')
  return res.json()
}

export async function inviteTaskShare(taskId: number, username: string, permission: 'viewer' | 'editor') {
  const res = await fetch('/api/task-invites', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ action: 'invite', taskId, username, permission }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '发送任务邀请失败')
  return data
}

export async function createTaskShareCode(taskId: number, permission: 'viewer' | 'editor') {
  const res = await fetch('/api/task-invites', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ action: 'create-code', taskId, permission }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '生成共享码失败')
  return data
}

export async function redeemTaskShareCode(code: string) {
  const res = await fetch('/api/task-invites', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ action: 'redeem-code', code }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '兑换共享码失败')
  return data
}

export async function respondTaskInvite(inviteId: number, action: 'accept' | 'reject') {
  const res = await fetch('/api/task-invites', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ action, inviteId }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '处理任务邀请失败')
  return data
}

export async function revokeTaskInvite(inviteId: number) {
  const res = await fetch(`/api/task-invites?inviteId=${inviteId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '撤回任务邀请失败')
  return data
}
