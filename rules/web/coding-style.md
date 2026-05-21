> This file extends [common/coding-style.md](../common/coding-style.md) with web-specific frontend content.

# Web Coding Style

## File Organization

Organize by feature or surface area, not by file type:

```text
src/
├── components/
│   ├── hero/
│   │   ├── Hero.vue
│   │   ├── HeroVisual.vue
│   │   └── hero.scss
│   ├── panels/
│   │   └── settings/
│   │       └── SettingsPanel.vue
│   └── ui/
│       ├── BaseButton.vue
│       └── SurfaceCard.vue
├── stores/
│   ├── main-store.ts
│   └── llm-store.ts
├── utils/
│   ├── api.ts
│   └── notify.ts
└── css/
    ├── quasar.variables.scss
    └── app.scss
```

## CSS Custom Properties

Define design tokens as variables. Do not hardcode palette, typography, or spacing repeatedly:

```css
:root {
  --color-surface: oklch(98% 0 0);
  --color-text: oklch(18% 0 0);
  --color-accent: oklch(68% 0.21 250);

  --text-base: clamp(1rem, 0.92rem + 0.4vw, 1.125rem);
  --text-hero: clamp(3rem, 1rem + 7vw, 8rem);

  --space-section: clamp(4rem, 3rem + 5vw, 10rem);

  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
}
```

## Animation-Only Properties

Prefer compositor-friendly motion:
- `transform`
- `opacity`
- `clip-path`
- `filter` (sparingly)

Avoid animating layout-bound properties:
- `width`
- `height`
- `top`
- `left`
- `margin`
- `padding`
- `border`
- `font-size`

## Semantic HTML First

```html
<header>
  <nav aria-label="Main navigation">...</nav>
</header>
<main>
  <section aria-labelledby="hero-heading">
    <h1 id="hero-heading">...</h1>
  </section>
</main>
<footer>...</footer>
```

Do not reach for generic wrapper `div` stacks when a semantic element exists.

## Naming

- Components: PascalCase (`ScrollySection`, `SurfaceCard`)
- Hooks: `use` prefix (`useReducedMotion`)
- CSS classes: kebab-case or utility classes
- Animation timelines: camelCase with intent (`heroRevealTl`)

---

## MYCUTE / Quasar 固有規約

MYCUTE のフロントエンドは **Quasar (Vue.js) + Vite** で構築されている。

### プロジェクト構成

```text
web/
├── src/
│   ├── App.vue           # ルートコンポーネント
│   ├── components/       # 再利用可能な Vue コンポーネント
│   ├── layouts/          # Quasar レイアウト
│   ├── pages/            # ページコンポーネント
│   ├── boot/             # Quasar ブートファイル（axios 等の初期化）
│   ├── router/           # Vue Router 設定
│   ├── stores/           # Pinia ストア
│   ├── models/           # 型定義
│   ├── utils/            # ユーティリティ関数
│   ├── configs/          # 設定ファイル
│   ├── consts/           # 定数
│   ├── enums/            # 列挙型
│   ├── i18n/             # 国際化
│   └── assets/           # 静的アセット
sdk-ts/                   # TypeScript SDK（バックエンドAPIクライアント）
```

### コンポーネント規約

- **Composition API + `<script setup>` を標準とする**（Quasar 推奨）
- Quasar の UI コンポーネント（`q-btn`, `q-dialog`, `q-table` 等）を優先して使用し、独自実装を避ける
- スタイルは Quasar のテーマ変数（`$primary`, `$secondary` 等）を活用する

```vue
<template>
  <q-page>
    <q-btn
      color="primary"
      :label="$t('buttons.submit')"
      @click="handleSubmit"
    />
  </q-page>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const loading = ref(false)

async function handleSubmit() {
  loading.value = true
  try {
    // API呼び出し
  } finally {
    loading.value = false
  }
}
</script>
```

### API 呼び出し

- **`boot/axios.ts`** で設定された Axios インスタンスを介してバックエンドにリクエスト
- エラーハンドリングには Quasar の `Notify` プラグイン（`$q.notify`）を使用
- SDK (`sdk-ts/`) の型定義をインポートして型安全な通信を行う
