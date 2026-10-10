<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type { Task, TaskPriority, TaskStatus } from '../types/task'
import TaskPriorityPicker from './TaskPriorityPicker.vue'
import TaskStatusPicker from './TaskStatusPicker.vue'

const props = defineProps<{
  modelValue: boolean
  task: Task | null
}>()

const emit = defineEmits<{
  'update:modelValue': [isOpen: boolean]
  create: []
  submit: [task: Task]
}>()

function getLocalDate() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
}

function formatDate(date: string) {
  const [year, month, day] = date.split('-')
  return year && month && day ? `${year}年${month}月${day}日` : '请选择日期'
}

function openDatePicker() {
  const input = dueDateInput.value
  if (!input) return

  try {
    if (typeof input.showPicker === 'function') {
      input.showPicker()
      return
    }
  } catch {
    // Fall back for browsers that do not allow showPicker in this context.
  }

  input.click()
}

const titleError = ref(false)
const dueDateInput = ref<HTMLInputElement | null>(null)
const form = reactive({
  title: '',
  description: '',
  status: 'todo' as TaskStatus,
  priority: 'medium' as TaskPriority,
  dueDate: getLocalDate(),
})

watch(
  () => [props.modelValue, props.task] as const,
  ([isOpen, task]) => {
    if (!isOpen) return
    titleError.value = false
    form.title = task?.title ?? ''
    form.description = task?.description ?? ''
    form.status = task?.status ?? 'todo'
    form.priority = task?.priority ?? 'medium'
    form.dueDate = task?.dueDate ?? getLocalDate()
  },
  { immediate: true },
)

function closeModal() {
  emit('update:modelValue', false)
  titleError.value = false
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.modelValue) closeModal()
}

function submitTask() {
  const title = form.title.trim()
  if (!title) {
    titleError.value = true
    return
  }

  const now = new Date()

  emit('submit', {
    id: props.task?.id ?? crypto.randomUUID(),
    title,
    description: form.description.trim(),
    status: form.status,
    priority: form.priority,
    dueDate: form.dueDate,
    createdAt: props.task?.createdAt ?? now.toISOString(),
  })

  form.title = ''
  form.description = ''
  form.status = 'todo'
  form.priority = 'medium'
  form.dueDate = getLocalDate()
  closeModal()
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <button
    type="button"
    class="inline-flex min-h-11 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
    @click="emit('create')"
  >
    <span aria-hidden="true" class="text-lg leading-none">+</span>
    新建任务
  </button>

  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="modelValue"
        class="fixed inset-0 z-50 grid items-end overflow-y-auto bg-slate-950/45 p-0 sm:place-items-center sm:p-4"
        @click.self="closeModal"
      >
        <Transition
          appear
          enter-active-class="transition-transform duration-300 ease-out"
          enter-from-class="translate-y-full sm:translate-y-3"
          enter-to-class="translate-y-0"
          leave-active-class="transition-transform duration-200 ease-in"
          leave-from-class="translate-y-0"
          leave-to-class="translate-y-full sm:translate-y-3"
        >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-modal-title"
          class="max-h-[90dvh] w-full overflow-y-auto rounded-t-xl rounded-b-none bg-white p-5 shadow-2xl dark:bg-slate-900 sm:my-auto sm:max-w-lg sm:rounded-xl sm:p-6"
        >
          <div class="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 id="task-modal-title" class="m-0 text-xl font-semibold text-slate-900 dark:text-slate-100">{{ task ? '编辑任务' : '新建任务' }}</h2>
              <p class="mb-0 mt-1 text-sm text-slate-500 dark:text-slate-400">{{ task ? '更新任务信息；创建时间仅供查看。' : '填写任务信息，稍后也可以继续调整。' }}</p>
            </div>
            <button
              type="button"
              aria-label="关闭弹窗"
              class="grid size-11 shrink-0 place-items-center rounded-md text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              @click="closeModal"
            >
              ×
            </button>
          </div>

          <form class="space-y-5" @submit.prevent="submitTask">
            <div>
              <label for="task-title" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">标题</label>
              <input
                id="task-title"
                v-model="form.title"
                type="text"
                aria-required="true"
                :aria-invalid="titleError"
                aria-describedby="task-title-error"
                class="w-full rounded-md border bg-white px-3 py-2 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                :class="titleError ? 'border-rose-500 dark:border-rose-400' : 'border-slate-300 dark:border-slate-700'"
                placeholder="输入任务标题"
                @input="titleError = false"
              />
              <p v-if="titleError" id="task-title-error" class="mb-0 mt-1.5 text-sm text-rose-600">
                标题不能为空
              </p>
            </div>

            <div>
              <label for="task-description" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">描述（选填）</label>
              <textarea
                id="task-description"
                v-model="form.description"
                rows="3"
                class="w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder="补充任务细节"
              />
            </div>

            <div>
              <button
                id="task-due-date-label"
                type="button"
                class="mb-1.5 block cursor-pointer text-sm font-medium text-slate-700 hover:text-indigo-600 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-slate-300 dark:hover:text-indigo-300"
                @click="openDatePicker"
              >
                截止日期
              </button>
              <div class="relative min-h-11 w-full">
                <input
                  ref="dueDateInput"
                  id="task-due-date"
                  v-model="form.dueDate"
                  type="date"
                  lang="zh-CN"
                  required
                  aria-label="选择截止日期"
                  tabindex="-1"
                  class="absolute inset-0 -z-10 h-11 w-full opacity-0"
                />
                <button
                  type="button"
                  aria-labelledby="task-due-date-label"
                  class="flex min-h-11 w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 text-left text-base text-slate-900 transition hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:border-slate-500"
                  @click="openDatePicker"
                >
                  <time>{{ formatDate(form.dueDate) }}</time>
                  <span class="text-sm text-slate-400">更改</span>
                </button>
              </div>
            </div>

            <div>
              <label for="task-priority" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">优先级</label>
              <TaskPriorityPicker
                id="task-priority"
                v-model="form.priority"
                :task-title="form.title || '任务'"
                variant="field"
              />
            </div>

            <div v-if="task" class="grid gap-4 sm:grid-cols-2">
              <div>
                <label for="task-status" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">状态</label>
                <TaskStatusPicker
                  id="task-status"
                  v-model="form.status"
                  :task-title="form.title || task.title"
                  variant="field"
                />
              </div>
              <div>
                <span class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">创建时间</span>
                <time
                  :datetime="task.createdAt"
                  class="flex min-h-11 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >{{ task.createdAt.slice(0, 10) }}</time>
              </div>
            </div>

            <div class="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button
                type="button"
                class="min-h-11 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                @click="closeModal"
              >
                取消
              </button>
              <button
                type="submit"
                class="min-h-11 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                {{ task ? '保存修改' : '创建任务' }}
              </button>
            </div>
          </form>
        </section>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
