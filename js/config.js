// Supabase設定
const SUPABASE_URL = 'https://vjgtoedqyxtumadjjixr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqZ3RvZWRxeXh0dW1hZGpqaXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MTQ2OTMsImV4cCI6MjA4MDM5MDY5M30.CLom_qAan2Av94VBr4qUnPTKd5iUQwcSPnqRYkkkak4';

// Supabaseクライアント（supabaseClientという名前で作成）
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// タスク定義（削除予定だが互換性のため残す）
const TASKS = [
  { type: 'planning', name: '企画', order: 1, required: true },
  { type: 'writing', name: '執筆', order: 2, required: true },
  { type: 'proofreading', name: '校正', order: 3, required: true },
  { type: 'thumbnail', name: 'サムネイル作成', order: 4, required: true },
  { type: 'image', name: '画像貼り付け', order: 5, required: false },
  { type: 'affiliate', name: 'アフェリエイト貼り付け', order: 6, required: false }
];

const TASK_STATUSES = [
  { value: 'not_started', label: '未着手' },
  { value: 'in_progress', label: '進行中' },
  { value: 'completed', label: '完了' },
  { value: 'skipped', label: 'スキップ' }
];
