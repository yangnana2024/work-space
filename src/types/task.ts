export type TaskStatus = 'todo' | 'in-progress' | 'done'

export type TaskPriority = 'low' | 'medium' | 'high'

export interface Task {
  id: number
  userId: number
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  dueDate: string
  createdAt: string
}
