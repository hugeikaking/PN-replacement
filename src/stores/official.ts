import { defineStore } from 'pinia'
import { markRaw, shallowRef } from 'vue'
import type { OfficialCatalog } from '../engine/official/catalog'

/** Company records live in page memory only; never localStorage or a remote API. */
export const useOfficialStore = defineStore('official', () => {
  const catalog = shallowRef<OfficialCatalog>()
  function setCatalog(value?: OfficialCatalog) { catalog.value = value ? markRaw(value) : undefined }
  return { catalog, setCatalog }
})
