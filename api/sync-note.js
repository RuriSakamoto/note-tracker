/**
 * Vercel Serverless Function
 * note APIからデータを取得してSupabaseに保存
 */

import { createClient } from '@supabase/supabase-js';

// Supabaseクライアント初期化
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

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
    
    // デバッグ: 生のレスポンスを出力
    if (page === 1) {
      console.log('=== RAW API RESPONSE (Page 1) ===');
      console.log(JSON.stringify(data, null, 2));
      
      if (data?.data?.contents && data.data.contents.length > 0) {
        console.log('=== FIRST ARTICLE DATA ===');
        console.log(JSON.stringify(data.data.contents[0], null, 2));
      }
    }
    
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
 * 記事マスタに登録
 */
async function upsertArticle(articleId, title, url) {
  try {
    await supabase
      .from('articles')
      .upsert({
        id: articleId,
        title: title,
        url: url,
        status: 'published',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      });
  } catch (error) {
    console.error('Article upsert error:', error);
  }
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
    
    // デバッグ: 全てのフィールドを確認
    console.log('=== ARTICLE FIELDS ===');
    console.log('Available fields:', Object.keys(article));
    console.log('readCount:', article.readCount);
    console.log('pv:', article.pv);
    console.log('viewCount:', article.viewCount);
    console.log('likeCount:', article.likeCount);
    console.log('likes:', article.likes);
    console.log('commentCount:', article.commentCount);
    console.log('comments:', article.comments);
    
    const pv = article.readCount || article.pv || article.viewCount || 0;
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

/**
 * メインハンドラー（必ずexport defaultする）
 */
export default async function handler(req, res) {
  // CORSヘッダー設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONSリクエスト対応
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POSTのみ許可
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('=== SYNC START ===');
    
    // リクエストボディからCookie情報を取得
    const { authToken, sessionToken } = req.body;

    if (!authToken || !sessionToken) {
      return res.status(400).json({ 
        error: 'Cookie情報が必要です' 
      });
    }

    // noteから全ページのデータ取得
    const articles = await fetchAllNoteStats(authToken, sessionToken, 10);

    if (articles.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'データが取得できませんでした',
        count: 0
      });
    }

    // Supabaseに保存
    const count = await saveAnalytics(articles);

    console.log('=== SYNC COMPLETE ===');

    return res.status(200).json({
      success: true,
      message: '同期が完了しました',
      count: count
    });

  } catch (error) {
    console.error('=== SYNC ERROR ===');
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
