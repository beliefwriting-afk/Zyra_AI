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

    /**
     * 開放給 AI 代理的 action 白名單。
     *
     * 為什麼不是「全部 38 個」：工具愈多，模型選錯的機率愈高，
     * 而且第一版若品質不好，會分不清是「模型不會用」還是「工具太多挑花了」。
     * 先開這組最常用的，確認品質後再放。
     *
     * 名單外的 action 不會出現在工具定義裡，模型無從呼叫——
     * agent.js 執行前也會再擋一次，不靠模型自律。
     */
    AI_TOOLS: [
      // 先看清楚，再動手
      'listStructure', 'findCards', 'getCard',
      // 卡片
      'createCard', 'updateCard', 'moveCard', 'duplicateCard', 'deleteCard',
      // 檢查清單
      'addChecklistItem', 'toggleChecklistItem',
      // 結構
      'createDepartment', 'createBoard', 'addColumn', 'renameBoard',
      // 成員與導覽
      'addMember', 'setActiveBoard'
    ],

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
      green:  { light: { accent: '#247765', ink: '#FFFFFF', soft: '#E5EFED' }, dark: { accent: '#71BFA0', ink: '#0F1915', soft: 'rgba(113,191,160,.15)' } },
      teal:   { light: { accent: '#27747C', ink: '#FFFFFF', soft: '#E5EFF0' }, dark: { accent: '#5FC3CE', ink: '#0C191B', soft: 'rgba(95,195,206,.15)' } },
      blue:   { light: { accent: '#466C9B', ink: '#FFFFFF', soft: '#E9EEF4' }, dark: { accent: '#8FB6DE', ink: '#13181D', soft: 'rgba(143,182,222,.15)' } },
      indigo: { light: { accent: '#6265A6', ink: '#FFFFFF', soft: '#EDEDF5' }, dark: { accent: '#9DA1E8', ink: '#14151E', soft: 'rgba(157,161,232,.15)' } },
      purple: { light: { accent: '#7955C5', ink: '#FFFFFF', soft: '#F0EBF9' }, dark: { accent: '#A990DF', ink: '#16131D', soft: 'rgba(169,144,223,.15)' } },
      pink:   { light: { accent: '#A44C71', ink: '#FFFFFF', soft: '#F5EAEF' }, dark: { accent: '#E594AF', ink: '#1E1317', soft: 'rgba(229,148,175,.15)' } },
      red:    { light: { accent: '#A45148', ink: '#FFFFFF', soft: '#F5EBEA' }, dark: { accent: '#E09289', ink: '#1D1312', soft: 'rgba(224,146,137,.15)' } },
      orange: { light: { accent: '#975B27', ink: '#FFFFFF', soft: '#F4ECE5' }, dark: { accent: '#E0A167', ink: '#1D150D', soft: 'rgba(224,161,103,.15)' } },
      amber:  { light: { accent: '#7D6822', ink: '#FFFFFF', soft: '#F0EEE5' }, dark: { accent: '#DDC177', ink: '#1D190F', soft: 'rgba(221,193,119,.15)' } },
      slate:  { light: { accent: '#606B7C', ink: '#FFFFFF', soft: '#EDEEF0' }, dark: { accent: '#AFBCCB', ink: '#17181A', soft: 'rgba(175,188,203,.15)' } }
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
