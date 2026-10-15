<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, nextTick } from 'vue'
import KanbanBoard from './components/KanbanBoard.vue'
import TaskModal from './components/TaskModal.vue'
import TaskList from './components/TaskList.vue'
import TaskShareModal from './components/TaskShareModal.vue'
import ThemeToggle from './components/ThemeToggle.vue'
import CollaborationModal from './components/CollaborationModal.vue'
// ========== 新增导入 ==========
import AuthModal from './components/AuthModal.vue'
import Avatar from './components/Avatar.vue'
import { getCollaborationEvents, getTaskInvites, getTrustOverview, logout } from './utils/storage'
// ==============================
import { addTask, deleteTask, leaveSharedTask, taskStore, updateTask, fetchTasks } from './stores/taskStore'
import { appReleaseDate, appVersion, changelogHtml } from './appMetadata'
import type { Task, TaskFormData } from './types/task'

const isTaskModalOpen = ref(false)
const editingTask = ref<Task | null>(null)
const sharingTask = ref<Task | null>(null)
const isMobileMenuOpen = ref(false)
const isUserMenuOpen = ref(false)
const isPasswordModalOpen = ref(false) // 修改密码弹窗
const isPasswordSuccessOpen = ref(false) // 修改成功提示弹窗
const activeView = ref<'list' | 'kanban'>('list')
const isLogoutConfirmOpen = ref(false)
const isCollaborationOpen = ref(false)
const pendingCollaborationCount = ref(0)
const logoutTrigger = ref<HTMLButtonElement | null>(null)
const cancelLogoutButton = ref<HTMLButtonElement | null>(null)
let collaborationRefreshTimer: number | undefined

// 修改密码表单与状态
const passwordForm = ref({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})
const passwordLoading = ref(false)
const passwordError = ref('')

// ========== 新增登录相关状态 ==========
const isLoggedIn = ref(false)
const currentUser = ref<{ id: number; username: string } | null>(null)
// =====================================

const completedCount = computed(() => taskStore.tasks.filter((task) => task.status === 'done').length)

// 更新记录 details 点击空白关闭逻辑
const changelogDetails = ref<HTMLDetailsElement | null>(null)
function handlePageClick(event: MouseEvent) {
  // 点击空白关闭用户菜单
  isUserMenuOpen.value = false

  const el = changelogDetails.value
  if (!el || !el.open) return
  if (!el.contains(event.target as Node)) {
    el.open = false
  }
}

function confirmPasswordSuccess() {
  isPasswordSuccessOpen.value = false
  handleLogout()
}
// 打开修改密码弹窗
function openPasswordModal() {
  passwordForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
  passwordError.value = ''
  isUserMenuOpen.value = false
  isPasswordModalOpen.value = true
}

// 提交修改密码
async function submitPasswordChange() {
  passwordError.value = ''

  // 前端校验
  if (!passwordForm.value.oldPassword.trim()) {
    passwordError.value = '请输入原密码'
    return
  }
  if (!passwordForm.value.newPassword.trim()) {
    passwordError.value = '请输入新密码'
    return
  }
  if (passwordForm.value.newPassword.length < 6) {
    passwordError.value = '新密码长度不能少于6位'
    return
  }
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    passwordError.value = '两次输入的新密码不一致'
    return
  }

  passwordLoading.value = true
  try {
    // 从本地存储读取登录 token，和项目其他接口保持一致
    const token = localStorage.getItem('workspace_token')

    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` // 补充认证头
      },
      body: JSON.stringify({
        oldPassword: passwordForm.value.oldPassword,
        newPassword: passwordForm.value.newPassword
      })
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || '密码修改失败')
    }

    // 修改成功：关闭修改密码弹窗，打开统一风格的成功提示
    isPasswordModalOpen.value = false
    isPasswordSuccessOpen.value = true
  } catch (e) {
    passwordError.value = e.message || '密码修改失败，请稍后重试'
  } finally {
    passwordLoading.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handlePageClick)
  document.addEventListener('visibilitychange', refreshCollaborationCountWhenVisible)
  window.addEventListener('workspace:auth-expired', handleAuthExpired)
  collaborationRefreshTimer = window.setInterval(refreshCollaborationCountWhenVisible, 30_000)

  // ========== 修改：初始化先检查登录态，已登录再拉取任务 ==========
  const token = localStorage.getItem('workspace_token')
  const userStr = localStorage.getItem('workspace_user')
  if (token && userStr) {
    currentUser.value = JSON.parse(userStr)
    isLoggedIn.value = true
    fetchTasks()
    refreshPendingCollaborationCount()
  }
  // =============================================================
})

onUnmounted(() => {
  document.removeEventListener('click', handlePageClick)
  document.removeEventListener('visibilitychange', refreshCollaborationCountWhenVisible)
  window.removeEventListener('workspace:auth-expired', handleAuthExpired)
  if (collaborationRefreshTimer !== undefined) window.clearInterval(collaborationRefreshTimer)
})

// ========== 新增登录登出方法 ==========
function handleLoginSuccess(user: { id: number; username: string }) {
  currentUser.value = user
  isLoggedIn.value = true
  fetchTasks()
  refreshPendingCollaborationCount()
}

async function refreshPendingCollaborationCount() {
  try {
    const [trust, invites, collaboration] = await Promise.all([
      getTrustOverview(),
      getTaskInvites(),
      getCollaborationEvents(),
    ])
    pendingCollaborationCount.value = trust.receivedRequests.length + invites.length + collaboration.unreadCount
  } catch {
    pendingCollaborationCount.value = 0
  }
}

function refreshCollaborationCountWhenVisible() {
  if (isLoggedIn.value && !document.hidden) refreshPendingCollaborationCount()
}

function updatePendingCollaborationCount(count: number) {
  pendingCollaborationCount.value = count
}

function handleAuthExpired() {
  isLoggedIn.value = false
  currentUser.value = null
  pendingCollaborationCount.value = 0
  isLogoutConfirmOpen.value = false
}

function openLogoutConfirm(event: MouseEvent) {
  logoutTrigger.value = event.currentTarget as HTMLButtonElement
  isLogoutConfirmOpen.value = true
  nextTick(() => cancelLogoutButton.value?.focus())
}

function cancelLogout() {
  isLogoutConfirmOpen.value = false
  nextTick(() => logoutTrigger.value?.focus())
}

function handleLogout() {
  isLogoutConfirmOpen.value = false
  logout()
  isLoggedIn.value = false
  currentUser.value = null
  pendingCollaborationCount.value = 0
}
// =====================================

function toggleTask(updatedTask: Task) {
  updateTask({
    ...updatedTask,
    status: updatedTask.status === 'done' ? 'todo' : 'done',
  })
}

function moveTask(payload: { taskId: number; status: Task['status'] }) {
  const task = taskStore.tasks.find((item) => item.id === payload.taskId)
  if (task) updateTask({ ...task, status: payload.status })
}

function updateTaskPriority(payload: { taskId: number; priority: Task['priority'] }) {
  const task = taskStore.tasks.find((item) => item.id === payload.taskId)
  if (task) updateTask({ ...task, priority: payload.priority })
}

function updateTaskDueDate(payload: { taskId: number; dueDate: string }) {
  const task = taskStore.tasks.find((item) => item.id === payload.taskId)
  if (task) updateTask({ ...task, dueDate: payload.dueDate })
}

function openEditTask(task: Task) {
  editingTask.value = task
  isTaskModalOpen.value = true
}

async function openTaskFromCollaboration(taskId: number) {
  await fetchTasks()
  const task = taskStore.tasks.find((item) => item.id === taskId)
  if (!task) return
  activeView.value = 'list'
  editingTask.value = task
  isTaskModalOpen.value = true
  isCollaborationOpen.value = false
}

function openNewTask() {
  editingTask.value = null
  isTaskModalOpen.value = true
}

function saveTask(updatedTask: TaskFormData) {
  const originalTask = editingTask.value
  if (!originalTask) {
    addTask({
      title: updatedTask.title,
      description: updatedTask.description,
      status: updatedTask.status,
      priority: updatedTask.priority,
      dueDate: updatedTask.dueDate,
    })
    return
  }
  updateTask({
    ...originalTask,
    title: updatedTask.title,
    description: updatedTask.description,
    status: updatedTask.status,
    priority: updatedTask.priority,
    dueDate: updatedTask.dueDate,
    id: originalTask.id,
    createdAt: originalTask.createdAt,
  })
}

function selectView(view: 'list' | 'kanban') {
  activeView.value = view
  isMobileMenuOpen.value = false
}
</script>

<template>
  <AuthModal v-if="!isLoggedIn" @success="handleLoginSuccess" />
  <!-- 根容器：双写高度兼容移动端，overflow-hidden 锁死外层滚动 -->
  <div
    v-else
    class="w-screen flex flex-col overflow-hidden bg-[#f7f8fc] text-left text-slate-800 transition-colors dark:bg-slate-950 dark:text-slate-100"
    style="height: 100dvh; height: 100vh;"
  >
    <!-- header：shrink-0 防止压缩，永久固定顶部 -->
    <header class="shrink-0 border-b border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div class="mx-auto max-w-6xl px-5 sm:px-8">
        <div class="flex h-14 items-center justify-between">

          <!-- 左侧：缩小的紫色主题切换 + 应用名 -->
          <div class="flex items-center gap-2">
            <!-- 主题按钮：缩小 + 紫色系 -->
            <div class="scale-90 [&_button]:bg-indigo-50 [&_button]:text-indigo-600 [&_button]:hover:bg-indigo-100 dark:[&_button]:bg-indigo-500/10 dark:[&_button]:text-indigo-300 dark:[&_button]:hover:bg-indigo-500/20">
              <ThemeToggle />
            </div>
            <span class="text-base font-semibold text-slate-900 dark:text-slate-100">Work Space</span>
          </div>

          <!-- 右侧操作区 -->
          <div class="flex items-center gap-2 sm:gap-3">

            <!-- 桌面端：协作按钮放大 + 头像菜单 -->
            <div class="hidden items-center gap-3 sm:flex">
              <!-- 协作按钮：放大尺寸，颜色保持常规 -->
              <button
                type="button"
                class="relative rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800"
                :aria-label="pendingCollaborationCount ? `协作，有 ${pendingCollaborationCount} 条待处理` : '协作'"
                @click="isCollaborationOpen = true"
              >
                协作
                <span
                  v-if="pendingCollaborationCount"
                  aria-hidden="true"
                  class="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white"
                >
                  {{ pendingCollaborationCount > 99 ? '99+' : pendingCollaborationCount }}
                </span>
              </button>

              <div class="relative">
                <button
                  type="button"
                  class="grid place-items-center rounded-full p-0 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-indigo-500"
                  @click.stop="isUserMenuOpen = !isUserMenuOpen"
                  aria-label="用户菜单"
                >
                  <Avatar :username="currentUser?.username || ''" :size="32" />
                </button>

                <div
                  v-if="isUserMenuOpen"
                  class="absolute right-0 top-full mt-2 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900 z-50"
                >
                  <div class="px-4 py-2 border-b border-slate-100 dark:border-slate-700">
                    <p class="text-sm font-medium text-slate-800 dark:text-slate-100">{{ currentUser?.username }}</p>
                    <p class="text-xs text-slate-500 dark:text-slate-400">个人账号</p>
                  </div>
                  <button
                    type="button"
                    class="w-full px-4 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                    @click="openPasswordModal"
                  >
                    修改密码
                  </button>
                  <button
                    type="button"
                    class="w-full px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                    @click="($event) => { isUserMenuOpen = false; openLogoutConfirm($event) }"
                  >
                    退出登录
                  </button>
                </div>
              </div>
            </div>

            <!-- 移动端：头像 + 汉堡菜单 -->
            <div class="relative sm:hidden">
              <button
                type="button"
                class="grid place-items-center rounded-full p-0 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-indigo-500"
                @click.stop="isUserMenuOpen = !isUserMenuOpen"
                aria-label="用户菜单"
              >
                <Avatar :username="currentUser?.username || ''" :size="28" />
              </button>

              <div
                v-if="isUserMenuOpen"
                class="absolute right-0 top-full mt-2 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900 z-50"
              >
                <div class="px-4 py-2 border-b border-slate-100 dark:border-slate-700">
                  <p class="text-sm font-medium text-slate-800 dark:text-slate-100">{{ currentUser?.username }}</p>
                  <p class="text-xs text-slate-500 dark:text-slate-400">个人账号</p>
                </div>
                <button
                  type="button"
                  class="w-full px-4 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  @click="openPasswordModal"
                >
                  修改密码
                </button>
                <button
                  type="button"
                  class="w-full px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                  @click="($event) => { isUserMenuOpen = false; openLogoutConfirm($event) }"
                >
                  退出登录
                </button>
              </div>
            </div>

            <button
              type="button"
              class="relative grid size-11 place-items-center rounded-md text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-slate-200 dark:hover:bg-slate-800 md:hidden"
              :aria-expanded="isMobileMenuOpen"
              aria-controls="mobile-navigation"
              :aria-label="isMobileMenuOpen ? '关闭导航菜单' : '打开导航菜单'"
              @click="isMobileMenuOpen = !isMobileMenuOpen"
            >
              <span aria-hidden="true" class="text-2xl leading-none">{{ isMobileMenuOpen ? '×' : '☰' }}</span>
              <span
                v-if="pendingCollaborationCount > 0"
                aria-hidden="true"
                class="absolute right-1 top-1 size-2.5 rounded-full bg-rose-600 ring-2 ring-white dark:ring-slate-900"
              />
            </button>
          </div>
        </div>

        <!-- 移动端导航 -->
        <nav
          v-if="isMobileMenuOpen"
          id="mobile-navigation"
          aria-label="任务视图导航"
          class="space-y-1 border-t border-slate-100 py-2 dark:border-slate-800 md:hidden"
        >
          <button
            type="button"
            class="min-h-11 w-full rounded-md px-3 text-left text-sm font-medium"
            :class="activeView === 'list' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'"
            :aria-current="activeView === 'list' ? 'page' : undefined"
            @click="selectView('list')"
          >
            列表
          </button>
          <button
            type="button"
            class="min-h-11 w-full rounded-md px-3 text-left text-sm font-medium"
            :class="activeView === 'kanban' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'"
            :aria-current="activeView === 'kanban' ? 'page' : undefined"
            @click="selectView('kanban')"
          >
            看板
          </button>
          <button
            type="button"
            class="flex min-h-11 w-full items-center justify-between rounded-md px-3 text-left text-sm font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            @click="isCollaborationOpen = true; isMobileMenuOpen = false"
          >
            协作
            <span
              v-if="pendingCollaborationCount"
              aria-hidden="true"
              class="grid min-h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white"
            >{{ pendingCollaborationCount > 99 ? '99+' : pendingCollaborationCount }}</span>
          </button>
        </nav>
      </div>
    </header>


    <main class="mx-auto w-full max-w-6xl flex flex-col px-5 pt-3 pb-3 sm:px-8 sm:pt-4 sm:pb-6" style="flex: 1 1 0;">
      <!-- 【固定区域】标题、统计、Tab切换（已紧凑优化） -->
      <section class="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center sm:gap-4 shrink-0">
        <div>
          <h1 class="m-0 text-xl font-semibold text-slate-900 dark:text-slate-100 sm:text-2xl ">我的任务</h1>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <!-- 统计卡片：缩小内边距，高度和新建任务按钮对齐 -->
          <div class="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <span class="grid size-6 place-items-center rounded-lg bg-indigo-50 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{{ completedCount }}</span>
            <span class="text-sm text-slate-600 dark:text-slate-300">/{{ taskStore.tasks.length }} 项已完成</span>
          </div>
          <TaskModal
            v-model="isTaskModalOpen"
            :task="editingTask"
            @create="openNewTask"
            @submit="saveTask"
            @shares-changed="fetchTasks()"
          />
        </div>
      </section>

      <div class="mb-5 shrink-0 hidden rounded-lg bg-slate-100 p-1 dark:bg-slate-800 md:inline-flex" role="tablist" aria-label="任务视图">
        <button
          type="button"
          role="tab"
          class="min-h-11 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-indigo-500"
          :class="activeView === 'list' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'"
          :aria-selected="activeView === 'list'"
          @click="selectView('list')"
        >
          列表
        </button>
        <button
          type="button"
          role="tab"
          class="min-h-11 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-indigo-500"
          :class="activeView === 'kanban' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'"
          :aria-selected="activeView === 'kanban'"
          @click="selectView('kanban')"
        >
          看板
        </button>
      </div>

      <!-- 【唯一滚动区域】任务内容 -->
      <div style="flex:1 1 0;" class="min-h-0">
        <div v-if="activeView === 'list'" class="h-full">
          <TaskList
            :tasks="taskStore.tasks"
            @move="moveTask"
            @toggle="toggleTask"
            @delete="deleteTask"
            @leave-share="leaveSharedTask"
            @priority="updateTaskPriority"
            @due-date="updateTaskDueDate"
            @edit="openEditTask"
            @manage-share="sharingTask = $event"
          />
        </div>
        <div v-else class="h-full overflow-x-auto md:overflow-y-hidden overflow-y-auto">
          <KanbanBoard
            :tasks="taskStore.tasks"
            @move="moveTask"
            @toggle="toggleTask"
            @delete="deleteTask"
            @leave-share="leaveSharedTask"
            @priority="updateTaskPriority"
            @due-date="updateTaskDueDate"
            @edit="openEditTask"
            @manage-share="sharingTask = $event"
          />
        </div>
      </div>
    </main>

    <!-- footer：shrink-0 固定底部；内部单行截断，解决换行乱版 -->
    <footer class="shrink-0 border-t border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div class="mx-auto flex max-w-6xl items-center gap-x-3 px-5 py-2 sm:px-8">
        <!-- 左侧：单行截断，节省空间 -->
        <div
          class="flex-1 min-w-0 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap overflow-hidden text-ellipsis"
        >
          Work Space<span class="mx-1 text-slate-500 dark:text-slate-400">·</span>v{{ appVersion }}<span class="mx-2">更新于 <time :datetime="appReleaseDate">{{ appReleaseDate }}</time></span>
        </div>
        <!-- 右侧：固定宽度不压缩，永远靠右 -->
        <details
          ref="changelogDetails"
          class="group relative shrink-0"
        >
          <summary
            @click.stop
            class="flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-600 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-slate-300 dark:hover:bg-slate-800 sm:min-h-11"
          >
            更新记录
            <span aria-hidden="true" class="transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <section class="absolute bottom-full right-0 z-20 mb-2 max-h-[70dvh] w-72 max-w-[calc(100vw-2.5rem)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div
              class="leading-6 text-slate-600 dark:text-slate-300 [&_h1]:mb-3 [&_h1]:mt-0 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-slate-900 [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-slate-800 [&_ul]:mb-3 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_p]:my-2 dark:[&_h1]:text-slate-100 dark:[&_h2]:text-slate-100"
              v-html="changelogHtml"
            />
          </section>
        </details>
      </div>
    </footer>
  </div>

  <TaskShareModal
    v-if="sharingTask && currentUser"
    :task-id="sharingTask.id"
    :current-user-id="currentUser.id"
    @close="sharingTask = null"
    @success="fetchTasks()"
  />
  <CollaborationModal
    v-if="isCollaborationOpen"
    @close="isCollaborationOpen = false"
    @success="fetchTasks()"
    @pending-count="updatePendingCollaborationCount"
    @open-task="openTaskFromCollaboration"
  />

  <!-- 退出确认弹窗 -->
  <Teleport to="body">
    <div
      v-if="isLogoutConfirmOpen"
      class="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 p-4"
      @click.self="cancelLogout"
      @keydown.esc.stop.prevent="cancelLogout"
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="logout-title"
        aria-describedby="logout-description"
        class="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <h2 id="logout-title" class="m-0 text-base font-semibold text-slate-900 dark:text-slate-100">确定退出登录？</h2>
        <p id="logout-description" class="mb-0 mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          退出后需要重新登录才能继续使用。
        </p>
        <div class="mt-5 flex justify-end gap-2">
          <button
            ref="cancelLogoutButton"
            type="button"
            class="min-h-11 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            @click="cancelLogout"
          >
            取消
          </button>
          <button
            type="button"
            class="min-h-11 rounded-md bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
            @click="handleLogout"
          >
            确认退出
          </button>
        </div>
      </section>
    </div>
  </Teleport>

  <!-- 修改密码弹窗 -->
  <Teleport to="body">
    <div
      v-if="isPasswordModalOpen"
      class="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 p-4"
      @click.self="isPasswordModalOpen = false"
      @keydown.esc.stop.prevent="isPasswordModalOpen = false"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-title"
        class="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <h2 id="password-title" class="m-0 text-base font-semibold text-slate-900 dark:text-slate-100">修改密码</h2>
        <form class="mt-4 space-y-3" @submit.prevent="submitPasswordChange">
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">原密码</label>
            <input
              v-model="passwordForm.oldPassword"
              type="password"
              class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              placeholder="请输入原密码"
              autocomplete="current-password"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">新密码</label>
            <input
              v-model="passwordForm.newPassword"
              type="password"
              class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              placeholder="请输入新密码（至少6位）"
              autocomplete="new-password"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">确认新密码</label>
            <input
              v-model="passwordForm.confirmPassword"
              type="password"
              class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              placeholder="请再次输入新密码"
              autocomplete="new-password"
            />
          </div>
          <p v-if="passwordError" class="m-0 text-xs text-rose-600 dark:text-rose-400">
            {{ passwordError }}
          </p>
          <div class="mt-5 flex justify-end gap-2">
            <button
              type="button"
              class="min-h-11 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              @click="isPasswordModalOpen = false"
            >
              取消
            </button>
            <button
              type="submit"
              :disabled="passwordLoading"
              class="min-h-11 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-60"
            >
              {{ passwordLoading ? '提交中...' : '确认修改' }}
            </button>
          </div>
        </form>
      </section>
    </div>
  </Teleport>

  <!-- 密码修改成功提示 -->
  <Teleport to="body">
    <div
      v-if="isPasswordSuccessOpen"
      class="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 p-4"
      @click.self="confirmPasswordSuccess"
    >
      <section
        role="alertdialog"
        aria-modal="true"
        class="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <h2 class="m-0 text-base font-semibold text-slate-900 dark:text-slate-100">密码修改成功</h2>
        <p class="mb-0 mt-2 text-sm text-slate-600 dark:text-slate-300">
          密码已更新，请使用新密码重新登录。
        </p>
        <div class="mt-5 flex justify-end">
          <button
            type="button"
            class="min-h-11 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            @click="confirmPasswordSuccess"
          >
            确定
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
