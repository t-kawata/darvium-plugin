> This file extends [common/patterns.md](../common/patterns.md) with web-specific patterns.

# Web Patterns

## Vue 3 Patterns (MYCUTE)

MYCUTE のフロントエンドは **Vue 3 Composition API + `<script setup>`** を標準とする。

### コンポーネント構成

#### スロットによるコンポジション

Vue の slot 機構で親子間の UI バリエーションを分離する：

```vue
<template>
  <div class="panel">
    <header>
      <slot name="title" />
    </header>
    <main>
      <slot />
    </main>
    <footer v-if="$slots.footer">
      <slot name="footer" />
    </footer>
  </div>
</template>
```

- 親が children として任意のマークアップを注入できる
- 名前付きスロットで責務を明示
- `$slots` チェックで条件付きレンダリング

#### Provide / Inject による依存注入

深くネストしたコンポーネント間の状態共有は props バケツリレーではなく provide/inject を使用する：

```vue
<!-- 祖先コンポーネント -->
<script setup lang="ts">
import { provide, ref } from 'vue'

const activeTab = ref('overview')
provide('activeTab', activeTab)
</script>

<!-- 子孫コンポーネント -->
<script setup lang="ts">
import { inject } from 'vue'

const activeTab = inject('activeTab', ref('overview'))
</script>
```

#### Container / Presentational 分割

- Container（ページやビュー）がデータ取得と副作用を担当
- Presentational（汎用コンポーネント）は props を受け取り UI を描画
- Presentational コンポーネントは純粋に保つ

### 状態管理: Pinia

MYCUTE は Pinia を唯一の状態管理ライブラリとして使用する：

```typescript
// src/stores/main-store.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useMainStore = defineStore('main', () => {
  const count = ref(0)
  const double = computed(() => count.value * 2)

  function increment() {
    count.value++
  }

  return { count, double, increment }
})
```

- **Server state**: バックエンドから取得したデータは `boot/axios.ts` の Axios インスタンスを介して取得し、Pinia store でキャッシュする
- **Client state**: Pinia store で一元管理。store 間の依存は `useXxxStore()` で解決
- **Form state**: フォームの値は Quasar の `v-model` + Pinia、またはローカル ref で管理
- サーバー状態を重複して保持しない（必要な都度 Axios で取得し store でキャッシュ）

### URL 状態

Vue Router で管理：

```typescript
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

// クエリパラメータの取得
const tab = route.query.tab as string | undefined

// クエリパラメータの更新
router.push({ query: { ...route.query, tab: 'settings' } })
```

永続化すべき UI 状態（フィルター、ソート、ページネーション、アクティブタブ、検索クエリ）は URL に保持する。

### データ取得 (Axios)

MYCUTE は `boot/axios.ts` で設定された Axios インスタンスを介してバックエンドと通信する：

```typescript
import { api } from 'boot/axios'
import { useMainStore } from 'stores/main-store'

// 取得 → store でキャッシュ
async function fetchUsers() {
  const store = useMainStore()
  const res = await api.get('/v1/users')
  store.setUsers(res.data)
}

// 楽観的更新 (Optimistic Update)
async function toggleLike(postId: string) {
  const store = useMainStore()
  const prev = store.likes
  store.addOptimisticLike(postId) // 先に UI 更新
  try {
    await api.post(`/v1/posts/${postId}/like`)
  } catch {
    store.restoreLikes(prev) // 失敗時にロールバック
    $q.notify({ type: 'negative', message: 'いいねに失敗しました' })
  }
}
```

### 非同期処理パターン

- 独立した複数のリクエストは `Promise.all` で並列実行
- ページ遷移前に次の画面のデータを先読みする場合は `swr` パターンを Pinia store に実装する
- ローディング状態は `ref(false)` + Quasar の `$q.loading` / `q-inner-loading` で表示
