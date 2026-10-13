<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 w-80 shadow-xl">
      <h2 class="text-lg font-semibold mb-4 text-center text-slate-900 dark:text-slate-100">
        {{ isLogin ? '登录' : '注册' }}
      </h2>

      <div class="space-y-3">
        <div>
          <label class="block text-sm mb-1 text-slate-700 dark:text-slate-300">用户名</label>
          <input
            v-model="username"
            type="text"
            class="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-slate-100"
            placeholder="请输入用户名"
          />
        </div>
        <div>
          <label class="block text-sm mb-1 text-slate-700 dark:text-slate-300">密码</label>
          <input
            v-model="password"
            type="password"
            class="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-slate-100"
            placeholder="请输入密码"
            @keyup.enter="handleSubmit"
          />
        </div>

        <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>

        <button
          @click="handleSubmit"
          :disabled="loading"
          class="w-full py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {{ loading ? '处理中...' : (isLogin ? '登录' : '注册') }}
        </button>

        <p class="text-sm text-center text-slate-500 dark:text-slate-400">
          {{ isLogin ? '还没有账号？' : '已有账号？' }}
          <button @click="isLogin = !isLogin" class="text-indigo-600 hover:underline ml-1">
            {{ isLogin ? '去注册' : '去登录' }}
          </button>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { login, register } from '../utils/storage'

const emit = defineEmits<{
  (e: 'success', user: { id: number; username: string }): void
}>()

const isLogin = ref(true)
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function handleSubmit() {
  error.value = ''
  loading.value = true
  try {
    const res = isLogin.value
      ? await login(username.value, password.value)
      : await register(username.value, password.value)

    localStorage.setItem('workspace_token', res.token)
    localStorage.setItem('workspace_user', JSON.stringify(res.user))
    emit('success', res.user)
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
</script>
