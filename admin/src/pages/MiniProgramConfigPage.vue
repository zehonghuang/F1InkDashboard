<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  fetchMpWechatGroup,
  updateMpWechatGroup,
  uploadMpWechatGroupQr,
  type MpWechatGroupConfig,
} from '@/api/admin'
import { getApiBase } from '@/api/http'
import { Message } from 'view-ui-plus'

const loading = ref(false)
const saving = ref(false)
const uploading = ref(false)

const name = ref('')
const hint = ref('')
const qrImage = ref('')
const qrFileInput = ref<HTMLInputElement | null>(null)

function effectiveQrUrl() {
  const base = getApiBase()
  const img = qrImage.value.trim()
  if (!img) return ''
  if (/^https?:\/\//i.test(img)) return img
  return base + img
}

async function load() {
  loading.value = true
  try {
    const res = await fetchMpWechatGroup()
    const cfg: MpWechatGroupConfig = res.config || { name: '', hint: '', qr_image: '' }
    name.value = cfg.name || ''
    hint.value = cfg.hint || ''
    qrImage.value = cfg.qr_image || ''
  } catch (e: any) {
    Message.error(String(e?.message || e || '加载失败'))
  } finally {
    loading.value = false
  }
}

async function onSave() {
  saving.value = true
  try {
    await updateMpWechatGroup({
      name: name.value.trim(),
      hint: hint.value.trim(),
    })
    Message.success('保存成功')
  } catch (e: any) {
    Message.error(String(e?.message || e || '保存失败'))
  } finally {
    saving.value = false
  }
}

function onPickQrFile() {
  qrFileInput.value?.click()
}

async function onQrFileChanged(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input?.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const res = await uploadMpWechatGroupQr(file)
    qrImage.value = res.qr_image || ''
    Message.success('二维码上传成功')
  } catch (e: any) {
    Message.error(String(e?.message || e || '上传失败'))
  } finally {
    uploading.value = false
    if (qrFileInput.value) qrFileInput.value.value = ''
  }
}

function onRemoveQr() {
  qrImage.value = ''
}

onMounted(() => {
  load()
})
</script>

<template>
  <div class="space-y-4">
    <Card>
      <template #title>微信群二维码</template>
      <template #extra>
        <Button :loading="loading" type="outline" size="small" @click="load">
          刷新
        </Button>
      </template>

      <Form :model="{ name, hint }" label-align="left" :label-width="100">
        <FormItem label="群名称">
          <Input
            v-model="name"
            placeholder="例如：F1 Ink 官方交流群"
            :maxlength="64"
            clearable
          />
        </FormItem>

        <FormItem label="入群提示">
          <Input
            v-model="hint"
            type="textarea"
            placeholder="例如：扫码添加小助手微信，备注「F1」后邀请入群"
            :maxlength="256"
            :rows="3"
            clearable
          />
        </FormItem>

        <FormItem label="二维码图片">
          <div class="flex items-start gap-4">
            <div
              class="w-48 h-48 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 flex items-center justify-center overflow-hidden"
            >
              <img
                v-if="effectiveQrUrl()"
                :src="effectiveQrUrl()"
                class="w-full h-full object-contain"
                alt="qr"
              />
              <div v-else class="text-xs text-zinc-400 text-center px-4">
                暂无二维码图片
              </div>
            </div>
            <div class="flex flex-col gap-2 pt-1">
              <Button
                type="primary"
                :loading="uploading"
                @click="onPickQrFile"
              >
                上传二维码
              </Button>
              <Button
                v-if="qrImage"
                type="outline"
                style="border-color: #ff4d4f; color: #ff4d4f;"
                @click="onRemoveQr"
              >
                移除
              </Button>
              <div class="text-xs text-zinc-400 mt-2 max-w-[220px] leading-5">
                建议使用正方形图片，支持 PNG / JPG / WEBP，大小不超过 8MB。
              </div>
            </div>
            <input
              ref="qrFileInput"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              class="hidden"
              @change="onQrFileChanged"
            />
          </div>
        </FormItem>

        <FormItem>
          <div class="flex gap-2">
            <Button type="primary" :loading="saving" long @click="onSave">
              保存配置
            </Button>
          </div>
        </FormItem>
      </Form>
    </Card>

    <Card>
      <template #title>效果预览（小程序「我的」页面）</template>
      <div class="mx-auto max-w-[360px]">
        <div
          class="rounded-2xl p-5 border border-zinc-800 text-white"
          style="background: linear-gradient(180deg, rgba(13, 13, 18, 0.96) 0%, rgba(7, 7, 11, 0.985) 100%);"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="text-[15px] font-bold truncate">
                {{ name || '群名称占位' }}
              </div>
              <div class="mt-1 text-xs text-zinc-400 leading-5 break-words">
                {{ hint || '入群提示占位，扫码添加小助手微信' }}
              </div>
            </div>
            <div
              class="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style="background: linear-gradient(180deg, rgba(36, 183, 95, 0.96) 0%, rgba(15, 142, 69, 1) 100%);"
            >
              <div class="relative w-4 h-4">
                <div class="absolute left-0 top-0 w-[5px] h-[5px] border-l-2 border-t-2 border-white rounded-sm"></div>
                <div class="absolute right-0 top-0 w-[5px] h-[5px] border-r-2 border-t-2 border-white rounded-sm"></div>
                <div class="absolute left-0 bottom-0 w-[5px] h-[5px] border-l-2 border-b-2 border-white rounded-sm"></div>
                <div class="absolute right-0 bottom-0 w-[5px] h-[5px] border-r-2 border-b-2 border-white rounded-sm"></div>
                <div class="absolute left-1/2 top-1/2 w-[3px] h-[3px] -translate-x-1/2 -translate-y-1/2 bg-white rounded-sm"></div>
              </div>
            </div>
          </div>
          <div
            class="mt-4 rounded-xl overflow-hidden border border-zinc-700"
            style="background: linear-gradient(180deg, rgba(21, 21, 30, 0.96) 0%, rgba(11, 11, 16, 0.98) 100%);"
          >
            <div class="aspect-square w-full bg-white flex items-center justify-center">
              <img
                v-if="effectiveQrUrl()"
                :src="effectiveQrUrl()"
                class="w-full h-full object-contain"
                alt="qr-preview"
              />
              <div v-else class="text-xs text-zinc-400">二维码预览</div>
            </div>
          </div>
          <div class="mt-3 text-[11px] text-zinc-500 text-center leading-5">
            {{ qrImage ? '点击二维码可放大查看' : '上传二维码图片后，这里会显示预览' }}
          </div>
        </div>
      </div>
    </Card>
  </div>
</template>
