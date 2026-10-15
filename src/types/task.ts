export type TaskStatus = 'todo' | 'in-progress' | 'done'

export type TaskPriority = 'low' | 'medium' | 'high'

export interface Task {
  id: number
  userId: number
  ownerUsername?: string
  currentRole?: 'owner' | 'editor' | 'viewer'
  shareCount?: number
  shareMembers?: { username: string; permission: 'viewer' | 'editor' }[]
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  dueDate: string
  createdAt: string
}

export type TaskFormData = Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'dueDate'>
  & Partial<Pick<Task, 'id' | 'createdAt'>>

export type TaskCreateData = Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'dueDate'>
