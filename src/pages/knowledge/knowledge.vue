<template>
  <div class="kb-page">
    <!-- Nav -->
    <div class="kb-page__nav">
      <button class="kb-page__back" @click="goBack">← 返回</button>
      <span class="kb-page__nav-title">知识库</span>
      <button class="kb-page__add" @click="showEditor = true">＋ 新增</button>
    </div>

    <!-- Info Banner -->
    <div class="kb-page__banner">
      💡 上传厂家的料号编码规则后，所有人均可使用"料号→规格描述"功能进行解析。
    </div>

    <!-- Rule List -->
    <div class="kb-page__section" v-if="store.rules.length > 0">
      <div class="kb-page__section-title">
        已录入规则（{{ store.ruleCount }} 条）
      </div>

      <div
        v-for="rule in store.rules"
        :key="rule.id"
        class="kb-rule-card"
      >
        <div class="kb-rule-card__header">
          <span class="kb-rule-card__mfr">{{ rule.manufacturerLabel }}</span>
          <span class="kb-rule-card__type">{{ rule.componentLabel }}</span>
          <span class="kb-rule-card__format" :class="`kb-rule-card__format--${rule.fileType}`">
            {{ fileTypeLabel(rule.fileType) }}
          </span>
        </div>
        <div class="kb-rule-card__desc">{{ rule.description }}</div>
        <div class="kb-rule-card__footer">
          <span class="kb-rule-card__date">{{ formatDate(rule.createdAt) }}</span>
          <div class="kb-rule-card__actions">
            <button
              v-if="rule.fileType === 'pdf' && rule.dataUrl"
              class="kb-rule-card__btn kb-rule-card__btn--view"
              @click="viewPdf(rule)"
            >
              📄 查看PDF
            </button>
            <button
              v-if="rule.fileType === 'image' && rule.dataUrl"
              class="kb-rule-card__btn kb-rule-card__btn--view"
              @click="viewImage(rule)"
            >
              🖼️ 查看图片
            </button>
            <button class="kb-rule-card__btn kb-rule-card__btn--del" @click="confirmDelete(rule)">
              🗑
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="kb-page__empty">
      <div class="kb-page__empty-icon">📚</div>
      <p class="kb-page__empty-title">知识库为空</p>
      <p class="kb-page__empty-desc">
        还没有录入任何厂家的料号编码规则。<br />
        点击右上角"＋ 新增"添加第一条规则。
      </p>
    </div>

    <!-- Rule Editor Modal -->
    <div v-if="showEditor" class="kb-modal-overlay" @click.self="showEditor = false">
      <div class="kb-modal">
        <div class="kb-modal__header">
          <span>新增编码规则</span>
          <button class="kb-modal__close" @click="showEditor = false">✕</button>
        </div>

        <div class="kb-modal__body">
          <!-- Manufacturer -->
          <label class="kb-field">
            <span class="kb-field__label">制造商</span>
            <select v-model="form.manufacturer" class="kb-field__select">
              <option value="">请选择</option>
              <option v-for="(label, key) in store.MANUFACTURER_LABELS" :key="key" :value="key">
                {{ label }}
              </option>
            </select>
          </label>

          <!-- Component Type -->
          <label class="kb-field">
            <span class="kb-field__label">元件类型</span>
            <select v-model="form.componentType" class="kb-field__select">
              <option value="">请选择</option>
              <option v-for="(label, key) in store.COMPONENT_LABELS" :key="key" :value="key">
                {{ label }}
              </option>
            </select>
          </label>

          <!-- File Type -->
          <label class="kb-field">
            <span class="kb-field__label">录入方式</span>
            <div class="kb-field__tabs">
              <button
                class="kb-tab"
                :class="{ 'kb-tab--active': form.fileType === 'text' }"
                @click="form.fileType = 'text'"
              >✏️ 文字</button>
              <button
                class="kb-tab"
                :class="{ 'kb-tab--active': form.fileType === 'pdf' }"
                @click="form.fileType = 'pdf'"
              >📎 PDF</button>
              <button
                class="kb-tab"
                :class="{ 'kb-tab--active': form.fileType === 'image' }"
                @click="form.fileType = 'image'"
              >🖼️ 图片</button>
            </div>
          </label>

          <!-- Text Input -->
          <template v-if="form.fileType === 'text'">
            <label class="kb-field">
              <span class="kb-field__label">编码规则描述</span>
              <textarea
                v-model="form.description"
                class="kb-field__textarea"
                rows="5"
                placeholder="描述该厂家料号的编码方式，例如：&#10;三星 MLCC 料号格式：CL + 尺寸(2位) + 温度特性(1位) + 容值(3位) + 精度(1位) + 电压(1位) + ...&#10;&#10;CL10B104KO8NNNC 解析：&#10;CL=系列, 10=0603, B=X7R, 104=100nF, K=±10%, O=16V"
              ></textarea>
            </label>
          </template>

          <!-- PDF Upload -->
          <template v-if="form.fileType === 'pdf'">
            <label class="kb-field">
              <span class="kb-field__label">规则说明</span>
              <input
                v-model="form.description"
                class="kb-field__input"
                placeholder="简要说明PDF内容，如：三星MLCC料号命名规则手册"
              />
            </label>
            <label class="kb-field">
              <span class="kb-field__label">PDF文件</span>
              <div class="kb-field__upload" @click="triggerFileInput">
                <span v-if="!form.fileName">📁 点击选择PDF文件</span>
                <span v-else class="kb-field__file-selected">📄 {{ form.fileName }}</span>
              </div>
              <input
                ref="fileInput"
                type="file"
                accept=".pdf,application/pdf"
                style="display:none"
                @change="onFilePicked"
              />
              <div v-if="tooLarge" class="kb-field__error">
                文件过大（超过5MB），请压缩后重试或使用文字录入。
              </div>
            </label>
          </template>

          <!-- Image Upload -->
          <template v-if="form.fileType === 'image'">
            <label class="kb-field">
              <span class="kb-field__label">规则说明</span>
              <input
                v-model="form.description"
                class="kb-field__input"
                placeholder="简要说明图片内容，如：三星MLCC料号编码规则截图"
              />
            </label>
            <label class="kb-field">
              <span class="kb-field__label">图片文件</span>
              <div class="kb-field__upload" @click="triggerFileInput">
                <span v-if="!form.fileName">🖼️ 点击选择图片（支持 JPG/PNG/GIF/WebP/BMP/SVG）</span>
                <span v-else class="kb-field__file-selected">🖼️ {{ form.fileName }}</span>
              </div>
              <input
                ref="fileInput"
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,image/bmp,image/svg+xml,image/*"
                style="display:none"
                @change="onFilePicked"
              />
              <div v-if="tooLarge" class="kb-field__error">
                图片过大（超过5MB），请压缩后重试。
              </div>
              <!-- Image Preview -->
              <div v-if="form.dataUrl" class="kb-field__preview">
                <img :src="form.dataUrl" class="kb-field__preview-img" alt="预览" />
              </div>
            </label>
          </template>
        </div>

        <div class="kb-modal__footer">
          <button class="kb-btn kb-btn--cancel" @click="showEditor = false">取消</button>
          <button class="kb-btn kb-btn--save" :disabled="!canSave" @click="saveRule">保存</button>
        </div>
      </div>
    </div>

    <!-- PDF Viewer Modal -->
    <div v-if="viewingPdf" class="kb-modal-overlay" @click.self="viewingPdf = null">
      <div class="kb-modal kb-modal--wide">
        <div class="kb-modal__header">
          <span>{{ viewingPdf.fileName || 'PDF 预览' }}</span>
          <button class="kb-modal__close" @click="viewingPdf = null">✕</button>
        </div>
        <div class="kb-modal__body">
          <iframe
            v-if="viewingPdf.dataUrl"
            :src="viewingPdf.dataUrl"
            class="kb-pdf-viewer"
            frameborder="0"
          ></iframe>
          <p v-else class="kb-page__empty-desc">PDF数据不可用</p>
        </div>
      </div>
    </div>

    <!-- Image Viewer Modal -->
    <div v-if="viewingImage" class="kb-modal-overlay" @click.self="viewingImage = null">
      <div class="kb-modal kb-modal--wide">
        <div class="kb-modal__header">
          <span>{{ viewingImage.fileName || '图片预览' }}</span>
          <button class="kb-modal__close" @click="viewingImage = null">✕</button>
        </div>
        <div class="kb-modal__body kb-modal__body--image">
          <img
            v-if="viewingImage.dataUrl"
            :src="viewingImage.dataUrl"
            class="kb-image-viewer"
            alt="规则图片"
          />
          <p v-else class="kb-page__empty-desc">图片数据不可用</p>
        </div>
      </div>
    </div>

    <!-- Delete Confirm -->
    <div v-if="deletingRule" class="kb-modal-overlay" @click.self="deletingRule = null">
      <div class="kb-modal kb-modal--small">
        <div class="kb-modal__header">
          <span>确认删除</span>
          <button class="kb-modal__close" @click="deletingRule = null">✕</button>
        </div>
        <div class="kb-modal__body">
          <p>确定要删除「{{ deletingRule.manufacturerLabel }} - {{ deletingRule.componentLabel }}」的编码规则吗？</p>
        </div>
        <div class="kb-modal__footer">
          <button class="kb-btn kb-btn--cancel" @click="deletingRule = null">取消</button>
          <button class="kb-btn kb-btn--danger" @click="doDelete">确认删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useKnowledgeStore } from '@/stores/knowledge'
import { navigateTo } from '@/utils/router'
import { showToast } from '@/utils/clipboard'
import type { KnowledgeRule, KnowledgeFileType } from '@/stores/knowledge'

const store = useKnowledgeStore()

// ─── Navigation ────────────────────────────────────────
function goBack() {
  navigateTo('/')
}

// ─── Date format ───────────────────────────────────────
function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function fileTypeLabel(type: KnowledgeFileType): string {
  switch (type) {
    case 'text': return '文字'
    case 'pdf': return 'PDF'
    case 'image': return '图片'
  }
}

// ─── Editor ────────────────────────────────────────────
const showEditor = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const tooLarge = ref(false)
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB limit for localStorage

const form = reactive({
  manufacturer: '',
  componentType: '',
  fileType: 'text' as KnowledgeFileType,
  description: '',
  dataUrl: '',
  fileName: '',
})

const canSave = computed(() => {
  if (!form.manufacturer || !form.componentType) return false
  if (form.fileType === 'text') return form.description.trim().length > 0
  return form.dataUrl.length > 0
})

function triggerFileInput() {
  if (fileInput.value) {
    fileInput.value.value = ''
    fileInput.value.click()
  }
}

function onFilePicked(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (file.size > MAX_FILE_SIZE) {
    tooLarge.value = true
    return
  }

  tooLarge.value = false
  form.fileName = file.name

  const reader = new FileReader()
  reader.onload = () => {
    form.dataUrl = reader.result as string
  }
  reader.readAsDataURL(file)
}

function resetForm() {
  form.manufacturer = ''
  form.componentType = ''
  form.fileType = 'text'
  form.description = ''
  form.dataUrl = ''
  form.fileName = ''
  tooLarge.value = false
}

function saveRule() {
  if (!canSave.value) return

  store.addRule({
    manufacturer: form.manufacturer,
    manufacturerLabel: store.getManufacturerLabel(form.manufacturer),
    componentType: form.componentType,
    componentLabel: store.getComponentLabel(form.componentType),
    description: form.description,
    fileType: form.fileType,
    dataUrl: form.fileType !== 'text' ? form.dataUrl : undefined,
    fileName: form.fileType !== 'text' ? form.fileName : undefined,
  })

  showToast('规则已保存，所有人均可使用')
  resetForm()
  showEditor.value = false
}

// ─── Viewers ───────────────────────────────────────────
const viewingPdf = ref<KnowledgeRule | null>(null)
const viewingImage = ref<KnowledgeRule | null>(null)

function viewPdf(rule: KnowledgeRule) {
  viewingPdf.value = rule
}

function viewImage(rule: KnowledgeRule) {
  viewingImage.value = rule
}

// ─── Delete ────────────────────────────────────────────
const deletingRule = ref<KnowledgeRule | null>(null)
function confirmDelete(rule: KnowledgeRule) {
  deletingRule.value = rule
}
function doDelete() {
  if (!deletingRule.value) return
  store.deleteRule(deletingRule.value.id)
  showToast('已删除')
  deletingRule.value = null
}
</script>

<style lang="scss" scoped>
.kb-page {
  min-height: 100vh;
  padding-bottom: var(--spacing-xl);

  &__nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px var(--spacing-lg);
    background: var(--color-bg-card);
    border-bottom: 1px solid var(--color-border);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  &__back {
    font-size: var(--font-size-md);
    color: var(--color-primary);
    background: none;
    border: none;
    cursor: pointer;
  }

  &__nav-title {
    font-size: var(--font-size-lg);
    font-weight: 600;
  }

  &__add {
    font-size: var(--font-size-md);
    color: var(--color-primary);
    background: none;
    border: 1.5px solid var(--color-primary);
    border-radius: 16px;
    padding: 4px 14px;
    font-weight: 500;
    cursor: pointer;
  }

  &__banner {
    margin: var(--spacing-md) var(--spacing-lg);
    padding: var(--spacing-md);
    background: rgba(7, 193, 96, 0.06);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    line-height: 1.6;
  }

  &__section {
    margin-top: var(--spacing-md);
  }

  &__section-title {
    padding: 0 var(--spacing-lg);
    margin-bottom: var(--spacing-sm);
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  &__empty {
    text-align: center;
    padding: 64px var(--spacing-lg);
  }

  &__empty-icon { font-size: 48px; margin-bottom: var(--spacing-lg); }
  &__empty-title { font-size: var(--font-size-lg); font-weight: 600; margin-bottom: var(--spacing-sm); }
  &__empty-desc { font-size: var(--font-size-sm); color: var(--color-text-secondary); line-height: 1.8; }
}

// ─── Rule Cards ────────────────────────────────────────
.kb-rule-card {
  margin: 8px var(--spacing-lg);
  padding: var(--spacing-md);
  background: var(--color-bg-card);
  border-radius: var(--radius-sm);
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);

  &__header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  &__mfr {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-text-primary);
  }

  &__type {
    font-size: var(--font-size-xs);
    color: var(--color-primary);
    background: rgba(7,193,96,0.1);
    padding: 2px 8px;
    border-radius: 10px;
  }

  &__format {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 8px;
    font-weight: 500;

    &--text { background: #E8F0FE; color: #1967D2; }
    &--pdf { background: #FCE8E6; color: #C5221F; }
    &--image { background: #E6F4EA; color: #137333; }
  }

  &__desc {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  &__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 8px;
  }

  &__date {
    font-size: var(--font-size-xs);
    color: var(--color-text-hint);
  }

  &__actions {
    display: flex;
    gap: 8px;
  }

  &__btn {
    font-size: var(--font-size-xs);
    border: none;
    background: none;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;

    &--view { color: #1967D2; }
    &--del { color: var(--color-text-hint);
      &:hover { color: var(--color-danger); }
    }
  }
}

// ─── Modal ─────────────────────────────────────────────
.kb-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 200;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.kb-modal {
  background: var(--color-bg-card);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  width: 100%;
  max-width: 480px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.25s ease;

  &--wide { max-width: 100%; }
  &--small { max-width: 360px; }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-lg);
    border-bottom: 1px solid var(--color-divider);
    font-size: var(--font-size-lg);
    font-weight: 600;
  }

  &__close {
    font-size: 18px;
    background: none;
    border: none;
    color: var(--color-text-hint);
    cursor: pointer;
    padding: 4px;
  }

  &__body {
    padding: var(--spacing-lg);
    overflow-y: auto;
    flex: 1;

    &--image {
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }

  &__footer {
    padding: var(--spacing-md) var(--spacing-lg);
    border-top: 1px solid var(--color-divider);
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }
}

@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

// ─── Form Fields ───────────────────────────────────────
.kb-field {
  display: block;
  margin-bottom: var(--spacing-md);

  &__label {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--color-text-secondary);
    margin-bottom: 6px;
  }

  &__select, &__input, &__textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1.5px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-md);
    color: var(--color-text-primary);
    background: var(--color-bg);
    outline: none;
    font-family: inherit;

    &:focus { border-color: var(--color-primary); }
  }

  &__textarea {
    resize: vertical;
    line-height: 1.6;
  }

  &__tabs {
    display: flex;
    gap: 8px;
  }

  &__upload {
    padding: 24px;
    border: 2px dashed var(--color-border);
    border-radius: var(--radius-sm);
    text-align: center;
    font-size: var(--font-size-sm);
    color: var(--color-text-hint);
    cursor: pointer;
    transition: border-color 0.2s;

    &:hover { border-color: var(--color-primary); }
  }

  &__file-selected {
    color: var(--color-primary);
    font-weight: 500;
    word-break: break-all;
  }

  &__error {
    margin-top: 6px;
    font-size: var(--font-size-xs);
    color: var(--color-danger);
  }

  &__preview {
    margin-top: 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: var(--color-bg);
  }

  &__preview-img {
    width: 100%;
    max-height: 200px;
    object-fit: contain;
    display: block;
  }
}

.kb-tab {
  flex: 1;
  padding: 10px 6px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  text-align: center;
  white-space: nowrap;

  &--active {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: rgba(7,193,96,0.06);
  }
}

// ─── Buttons ───────────────────────────────────────────
.kb-btn {
  padding: 10px 24px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-md);
  font-weight: 500;
  cursor: pointer;
  border: none;

  &--cancel {
    background: var(--color-divider);
    color: var(--color-text-secondary);
  }

  &--save {
    background: var(--color-primary);
    color: #fff;
    &:disabled { opacity: 0.4; cursor: not-allowed; }
  }

  &--danger {
    background: var(--color-danger);
    color: #fff;
  }
}

// ─── PDF Viewer ────────────────────────────────────────
.kb-pdf-viewer {
  width: 100%;
  height: 60vh;
  border-radius: var(--radius-sm);
}

// ─── Image Viewer ──────────────────────────────────────
.kb-image-viewer {
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
  border-radius: var(--radius-sm);
}
</style>
