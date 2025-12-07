// CSVインポート機能

let csvData = null;
let csvDraftArticles = [];

function openCsvModal() {
  document.getElementById('csv-modal').classList.add('active');
  csvData = null;
  csvDraftArticles = [];
  document.getElementById('csv-preview').style.display = 'none';
  document.getElementById('update-status-group').style.display = 'none';
  document.getElementById('import-csv-btn').disabled = true;
  document.getElementById('csv-file').value = '';
  
  // 日付入力のデフォルト値を今日に設定
  document.getElementById('csv-date').value = new Date().toISOString().split('T')[0];
}

function closeCsvModal() {
  document.getElementById('csv-modal').classList.remove('active');
}

function handleCsvFile(event) {
  const file = event.target.files[0];
  if (file) {
    processCsvFile(file);
  }
}

async function processCsvFile(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    const text = e.target.result;
    const lines = text.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      showToast('CSVファイルが空です');
      return;
    }
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });
      data.push(row);
    }
    
    csvData = data;
    
    const preview = document.getElementById('csv-preview');
    const content = document.getElementById('csv-preview-content');
    preview.style.display = 'block';
    content.innerHTML = `
      <p><strong>${data.length}件のデータ</strong></p>
      <p>カラム: ${headers.join(', ')}</p>
      <hr style="margin: 8px 0;">
      ${data.slice(0, 3).map(row => `<p>${JSON.stringify(row)}</p>`).join('')}
      ${data.length > 3 ? '<p>...</p>' : ''}
    `;
    
    const csvTitles = [...new Set(data.map(row => 
      (row['記事名'] || row['タイトル'] || row['title'] || '').trim()
    ).filter(t => t))];
    
    const { data: draftArticles } = await supabase
      .from('articles')
      .select('id, title')
      .eq('status', 'draft')
      .in('title', csvTitles);
    
    csvDraftArticles = draftArticles || [];
    
    const updateStatusGroup = document.getElementById('update-status-group');
    if (csvDraftArticles.length > 0) {
      updateStatusGroup.style.display = 'flex';
      updateStatusGroup.querySelector('label').textContent = 
        `下書き記事（${csvDraftArticles.length}件）を「投稿済み」に更新する`;
    } else {
      updateStatusGroup.style.display = 'none';
    }
    
    document.getElementById('import-csv-btn').disabled = false;
  };
  reader.readAsText(file);
}

async function importCsv() {
  if (!csvData || csvData.length === 0 || isProcessing) return;
  
  isProcessing = true;
  const importBtn = document.getElementById('import-csv-btn');
  importBtn.disabled = true;
  importBtn.textContent = 'インポート中...';
  
  try {
    const updateDraftStatus = document.getElementById('update-draft-status').checked;
    const importDate = document.getElementById('csv-date').value;
    
    if (!importDate) {
      showToast('日付を選択してください');
      return;
    }
    
    // CSVデータを解析（累積値として取得）
    const analyticsData = csvData.map(row => {
      return {
        article_title: (row['記事名'] || row['タイトル'] || row['title'] || '').trim(),
        pv: parseInt(row['PV'] || row['ビュー'] || row['pv'] || 0) || 0,
        likes: parseInt(row['スキ'] || row['いいね'] || row['likes'] || 0) || 0,
        comments: parseInt(row['コメント'] || row['comments'] || 0) || 0
      };
    });
    
    // 記事タイトルごとにグループ化
    const uniqueTitles = [...new Set(analyticsData.map(d => d.article_title).filter(t => t))];
    const articleIdMap = {};
    
    // 既存の記事を一括取得
    const { data: existingArticles } = await supabase
      .from('articles')
      .select('id, title, status')
      .in('title', uniqueTitles);
    
    (existingArticles || []).forEach(a => {
      articleIdMap[a.title] = a.id;
    });
    
    // 下書き記事を投稿済みに更新
    if (updateDraftStatus && csvDraftArticles.length > 0) {
      const draftIds = csvDraftArticles.map(a => a.id);
      await supabase
        .from('articles')
        .update({ 
          status: 'published',
          published_at: new Date().toISOString()
        })
        .in('id', draftIds);
    }
    
    // 存在しない記事を作成
    const newTitles = uniqueTitles.filter(t => !articleIdMap[t]);
    if (newTitles.length > 0) {
      const { data: newArticles } = await supabase
        .from('articles')
        .insert(newTitles.map(title => ({ title, status: 'published' })))
        .select();
      
      (newArticles || []).forEach(a => {
        articleIdMap[a.title] = a.id;
      });
      
      // 新規記事のデフォルトタスクを作成
      const tasksToInsert = [];
      (newArticles || []).forEach(article => {
        TASKS.forEach(task => {
          tasksToInsert.push({
            article_id: article.id,
            task_type: task.type,
            task_status: 'completed',
            task_order: task.order
          });
        });
      });
      if (tasksToInsert.length > 0) {
        await supabase.from('tasks').insert(tasksToInsert);
      }
    }
    
    // 記事ごとにデータを整理
    const dataByArticle = {};
    analyticsData.forEach(d => {
      if (!d.article_title || !articleIdMap[d.article_title]) return;
      const articleId = articleIdMap[d.article_title];
      dataByArticle[articleId] = {
        articleId,
        pv: d.pv,
        likes: d.likes,
        comments: d.comments
      };
    });
    
    // 各記事について、指定日付の前日までの累積値を取得
    const articleIds = Object.keys(dataByArticle);
    
    // 指定日付の前日を計算
    const targetDate = new Date(importDate);
    const previousDate = new Date(targetDate);
    previousDate.setDate(previousDate.getDate() - 1);
    const previousDateStr = previousDate.toISOString().split('T')[0];
    
    // 各記事の指定日付以前の最新データを取得
    const previousCumulativeByArticle = {};
    
    for (const articleId of articleIds) {
      const { data: previousData } = await supabase
        .from('article_analytics')
        .select('*')
        .eq('article_id', articleId)
        .lte('date', previousDateStr)
        .order('date', { ascending: false })
        .limit(1);
      
      if (previousData && previousData.length > 0) {
        // 既存データから累積値を再計算
        const { data: allPreviousData } = await supabase
          .from('article_analytics')
          .select('pv, likes, comments')
          .eq('article_id', articleId)
          .lte('date', previousDateStr);
        
        const cumulative = {
          pv: 0,
          likes: 0,
          comments: 0
        };
        
        (allPreviousData || []).forEach(item => {
          cumulative.pv += item.pv || 0;
          cumulative.likes += item.likes || 0;
          cumulative.comments += item.comments || 0;
        });
        
        previousCumulativeByArticle[articleId] = cumulative;
      } else {
        // 前日データがない場合は0
        previousCumulativeByArticle[articleId] = {
          pv: 0,
          likes: 0,
          comments: 0
        };
      }
    }
    
    // 増分を計算してupsert用データを作成
    const analyticsToUpsert = [];
    
    Object.keys(dataByArticle).forEach(articleId => {
      const current = dataByArticle[articleId];
      const previous = previousCumulativeByArticle[articleId];
      
      // CSVの累積値から前日までの累積値を引いて増分を計算
      const deltaPv = Math.max(0, current.pv - previous.pv);
      const deltaLikes = Math.max(0, current.likes - previous.likes);
      const deltaComments = Math.max(0, current.comments - previous.comments);
      
      analyticsToUpsert.push({
        article_id: articleId,
        date: importDate,
        pv: deltaPv,
        likes: deltaLikes,
        comments: deltaComments
      });
    });
    
    if (analyticsToUpsert.length > 0) {
      await upsertArticleAnalytics(analyticsToUpsert);
    }
    
    let message = `${analyticsToUpsert.length}件のデータを${importDate}にインポートしました`;
    if (updateDraftStatus && csvDraftArticles.length > 0) {
      message += `（${csvDraftArticles.length}件を投稿済みに更新）`;
    }
    
    showToast(message);
    closeCsvModal();
    loadArticles();
    loadAnalytics();
  } catch (error) {
    console.error('Error importing CSV:', error);
    showToast('インポートに失敗しました');
  } finally {
    isProcessing = false;
    importBtn.disabled = false;
    importBtn.textContent = 'インポート';
  }
}
