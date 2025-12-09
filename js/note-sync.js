/**
 * note同期処理（Vercel API Route版）
 */

class NoteSyncManager {
  constructor() {
    this.isSyncing = false;
    this.lastSyncTime = null;
    this.loadLastSyncTime();
  }

  /**
   * 最終同期時刻を読み込み
   */
  loadLastSyncTime() {
    const saved = localStorage.getItem('note_last_sync_time');
    if (saved) {
      this.lastSyncTime = new Date(saved);
    }
  }

  /**
   * 最終同期時刻を保存
   */
  saveLastSyncTime() {
    this.lastSyncTime = new Date();
    localStorage.setItem('note_last_sync_time', this.lastSyncTime.toISOString());
    this.updateSyncStatusUI();
  }

  /**
   * 同期ステータスUIを更新
   */
  updateSyncStatusUI() {
    const statusElement = document.getElementById('last-sync-time');
    if (statusElement && this.lastSyncTime) {
      statusElement.textContent = this.lastSyncTime.toLocaleString('ja-JP');
    }
  }

  /**
   * noteからデータを同期（Vercel API経由）
   */
  async syncFromNote() {
    if (this.isSyncing) {
      showToast('同期処理が既に実行中です');
      return;
    }

    try {
      this.isSyncing = true;
      showToast('noteからデータを取得中...');

      // Cookie情報を取得
      const settings = window.noteSettingsManager.loadSettings();
      
      if (!settings.authToken || !settings.sessionToken) {
        throw new Error('note API認証情報が設定されていません。⚙️ note連携設定から設定してください。');
      }

      // Vercel API Routeを呼び出し
      const response = await fetch('/api/sync-note', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          authToken: settings.authToken,
          sessionToken: settings.sessionToken
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API Error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '同期に失敗しました');
      }

      const now = new Date().toLocaleString('ja-JP');
      showToast(`${result.count}件のデータを保存しました（取得時刻: ${now}）`);
      this.saveLastSyncTime();
      showToast('✅ 同期が完了しました。※noteのデータは数時間の遅延があります');

      // グラフを更新
      if (typeof loadAnalytics === 'function') {
        await loadAnalytics();
      }

    } catch (error) {
      console.error('Sync error:', error);
      showToast(`同期エラー: ${error.message}`);
    } finally {
      this.isSyncing = false;
    }
  }
}

// グローバルインスタンス
window.noteSyncManager = new NoteSyncManager();

// グローバル関数（HTMLから呼び出し用）
async function syncFromNote() {
  await window.noteSyncManager.syncFromNote();
}
