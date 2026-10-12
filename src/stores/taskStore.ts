import { reactive } from 'vue'
import type { Task } from '../types/task'
// 导入云端接口函数
import { loadTasks, addTask as apiAddTask, updateTask as apiUpdateTask, deleteTask as apiDeleteTask } from '../utils/storage'

export const taskStore = reactive({
  tasks: [] as Task[],
  loading: false,
})

// 从云端D1加载任务
export async function fetchTasks() {
  taskStore.loading = true
  try {
    taskStore.tasks = await loadTasks()
  } catch (err) {
    console.error('加载云端任务失败', err)
    // 加载失败保持空列表，由页面展示空态提示
    taskStore.tasks = []
  } finally {
    taskStore.loading = false
  }
}

// 新增任务：调用后端API，成功后重新拉取列表
export async function addTask(task: Omit<Task, 'id'>) {
  await apiAddTask(task)
  await fetchTasks()
}

// 更新任务
export async function updateTask(updatedTask: Task) {
  await apiUpdateTask(updatedTask)
  await fetchTasks()
}

// 删除任务
export async function deleteTask(deletedTask: Task) {
  await apiDeleteTask(deletedTask.id)
  await fetchTasks()
}
