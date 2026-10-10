import type { Task } from '../types/task'

const STORAGE_KEY = 'work-space-tasks'

export function hasStoredTasks(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null
  } catch {
    return false
  }
}

export function saveTasks(tasks: Task[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  } catch (error) {
    console.error('无法保存任务到 localStorage', error)
  }
}

export function loadTasks(): Task[] {
  try {
    const savedTasks = localStorage.getItem(STORAGE_KEY)
    if (!savedTasks) return []

    const parsedTasks: unknown = JSON.parse(savedTasks)
    return Array.isArray(parsedTasks) ? (parsedTasks as Task[]) : []
  } catch {
    return []
  }
}
