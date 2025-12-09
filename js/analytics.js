// ... 既存のコード（変更なし） ...

async function saveStats() {
  if (isProcessing) return;
  
  const date = document.getElementById('stats-date').value;
  const followers = parseInt(document.getElementById('stats-followers').value) || 0;
  const revenue = parseInt(document.getElementById('stats-revenue').value) || 0;
  
  if (!date) {
    showToast('日付を入力してください');
    return;
  }
  
  isProcessing = true;
  const saveBtn = document.getElementById('save-stats-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = '保存中...';
  
  try {
    await upsertOverallStats({ date, followers, revenue });
    showToast('保存しました');
    closeStatsModal();
    loadAnalytics();
  } catch (error) {
    console.error('Error saving stats:', error);
    showToast('保存に失敗しました');
  } finally {
    isProcessing = false;
    saveBtn.disabled = false;
    saveBtn.textContent = '保存';
  }
}

/**
 * 同期ステータスの初期化
 */
function initSyncStatus() {
  if (window.noteSyncManager) {
    window.noteSyncManager.updateSyncStatusUI();
  }
}

/**
 * グラフ切り替えのイベントリスナーを設定
 */
function initChartViewSwitcher() {
  const filterTabs = document.querySelectorAll('.filter-tab[data-chart]');
  
  filterTabs.forEach(tab => {
    tab.addEventListener('click', function() {
      // アクティブ状態を切り替え
      filterTabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      
      // ビューを変更
      currentChartView = this.getAttribute('data-chart');
      
      // グラフを再描画
      loadAnalytics();
    });
  });
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', () => {
  initSyncStatus();
  initChartViewSwitcher();
});
/**
 * アナリティクスデータを読み込み
 */
async function loadAnalytics() {
  try {
    // 総計を取得
    await loadTotalStats();
    
    // グラフを描画
    await renderTrendChart();
    
    // 記事別アクセスを表示
    await loadArticleAnalytics();
    
  } catch (error) {
    console.error('Error loading analytics:', error);
    showToast('データの読み込みに失敗しました');
  }
}

/**
 * 総計を取得して表示
 */
async function loadTotalStats() {
  try {
    // 最新の日付を取得
    const { data: latestData, error: dateError } = await supabase
      .from('article_analytics')
      .select('date')
      .order('date', { ascending: false })
      .limit(1);

    if (dateError) throw dateError;
    
    if (!latestData || latestData.length === 0) {
      console.log('No analytics data found');
      return;
    }

    const latestDate = latestData[0].date;

    // 最新日付のデータを取得
    const { data: analytics, error: analyticsError } = await supabase
      .from('article_analytics')
      .select('pv, likes, comments')
      .eq('date', latestDate);

    if (analyticsError) throw analyticsError;

    // 合計を計算
    const totalPV = analytics.reduce((sum, row) => sum + (row.pv || 0), 0);
    const totalLikes = analytics.reduce((sum, row) => sum + (row.likes || 0), 0);
    const totalComments = analytics.reduce((sum, row) => sum + (row.comments || 0), 0);

    // 表示を更新
    document.getElementById('total-pv').textContent = totalPV.toLocaleString();
    document.getElementById('total-likes').textContent = totalLikes.toLocaleString();
    document.getElementById('total-comments').textContent = totalComments.toLocaleString();

    // フォロワーと売上を取得
    const { data: overallStats, error: overallError } = await supabase
      .from('overall_stats')
      .select('followers, revenue')
      .order('date', { ascending: false })
      .limit(1);

    if (overallError) throw overallError;

    if (overallStats && overallStats.length > 0) {
      document.getElementById('total-followers').textContent = (overallStats[0].followers || 0).toLocaleString();
      document.getElementById('total-revenue').textContent = '¥' + (overallStats[0].revenue || 0).toLocaleString();
    } else {
      document.getElementById('total-followers').textContent = '-';
      document.getElementById('total-revenue').textContent = '-';
    }

  } catch (error) {
    console.error('Error loading total stats:', error);
  }
}

/**
 * トレンドグラフを描画
 */
async function renderTrendChart() {
  try {
    // データを取得
    const { data: analytics, error } = await supabase
      .from('article_analytics')
      .select('date, pv, likes, comments')
      .order('date', { ascending: true });

    if (error) throw error;

    if (!analytics || analytics.length === 0) {
      console.log('No data for chart');
      return;
    }

    // 日付ごとに集計
    const dateMap = {};
    analytics.forEach(row => {
      if (!dateMap[row.date]) {
        dateMap[row.date] = { pv: 0, likes: 0, comments: 0 };
      }
      dateMap[row.date].pv += row.pv || 0;
      dateMap[row.date].likes += row.likes || 0;
      dateMap[row.date].comments += row.comments || 0;
    });

    const dates = Object.keys(dateMap).sort();
    const pvData = dates.map(date => dateMap[date].pv);
    const likesData = dates.map(date => dateMap[date].likes);
    const commentsData = dates.map(date => dateMap[date].comments);

    // グラフを描画
    const ctx = document.getElementById('trend-chart');
    if (!ctx) return;

    // 既存のグラフを破棄
    if (window.trendChart) {
      window.trendChart.destroy();
    }

    window.trendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dates,
        datasets: [
          {
            label: 'PV',
            data: pvData,
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            tension: 0.1
          },
          {
            label: 'スキ',
            data: likesData,
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            tension: 0.1
          },
          {
            label: 'コメント',
            data: commentsData,
            borderColor: 'rgb(54, 162, 235)',
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            tension: 0.1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
          },
          title: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });

  } catch (error) {
    console.error('Error rendering chart:', error);
  }
}

/**
 * 記事別アクセスを表示
 */
async function loadArticleAnalytics() {
  try {
    // 最新の日付を取得
    const { data: latestData, error: dateError } = await supabase
      .from('article_analytics')
      .select('date')
      .order('date', { ascending: false })
      .limit(1);

    if (dateError) throw dateError;
    
    if (!latestData || latestData.length === 0) {
      return;
    }

    const latestDate = latestData[0].date;

    // 記事別データを取得
    const { data: analytics, error } = await supabase
      .from('article_analytics')
      .select(`
        article_id,
        pv,
        likes,
        comments,
        articles (
          title,
          url
        )
      `)
      .eq('date', latestDate)
      .order('pv', { ascending: false });

    if (error) throw error;

    const container = document.getElementById('article-analytics-list');
    if (!container) return;

    if (!analytics || analytics.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: var(--gray-500);">データがありません</p>';
      return;
    }

    // HTMLを生成
    let html = '<div class="article-analytics-table">';
    html += '<table style="width: 100%; border-collapse: collapse;">';
    html += '<thead><tr>';
    html += '<th style="text-align: left; padding: 12px; border-bottom: 2px solid var(--gray-300);">記事</th>';
    html += '<th style="text-align: right; padding: 12px; border-bottom: 2px solid var(--gray-300);">PV</th>';
    html += '<th style="text-align: right; padding: 12px; border-bottom: 2px solid var(--gray-300);">スキ</th>';
    html += '<th style="text-align: right; padding: 12px; border-bottom: 2px solid var(--gray-300);">コメント</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    analytics.forEach(row => {
      const title = row.articles?.title || '無題';
      const url = row.articles?.url || '#';
      html += '<tr>';
      html += `<td style="padding: 12px; border-bottom: 1px solid var(--gray-200);"><a href="${url}" target="_blank" style="color: var(--primary-color); text-decoration: none;">${title}</a></td>`;
      html += `<td style="text-align: right; padding: 12px; border-bottom: 1px solid var(--gray-200);">${(row.pv || 0).toLocaleString()}</td>`;
      html += `<td style="text-align: right; padding: 12px; border-bottom: 1px solid var(--gray-200);">${(row.likes || 0).toLocaleString()}</td>`;
      html += `<td style="text-align: right; padding: 12px; border-bottom: 1px solid var(--gray-200);">${(row.comments || 0).toLocaleString()}</td>`;
      html += '</tr>';
    });

    html += '</tbody></table>';
    html += '</div>';

    container.innerHTML = html;

  } catch (error) {
    console.error('Error loading article analytics:', error);
  }
}
