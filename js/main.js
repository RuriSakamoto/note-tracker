/**
 * note アクセス解析ツール - メインエントリーポイント
 */

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  console.log('note アクセス解析ツール 初期化開始');
  
  try {
    // Supabase確認
    checkSupabase();
    
    // note設定の読み込み
    loadNoteSettings();
    
    // アナリティクスの初期化（データ取得含む）
    await initAnalytics();
    
    // チャート期間タブのイベント設定
    initChartPeriodTabs();
    
    // 最終同期時刻の表示
    updateLastSyncTime();
    
    console.log('初期化完了');
  } catch (error) {
    console.error('初期化エラー:', error);
    showToast('初期化に失敗しました');
  }
}

// Supabase確認
function checkSupabase() {
  if (typeof supabaseClient !== 'undefined' && supabaseClient) {
    console.log('Supabaseクライアント確認完了');
  } else {
    console.warn('Supabaseクライアントが見つかりません。ローカルモードで動作します。');
  }
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
  if (element) {
    if (lastSync) {
      const date = new Date(lastSync);
      element.textContent = `最終同期: ${date.toLocaleString('ja-JP')}`;
    } else {
      element.textContent = '最終同期: -';
    }
  }
}

// noteから同期
async function syncFromNote() {
  const authToken = localStorage.getItem('note_auth_token');
  const session = localStorage.getItem('note_session');
  
  if (!authToken || !session) {
    showToast('先にnote連携設定で認証情報を設定してください');
    openNoteSettingsModal();
    return;
  }
  
  const btn = document.getElementById('sync-note-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '🔄 同期中...';
  }
  
  showToast('noteからデータを取得中...');
  
  try {
    // note-sync.jsのsyncNoteStats関数を呼び出し
    if (typeof syncNoteStats === 'function') {
      await syncNoteStats();
    } else {
      // フォールバック: 直接API呼び出し
      await fetchNoteStatsDirectly();
    }
    
    localStorage.setItem('note_last_sync', new Date().toISOString());
    updateLastSyncTime();
    await initAnalytics(); // データ再読み込み
    showToast('同期が完了しました');
  } catch (error) {
    console.error('同期エラー:', error);
    showToast('同期に失敗しました: ' + error.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '🔄 noteから自動取得';
    }
  }
}

// 直接API呼び出し（フォールバック用）
async function fetchNoteStatsDirectly() {
  const authToken = localStorage.getItem('note_auth_token');
  const session = localStorage.getItem('note_session');
  
  const response = await fetch('/api/sync-note', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      cookies: {
        note_gql_auth_token: authToken,
        _note_session_v5: session
      }
    })
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API Error: ${response.status}`);
  }
  
  const result = await response.json();
  
  if (result.data) {
    localStorage.setItem('note_analytics_cache', JSON.stringify(result.data));
  }
  
  return result;
}
