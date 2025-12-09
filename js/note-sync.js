/**
 * note同期処理
 * note APIからデータを取得してSupabaseに保存
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
   * noteからデータを同期
   */
  async syncFromNote() {
    if (this.isSyncing) {
      showToast('同期処理が既に実行中です');
      return;
    }

    try {
      this.isSyncing = true;
      showToast('noteからデータを取得中...');

      // 認証チェック
      if (!window.noteAPIClient.isAuthenticated) {
        throw new Error('note API認証情報が設定されていません');
      }

      // 全記事のデータを取得
      const allStats = await window.noteAPIClient.getAllStats('all', 10);
      
      if (!allStats || allStats.length === 0) {
        throw new Error('データが取得できませんでした');
      }

      showToast(`${allStats.length}件の記事データを取得しました`);

      // データを整形してSupabaseに保存
      await this.saveStatsToDatabase(allStats);

      this.saveLastSyncTime();
      showToast('同期が完了しました');

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

  /**
   * 統計データをデータベースに保存
   */
  async saveStatsToDatabase(statsArray) {
    const today = new Date().toISOString().split('T')[0];
    const records = [];

    for (const stat of statsArray) {
      // 記事情報を抽出
      const articleId = stat.id || stat.key;
      const title = stat.name || stat.title || '無題';
      const url = stat.noteUrl || `https://note.com/${stat.userUrlname}/n/${stat.key}`;
      
      // 統計情報を抽出
      const pv = stat.readCount || stat.pv || 0;
      const likes = stat.likeCount || stat.likes || 0;
      const comments = stat.commentCount || stat.comments || 0;

      // 記事マスタに登録（存在しない場合）
      await this.upsertArticle(articleId, title, url);

      // 統計データを登録
      records.push({
        article_id: articleId,
        date: today,
        pv: pv,
        likes: likes,
        comments: comments
      });
    }

    // バッチで保存
    if (records.length > 0) {
      await this.batchUpsertAnalytics(records);
    }
  }

  /**
   * 記事マスタに登録
   */
  async upsertArticle(articleId, title, url) {
    try {
      const { error } = await supabase
        .from('articles')
        .upsert({
          id: articleId,
          title: title,
          url: url,
          status: 'published',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'id'
        });

      if (error) throw error;
    } catch (error) {
      console.error('Article upsert error:', error);
      // 記事マスタの登録エラーは致命的ではないので続行
    }
  }

  /**
   * 分析データをバッチで登録
   */
  async batchUpsertAnalytics(records) {
    try {
      // 既存データを削除（同じ日付のデータ）
      const dates = [...new Set(records.map(r => r.date))];
      for (const date of dates) {
        await supabase
          .from('article_analytics')
          .delete()
          .eq('date', date);
      }

      // 新しいデータを挿入
      const { error } = await supabase
        .from('article_analytics')
        .insert(records);

      if (error) throw error;

      showToast(`${records.length}件のデータを保存しました`);
    } catch (error) {
      console.error('Batch upsert error:', error);
      throw new Error('データベースへの保存に失敗しました');
    }
  }

  /**
   * 自動同期を設定
   */
  setupAutoSync(intervalHours = 24) {
    // 既存のタイマーをクリア
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
    }

    // 新しいタイマーを設定
    const intervalMs = intervalHours * 60 * 60 * 1000;
    this.autoSyncTimer = setInterval(() => {
      this.syncFromNote();
    }, intervalMs);

    console.log(`Auto sync enabled: every ${intervalHours} hours`);
  }
}

// グローバルインスタンス
window.noteSyncManager = new NoteSyncManager();

// グローバル関数（HTMLから呼び出し用）
async function syncFromNote() {
  await window.noteSyncManager.syncFromNote();
}
