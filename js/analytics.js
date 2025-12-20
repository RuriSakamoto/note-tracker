/**
 * note アクセス解析ツール - アナリティクス機能
 */

let analyticsChart = null;
let analyticsData = [];
let dailyStats = [];

// アナリティクス初期化
async function initAnalytics() {
  await loadAnalyticsData();
  updateKPICards();
  updateChart('daily');
  updateArticleStatsTable();
}

// データ読み込み（Supabase + ローカルキャッシュ）
async function loadAnalyticsData() {
  try {
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      // note_statsテーブルからデータ取得
      const { data: articles, error: articlesError } = await supabaseClient
        .from('note_stats')
        .select('*')
        .order('read_count', { ascending: false });
      
      if (articlesError) {
        console.error('note_stats取得エラー:', articlesError);
      } else if (articles) {
        analyticsData = articles;
        localStorage.setItem('note_analytics_cache', JSON.stringify(analyticsData));
        console.log('note_stats取得成功:', articles.length, '件');
      }
      
      // daily_statsテーブルからデータ取得
      const { data: stats, error: statsError } = await supabaseClient
        .from('daily_stats')
        .select('*')
        .order('date', { ascending: false });
      
      if (statsError) {
        console.warn('daily_stats取得エラー（テーブル未作成の可能性）:', statsError.message);
      } else if (stats) {
        dailyStats = stats;
        localStorage.setItem('note_daily_stats_cache', JSON.stringify(dailyStats));
        console.log('daily_stats取得成功:', stats.length, '件');
      }
    } else {
      throw new Error('Supabase not initialized');
    }
  } catch (error) {
    console.warn('Supabaseからの読み込みエラー、キャッシュを使用:', error.message);
    const storedArticles = localStorage.getItem('note_analytics_cache');
    if (storedArticles) {
      analyticsData = JSON.parse(storedArticles);
    }
    const storedStats = localStorage.getItem('note_daily_stats_cache');
    if (storedStats) {
      dailyStats = JSON.parse(storedStats);
    }
  }
}

// KPIカード更新
function updateKPICards() {
  let totalPV = 0;
  let totalLikes = 0;
  let totalComments = 0;
  
  analyticsData.forEach(article => {
    totalPV += article.read_count || 0;
    totalLikes += article.like_count || 0;
    totalComments += article.comment_count || 0;
  });
  
  let latestFollowers = '-';
  let latestRevenue = '-';
  
  if (dailyStats.length > 0) {
    const sortedStats = [...dailyStats].sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );
    const latest = sortedStats[0];
    if (latest.followers !== undefined && latest.followers !== null) {
      latestFollowers = Number(latest.followers).toLocaleString();
    }
    if (latest.revenue !== undefined && latest.revenue !== null) {
      latestRevenue = '¥' + Number(latest.revenue).toLocaleString();
    }
  }
  
  const pvEl = document.getElementById('total-pv');
  const likesEl = document.getElementById('total-likes');
  const commentsEl = document.getElementById('total-comments');
  const followersEl = document.getElementById('total-followers');
  const revenueEl = document.getElementById('total-revenue');
  
  if (pvEl) pvEl.textContent = totalPV.toLocaleString();
  if (likesEl) likesEl.textContent = totalLikes.toLocaleString();
  if (commentsEl) commentsEl.textContent = totalComments.toLocaleString();
  if (followersEl) followersEl.textContent = latestFollowers;
  if (revenueEl) revenueEl.textContent = latestRevenue;
}

// チャート更新
function updateChart(period = 'daily') {
  const ctx = document.getElementById('analytics-chart');
  if (!ctx) return;
  
  if (analyticsChart) {
    analyticsChart.destroy();
  }
  
  const chartData = prepareChartData(period);
  
  analyticsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: 'PV',
          data: chartData.pv,
          borderColor: '#2cb696',
          backgroundColor: 'rgba(44, 182, 150, 0.1)',
          tension: 0.3,
          fill: true
        },
        {
          label: 'スキ',
          data: chartData.likes,
          borderColor: '#e74c3c',
          backgroundColor: 'rgba(231, 76, 60, 0.1)',
          tension: 0.3,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

// チャートデータ準備
function prepareChartData(period) {
  const aggregated = {};
  
  analyticsData.forEach(article => {
    const recordedAt = article.recorded_at || article.updated_at || article.created_at;
    const dateStr = recordedAt ? recordedAt.split('T')[0] : new Date().toISOString().split('T')[0];
    const key = getAggregationKey(dateStr, period);
    
    if (!aggregated[key]) {
      aggregated[key] = { pv: 0, likes: 0 };
    }
    aggregated[key].pv += article.read_count || 0;
    aggregated[key].likes += article.like_count || 0;
  });
  
  const sortedKeys = Object.keys(aggregated).sort();
  
  if (sortedKeys.length === 0) {
    const today = new Date().toISOString().split('T')[0];
    return { labels: [today], pv: [0], likes: [0] };
  }
  
  return {
    labels: sortedKeys.map(k => formatChartLabel(k, period)),
    pv: sortedKeys.map(k => aggregated[k].pv),
    likes: sortedKeys.map(k => aggregated[k].likes)
  };
}

function getAggregationKey(dateStr, period) {
  const date = new Date(dateStr);
  
  switch (period) {
    case 'weekly':
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      return weekStart.toISOString().split('T')[0];
    case 'monthly':
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    default:
      return dateStr.split('T')[0];
  }
}

function formatChartLabel(key, period) {
  if (period === 'monthly') {
    const [year, month] = key.split('-');
    return `${year}/${month}`;
  }
  const date = new Date(key);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// 記事別アクセステーブル更新
function updateArticleStatsTable() {
  const tbody = document.getElementById('article-stats-body');
  const emptyState = document.getElementById('article-empty-state');
  const table = document.getElementById('article-stats-table');
  
  if (!analyticsData || analyticsData.length === 0) {
    if (tbody) tbody.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    if (table) table.style.display = 'none';
    return;
  }
  
  if (emptyState) emptyState.style.display = 'none';
  if (table) table.style.display = 'table';
  
  const articleStats = analyticsData.map(article => {
    return {
      title: article.title || '無題',
      url: article.note_url || '#',
      pv: article.read_count || 0,
      likes: article.like_count || 0,
      comments: article.comment_count || 0,
      trend: 'flat',
      trendValue: 0
    };
  });
  
  articleStats.sort((a, b) => b.pv - a.pv);
  
  tbody.innerHTML = articleStats.map(article => {
    const trendIcon = getTrendIcon(article.trend, article.trendValue);
    const titleHtml = article.url !== '#' 
      ? `<a href="${escapeHtml(article.url)}" target="_blank" rel="noopener">${escapeHtml(article.title)}</a>`
      : escapeHtml(article.title);
    
    return `
      <tr>
        <td class="article-name" title="${escapeHtml(article.title)}">${titleHtml}</td>
        <td>${article.pv.toLocaleString()}</td>
        <td>${article.likes.toLocaleString()}</td>
        <td>${article.comments.toLocaleString()}</td>
        <td>${trendIcon}</td>
      </tr>
    `;
  }).join('');
}

function getTrendIcon(trend, value) {
  switch (trend) {
    case 'up':
      return `<span class="trend-icon up">↑ +${value}%</span>`;
    case 'down':
      return `<span class="trend-icon down">↓ ${value}%</span>`;
    default:
      return `<span class="trend-icon flat">→ 横ばい</span>`;
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 期間比較
function comparePeriods() {
  const p1Start = document.getElementById('period1-start').value;
  const p1End = document.getElementById('period1-end').value;
  const p2Start = document.getElementById('period2-start').value;
  const p2End = document.getElementById('period2-end').value;
  
  if (!p1Start || !p1End || !p2Start || !p2End) {
    showToast('すべての期間を入力してください');
    return;
  }
  
  const period1 = aggregateByPeriod(p1Start, p1End);
  const period2 = aggregateByPeriod(p2Start, p2End);
  
  const resultDiv = document.getElementById('comparison-result');
  resultDiv.innerHTML = `
    <div class="comparison-result">
      ${createComparisonItem('PV', period1.pv, period2.pv)}
      ${createComparisonItem('スキ', period1.likes, period2.likes)}
      ${createComparisonItem('コメント', period1.comments, period2.comments)}
    </div>
  `;
}

function aggregateByPeriod(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  
  let pv = 0, likes = 0, comments = 0;
  
  analyticsData.forEach(article => {
    const recordedAt = article.recorded_at || article.updated_at || article.created_at;
    if (recordedAt) {
      const date = new Date(recordedAt);
      if (date >= start && date <= end) {
        pv += article.read_count || 0;
        likes += article.like_count || 0;
        comments += article.comment_count || 0;
      }
    }
  });
  
  return { pv, likes, comments };
}

function createComparisonItem(label, value1, value2) {
  const diff = value2 - value1;
  const percent = value1 > 0 ? Math.round((diff / value1) * 100) : 0;
  
  let changeClass = 'neutral';
  let changeText = '±0%';
  
  if (percent > 0) {
    changeClass = 'positive';
    changeText = `+${percent}%`;
  } else if (percent < 0) {
    changeClass = 'negative';
    changeText = `${percent}%`;
  }
  
  return `
    <div class="comparison-item">
      <div class="comparison-label">${label}</div>
      <div class="comparison-values">
        <span class="comparison-value">${value1.toLocaleString()}</span>
        <span>→</span>
        <span class="comparison-value">${value2.toLocaleString()}</span>
        <span class="comparison-change ${changeClass}">${changeText}</span>
      </div>
    </div>
  `;
}

// ========== フォロワー・売上入力モーダル ==========

function openStatsModal() {
  const modal = document.getElementById('stats-modal');
  const today = new Date().toISOString().split('T')[0];
  
  document.getElementById('stats-date').value = today;
  document.getElementById('stats-followers').value = '';
  document.getElementById('stats-revenue').value = '';
  
  if (dailyStats.length > 0) {
    const sortedStats = [...dailyStats].sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );
    const latest = sortedStats[0];
    const followersInput = document.getElementById('stats-followers');
    const revenueInput = document.getElementById('stats-revenue');
    
    if (latest.followers) {
      followersInput.placeholder = `前回: ${Number(latest.followers).toLocaleString()}`;
    }
    if (latest.revenue) {
      revenueInput.placeholder = `前回: ¥${Number(latest.revenue).toLocaleString()}`;
    }
  }
  
  modal.classList.add('active');
}

function closeStatsModal() {
  document.getElementById('stats-modal').classList.remove('active');
}

async function saveStats() {
  const date = document.getElementById('stats-date').value;
  const followers = document.getElementById('stats-followers').value;
  const revenue = document.getElementById('stats-revenue').value;
  
  if (!date) {
    showToast('日付を入力してください');
    return;
  }
  
  if (!followers && !revenue) {
    showToast('フォロワー数または売上を入力してください');
    return;
  }
  
  try {
    const data = {
      date: date,
      followers: followers ? parseInt(followers, 10) : null,
      revenue: revenue ? parseInt(revenue, 10) : null
    };
    
    // Supabaseに保存
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      const { error } = await supabaseClient
        .from('daily_stats')
        .upsert(data, { onConflict: 'date' });
      
      if (error) {
        console.error('Supabase保存エラー:', error);
        throw error;
      }
      console.log('Supabaseに保存成功');
    }
    
    // ローカルキャッシュも更新
    const existingIndex = dailyStats.findIndex(s => s.date === date);
    
    if (existingIndex >= 0) {
      if (data.followers !== null) dailyStats[existingIndex].followers = data.followers;
      if (data.revenue !== null) dailyStats[existingIndex].revenue = data.revenue;
    } else {
      dailyStats.push(data);
    }
    
    localStorage.setItem('note_daily_stats_cache', JSON.stringify(dailyStats));
    
    updateKPICards();
    closeStatsModal();
    showToast('保存しました');
  } catch (error) {
    console.error('保存エラー:', error);
    showToast('保存に失敗しました: ' + error.message);
  }
}
