/**
 * note APIから全ページのデータを取得
 */
async function fetchAllNoteStats(authToken, sessionToken, maxPages = 10) {
  const allContents = [];
  
  for (let page = 1; page <= maxPages; page++) {
    const url = `https://note.com/api/v1/stats/pv?filter=all&page=${page}&sort=pv`;
    
    console.log(`Fetching page ${page}...`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Cookie': `note_gql_auth_token=${authToken}; _note_session_v5=${sessionToken}`
      }
    });

    if (!response.ok) {
      console.error(`API Error on page ${page}: ${response.status}`);
      throw new Error(`note API Error: ${response.status}`);
    }

    const data = await response.json();
    
    // ===== デバッグ: 生のレスポンスを出力 =====
    if (page === 1) {
      console.log('=== RAW API RESPONSE (Page 1) ===');
      console.log(JSON.stringify(data, null, 2));
      
      if (data?.data?.contents && data.data.contents.length > 0) {
        console.log('=== FIRST ARTICLE DATA ===');
        console.log(JSON.stringify(data.data.contents[0], null, 2));
      }
    }
    // ==========================================
    
    const contents = data?.data?.contents || [];
    
    console.log(`Page ${page}: ${contents.length} articles found`);
    
    if (contents.length === 0) {
      console.log(`No more data at page ${page}, stopping`);
      break;
    }
    
    allContents.push(...contents);
    
    // レート制限対策: 1秒待機
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`Total articles fetched: ${allContents.length}`);
  return allContents;
}

/**
 * 分析データを保存
 */
async function saveAnalytics(articles) {
  const today = new Date().toISOString().split('T')[0];
  const records = [];

  console.log(`Processing ${articles.length} articles...`);

  for (const article of articles) {
    const articleId = article.id || article.key;
    const title = article.name || article.title || '無題';
    const url = article.noteUrl || `https://note.com/${article.userUrlname}/n/${article.key}`;
    
    // ===== デバッグ: 全てのフィールドを確認 =====
    console.log('=== ARTICLE FIELDS ===');
    console.log('Available fields:', Object.keys(article));
    console.log('readCount:', article.readCount);
    console.log('pv:', article.pv);
    console.log('viewCount:', article.viewCount);
    console.log('view_count:', article.view_count);
    console.log('page_view:', article.page_view);
    console.log('likeCount:', article.likeCount);
    console.log('likes:', article.likes);
    console.log('commentCount:', article.commentCount);
    console.log('comments:', article.comments);
    // ==========================================
    
    const pv = article.readCount || article.pv || article.viewCount || article.view_count || article.page_view || 0;
    const likes = article.likeCount || article.likes || 0;
    const comments = article.commentCount || article.comments || 0;

    console.log(`Article: ${title}, PV: ${pv}, Likes: ${likes}, Comments: ${comments}`);

    // 記事マスタに登録
    await upsertArticle(articleId, title, url);

    // 分析データを追加
    records.push({
      article_id: articleId,
      date: today,
      pv: pv,
      likes: likes,
      comments: comments
    });
  }

  // 既存データを削除
  console.log(`Deleting existing data for ${today}...`);
  await supabase
    .from('article_analytics')
    .delete()
    .eq('date', today);

  // 新しいデータを挿入
  console.log(`Inserting ${records.length} records...`);
  const { error } = await supabase
    .from('article_analytics')
    .insert(records);

  if (error) {
    console.error('Insert error:', error);
    throw error;
  }

  console.log(`Successfully saved ${records.length} records`);
  return records.length;
}
