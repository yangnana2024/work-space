<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, watch, computed } from 'vue'
import type { Task, TaskFormData, TaskPriority, TaskStatus } from '../types/task'
import TaskPriorityPicker from './TaskPriorityPicker.vue'
import TaskStatusPicker from './TaskStatusPicker.vue'
import TaskShareModal from './TaskShareModal.vue'
import Avatar from './Avatar.vue'
import { formatDate as formatISODate } from '../utils/date'
import { getTaskLogs } from '../utils/storage'

const props = defineProps<{
  modelValue: boolean
  task: Task | null
}>()
const emit = defineEmits<{
  'update:modelValue': [isOpen: boolean]
  create: []
  submit: [task: TaskFormData]
  sharesChanged: []
}>()

function getLocalDate() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
}

// 截止日期中文格式化（保留原逻辑，本地日期无时差）
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

// ========== 新增：权限与状态 ==========
const activeTab = ref<'info' | 'logs'>('info')
interface TaskLog {
  id: number
  userName: string
  action: string
  detail: {
    targetUser?: string
    targetUserId?: number
    changes?: Record<string, { before: unknown; after: unknown }>
  } | null
  targetUserName?: string
  createdAt: string
}
const logs = ref<TaskLog[]>([])
const isShareModalOpen = ref(false)

// 当前登录用户ID
const currentUserId = computed(() => {
  const userStr = localStorage.getItem('workspace_user')
  if (!userStr) return 0
  return JSON.parse(userStr).id
})

// 是否是任务创建者
const isOwner = computed(() => {
  if (!props.task) return true
  return props.task.currentRole === 'owner' || props.task.userId === currentUserId.value
})

// 是否有编辑权限
const canEdit = computed(() => {
  if (!props.task) return true
  return isOwner.value || props.task.currentRole === 'editor'
})

const changeLabels: Record<string, string> = {
  title: '标题',
  description: '描述',
  status: '状态',
  priority: '优先级',
  dueDate: '截止日期',
}

function parseLogDetail(detail: unknown, targetUserName?: string): TaskLog['detail'] {
  if (!detail) return null
  try {
    const parsed = typeof detail === 'string' ? JSON.parse(detail) : detail
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as Record<string, any>
    if (targetUserName && !record.targetUser) record.targetUser = targetUserName
    if (!record.changes && record.before && record.after) {
      const fields = ['title', 'description', 'status', 'priority', 'dueDate']
      record.changes = Object.fromEntries(fields.flatMap((field) => {
        const databaseField = field.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`)
        const before = record.before[databaseField] ?? record.before[field] ?? null
        const after = record.after[databaseField] ?? record.after[field] ?? null
        return before === after ? [] : [[field, { before, after }]]
      }))
    }
    return record as TaskLog['detail']
  } catch {
    return null
  }
}

function formatLogValue(field: string, value: unknown) {
  if (field === 'status') {
    return ({ todo: '待办', 'in-progress': '进行中', done: '已完成' } as Record<string, string>)[String(value)] ?? String(value ?? '空')
  }
  if (field === 'priority') {
    return ({ low: '低', medium: '中', high: '高' } as Record<string, string>)[String(value)] ?? String(value ?? '空')
  }
  return value === null || value === '' ? '空' : String(value)
}

// 加载操作日志
async function loadTaskLogs() {
  if (!props.task) return
  try {
    const result = await getTaskLogs(props.task.id)
    logs.value = result
      .map((log: Omit<TaskLog, 'detail'> & { detail: unknown }) => ({
        ...log,
        detail: parseLogDetail(log.detail, log.targetUserName),
      }))
      .filter((log: TaskLog) =>
        log.action !== 'update'
        || !log.detail?.changes
        || Object.keys(log.detail.changes).length > 0,
      )
  } catch (e) {
    console.error('加载操作日志失败', e)
  }
}
// =====================================

watch(
  () => [props.modelValue, props.task] as const,
  ([isOpen, task]) => {
    if (!isOpen) return
    titleError.value = false
    activeTab.value = 'info'
    form.title = task?.title ?? ''
    form.description = task?.description ?? ''
    form.status = task?.status ?? 'todo'
    form.priority = task?.priority ?? 'medium'
    form.dueDate = task?.dueDate ?? getLocalDate()

    // 打开编辑弹窗时加载日志
    if (task) loadTaskLogs()
  },
  { immediate: true },
)

function closeModal() {
  emit('update:modelValue', false)
  titleError.value = false
}

function handleSharesChanged() {
  emit('sharesChanged')
  loadTaskLogs()
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.modelValue) closeModal()
}

function submitTask() {
  console.log("submitTask 函数执行了")
  const title = form.title.trim()
  if (!title) {
    titleError.value = true
    return
  }
  if (props.task) {
    // 编辑任务：保留原始 id 和 createdAt
    emit('submit', {
      id: props.task.id,
      title,
      description: form.description.trim(),
      status: form.status,
      priority: form.priority,
      dueDate: form.dueDate,
      createdAt: props.task.createdAt,
    })
  } else {
    // 新建任务：id、createdAt 后端D1自动生成，前端不传递
    emit('submit', {
      title,
      description: form.description.trim(),
      status: form.status,
      priority: form.priority,
      dueDate: form.dueDate,
    })
  }
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
            class="max-h-[90dvh] w-full rounded-t-xl rounded-b-none bg-white shadow-2xl dark:bg-slate-900 sm:my-auto sm:max-w-lg sm:rounded-xl flex flex-col"
          >
            <!-- 头部区域：标题+标签，固定不滚动 -->
            <div class="p-5 pb-0 sm:p-6 sm:pb-0">
              <div class="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 id="task-modal-title" class="m-0 text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {{ task ? (canEdit ? '编辑任务' : '查看任务') : '新建任务' }}
                  </h2>
                  <p class="mb-0 mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {{ task ? (canEdit ? '更新任务信息；创建时间仅供查看。' : '任务信息和操作记录仅供查看。') : '填写任务信息，稍后也可以继续调整。' }}
                  </p>
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
              <!-- ========== 标签切换 ========== -->
              <div v-if="task" class="mb-4 flex gap-1 border-b border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  class="px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
                  :class="activeTab === 'info'
                    ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'"
                  @click="activeTab = 'info'"
                >
                  任务信息
                </button>
                <button
                  type="button"
                  class="px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
                  :class="activeTab === 'logs'
                    ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'"
                  @click="activeTab = 'logs'"
                >
                  操作记录
                </button>
              </div>
            </div>

            <!-- 【唯一可滚动区域】表单/日志内容区 -->
            <div class="flex-1 overflow-y-auto px-5 sm:px-6 py-4">
              <form class="space-y-5" @submit.prevent="submitTask">
                <!-- ========== 任务信息标签页 ========== -->
                <div v-if="!task || activeTab === 'info'">
                  <div>
                    <label for="task-title" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">标题</label>
                    <input
                      id="task-title"
                      v-model="form.title"
                      type="text"
                      :disabled="!canEdit"
                      aria-required="true"
                      :aria-invalid="titleError"
                      aria-describedby="task-title-error"
                      class="w-full rounded-md border bg-white px-3 py-2 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 disabled:opacity-60 disabled:cursor-not-allowed"
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
                      :disabled="!canEdit"
                      rows="3"
                      class="w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 disabled:opacity-60 disabled:cursor-not-allowed"
                      placeholder="补充任务细节"
                    ></textarea>
                  </div>
                  <div>
                    <button
                      id="task-due-date-label"
                      type="button"
                      :disabled="!canEdit"
                      class="mb-1.5 block cursor-pointer text-sm font-medium text-slate-700 hover:text-indigo-600 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-slate-300 dark:hover:text-indigo-300 disabled:opacity-60 disabled:cursor-not-allowed"
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
                        :disabled="!canEdit"
                        class="flex min-h-11 w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 text-left text-base text-slate-900 transition hover:border-slate-400 focus:border-indigo-500 focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:border-slate-500 disabled:opacity-60 disabled:cursor-not-allowed"
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
                      :disabled="!canEdit"
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
                        :disabled="!canEdit"
                        :task-title="form.title || task.title"
                        variant="field"
                      />
                    </div>
                    <div>
                      <span class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">创建时间</span>
                      <time
                        :datetime="task.createdAt"
                        class="flex min-h-11 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      >
                        {{ formatISODate(task.createdAt, 'full') }}
                      </time>
                    </div>
                  </div>
                </div>
                <!-- ========== 操作记录标签页 ========== -->
                <div v-else-if="task && activeTab === 'logs'" class="space-y-3">
                  <div v-if="!logs.length" class="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    暂无操作记录
                  </div>
                  <div v-else class="space-y-3">
                    <div
                      v-for="log in logs"
                      :key="log.id"
                      class="flex gap-3 text-sm"
                    >
                      <Avatar :username="log.userName" :size="28" />
                      <div class="flex-1 min-w-0">
                        <div class="flex items-baseline justify-between gap-2">
                          <span class="font-medium text-slate-800 dark:text-slate-200">
                            {{ log.userName }}
                          </span>
                          <span class="text-xs text-slate-500 dark:text-slate-400 shrink-0">
                            {{ formatISODate(log.createdAt, 'datetime') }}
                          </span>
                        </div>
                        <p class="mb-1 text-slate-600 dark:text-slate-300">
                          <template v-if="log.action === 'create'">创建了任务</template>
                          <template v-else-if="log.action === 'update'">更新了任务</template>
                          <template v-else-if="log.action === 'delete'">删除了任务</template>
                          <template v-else-if="log.action === 'share'">共享了任务<template v-if="log.detail?.targetUser">给 {{ log.detail.targetUser }}</template></template>
                          <template v-else-if="log.action === 'accept_invite'">接受了任务共享邀请<template v-if="log.detail?.inviterUser">（来自 {{ log.detail.inviterUser }}）</template></template>
                          <template v-else-if="log.action === 'unshare'">取消了<template v-if="log.detail?.targetUser">与 {{ log.detail.targetUser }} 的</template>共享</template>
                          <template v-else-if="log.action === 'reject_invite'">拒绝了任务共享邀请<template v-if="log.detail?.inviterUser">（来自 {{ log.detail.inviterUser }}）</template></template>
                          <template v-else-if="log.action === 'create_invite'">发起了任务共享邀请<template v-if="log.detail?.recipientUser">（发给 {{ log.detail.recipientUser }}）</template></template>
                          <template v-else-if="log.action === 'revoke_invite'">撤销了任务共享邀请<template v-if="log.detail?.recipientUser">（发给 {{ log.detail.recipientUser }}）</template></template>
                          <template v-else>{{ log.action }}</template>
                        </p>
                        <ul
                          v-if="log.action === 'update' && log.detail?.changes && Object.keys(log.detail.changes).length"
                          class="m-0 list-inside list-disc space-y-1 text-xs text-slate-500 dark:text-slate-400"
                        >
                          <li v-for="(change, field) in log.detail.changes" :key="field">
                            {{ changeLabels[field] || field }}：{{ formatLogValue(field, change.before) }} → {{ formatLogValue(field, change.after) }}
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            </div>

            <!-- 底部按钮栏：固定在底部，永远可见 -->
            <div class="border-t border-slate-100 p-5 pt-4 sm:p-6 sm:pt-4 dark:border-slate-800">
              <div class="flex items-center justify-between gap-2">
                <button
                  v-if="task && isOwner"
                  type="button"
                  class="min-h-11 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  @click="isShareModalOpen = true"
                >
                  管理共享
                </button>
                <span v-else />
                <div class="flex justify-end gap-2">
                  <button
                    type="button"
                    class="min-h-11 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    @click="closeModal"
                  >
                    取消
                  </button>
                  <button
                    v-if="canEdit"
                    type="button"
                    @click="submitTask"
                    class="min-h-11 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                  >
                    {{ task ? '保存修改' : '创建任务' }}
                  </button>
                </div>
              </div>
            </div>
          </section>

        </Transition>
      </div>
    </Transition>

    <!-- 共享弹窗 -->
    <TaskShareModal
      v-if="isShareModalOpen"
      :task-id="task!.id"
      @close="isShareModalOpen = false"
      @success="handleSharesChanged"
    />
  </Teleport>
</template>
