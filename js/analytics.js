// 分析・グラフ機能

let trendChart = null;
let compareChart = null;
let currentChartView = 'daily';

async function loadAnalytics() {
  try {
    const articleAnalytics = await fetchArticleAnalytics();
    const overallStats = await fetchOverallStats();
    
    // 累積値を計算
    const totals = {
      pv: 0,
      likes: 0,
      comments: 0,
      followers: overallStats[0]?.followers || 0,
      revenue: 0
    };
    
    articleAnalytics.forEach(a => {
      totals.pv += a.pv || 0;
      totals.likes += a.likes || 0;
      totals.comments += a.comments || 0;
    });
    
    overallStats.forEach(s => {
      totals.revenue += s.revenue || 0;
    });
    
    document.getElementById('total-pv').textContent = totals.pv.toLocaleString();
    document.getElementById('total-likes').textContent = totals.likes.toLocaleString();
    document.getElementById('total-comments').textContent = totals.comments.toLocaleString();
    document.getElementById('total-followers').textContent = totals.followers.toLocaleString();
    document.getElementById('total-revenue').textContent = `¥${totals.revenue.toLocaleString()}`;
    
    updateTrendChart(articleAnalytics);
    renderArticleAnalytics(articleAnalytics);
    
  } catch (error) {
    console.error('Error loading analytics:', error);
  }
}

function updateTrendChart(data) {
  const ctx = document.getElementById('trend-chart').getContext('2d');
  
  if (trendChart) {
    trendChart.destroy();
  }
  
  // データを日付ごとにグループ化（増分の合計）
  const grouped = {};
  (data || []).forEach(item => {
    let key;
    const date = new Date(item.date);
    
    if (currentChartView === 'daily') {
      key = item.date;
    } else if (currentChartView === 'weekly') {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      key = weekStart.toISOString().split('T')[0];
    } else {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    
    if (!grouped[key]) {
      grouped[key] = { pv: 0, likes: 0, comments: 0 };
    }
    grouped[key].pv += item.pv || 0;
    grouped[key].likes += item.likes || 0;
    grouped[key].comments += item.comments || 0;
  });
  
  // 日付順にソート
  const labels = Object.keys(grouped).sort();
  
  // 累積値を計算
  let cumulativePv = 0;
  let cumulativeLikes = 0;
  let cumulativeComments = 0;
  
  const pvData = labels.map(l => {
    cumulativePv += grouped[l].pv;
    return cumulativePv;
  });
  
  const likesData = labels.map(l => {
    cumulativeLikes += grouped[l].likes;
    return cumulativeLikes;
  });
  
  const commentsData = labels.map(l => {
    cumulativeComments += grouped[l].comments;
    return cumulativeComments;
  });
  
  // ラベルを見やすく整形
  const formattedLabels = labels.map(l => {
    if (currentChartView === 'daily') {
      const date = new Date(l);
      return `${date.getMonth() + 1}/${date.getDate()}`;
    } else if (currentChartView === 'weekly') {
      const date = new Date(l);
      return `${date.getMonth() + 1}/${date.getDate()}～`;
    } else {
      const [year, month] = l.split('-');
      return `${year}/${month}`;
    }
  });
  
  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: formattedLabels,
      datasets: [
        {
          label: 'PV（累積）',
          data: pvData,
          borderColor: '#2cb696',
          backgroundColor: 'rgba(44, 182, 150, 0.1)',
          tension: 0.3,
          fill: true
        },
        {
          label: 'スキ（累積）',
          data: likesData,
          borderColor: '#e74c3c',
          backgroundColor: 'rgba(231, 76, 60, 0.1)',
          tension: 0.3,
          fill: true
        },
        {
          label: 'コメント（累積）',
          data: commentsData,
          borderColor: '#3498db',
          backgroundColor: 'rgba(52, 152, 219, 0.1)',
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
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              label += context.parsed.y.toLocaleString();
              return label;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return value.toLocaleString();
            }
          }
        }
      }
    }
  });
}

async function comparePeriods() {
  const period1 = document.getElementById('period1').value;
  const period2 = document.getElementById('period2').value;
  
  if (!period1 || !period2) {
    showToast('期間を選択してください');
    return;
  }
  
  try {
    const [year1, month1] = period1.split('-').map(Number);
    const [year2, month2] = period2.split('-').map(Number);
    
    const start1 = `${period1}-01`;
    const end1 = `${period1}-${new Date(year1, month1, 0).getDate()}`;
    const start2 = `${period2}-01`;
    const end2 = `${period2}-${new Date(year2, month2, 0).getDate()}`;
    
    const { data: data1 } = await supabase
      .from('article_analytics')
      .select('*')
      .gte('date', start1)
      .lte('date', end1);
    
    const { data: data2 } = await supabase
      .from('article_analytics')
      .select('*')
      .gte('date', start2)
      .lte('date', end2);
    
    const totals1 = { pv: 0, likes: 0, comments: 0 };
    const totals2 = { pv: 0, likes: 0, comments: 0 };
    
    (data1 || []).forEach(d => {
      totals1.pv += d.pv || 0;
      totals1.likes += d.likes || 0;
      totals1.comments += d.comments || 0;
    });
    
    (data2 || []).forEach(d => {
      totals2.pv += d.pv || 0;
      totals2.likes += d.likes || 0;
      totals2.comments += d.comments || 0;
    });
    
    const ctx = document.getElementById('compare-chart').getContext('2d');
    
    if (compareChart) {
      compareChart.destroy();
    }
    
    compareChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['PV', 'スキ', 'コメント'],
        datasets: [
          {
            label: period1,
            data: [totals1.pv, totals1.likes, totals1.comments],
            backgroundColor: 'rgba(44, 182, 150, 0.7)'
          },
          {
            label: period2,
            data: [totals2.pv, totals2.likes, totals2.comments],
            backgroundColor: 'rgba(52, 152, 219, 0.7)'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top'
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return context.dataset.label + ': ' + context.parsed.y.toLocaleString();
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return value.toLocaleString();
              }
            }
          }
        }
      }
    });
    
  } catch (error) {
    console.error('Error comparing periods:', error);
    showToast('比較に失敗しました');
  }
}

function renderArticleAnalytics(data) {
  const container = document.getElementById('article-analytics-list');
  
  const byArticle = {};
  data.forEach(item => {
    const title = item.articles?.title || '不明';
    if (!byArticle[title]) {
      byArticle[title] = { pv: 0, likes: 0, comments: 0 };
    }
    byArticle[title].pv += item.pv || 0;
    byArticle[title].likes += item.likes || 0;
    byArticle[title].comments += item.comments || 0;
  });
  
  const sorted = Object.entries(byArticle).sort((a, b) => b[1].pv - a[1].pv);
  
  if (sorted.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <p>データがありません</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = sorted.map(([title, stats]) => `
    <div class="article-item" style="cursor: default;">
      <div class="article-title">${escapeHtml(title)}</div>
      <div style="display: flex; gap: 16px; margin-top: 8px;">
        <span style="color: var(--primary);"><strong>${stats.pv.toLocaleString()}</strong> PV</span>
        <span style="color: var(--danger);"><strong>${stats.likes.toLocaleString()}</strong> スキ</span>
        <span style="color: #3498db;"><strong>${stats.comments.toLocaleString()}</strong> コメント</span>
      </div>
    </div>
  `).join('');
}

function openStatsModal() {
  document.getElementById('stats-modal').classList.add('active');
  document.getElementById('stats-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('stats-followers').value = '';
  document.getElementById('stats-revenue').value = '';
}

function closeStatsModal() {
  document.getElementById('stats-modal').classList.remove('active');
}

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
