/**
 * note アクセス解析ツール - CSVエクスポート機能
 */

// エクスポートモーダルを開く
function openExportModal() {
  const modal = document.getElementById('export-modal');
  
  // デフォルト期間を設定（過去30日）
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);
  
  document.getElementById('export-start').value = thirtyDaysAgo.toISOString().split('T')[0];
  document.getElementById('export-end').value = today.toISOString().split('T')[0];
  
  modal.classList.add('active');
}

// エクスポートモーダルを閉じる
function closeExportModal() {
  document.getElementById('export-modal').classList.remove('active');
}

// エクスポート実行
function executeExport() {
  const exportType = document.getElementById('export-type').value;
  const startDate = document.getElementById('export-start').value;
  const endDate = document.getElementById('export-end').value;
  
  let csvContent = '';
  
  if (exportType === 'detail') {
    csvContent = generateDetailCSV(startDate, endDate);
  } else {
    csvContent = generateSummaryCSV(startDate, endDate);
  }
  
  if (!csvContent) {
    showToast('エクスポートするデータがありません');
    return;
  }
  
  // BOM付きUTF-8でダウンロード
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `note_analytics_${exportType}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  closeExportModal();
  showToast('エクスポートが完了しました');
}

// 詳細データCSV生成
function generateDetailCSV(startDate, endDate) {
  const stored = localStorage.getItem('note_analytics_data');
  const analyticsData = stored ? JSON.parse(stored) : [];
  
  if (analyticsData.length === 0) return '';
  
  const rows = [];
  rows.push(['日付', '記事タイトル', 'PV', 'スキ', 'コメント'].join(','));
  
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  
  analyticsData.forEach(article => {
    if (!article.stats) return;
    
    article.stats.forEach(stat => {
      const date = new Date(stat.date);
      
      // 期間フィルタ
      if (start && date < start) return;
      if (end && date > end) return;
      
      rows.push([
        stat.date,
        `"${(article.title || '').replace(/"/g, '""')}"`,
        stat.pv || 0,
        stat.likes || 0,
        stat.comments || 0
      ].join(','));
    });
  });
  
  return rows.join('\n');
}

// サマリーCSV生成
function generateSummaryCSV(startDate, endDate) {
  const stored = localStorage.getItem('note_analytics_data');
  const analyticsData = stored ? JSON.parse(stored) : [];
  
  if (analyticsData.length === 0) return '';
  
  const rows = [];
  rows.push(['記事タイトル', '累計PV', '累計スキ', '累計コメント', '最終更新日'].join(','));
  
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  
  analyticsData.forEach(article => {
    if (!article.stats || article.stats.length === 0) return;
    
    let totalPV = 0;
    let totalLikes = 0;
    let totalComments = 0;
    let lastDate = '';
    
    article.stats.forEach(stat => {
      const date = new Date(stat.date);
      
      // 期間フィルタ
      if (start && date < start) return;
      if (end && date > end) return;
      
      totalPV += stat.pv || 0;
      totalLikes += stat.likes || 0;
      totalComments += stat.comments || 0;
      
      if (!lastDate || stat.date > lastDate) {
        lastDate = stat.date;
      }
    });
    
    if (lastDate) {
      rows.push([
        `"${(article.title || '').replace(/"/g, '""')}"`,
        totalPV,
        totalLikes,
        totalComments,
        lastDate
      ].join(','));
    }
  });
  
  return rows.join('\n');
}
