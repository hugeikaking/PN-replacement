/**
 * Simple hash-based router compatible with uni-app migration path.
 * On H5: uses window.location.hash
 * On uni-app: replace with uni.navigateTo
 */

import { ref, onMounted, onUnmounted, type Component } from 'vue'

export interface Route {
  path: string
  component: Component
}

let routes: Route[] = []
const currentPath = ref('/')

export function createRouter(routeDefs: Route[]) {
  routes = routeDefs
  return { currentPath, navigateTo }
}

export function navigateTo(path: string) {
  window.location.hash = '#' + path
}

function onHashChange() {
  const hash = window.location.hash.replace('#', '') || '/'
  currentPath.value = hash
}

export function useRouter() {
  onMounted(() => {
    onHashChange()
    window.addEventListener('hashchange', onHashChange)
  })

  onUnmounted(() => {
    window.removeEventListener('hashchange', onHashChange)
  })

  return { currentPath, navigateTo }
}
