import { reactive, watch } from 'vue'
import type { Task } from '../types/task'
import { hasStoredTasks, loadTasks, saveTasks } from '../utils/storage'

function createExampleTasks(): Task[] {
  return [
    {
      id: 'task-1',
      title: '梳理产品需求与用户流程',
      description: '整理核心使用场景，明确任务列表的第一版功能范围。',
      status: 'in-progress',
      priority: 'high',
      dueDate: '2026-10-10',
      createdAt: '2026-10-06T09:00:00.000Z',
    },
    {
      id: 'task-2',
      title: '搭建 Vue 项目基础结构',
      description: '完成页面入口、组件组织方式和 Tailwind CSS 配置。',
      status: 'todo',
      priority: 'medium',
      dueDate: '2026-10-12',
      createdAt: '2026-10-05T09:00:00.000Z',
    },
    {
      id: 'task-3',
      title: '规划本周工作安排',
      description: '将待办事项拆分为清晰、可执行的小步骤。',
      status: 'todo',
      priority: 'low',
      dueDate: '2026-10-14',
      createdAt: '2026-10-04T09:00:00.000Z',
    },
  ]
}

const savedTasks = loadTasks()

export const taskStore = reactive({
  tasks: hasStoredTasks() ? savedTasks : createExampleTasks(),
})

watch(
  () => taskStore.tasks,
  (tasks) => saveTasks(tasks),
  { deep: true, immediate: true },
)

export function addTask(task: Task): void {
  taskStore.tasks.push(task)
}

export function updateTask(updatedTask: Task): void {
  const taskIndex = taskStore.tasks.findIndex((task) => task.id === updatedTask.id)
  if (taskIndex !== -1) taskStore.tasks[taskIndex] = updatedTask
}

export function deleteTask(deletedTask: Task): void {
  const taskIndex = taskStore.tasks.findIndex((task) => task.id === deletedTask.id)
  if (taskIndex !== -1) taskStore.tasks.splice(taskIndex, 1)
}
