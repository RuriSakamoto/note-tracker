/**
 * note アクセス解析ツール - メインエントリーポイント
 */

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  console.log('note アクセス解析ツール 初期化開始');
  
  // note設定の読み込み
  loadNoteSettings();
  
  // アナリティクスの初期化
  initAnalytics();
  
  // チャート期間タブのイベント設定
  initChartPeriodTabs();
  
  // 最終同期時刻の表示
  updateLastSyncTime();
  
  console.log('初期化完了');
}

// チャート期間タブの初期化
function initChartPeriodTabs() {
  const tabs = document.querySelectorAll('#chart-period-tabs .filter-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const period = tab.dataset.period;
      updateChart(period);
    });
  });
}

// 最終同期時刻の更新
function updateLastSyncTime() {
  const lastSync = localStorage.getItem('note_last_sync');
  const element = document.getElementById('last-sync-time');
  if (lastSync) {
    const date = new Date(lastSync);
    element.textContent = `最終同期: ${date.toLocaleString('ja-JP')}`;
  } else {
    element.textContent = '最終同期: -';
  }
}

// noteから同期
async function syncFromNote() {
  const username = localStorage.getItem('note_username');
  if (!username) {
    showToast('先にnote連携設定でユーザー名を設定してください');
    openNoteSettings();
    return;
  }
  
  showToast('noteからデータを取得中...');
  
  try {
    await fetchNoteAnalytics(username);
    localStorage.setItem('note_last_sync', new Date().toISOString());
    updateLastSyncTime();
    initAnalytics(); // データ再読み込み
    showToast('同期が完了しました');
  } catch (error) {
    console.error('同期エラー:', error);
    showToast('同期に失敗しました: ' + error.message);
  }
}
