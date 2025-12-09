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
async function fetchAllNoteStats(authToken, sessionToken, maxPages = 20) {
  const allContents = [];
  let totalPV = 0;
  let totalLikes = 0;
  let totalComments = 0;
  
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
    
    // 正しいフィールド名: note_stats
    const contents = data?.data?.note_stats || [];
    
    console.log(`Page ${page}: ${contents.length} articles found`);
    
    // 1ページ目の詳細を出力
    if (page === 1) {
      console.log('=== API TOTALS (from response) ===');
      console.log(`Total PV: ${data.data.total_pv}`);
      console.log(`Total Likes: ${data.data.total_like}`);
      console.log(`Total Comments: ${data.data.total_comment}`);
      console.log(`Last Page: ${data.data.last_page}`);
    }
    
    if (contents.length === 0) {
      console.log(`No more data at page ${page}, stopping`);
      break;
    }
    
    allContents.push(...contents);
    
    // ページごとの合計を計算
    const pagePV = contents.reduce((sum, article) => sum + (article.read_count || 0), 0);
    const pageLikes = contents.reduce((sum, article) => sum + (article.like_count || 0), 0);
    const pageComments = contents.reduce((sum, article) => sum + (article.comment_count || 0), 0);
    
    totalPV += pagePV;
    totalLikes += pageLikes;
    totalComments += pageComments;
    
    console.log(`Page ${page} totals - PV: ${pagePV}, Likes: ${pageLikes}, Comments: ${pageComments}`);
    console.log(`Running totals - PV: ${totalPV}, Likes: ${totalLikes}, Comments: ${totalComments}`);
    
    // last_pageフラグをチェック
    if (data?.data?.last_page === true) {
      console.log(`Last page reached at page ${page}`);
      break;
    }
    
    // レート制限対策: 1秒待機
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`=== FETCH COMPLETE ===`);
  console.log(`Total articles fetched: ${allContents.length}`);
  console.log(`Final totals - PV: ${totalPV}, Likes: ${totalLikes}, Comments: ${totalComments}`);
  
  return allContents;
}

/**
 * 記事マスタに登録
 */
async function upsertArticle(articleId, title, url) {
  try {
    const { error } = await supabase
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
    
    if (error) throw error;
  } catch (error) {
    console.error(`Article upsert error for ${articleId}:`, error);
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
    // 正しいフィールド名を使用
    const articleId = String(article.id || article.key);
    const title = article.name || article.title || '無題';
    const urlname = article.user?.urlname || 'unknown';
    const url = `https://note.com/${urlname}/n/${article.key}`;
    
    // 正しいフィールド名: read_count, like_count, comment_count
    const pv = article.read_count || 0;
    const likes = article.like_count || 0;
    const comments = article.comment_count || 0;

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
  const { error: deleteError } = await supabase
    .from('article_analytics')
    .delete()
    .eq('date', today);

  if (deleteError) {
    console.error('Delete error:', deleteError);
  }

  // 新しいデータを挿入
  console.log(`Inserting ${records.length} records...`);
  const { error: insertError } = await supabase
    .from('article_analytics')
    .insert(records);

  if (insertError) {
    console.error('Insert error:', insertError);
    throw insertError;
  }

  // 合計を計算して出力
  const totalPV = records.reduce((sum, r) => sum + r.pv, 0);
  const totalLikes = records.reduce((sum, r) => sum + r.likes, 0);
  const totalComments = records.reduce((sum, r) => sum + r.comments, 0);
  
  console.log('=== SAVED TOTALS ===');
  console.log(`Total PV: ${totalPV}`);
  console.log(`Total Likes: ${totalLikes}`);
  console.log(`Total Comments: ${totalComments}`);
  console.log(`Records saved: ${records.length}`);

  return records.length;
}

/**
 * メインハンドラー
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
    console.log(`Timestamp: ${new Date().toISOString()}`);
    
    // リクエストボディからCookie情報を取得
    const { authToken, sessionToken } = req.body;

    if (!authToken || !sessionToken) {
      console.error('Missing authentication tokens');
      return res.status(400).json({ 
        error: 'Cookie情報が必要です' 
      });
    }

    console.log('Authentication tokens received');

    // noteから全ページのデータ取得
    const articles = await fetchAllNoteStats(authToken, sessionToken, 20);

    if (articles.length === 0) {
      console.log('No articles found');
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
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
