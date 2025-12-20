import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  // CORS対応
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('=== SYNC START ===');
  
  let body = req.body;
  if (typeof req.body === 'string') {
    try {
      body = JSON.parse(req.body);
    } catch (e) {
      console.error('Body parse error:', e);
    }
  }

  const cookies = body?.cookies;

  if (!cookies || !cookies.note_gql_auth_token || !cookies._note_session_v5) {
    console.log('Missing cookies - returning 400');
    return res.status(400).json({ error: 'Cookie情報が必要です' });
  }

  try {
    const headers = {
      'Cookie': `note_gql_auth_token=${cookies.note_gql_auth_token}; _note_session_v5=${cookies._note_session_v5}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Referer': 'https://note.com/dashboard/stats'
    };

    // 全ページの記事を取得
    let allArticles = [];
    let page = 1;
    let hasMore = true;
    let totalPv = 0;
    let totalLike = 0;
    let totalComment = 0;

    while (hasMore) {
      const noteResponse = await fetch(`https://note.com/api/v1/stats/pv?filter=all&page=${page}&sort=pv`, {
        headers
      });

      console.log(`note API page ${page} status:`, noteResponse.status);

      if (!noteResponse.ok) {
        const errorText = await noteResponse.text();
        console.error('note API error:', errorText);
        return res.status(noteResponse.status).json({ 
          error: 'note APIエラー',
          details: errorText 
        });
      }

      const noteData = await noteResponse.json();
      const articles = noteData?.data?.note_stats || [];
      
      // 1ページ目で全体統計を取得
      if (page === 1) {
        totalPv = noteData?.data?.total_pv || 0;
        totalLike = noteData?.data?.total_like || 0;
        totalComment = noteData?.data?.total_comment || 0;
        console.log('Total stats:', { totalPv, totalLike, totalComment });
      }

      allArticles = allArticles.concat(articles);
      hasMore = noteData?.data?.last_page === false;
      page++;

      // 安全のため最大10ページまで
      if (page > 10) {
        console.log('Max pages reached');
        break;
      }
    }

    console.log('Total articles fetched:', allArticles.length);

    const today = new Date().toISOString().split('T')[0];

    // 全体統計をoverall_statsテーブルに保存
    const { error: overallError } = await supabase
      .from('overall_stats')
      .upsert({
        date: today,
        total_pv: totalPv,
        total_likes: totalLike,
        total_comments: totalComment
      }, { onConflict: 'date' });

    if (overallError) {
      console.error('Overall stats upsert error:', overallError);
    } else {
      console.log('Overall stats saved:', { totalPv, totalLike, totalComment });
    }

    // 各記事のデータを保存
    for (const article of allArticles) {
      const articleId = article.key || article.id;
      const articleTitle = article.name || article.title;
      const userUrlname = article.user?.urlname || '';
      const articleUrl = userUrlname 
        ? `https://note.com/${userUrlname}/n/${articleId}`
        : '';

      if (!articleId) {
        continue;
      }

      // articlesテーブルにupsert
      const { error: articleError } = await supabase
        .from('articles')
        .upsert({
          id: articleId,
          title: articleTitle,
          url: articleUrl,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

      if (articleError) {
        console.error('Article upsert error:', articleError);
      }

      // article_analyticsテーブルにupsert
      const { error: analyticsError } = await supabase
        .from('article_analytics')
        .upsert({
          article_id: articleId,
          date: today,
          pv: article.read_count || 0,
          likes: article.like_count || 0,
          comments: article.comment_count || 0
        }, { onConflict: 'article_id,date' });

      if (analyticsError) {
        console.error('Analytics upsert error:', analyticsError);
      }
    }

    console.log('=== SYNC COMPLETE ===');
    
    return res.status(200).json({ 
      success: true, 
      message: `${allArticles.length}件の記事を同期しました`,
      count: allArticles.length,
      stats: {
        total_pv: totalPv,
        total_likes: totalLike,
        total_comments: totalComment
      }
    });

  } catch (error) {
    console.error('Sync error:', error);
    return res.status(500).json({ 
      error: 'サーバーエラー',
      details: error.message 
    });
  }
}
