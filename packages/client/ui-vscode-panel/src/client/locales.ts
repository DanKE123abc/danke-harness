/** `vscode-panel` namespace dictionaries: the embedded Code panel chrome. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'vscode-panel'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'frame.title': '代码编辑器',
  'frame.unavailable': '代码编辑器资源不可用，请重新构建后再试。',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<VscodePanelKey, string> = {
  'frame.title': 'Code editor',
  'frame.unavailable': 'The code editor assets are unavailable. Rebuild and try again.',
}

/** Key domain of the `vscode-panel` namespace (zh is the source of truth). */
export type VscodePanelKey = keyof typeof zh
