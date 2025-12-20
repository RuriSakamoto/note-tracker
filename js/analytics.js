/**
 * note アクセス解析ツール - アナリティクス機能
 */

let analyticsChart = null;
let analyticsData = [];
let dailyStats = [];

// アナリティクス初期化
function initAnalytics() {
  loadAnalyticsData();
  updateKPICards();
  updateChart('daily');
  updateArticleStatsTable();
}

// データ読み込み
function loadAnalyticsData() {
  const stored = localStorage.getItem('note_analytics_data');
  analyticsData = stored ? JSON.parse(stored) : [];
  
  const storedStats = localStorage.getItem('note_daily_stats');
  dailyStats = storedStats ? JSON.parse(storedStats) : [];
}

// データ保存
function saveAnalyticsData() {
  localStorage.setItem('note_analytics_data', JSON.stringify(analyticsData));
  localStorage.setItem('note_daily_stats', JSON.stringify(dailyStats));
}

// KPIカード更新
function updateKPICards() {
  // 記事データの集計
  let totalPV = 0;
  let totalLikes = 0;
  let totalComments = 0;
  
  analyticsData.forEach(article => {
    if (article.stats && article.stats.length > 0) {
      const latest = article.stats[article.stats.length - 1];
      totalPV += latest.pv || 0;
      totalLikes += latest.likes || 0;
      totalComments += latest.comments || 0;
    }
  });
  
  // フォロワー・売上の最新値
  let latestFollowers = '-';
  let latestRevenue = '-';
  
  if (dailyStats.length > 0) {
    const sortedStats = [...dailyStats].sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );
    const latest = sortedStats[0];
    if (latest.followers !== undefined && latest.followers !== null) {
      latestFollowers = latest.followers.toLocaleString();
    }
    if (latest.revenue !== undefined && latest.revenue !== null) {
      latestRevenue = '¥' + latest.revenue.toLocaleString();
    }
  }
  
  document.getElementById('total-pv').textContent = totalPV.toLocaleString();
  document.getElementById('total-likes').textContent = totalLikes.toLocaleString();
  document.getElementById('total-comments').textContent = totalComments.toLocaleString();
  document.getElementById('total-followers').textContent = latestFollowers;
  document.getElementById('total-revenue').textContent = latestRevenue;
}

// チャート更新
function updateChart(period = 'daily') {
  const ctx = document.getElementById('analytics-chart');
  if (!ctx) return;
  
  // 既存チャートを破棄
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
        legend: {
          position: 'top'
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

// チャートデータ準備
function prepareChartData(period) {
  const aggregated = {};
  
  analyticsData.forEach(article => {
    if (!article.stats) return;
    
    article.stats.forEach(stat => {
      const date = new Date(stat.date);
      let key;
      
      switch (period) {
        case 'weekly':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split('T')[0];
          break;
        case 'monthly':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
        default: // daily
          key = stat.date;
      }
      
      if (!aggregated[key]) {
        aggregated[key] = { pv: 0, likes: 0 };
      }
      aggregated[key].pv += stat.pv || 0;
      aggregated[key].likes += stat.likes || 0;
    });
  });
  
  const sortedKeys = Object.keys(aggregated).sort();
  
  return {
    labels: sortedKeys,
    pv: sortedKeys.map(k => aggregated[k].pv),
    likes: sortedKeys.map(k => aggregated[k].likes)
  };
}

// 記事別アクセステーブル更新
function updateArticleStatsTable() {
  const tbody = document.getElementById('article-stats-body');
  const emptyState = document.getElementById('article-empty-state');
  
  if (!analyticsData || analyticsData.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  
  emptyState.style.display = 'none';
  
  // 記事ごとの最新データと前日比を計算
  const articleStats = analyticsData.map(article => {
    const stats = article.stats || [];
    if (stats.length === 0) {
      return {
        title: article.title,
        pv: 0,
        likes: 0,
        comments: 0,
        trend: 'flat',
        trendValue: 0
      };
    }
    
    // 日付でソート
    const sortedStats = [...stats].sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );
    
    const latest = sortedStats[sortedStats.length - 1];
    const previous = sortedStats.length > 1 ? sortedStats[sortedStats.length - 2] : null;
    
    // 前日比計算（PVベース）
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
      title: article.title,
      pv: latest.pv || 0,
      likes: latest.likes || 0,
      comments: latest.comments || 0,
      trend,
      trendValue
    };
  });
  
  // PV順でソート
  articleStats.sort((a, b) => b.pv - a.pv);
  
  // テーブル生成
  tbody.innerHTML = articleStats.map(article => {
    const trendIcon = getTrendIcon(article.trend, article.trendValue);
    return `
      <tr>
        <td class="article-name" title="${escapeHtml(article.title)}">${escapeHtml(article.title)}</td>
        <td>${article.pv.toLocaleString()}</td>
        <td>${article.likes.toLocaleString()}</td>
        <td>${article.comments.toLocaleString()}</td>
        <td>${trendIcon}</td>
      </tr>
    `;
  }).join('');
}

// 推移アイコン生成
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

// HTMLエスケープ
function escapeHtml(text) {
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

// 期間集計
function aggregateByPeriod(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  let pv = 0, likes = 0, comments = 0;
  
  analyticsData.forEach(article => {
    if (!article.stats) return;
    
    article.stats.forEach(stat => {
      const date = new Date(stat.date);
      if (date >= start && date <= end) {
        pv += stat.pv || 0;
        likes += stat.likes || 0;
        comments += stat.comments || 0;
      }
    });
  });
  
  return { pv, likes, comments };
}

// 比較アイテム生成
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
  
  // 直近のデータがあればプレースホルダーに表示
  if (dailyStats.length > 0) {
    const sortedStats = [...dailyStats].sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );
    const latest = sortedStats[0];
    if (latest.followers) {
      document.getElementById('stats-followers').placeholder = `前回: ${latest.followers}`;
    }
    if (latest.revenue) {
      document.getElementById('stats-revenue').placeholder = `前回: ¥${latest.revenue}`;
    }
  }
  
  modal.classList.add('active');
}

function closeStatsModal() {
  document.getElementById('stats-modal').classList.remove('active');
}

function saveStats() {
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
  
  // 既存データの更新または新規追加
  const existingIndex = dailyStats.findIndex(s => s.date === date);
  const newStat = {
    date,
    followers: followers ? parseInt(followers, 10) : null,
    revenue: revenue ? parseInt(revenue, 10) : null
  };
  
  if (existingIndex >= 0) {
    // 既存データがあれば、入力された値のみ更新
    if (newStat.followers !== null) {
      dailyStats[existingIndex].followers = newStat.followers;
    }
    if (newStat.revenue !== null) {
      dailyStats[existingIndex].revenue = newStat.revenue;
    }
  } else {
    dailyStats.push(newStat);
  }
  
  saveAnalyticsData();
  updateKPICards();
  closeStatsModal();
  showToast('保存しました');
}
