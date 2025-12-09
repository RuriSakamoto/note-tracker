/**
 * note設定管理
 * Cookie認証情報の保存・読み込み
 */

class NoteSettingsManager {
  constructor() {
    this.storageKey = 'note_api_settings';
    this.loadSettings();
  }

  /**
   * 設定を読み込み
   */
  loadSettings() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const settings = JSON.parse(saved);
        
        // APIクライアントに認証情報を設定
        if (settings.authToken && settings.sessionToken) {
          window.noteAPIClient.setAuth(settings.authToken, settings.sessionToken);
        }
        
        return settings;
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
    return {};
  }

  /**
   * 設定を保存
   */
  saveSettings(authToken, sessionToken) {
    try {
      const settings = {
        authToken: authToken,
        sessionToken: sessionToken,
        savedAt: new Date().toISOString()
      };

      localStorage.setItem(this.storageKey, JSON.stringify(settings));
      
      // APIクライアントに認証情報を設定
      window.noteAPIClient.setAuth(authToken, sessionToken);
      
      return true;
    } catch (error) {
      console.error('Failed to save settings:', error);
      return false;
    }
  }

  /**
   * 設定をクリア
   */
  clearSettings() {
    localStorage.removeItem(this.storageKey);
    window.noteAPIClient.setAuth(null, null);
  }

  /**
   * 設定が存在するかチェック
   */
  hasSettings() {
    const settings = this.loadSettings();
    return !!(settings.authToken && settings.sessionToken);
  }
}

// グローバルインスタンス
window.noteSettingsManager = new NoteSettingsManager();

/**
 * note設定モーダルを開く
 */
function openNoteSettingsModal() {
  const settings = window.noteSettingsManager.loadSettings();
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'note-settings-modal';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3 class="modal-title">note連携設定</h3>
        <button class="modal-close" onclick="closeNoteSettingsModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">note_gql_auth_token</label>
          <input 
            type="text" 
            id="note-auth-token" 
            class="form-input" 
            placeholder="ブラウザのCookieから取得"
            value="${settings.authToken || ''}"
          >
          <p style="font-size: 0.875rem; color: var(--gray-600); margin-top: 4px;">
            ブラウザの開発者ツールから取得してください
            <a href="#" onclick="showCookieGuide(); return false;" style="color: var(--primary-color);">取得方法を見る</a>
          </p>
        </div>
        
        <div class="form-group">
          <label class="form-label">_note_session_v5</label>
          <input 
            type="text" 
            id="note-session-token" 
            class="form-input" 
            placeholder="ブラウザのCookieから取得"
            value="${settings.sessionToken || ''}"
          >
        </div>

        <div style="padding: 12px; background: #e3f2fd; border-radius: 8px; margin-top: 16px;">
          <strong>⚠️ 注意:</strong> Cookie情報は定期的に更新が必要です（通常30日程度）
        </div>

        ${settings.savedAt ? `
          <div class="form-group" style="margin-top: 16px;">
            <small style="color: var(--gray-600);">最終保存: ${new Date(settings.savedAt).toLocaleString('ja-JP')}</small>
          </div>
        ` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeNoteSettingsModal()">キャンセル</button>
        <button class="btn btn-danger" onclick="clearNoteSettings()">設定をクリア</button>
        <button class="btn btn-secondary" onclick="testNoteConnection()">接続テスト</button>
        <button class="btn btn-primary" onclick="saveNoteSettings()">保存</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.style.display = 'flex';
}

/**
 * note設定モーダルを閉じる
 */
function closeNoteSettingsModal() {
  const modal = document.getElementById('note-settings-modal');
  if (modal) {
    modal.remove();
  }
}

/**
 * note設定を保存
 */
async function saveNoteSettings() {
  const authToken = document.getElementById('note-auth-token').value.trim();
  const sessionToken = document.getElementById('note-session-token').value.trim();

  if (!authToken || !sessionToken) {
    showToast('両方のCookie情報を入力してください');
    return;
  }

  const success = window.noteSettingsManager.saveSettings(authToken, sessionToken);
  
  if (success) {
    showToast('設定を保存しました');
    closeNoteSettingsModal();
  } else {
    showToast('設定の保存に失敗しました');
  }
}

/**
 * note設定をクリア
 */
function clearNoteSettings() {
  if (confirm('note連携設定をクリアしますか？')) {
    window.noteSettingsManager.clearSettings();
    showToast('設定をクリアしました');
    closeNoteSettingsModal();
  }
}

/**
 * note接続テスト
 */
async function testNoteConnection() {
  const authToken = document.getElementById('note-auth-token').value.trim();
  const sessionToken = document.getElementById('note-session-token').value.trim();

  if (!authToken || !sessionToken) {
    showToast('両方のCookie情報を入力してください');
    return;
  }

  // 一時的に認証情報を設定
  window.noteAPIClient.setAuth(authToken, sessionToken);

  showToast('接続テスト中...');

  const result = await window.noteAPIClient.testConnection();
  
  if (result.success) {
    showToast('✅ 接続成功！note APIと通信できます');
  } else {
    showToast(`❌ 接続失敗: ${result.message}`);
  }
}

/**
 * Cookie取得ガイドを表示
 */
function showCookieGuide() {
  const guideModal = document.createElement('div');
  guideModal.className = 'modal-overlay';
  guideModal.id = 'cookie-guide-modal';
  guideModal.innerHTML = `
    <div class="modal" style="max-width: 700px;">
      <div class="modal-header">
        <h3 class="modal-title">Cookie情報の取得方法</h3>
        <button class="modal-close" onclick="closeCookieGuide()">&times;</button>
      </div>
      <div class="modal-body" style="max-height: 500px; overflow-y: auto;">
        <h4>Chrome / Edge の場合</h4>
        <ol style="line-height: 1.8;">
          <li>note.com にログインした状態でページを開く</li>
          <li>F12キーを押して開発者ツールを開く</li>
          <li>「Application」タブをクリック</li>
          <li>左側メニューの「Cookies」→「https://note.com」を選択</li>
          <li>以下の2つのCookieを探してコピー:
            <ul>
              <li><code>note_gql_auth_token</code></li>
              <li><code>_note_session_v5</code></li>
            </ul>
          </li>
        </ol>

        <h4>Firefox の場合</h4>
        <ol style="line-height: 1.8;">
          <li>note.com にログインした状態でページを開く</li>
          <li>F12キーを押して開発者ツールを開く</li>
          <li>「ストレージ」タブをクリック</li>
          <li>左側メニューの「Cookie」→「https://note.com」を選択</li>
          <li>上記と同じCookieをコピー</li>
        </ol>

        <h4>Safari の場合</h4>
        <ol style="line-height: 1.8;">
          <li>「開発」メニューを有効化（環境設定→詳細）</li>
          <li>note.com にログインした状態でページを開く</li>
          <li>「開発」→「Webインスペクタを表示」</li>
          <li>「ストレージ」タブ→「Cookie」を選択</li>
          <li>上記と同じCookieをコピー</li>
        </ol>

        <div style="padding: 12px; background: #fff3cd; border-radius: 8px; margin-top: 20px;">
          <strong>⚠️ セキュリティ注意:</strong>
          <ul style="margin: 8px 0 0 20px;">
            <li>Cookie情報は他人に教えないでください</li>
            <li>公共のPCでは使用しないでください</li>
            <li>Cookie情報は定期的に更新されます（約30日）</li>
          </ul>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="closeCookieGuide()">閉じる</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(guideModal);
  guideModal.style.display = 'flex';
}

/**
 * Cookieガイドモーダルを閉じる
 */
function closeCookieGuide() {
  const modal = document.getElementById('cookie-guide-modal');
  if (modal) {
    modal.remove();
  }
}
