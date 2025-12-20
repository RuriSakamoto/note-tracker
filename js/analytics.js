/**
 * note アクセス解析ツール - アナリティクス機能
 */

let analyticsChart = null;
let analyticsData = [];
let dailyStats = [];
let overallStats = [];
let articlesMap = {};

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
      // articlesテーブルから記事情報を取得
      const { data: articles, error: articlesError } = await supabaseClient
        .from('articles')
        .select('id, title, url');
      
      if (articlesError) {
        console.error('articles取得エラー:', articlesError);
      } else if (articles) {
        articlesMap = {};
        articles.forEach(article => {
          articlesMap[article.id] = article;
        });
        console.log('articles取得成功:', articles.length, '件');
      }
      
      // article_analyticsテーブルからデータ取得
      const { data: analytics, error: analyticsError } = await supabaseClient
        .from('article_analytics')
        .select('*')
        .order('date', { ascending: false });
      
      if (analyticsError) {
        console.error('article_analytics取得エラー:', analyticsError);
      } else if (analytics) {
        analyticsData = analytics;
        localStorage.setItem('note_analytics_cache', JSON.stringify(analyticsData));
        localStorage.setItem('note_articles_map_cache', JSON.stringify(articlesMap));
        console.log('article_analytics取得成功:', analytics.length, '件');
      }
      
      // overall_statsテーブルからデータ取得
      const { data: overall, error: overallError } = await supabaseClient
        .from('overall_stats')
        .select('*')
        .order('date', { ascending: false });
      
      if (overallError) {
        console.error('overall_stats取得エラー:', overallError);
      } else if (overall) {
        overallStats = overall;
        localStorage.setItem('note_overall_stats_cache', JSON.stringify(overallStats));
        console.log('overall_stats取得成功:', overall.length, '件');
      }
      
      // daily_statsテーブルからデータ取得
      const { data: stats, error: statsError } = await supabaseClient
        .from('daily_stats')
        .select('*')
        .order('date', { ascending: false });
      
      if (statsError) {
        console.error('daily_stats取得エラー:', statsError);
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
    const storedAnalytics = localStorage.getItem('note_analytics_cache');
    if (storedAnalytics) {
      analyticsData = JSON.parse(storedAnalytics);
    }
    const storedArticlesMap = localStorage.getItem('note_articles_map_cache');
    if (storedArticlesMap) {
      articlesMap = JSON.parse(storedArticlesMap);
    }
    const storedOverall = localStorage.getItem('note_overall_stats_cache');
    if (storedOverall) {
      overallStats = JSON.parse(storedOverall);
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
  
  // overall_statsから最新の全体統計を取得（累計値）
  if (overallStats.length > 0) {
    // 日付降順でソートして最新を取得
    const sortedStats = [...overallStats].sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );
    const latestOverall = sortedStats[0];
    totalPV = latestOverall.total_pv || 0;
    totalLikes = latestOverall.total_likes || 0;
    totalComments = latestOverall.total_comments || 0;
  }
  
  // フォロワー・売上の最新値
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

// チャートデータ準備（overall_statsを使用）- 累計値をそのまま表示
function prepareChartData(period) {
  // 日付順にソート（昇順）
  const sortedStats = [...overallStats].sort((a, b) => 
    new Date(a.date) - new Date(b.date)
  );
  
  const aggregated = {};
  
  sortedStats.forEach(stat => {
    const dateStr = stat.date;
    const key = getAggregationKey(dateStr, period);
    
    // 累計値をそのまま使用（同じ期間は最新で上書き）
    aggregated[key] = {
      pv: stat.total_pv || 0,
      likes: stat.total_likes || 0
    };
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
      return dateStr;
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
  
  // 記事ごとにデータを集約
  const statsByArticle = {};
  
  analyticsData.forEach(stat => {
    const articleId = stat.article_id;
    // article_idがnullまたはundefinedの場合はスキップ
    if (!articleId) {
      console.warn('article_idが未設定のデータをスキップ:', stat);
      return;
    }
    if (!statsByArticle[articleId]) {
      statsByArticle[articleId] = [];
    }
    statsByArticle[articleId].push(stat);
  });
  
  // 各記事の最新値と前日比を計算
  const articleStats = Object.keys(statsByArticle).map(articleId => {
    const articleInfo = articlesMap[articleId] || {};
    const history = statsByArticle[articleId].sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );
    
    const latest = history[0];
    const previous = history[1];
    
    // 前日比計算
    let trend = 'flat';
    let trendValue = 0;
    
    if (previous && previous.pv > 0) {
      const diff = (latest.pv || 0) - (previous.pv || 0);
      trendValue = Math.round((diff / previous.pv) * 100);
      
      if (trendValue > 5) {
        trend = 'up';
      } else if (trendValue < -5) {
        trend = 'down';
      }
    }
    
    return {
      title: articleInfo.title || '無題',
      url: articleInfo.url || '#',
      pv: latest.pv || 0,
      likes: latest.likes || 0,
      comments: latest.comments || 0,
      trend,
      trendValue
    };
  });
  
  // ========== 重複排除ロジック ==========
  // タイトルとURLで重複を排除（PVが高い方を優先）
  const uniqueArticles = {};
  articleStats.forEach(article => {
    // URLを優先キーとし、なければタイトルを使用
    const key = article.url !== '#' ? article.url : article.title;
    
    if (!uniqueArticles[key] || uniqueArticles[key].pv < article.pv) {
      uniqueArticles[key] = article;
    }
  });
  const dedupedStats = Object.values(uniqueArticles);
  // ========================================
  
  // PV順でソート
  dedupedStats.sort((a, b) => b.pv - a.pv);
  
  tbody.innerHTML = dedupedStats.map(article => {
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
  
  // 期間内の最新のoverall_statsを取得（累計値）
  let pv = 0, likes = 0, comments = 0;
  
  const statsInRange = overallStats.filter(stat => {
    const date = new Date(stat.date);
    return date >= start && date <= end;
  }).sort((a, b) => new Date(b.date) - new Date(a.date));
  
  if (statsInRange.length > 0) {
    const latest = statsInRange[0];
    pv = latest.total_pv || 0;
    likes = latest.total_likes || 0;
    comments = latest.total_comments || 0;
  }
  
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
