> This file extends [common/hooks.md](../common/hooks.md) with web-specific hook recommendations.

# Web Hooks

## Recommended PostToolUse Hooks

Prefer project-local tooling. Do not wire hooks to remote one-off package execution.

### Build Verification

Quasar プロジェクトではビルドによる検証が最も確実：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "glob": "web/**",
        "command": "cd web && pnpm quasar build",
        "description": "Verify Quasar build after frontend edits"
      }
    ]
  }
}
```

### Type Check (if vue-tsc available)

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "glob": "web/src/**/*.{ts,vue}",
        "command": "cd web && pnpm vue-tsc --noEmit",
        "description": "Type-check Vue/TS files"
      }
    ]
  }
}
```

## PreToolUse Hooks

### Guard File Size

Block oversized writes from tool input content, not from a file that may not exist yet:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write",
        "command": "node -e \"let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const i=JSON.parse(d);const c=i.tool_input?.content||'';const lines=c.split('\\n').length;if(lines>800){console.error('[Hook] BLOCKED: File exceeds 800 lines ('+lines+' lines)');console.error('[Hook] Split into smaller modules');process.exit(2)}console.log(d)})\"",
        "description": "Block writes that exceed 800 lines"
      }
    ]
  }
}
```

## Stop Hooks

### Final Build Verification

```json
{
  "hooks": {
    "Stop": [
      {
        "command": "cd web && pnpm quasar build",
        "description": "Verify the Quasar production build at session end"
      }
    ]
  }
}
```

## Ordering (MYCUTE)

推奨順序（利用可能なツールに応じて）:
1. type check (`vue-tsc --noEmit`)
2. build verification (`quasar build`)
