/* ============================================================
   Zyra — 常數
   純資料，不含邏輯。任何列舉值都應該在這裡集中定義，
   避免字串散落在各模組造成拼字漂移。
   ============================================================ */
(function (Z) {
  'use strict';

  Z.C = {

    /** localStorage 鍵值。刻意沿用舊名，避免既有使用者資料讀不到。 */
    STORAGE_KEY: 'department-kanban-state-v1',

    /** 資料結構版本。store.migrate() 依此決定要套用哪些升級步驟。 */
    SCHEMA_VERSION: 2,

    /** 範本欄位型別 */
    FIELD_TYPES: { text: '文字', select: '下拉選單', date: '日期' },

    /** 標籤可用色。新增標籤時依序輪替。 */
    LABEL_COLORS: ['teal', 'gold', 'plum', 'slate', 'rose', 'moss'],

    COLOR_TOKENS: {
      teal:  { fg: 'var(--tag-teal)',  soft: 'var(--tag-teal-soft)' },
      gold:  { fg: 'var(--tag-gold)',  soft: 'var(--tag-gold-soft)' },
      plum:  { fg: 'var(--tag-plum)',  soft: 'var(--tag-plum-soft)' },
      slate: { fg: 'var(--tag-slate)', soft: 'var(--tag-slate-soft)' },
      rose:  { fg: 'var(--tag-rose)',  soft: 'var(--tag-rose-soft)' },
      moss:  { fg: 'var(--tag-moss)',  soft: 'var(--tag-moss-soft)' }
    },

    /** 建立看板時可套用的欄位範本 */
    BOARD_TEMPLATES: {
      basic: ['待辦', '進行中', '完成'],
      flow: ['規劃', '執行', '審核', '完成', '歸檔']
    },
    BOARD_TEMPLATE_LABELS: {
      basic: '三欄式（待辦／進行中／完成）',
      flow: '五階流程（規劃／執行／審核／完成／歸檔）'
    },

    /** 卡片優先級。順序即排序權重（愈前面愈緊急）。 */
    PRIORITIES: ['urgent', 'high', 'normal', 'low'],
    PRIORITY_LABELS: { urgent: '緊急', high: '高', normal: '一般', low: '低' },

    /** 到期狀態篩選 */
    DUE_FILTERS: {
      '': '到期：全部',
      overdue: '已逾期',
      today: '今天到期',
      week: '七天內到期',
      none: '未設到期日'
    },

    /** 主色方案 */
    ACCENT_THEMES: {
      green:  { light: { accent: '#0C6E58', ink: '#FFFFFF', soft: '#E1F0EA' }, dark: { accent: '#34B393', ink: '#0B140F', soft: 'rgba(52,179,147,.16)' } },
      teal:   { light: { accent: '#0E7480', ink: '#FFFFFF', soft: '#DCEEF0' }, dark: { accent: '#3FC1CF', ink: '#071A1C', soft: 'rgba(63,193,207,.16)' } },
      blue:   { light: { accent: '#2A5C99', ink: '#FFFFFF', soft: '#DEE9F5' }, dark: { accent: '#6FA8DC', ink: '#0B1520', soft: 'rgba(111,168,220,.16)' } },
      indigo: { light: { accent: '#4C51BF', ink: '#FFFFFF', soft: '#E6E7FA' }, dark: { accent: '#8B90E8', ink: '#12132B', soft: 'rgba(139,144,232,.16)' } },
      purple: { light: { accent: '#6B3FA0', ink: '#FFFFFF', soft: '#EFE3F5' }, dark: { accent: '#B98CE0', ink: '#180B22', soft: 'rgba(185,140,224,.16)' } },
      pink:   { light: { accent: '#B23368', ink: '#FFFFFF', soft: '#F8E1EA' }, dark: { accent: '#E8749E', ink: '#260A15', soft: 'rgba(232,116,158,.16)' } },
      red:    { light: { accent: '#B03A2E', ink: '#FFFFFF', soft: '#F6E1DE' }, dark: { accent: '#E2695A', ink: '#1C0C0A', soft: 'rgba(226,105,90,.16)' } },
      orange: { light: { accent: '#C2600C', ink: '#FFFFFF', soft: '#F8E4D2' }, dark: { accent: '#E98A4A', ink: '#1A0F08', soft: 'rgba(233,138,74,.16)' } },
      amber:  { light: { accent: '#8A6D0A', ink: '#FFFFFF', soft: '#F3E9C9' }, dark: { accent: '#E3C24C', ink: '#241C05', soft: 'rgba(227,194,76,.16)' } },
      slate:  { light: { accent: '#3F4B5C', ink: '#FFFFFF', soft: '#E5E8EC' }, dark: { accent: '#9FB0C4', ink: '#0E1218', soft: 'rgba(159,176,196,.16)' } }
    },
    ACCENT_LABELS: {
      green: '綠', teal: '青', blue: '藍', indigo: '靛', purple: '紫',
      pink: '粉', red: '紅', orange: '橘', amber: '琥珀', slate: '石墨'
    },

    THEME_MODES: ['system', 'light', 'dark'],
    THEME_MODE_LABELS: { system: '系統預設', light: '亮色', dark: '深色' },

    /** 復原堆疊上限。過大會吃記憶體，過小會讓使用者撤不回來。 */
    UNDO_LIMIT: 40,

    /** Toast 停留毫秒數 */
    TOAST_MS: 8000
  };

})(window.Zyra = window.Zyra || {});
