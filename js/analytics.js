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
    // supabaseClient（config.jsで定義）が利用可能か確認
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      // 記事別アクセスデータ取得
      const { data: articles, error: articlesError } = await supabaseClient
        .from('note_articles')
        .select('*')
        .order('read_count', { ascending: false });
      
      if (!articlesError && articles) {
        analyticsData = articles;
        localStorage.setItem('note_analytics_cache', JSON.stringify(analyticsData));
      }
      
      // 日次統計データ取得（フォロワー・売上）
      const { data: stats, error: statsError } = await supabaseClient
        .from('daily_stats')
        .select('*')
        .order('date', { ascending: false });
      
      if (!statsError && stats) {
        dailyStats = stats;
        localStorage.setItem('note_daily_stats_cache', JSON.stringify(dailyStats));
      }
    } else {
      throw new Error('Supabase not initialized');
    }
  } catch (error) {
    console.warn('Supabaseからの読み込みをスキップ、キャッシュを使用:', error.message);
    // ローカルストレージからフォールバック
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
    totalPV += article.read_count || article.pv || 0;
    totalLikes += article.like_count || article.likes || 0;
    totalComments += article.comment_count || article.comments || 0;
  });
  
  let latestFollowers = '-';
  let latestRevenue = '-';
  
  if (dailyStats.length > 0) {
    const sortedStats = [...dailyStats].sort((a, b) => 
      new Date(b.date || b.recorded_at) - new Date(a.date || a.recorded_at)
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
    const history = article.stats_history || article.history || [];
    
    if (history.length === 0) {
      const today = new Date().toISOString().split('T')[0];
      const key = getAggregationKey(today, period);
      if (!aggregated[key]) {
        aggregated[key] = { pv: 0, likes: 0 };
      }
      aggregated[key].pv += article.read_count || article.pv || 0;
      aggregated[key].likes += article.like_count || article.likes || 0;
      return;
    }
    
    history.forEach(stat => {
      const dateStr = stat.date || stat.recorded_at;
      const key = getAggregationKey(dateStr, period);
      
      if (!aggregated[key]) {
        aggregated[key] = { pv: 0, likes: 0 };
      }
      aggregated[key].pv += stat.pv || stat.read_count || 0;
      aggregated[key].likes += stat.likes || stat.like_count || 0;
    });
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
    const history = article.stats_history || article.history || [];
    
    const currentPV = article.read_count || article.pv || 0;
    const currentLikes = article.like_count || article.likes || 0;
    const currentComments = article.comment_count || article.comments || 0;
    
    let trend = 'flat';
    let trendValue = 0;
    
    if (history.length >= 2) {
      const sortedHistory = [...history].sort((a, b) => 
        new Date(a.date || a.recorded_at) - new Date(b.date || b.recorded_at)
      );
      
      const latest = sortedHistory[sortedHistory.length - 1];
      const previous = sortedHistory[sortedHistory.length - 2];
      
      const latestPV = latest.pv || latest.read_count || 0;
      const previousPV = previous.pv || previous.read_count || 0;
      
      if (previousPV > 0) {
        const diff = latestPV - previousPV;
        trendValue = Math.round((diff / previousPV) * 100);
        
        if (trendValue > 5) {
          trend = 'up';
        } else if (trendValue < -5) {
          trend = 'down';
        }
      }
    }
    
    return {
      title: article.title || article.name || '無題',
      url: article.url || article.note_url || '#',
      pv: currentPV,
      likes: currentLikes,
      comments: currentComments,
      trend,
      trendValue
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
    const history = article.stats_history || article.history || [];
    
    history.forEach(stat => {
      const date = new Date(stat.date || stat.recorded_at);
      if (date >= start && date <= end) {
        pv += stat.pv || stat.read_count || 0;
        likes += stat.likes || stat.like_count || 0;
        comments += stat.comments || stat.comment_count || 0;
      }
    });
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
      new Date(b.date || b.recorded_at) - new Date(a.date || a.recorded_at)
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
    
    // supabaseClientを使用（config.jsで定義）
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      const { error } = await supabaseClient
        .from('daily_stats')
        .upsert(data, { onConflict: 'date' });
      
      if (error) throw error;
    }
    
    const existingIndex = dailyStats.findIndex(s => 
      (s.date || s.recorded_at || '').split('T')[0] === date
    );
    
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
