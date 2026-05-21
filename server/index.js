import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

import {
  initDb,
  getPosts,
  getPostById,
  toggleFavorite,
  toggleRead,
  getRandomPost,
  getStats,
  searchForContext,
  resetDb,
  saveSummary,
  insertPost,
  upsertPostFromBackup,
  getAllPostsRaw
} from './db.js';
import { parseMboxFile, categorizeAndTag, cleanEmailBody, cleanSubject } from './parser.js';
import Parser from 'rss-parser';
import { load } from 'cheerio';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Initialize SQLite schema on start
initDb().catch(err => {
  console.error('Database initialization failed:', err);
});

// Endpoint: Statistics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: List posts with filters/search
app.get('/api/posts', async (req, res) => {
  try {
    const search = req.query.search || '';
    const favorite = req.query.favorite === 'true' ? true : req.query.favorite === 'false' ? false : null;
    const readStatus = req.query.readStatus === 'true' ? true : req.query.readStatus === 'false' ? false : null;
    
    let categories = [];
    if (req.query.categories) {
      categories = req.query.categories.split(',').map(c => c.trim()).filter(Boolean);
    }

    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const sort = req.query.sort || 'desc';

    const result = await getPosts({ search, favorite, readStatus, categories, limit, offset, sort });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Random post (Daily Pearl)
app.get('/api/posts/random', async (req, res) => {
  try {
    const { categories, userApiKey } = req.query;
    let catArray = [];
    if (categories) {
      catArray = categories.split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
    }

    const post = await getRandomPost(catArray);
    if (!post) {
      return res.status(404).json({ message: 'No posts found in the vault matching your selected categories. Try selecting more categories or importing files.' });
    }

    // Check if we already have a cached summary in the database
    if (post.summary && post.summary.trim() !== '') {
      return res.json(post);
    }

    // Attempt to generate a clean 3-5 line summary using Gemini
    const apiKey = userApiKey || process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const models = await getAvailableModels(apiKey);
        const modelName = models[0] || 'gemini-2.5-flash';
        const model = genAI.getGenerativeModel({ model: modelName });
        
        const systemInstruction = `You are an editor selecting the definitive "pearl of wisdom" direct quote from one of Seth Godin's blog posts.
Your task is to find and extract a key 1-3 line passage (under 60 words) from the post that represents the most insightful, thought-provoking, or core takeaway.
CRITICAL RULES:
1. You must extract the passage verbatim from the article text. Do NOT rewrite, summarize, or translate the text into your own words.
2. The quote should be self-contained and make sense on its own.
3. Do not add introductory text, quotes, or metadata. Just output the extracted verbatim text itself.`;

        const result = await model.generateContent({
          contents: [{ 
            role: 'user', 
            parts: [{ 
              text: `${systemInstruction}\n\nTitle: "${post.title}"\nContent:\n${post.content_text}` 
            }] 
          }]
        });
        
        const summaryText = result.response.text().trim();
        if (summaryText) {
          // Cache summary in database
          await saveSummary(post.id, summaryText);
          post.summary = summaryText;
        }
      } catch (geminiError) {
        console.error('Failed to generate summary via Gemini:', geminiError.message);
      }
    }

    // Fallback if API key is missing or generation fails
    if (!post.summary) {
      post.summary = generateFallbackSummary(post.content_text);
    }

    res.json(post);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate a clean text summary as fallback if Gemini is not configured
function generateFallbackSummary(text) {
  if (!text) return '';
  const cleanText = text.replace(/\s+/g, ' ').trim();
  const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];
  
  let summary = '';
  for (const sentence of sentences) {
    if ((summary + ' ' + sentence).length > 250) {
      if (summary === '') {
        summary = sentence.substring(0, 247) + '...';
      } else {
        summary += '...';
      }
      break;
    }
    summary = (summary + ' ' + sentence).trim();
  }
  
  if (!summary) {
    summary = cleanText.substring(0, 250) + (cleanText.length > 250 ? '...' : '');
  }
  return summary;
}

// Endpoint: Post Details
app.get('/api/posts/:id', async (req, res) => {
  try {
    const post = await getPostById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    res.json(post);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Toggle Favorite
app.post('/api/posts/:id/favorite', async (req, res) => {
  try {
    const result = await toggleFavorite(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Toggle Read
app.post('/api/posts/:id/read', async (req, res) => {
  try {
    const result = await toggleRead(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Import MBOX file
app.post('/api/import', upload.single('mbox'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded. Please upload a valid .mbox file.' });
  }

  const filePath = req.file.path;

  // Set up SSE headers to stream progress to client
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const sendProgress = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    sendProgress({ status: 'started', message: 'Parsing started...' });
    
    const results = await parseMboxFile(filePath, (progress) => {
      sendProgress({ status: 'progress', ...progress });
    });

    sendProgress({ status: 'completed', results });
  } catch (error) {
    console.error('Import error:', error);
    sendProgress({ status: 'error', message: error.message });
  } finally {
    res.end();
    // Safely delete file after processing
    fs.unlink(filePath, (err) => {
      if (err) console.error('Failed to clean up uploaded file:', err.message);
    });
  }
});

const rssParser = new Parser();

// Endpoint: Import RSS Feed
app.post('/api/import/rss', async (req, res) => {
  const { feedUrl } = req.body;
  if (!feedUrl) {
    return res.status(400).json({ error: 'feedUrl is required.' });
  }

  console.log(`Syncing RSS feed from: ${feedUrl}`);

  try {
    const feed = await rssParser.parseURL(feedUrl);
    let totalProcessed = 0;
    let imported = 0;
    let duplicates = 0;
    let errors = 0;

    for (const item of feed.items) {
      totalProcessed++;
      try {
        const title = cleanSubject(item.title);
        const date = item.isoDate || item.pubDate ? new Date(item.isoDate || item.pubDate).toISOString() : new Date().toISOString();
        const message_id = item.guid || item.id || item.link || `rss_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Extract content
        const rawContent = item['content:encoded'] || item.content || item.description || '';
        const snippet = item.contentSnippet || rawContent.replace(/<[^>]*>/g, '').substring(0, 1000);
        
        const { cleanedHtml, cleanedText } = cleanEmailBody(rawContent, snippet, title);
        const { category, tags } = categorizeAndTag(title, cleanedText);

        const dbResult = await insertPost({
          message_id,
          title,
          date,
          content_html: cleanedHtml || `<p>${cleanedText.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`,
          content_text: cleanedText,
          category,
          tags: JSON.stringify(tags)
        });

        if (dbResult.isDuplicate) {
          duplicates++;
        } else {
          imported++;
        }
      } catch (itemErr) {
        console.error('Error importing feed item:', itemErr.message);
        errors++;
      }
    }

    res.json({
      success: true,
      results: {
        totalProcessed,
        imported,
        duplicates,
        errors
      }
    });
  } catch (error) {
    console.error('RSS import error:', error);
    res.status(500).json({ error: `Failed to fetch or parse RSS feed: ${error.message}` });
  }
});

// Helper function to scrape a single blog post
async function scrapeSethPost(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch article. Status: ${response.status}`);
  }
  const html = await response.text();
  const $ = load(html);

  // Extract Title
  let title = $('h1.entry-title').text().trim() || 
              $('h1.post-title').text().trim() || 
              $('h1').first().text().trim() || 
              $('title').text().trim();
  
  title = cleanSubject(title);

  // Extract Date
  let dateStr = $('meta[property="article:published_time"]').attr('content') || 
                $('meta[name="date"]').attr('content') ||
                $('time').attr('datetime');

  if (!dateStr) {
    // Try to parse from URL (e.g., seths.blog/2026/05/slug)
    const match = url.match(/\/(\d{4})\/(\d{2})\//);
    if (match) {
      dateStr = new Date(`${match[1]}-${match[2]}-01`).toISOString();
    } else {
      dateStr = new Date().toISOString();
    }
  } else {
    dateStr = new Date(dateStr).toISOString();
  }

  // Extract Content
  let contentHtml = $('div.entry-content').html() || 
                    $('div.post-content').html() || 
                    $('article').html() || 
                    $('main').html() || 
                    $('body').html();

  if (contentHtml) {
    const $content = load(contentHtml);
    $content('script, style, iframe, footer, nav, header, .sharedaddy, .wpcnt, .jp-relatedposts').remove();
    contentHtml = $content.html();
  }

  let contentText = $('div.entry-content').text().trim() || 
                    $('div.post-content').text().trim() || 
                    $('article').text().trim() || 
                    $('main').text().trim() || 
                    $.text().trim();

  // Clean and sanitize
  const { cleanedHtml, cleanedText } = cleanEmailBody(contentHtml, contentText, title);
  const { category, tags } = categorizeAndTag(title, cleanedText);

  // Generate unique message_id from URL
  const message_id = `url_${Buffer.from(url).toString('base64').substring(0, 40)}`;

  return {
    message_id,
    title,
    date: dateStr,
    content_html: cleanedHtml || `<p>${cleanedText.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`,
    content_text: cleanedText,
    category,
    tags
  };
}

// Endpoint: Scrape and Import Single Article URL
app.post('/api/import/url', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'url is required.' });
  }

  try {
    const postData = await scrapeSethPost(url);
    const dbResult = await insertPost({
      ...postData,
      tags: JSON.stringify(postData.tags)
    });

    res.json({
      success: true,
      results: {
        title: postData.title,
        category: postData.category,
        date: postData.date,
        imported: dbResult.isDuplicate ? 0 : 1,
        duplicates: dbResult.isDuplicate ? 1 : 0
      }
    });
  } catch (error) {
    console.error('URL scraper error:', error);
    res.status(500).json({ error: `Failed to scrape or save article: ${error.message}` });
  }
});

// Endpoint: Export Vault Database
app.get('/api/export', async (req, res) => {
  try {
    const posts = await getAllPostsRaw();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=seth-vault-export.json');
    res.json(posts);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: `Failed to export vault: ${error.message}` });
  }
});

// Endpoint: Import Vault Database Backup (JSON)
app.post('/api/import/backup', async (req, res) => {
  const posts = req.body;
  if (!Array.isArray(posts)) {
    return res.status(400).json({ error: 'Invalid backup payload. Expected a JSON array of posts.' });
  }

  console.log(`Restoring database backup. Total entries: ${posts.length}`);

  try {
    let imported = 0;
    let duplicates = 0;
    let errors = 0;

    for (const post of posts) {
      try {
        if (!post.message_id || !post.title || !post.date) {
          errors++;
          continue;
        }

        await upsertPostFromBackup({
          message_id: post.message_id,
          title: post.title,
          date: post.date,
          content_html: post.content_html,
          content_text: post.content_text,
          is_favorite: post.is_favorite,
          read_status: post.read_status,
          category: post.category,
          tags: post.tags,
          summary: post.summary
        });
        imported++;
      } catch (err) {
        console.error('Backup row restore failed:', err.message);
        errors++;
      }
    }

    res.json({
      success: true,
      results: {
        totalProcessed: posts.length,
        imported,
        duplicates,
        errors
      }
    });
  } catch (error) {
    console.error('Backup import error:', error);
    res.status(500).json({ error: `Failed to restore database backup: ${error.message}` });
  }
});


// Helper to automatically query Google's Model Service and retrieve available text generation models
async function getAvailableModels(apiKey) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      if (data.models && data.models.length > 0) {
        // Filter for models supporting content generation
        const textModels = data.models.filter(m => 
          m.supportedGenerationMethods && 
          m.supportedGenerationMethods.includes('generateContent')
        );

        // Map to names, clean up 'models/' prefix
        const modelNames = textModels.map(m => m.name.replace('models/', ''));

        // Sort preference: flash models first, then pro models, then others
        modelNames.sort((a, b) => {
          const aLower = a.toLowerCase();
          const bLower = b.toLowerCase();
          
          const aIsFlash = aLower.includes('flash');
          const bIsFlash = bLower.includes('flash');
          const aIsPro = aLower.includes('pro');
          const bIsPro = bLower.includes('pro');

          if (aIsFlash && !bIsFlash) return -1;
          if (!aIsFlash && bIsFlash) return 1;
          if (aIsPro && !bIsPro) return -1;
          if (!aIsPro && bIsPro) return 1;
          
          // Secondary sort: alphabetical descending (so 2.5 comes before 2.0 or 1.5)
          return b.localeCompare(a);
        });

        if (modelNames.length > 0) {
          return modelNames;
        }
      }
    }
  } catch (err) {
    console.warn('Failed to query model list from Gemini, falling back to default list:', err.message);
  }
  
  // Default fallback list of models
  return ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];
}

// Endpoint: Ask a Question (Gemini Semantic Q&A Integration)
app.post('/api/ask', async (req, res) => {
  const { question, userApiKey } = req.body;

  if (!question || question.trim() === '') {
    return res.status(400).json({ error: 'Question is required' });
  }

  try {
    // 1. Fetch relevant posts from SQLite search
    const matchingPosts = await searchForContext(question, 5);

    if (matchingPosts.length === 0) {
      return res.json({
        answer: "I couldn't find any relevant posts in your Vault regarding this topic. Try importing more daily posts, or searching for other terms like 'marketing', 'fear', or 'systems'.",
        sources: []
      });
    }

    // 2. Determine which API key to use (user uploaded or server environment)
    const apiKey = userApiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      // Return a message showing we matched, but need API key for synthesis
      const titles = matchingPosts.map(p => `"${p.title}"`).join(', ');
      return res.json({
        answer: `I found ${matchingPosts.length} relevant posts in your Vault (including ${titles}).\n\n**To synthesize these posts into a single daily wisdom summary in Seth's writing style, please configure your Gemini API Key in the Settings panel!**`,
        sources: matchingPosts.map(p => ({ id: p.id, title: p.title, date: p.date }))
      });
    }

    // 3. Setup Gemini API client & auto-discover model list
    const genAI = new GoogleGenerativeAI(apiKey);
    const candidateModels = await getAvailableModels(apiKey);
    console.log(`Discovered candidate models: ${JSON.stringify(candidateModels)}`);

    // 4. Construct the contextual prompt
    const postsContext = matchingPosts.map((post, idx) => {
      return `---
Post [${idx + 1}]: "${post.title}" (Date: ${post.date.substring(0, 10)})
Content:
${post.content_text}
`;
    }).join('\n\n');

    const prompt = `You are Seth Godin, the marketing author, speaker, and daily blogger.
A reader has asked the following question:
"${question}"

Below are 5 of your actual blog posts that match their query. Respond to their question by synthesizing the wisdom in these posts.

Requirements:
1. Write in Seth's signature style: short, punchy paragraphs, highly direct, conversational, and philosophical.
2. Rely strictly on the information in the provided posts. If the posts don't cover a part of the question, make a brief wise observation rather than inventing standard facts.
3. Keep the response concise (around 200-350 words).
4. Do not include standard greetings (e.g. "Dear Reader", "Hi") or newsletter signoffs. Start directly with your insight.
5. Provide a short poetic summary sentence or question at the very end.

Here are your blog posts:
${postsContext}`;

    // 5. Try candidate models in sequence until one succeeds (fault tolerance for high demand/503 service issues)
    let answer = '';
    let usedModel = '';
    let lastError = null;

    for (const modelName of candidateModels) {
      try {
        console.log(`Attempting synthesis with model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const responseResult = await model.generateContent(prompt);
        answer = responseResult.response.text();
        usedModel = modelName;
        
        if (answer) {
          console.log(`Synthesis succeeded using model: ${modelName}`);
          break;
        }
      } catch (err) {
        console.warn(`Model ${modelName} failed: ${err.message}. Trying next candidate...`);
        lastError = err;
      }
    }

    if (!answer) {
      throw new Error(`All candidate models failed. Last error: ${lastError ? lastError.message : 'Unknown error'}`);
    }

    res.json({
      answer: answer,
      sources: matchingPosts.map(p => ({ id: p.id, title: p.title, date: p.date })),
      modelUsed: usedModel
    });

  } catch (error) {
    console.error('Ask API error:', error);
    res.status(500).json({ error: `Failed to consult Seth's brain: ${error.message}` });
  }
});

// Endpoint: Reset Database
app.post('/api/reset', async (req, res) => {
  try {
    await resetDb();
    res.json({ success: true, message: 'Database reset completed successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
