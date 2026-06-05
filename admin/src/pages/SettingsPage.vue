<script setup lang="ts">
import { computed, ref } from 'vue'

const API_BASE_KEY = 'f1ink_admin_api_base'
const TOKEN_KEY = 'f1ink_admin_token'

const apiBase = ref(localStorage.getItem(API_BASE_KEY) || '')
const token = ref(localStorage.getItem(TOKEN_KEY) || '')

const effectiveApiBase = computed(() => apiBase.value.trim().replace(/\/+$/, ''))

function save() {
  localStorage.setItem(API_BASE_KEY, apiBase.value.trim())
  localStorage.setItem(TOKEN_KEY, token.value.trim())
}

function clearAll() {
  localStorage.removeItem(API_BASE_KEY)
  localStorage.removeItem(TOKEN_KEY)
  apiBase.value = ''
  token.value = ''
}
</script>

<template>
  <Card>
    <template #title>设置</template>

    <Form label-position="top">
      <FormItem label="API Base（留空表示同域）">
        <Input v-model="apiBase" placeholder="例如：http://127.0.0.1:8008" />
        <div class="mt-2 text-xs text-zinc-400">当前生效：{{ effectiveApiBase || '(同域)' }}</div>
      </FormItem>

      <FormItem label="Token（可选）">
        <Input v-model="token" placeholder="用于调用需要 token 的接口（例如 mp/news/ingest）" />
      </FormItem>

      <div class="flex gap-2">
        <Button type="primary" @click="save">保存</Button>
        <Button type="default" @click="clearAll">清空</Button>
      </div>
    </Form>
  </Card>
</template>

