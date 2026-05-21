import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'wisdom.db');

// Ensure db directory exists
if (!fs.existsSync(__dirname)) {
  fs.mkdirSync(__dirname, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// Helper to run query and return Promise
const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

// Helper to get single row
const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

// Helper to get all rows
const all = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Initialize Database Schema
export async function initDb() {
  console.log('Initializing database schema...');

  // Create main posts table
  await run(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT UNIQUE,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      content_html TEXT,
      content_text TEXT,
      is_favorite INTEGER DEFAULT 0,
      read_status INTEGER DEFAULT 0,
      category TEXT,
      tags TEXT,
      summary TEXT
    )
  `);

  // Run migration to add summary column if table already exists
  try {
    await run('ALTER TABLE posts ADD COLUMN summary TEXT');
    console.log('Database Migration: Successfully added "summary" column.');
  } catch (err) {
    // Column already exists, safe to ignore
  }

  // Try creating Full-Text Search (FTS5) table and triggers
  try {
    await run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
        title, 
        content_text, 
        content='posts', 
        content_rowid='id'
      )
    `);

    // Create triggers to keep FTS virtual table in sync
    await run(`
      CREATE TRIGGER IF NOT EXISTS posts_ai AFTER INSERT ON posts BEGIN
        INSERT INTO posts_fts(rowid, title, content_text) VALUES (new.id, new.title, new.content_text);
      END
    `);

    await run(`
      CREATE TRIGGER IF NOT EXISTS posts_ad AFTER DELETE ON posts BEGIN
        INSERT INTO posts_fts(posts_fts, rowid, title, content_text) 
        VALUES('delete', old.id, old.title, old.content_text);
      END
    `);

    await run(`
      CREATE TRIGGER IF NOT EXISTS posts_au AFTER UPDATE ON posts BEGIN
        INSERT INTO posts_fts(posts_fts, rowid, title, content_text) 
        VALUES('delete', old.id, old.title, old.content_text);
        INSERT INTO posts_fts(rowid, title, content_text) 
        VALUES (new.id, new.title, new.content_text);
      END
    `);

    console.log('FTS5 full-text search index and triggers initialized successfully.');
  } catch (ftsError) {
    console.warn('FTS5 search is not supported or failed to init. Falling back to LIKE queries:', ftsError.message);
  }
}

// Insert a post. Skips if message_id already exists.
export async function insertPost({ message_id, title, date, content_html, content_text, category = '', tags = '[]' }) {
  try {
    const res = await run(
      `INSERT INTO posts (message_id, title, date, content_html, content_text, category, tags) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [message_id, title, date, content_html, content_text, category, tags]
    );
    return { id: res.id, isDuplicate: false };
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return { isDuplicate: true };
    }
    throw err;
  }
}

// Upsert a post from JSON backup
export async function upsertPostFromBackup({ message_id, title, date, content_html, content_text, is_favorite = 0, read_status = 0, category = '', tags = '[]', summary = null }) {
  const sql = `
    INSERT INTO posts (message_id, title, date, content_html, content_text, is_favorite, read_status, category, tags, summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(message_id) DO UPDATE SET
      title = excluded.title,
      date = excluded.date,
      content_html = excluded.content_html,
      content_text = excluded.content_text,
      is_favorite = excluded.is_favorite,
      read_status = excluded.read_status,
      category = excluded.category,
      tags = excluded.tags,
      summary = COALESCE(excluded.summary, posts.summary)
  `;
  const params = [
    message_id,
    title,
    date,
    content_html,
    content_text,
    is_favorite ? 1 : 0,
    read_status ? 1 : 0,
    category,
    JSON.stringify(Array.isArray(tags) ? tags : JSON.parse(tags || '[]')),
    summary
  ];
  return run(sql, params);
}

// Retrieve all posts for backup export
export async function getAllPostsRaw() {
  return all('SELECT * FROM posts ORDER BY date DESC');
}

// Query posts with search, filtering, pagination, and sorting
export async function getPosts({ 
  search = '', 
  favorite = null, 
  readStatus = null, 
  categories = [], 
  limit = 20, 
  offset = 0, 
  sort = 'desc' 
}) {
  let query = 'SELECT id, message_id, title, date, category, tags, is_favorite, read_status, summary, content_text FROM posts';
  const params = [];
  const clauses = [];

  if (favorite !== null) {
    clauses.push('is_favorite = ?');
    params.push(favorite ? 1 : 0);
  }

  if (readStatus !== null) {
    clauses.push('read_status = ?');
    params.push(readStatus ? 1 : 0);
  }

  if (categories && Array.isArray(categories) && categories.length > 0) {
    const placeholders = categories.map(() => '?').join(',');
    clauses.push(`LOWER(category) IN (${placeholders})`);
    params.push(...categories.map(c => c.toLowerCase()));
  }

  const orderDir = sort.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  let rows = [];
  let total = 0;

  if (search.trim() !== '') {
    const cleanSearch = search.trim().replace(/[^\w\s]/g, ' ').trim();
    if (cleanSearch !== '') {
      try {
        // Try executing using FTS5 virtual table
        let ftsQuery = `SELECT id, message_id, title, date, category, tags, is_favorite, read_status, summary, content_text FROM posts 
                        JOIN posts_fts ON posts.id = posts_fts.rowid 
                        WHERE posts_fts MATCH ?`;
        const ftsParams = [cleanSearch];
        
        const filterClauses = [];
        const ftsFilterParams = [];
        
        if (favorite !== null) {
          filterClauses.push('is_favorite = ?');
          ftsFilterParams.push(favorite ? 1 : 0);
        }
        if (readStatus !== null) {
          filterClauses.push('read_status = ?');
          ftsFilterParams.push(readStatus ? 1 : 0);
        }
        if (categories && Array.isArray(categories) && categories.length > 0) {
          const placeholders = categories.map(() => '?').join(',');
          filterClauses.push(`LOWER(category) IN (${placeholders})`);
          ftsFilterParams.push(...categories.map(c => c.toLowerCase()));
        }
        
        if (filterClauses.length > 0) {
          ftsQuery += ' AND ' + filterClauses.join(' AND ');
          ftsParams.push(...ftsFilterParams);
        }
        
        // Count query for pagination
        let countQuery = `SELECT COUNT(*) as total FROM posts 
                          JOIN posts_fts ON posts.id = posts_fts.rowid 
                          WHERE posts_fts MATCH ?`;
        if (filterClauses.length > 0) {
          countQuery += ' AND ' + filterClauses.join(' AND ');
        }
        
        const countRow = await get(countQuery, [cleanSearch, ...ftsFilterParams]);
        total = countRow ? countRow.total : 0;
        
        // Sorting and limit
        ftsQuery += ` ORDER BY date ${orderDir}, id ${orderDir} LIMIT ? OFFSET ?`;
        ftsParams.push(limit, offset);
        
        rows = await all(ftsQuery, ftsParams);
      } catch (err) {
        console.warn('FTS5 search failed, falling back to LIKE query:', err.message);
        // Fallback to LIKE query
        const likeSearch = `%${search.trim()}%`;
        const fallbackClauses = [...clauses, '(title LIKE ? OR content_text LIKE ?)'];
        const fallbackParams = [...params, likeSearch, likeSearch];
        
        let countQuery = 'SELECT COUNT(*) as total FROM posts';
        if (fallbackClauses.length > 0) {
          countQuery += ' WHERE ' + fallbackClauses.join(' AND ');
        }
        const countRow = await get(countQuery, fallbackParams);
        total = countRow ? countRow.total : 0;
        
        let fallbackQuery = query;
        if (fallbackClauses.length > 0) {
          fallbackQuery += ' WHERE ' + fallbackClauses.join(' AND ');
        }
        fallbackQuery += ` ORDER BY date ${orderDir}, id ${orderDir} LIMIT ? OFFSET ?`;
        fallbackParams.push(limit, offset);
        
        rows = await all(fallbackQuery, fallbackParams);
      }
    } else {
      // Empty search term after cleaning, run standard listing
      ({ rows, total } = await runStandardList(query, clauses, params, orderDir, limit, offset));
    }
  } else {
    // No search term
    ({ rows, total } = await runStandardList(query, clauses, params, orderDir, limit, offset));
  }

  // Format tags back to arrays
  const formattedRows = rows.map(row => ({
    ...row,
    tags: JSON.parse(row.tags || '[]'),
    is_favorite: !!row.is_favorite,
    read_status: !!row.read_status
  }));

  return { posts: formattedRows, total };
}

// Helper to run standard listing
async function runStandardList(query, clauses, params, orderDir, limit, offset) {
  let countQuery = 'SELECT COUNT(*) as total FROM posts';
  let listQuery = query;
  
  if (clauses.length > 0) {
    const where = ' WHERE ' + clauses.join(' AND ');
    countQuery += where;
    listQuery += where;
  }
  
  const countRow = await get(countQuery, params);
  const total = countRow ? countRow.total : 0;
  
  listQuery += ` ORDER BY date ${orderDir}, id ${orderDir} LIMIT ? OFFSET ?`;
  const listParams = [...params, limit, offset];
  
  const rows = await all(listQuery, listParams);
  return { rows, total };
}

// Get full details of a specific post
export async function getPostById(id) {
  const row = await get('SELECT * FROM posts WHERE id = ?', [id]);
  if (!row) return null;
  
  // Mark as read when opened
  if (!row.read_status) {
    await run('UPDATE posts SET read_status = 1 WHERE id = ?', [id]);
    row.read_status = 1;
  }

  return {
    ...row,
    tags: JSON.parse(row.tags || '[]'),
    is_favorite: !!row.is_favorite,
    read_status: !!row.read_status
  };
}

// Toggle favorite status
export async function toggleFavorite(id) {
  const row = await get('SELECT is_favorite FROM posts WHERE id = ?', [id]);
  if (!row) throw new Error('Post not found');
  const newValue = row.is_favorite ? 0 : 1;
  await run('UPDATE posts SET is_favorite = ? WHERE id = ?', [newValue, id]);
  return { id, is_favorite: !!newValue };
}

// Toggle read status
export async function toggleRead(id) {
  const row = await get('SELECT read_status FROM posts WHERE id = ?', [id]);
  if (!row) throw new Error('Post not found');
  const newValue = row.read_status ? 0 : 1;
  await run('UPDATE posts SET read_status = ? WHERE id = ?', [newValue, id]);
  return { id, read_status: !!newValue };
}

// Get a random post (Daily Pearl) with optional multiple category filters (array)
export async function getRandomPost(categories) {
  let query = 'SELECT * FROM posts';
  const params = [];
  
  if (categories && Array.isArray(categories) && categories.length > 0) {
    const placeholders = categories.map(() => '?').join(',');
    query += ` WHERE LOWER(category) IN (${placeholders})`;
    categories.forEach(cat => params.push(cat.toLowerCase()));
  }
  
  query += ' ORDER BY RANDOM() LIMIT 1';
  
  const row = await get(query, params);
  if (!row) return null;
  return {
    ...row,
    tags: JSON.parse(row.tags || '[]'),
    is_favorite: !!row.is_favorite,
    read_status: !!row.read_status
  };
}

// Save generated summary for caching
export async function saveSummary(id, summary) {
  return run('UPDATE posts SET summary = ? WHERE id = ?', [summary, id]);
}

// Get stats
export async function getStats() {
  const totalRow = await get('SELECT COUNT(*) as count FROM posts');
  const favRow = await get('SELECT COUNT(*) as count FROM posts WHERE is_favorite = 1');
  const readRow = await get('SELECT COUNT(*) as count FROM posts WHERE read_status = 1');
  const dateRange = await get('SELECT MIN(date) as minDate, MAX(date) as maxDate FROM posts');

  return {
    total: totalRow ? totalRow.count : 0,
    favorites: favRow ? favRow.count : 0,
    read: readRow ? readRow.count : 0,
    minDate: dateRange ? dateRange.minDate : null,
    maxDate: dateRange ? dateRange.maxDate : null
  };
}

// Helper to build FTS5-compatible search string with OR logic for matching relevant documents
function buildFtsQuery(searchQuery) {
  const stopWords = new Set([
    'how', 'do', 'i', 'the', 'a', 'of', 'and', 'to', 'is', 'in', 'that', 'you', 'it', 
    'he', 'was', 'for', 'on', 'are', 'as', 'with', 'his', 'they', 'at', 'be', 'this', 
    'have', 'from', 'about', 'what', 'where', 'why', 'can', 'your', 'my', 'me', 'we',
    'deal', 'dealing', 'ask', 'seth', 'godin'
  ]);
  
  // Clean punctuation, split into lowercase words
  const words = searchQuery
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.has(w));
    
  if (words.length === 0) {
    return searchQuery.trim().replace(/[^\w\s]/g, ' ');
  }
  
  // Join with OR, so we match any of these key concepts, and FTS5 ranking ranks documents
  // with higher count/relevance at the top.
  return words.join(' OR ');
}

// Search for Q&A context: returns full text content of top matches
export async function searchForContext(searchQuery, limit = 5) {
  const cleanSearch = buildFtsQuery(searchQuery);

  if (!cleanSearch || cleanSearch.trim() === '') {
    return [];
  }

  try {
    // Try executing using FTS5 and sorting by rank (relevance)
    const sql = `
      SELECT posts.id, posts.title, posts.date, posts.content_text 
      FROM posts 
      JOIN posts_fts ON posts.id = posts_fts.rowid 
      WHERE posts_fts MATCH ? 
      ORDER BY rank 
      LIMIT ?
    `;
    return await all(sql, [cleanSearch, limit]);
  } catch (e) {
    console.warn('Context search FTS5 failed, falling back to LIKE query:', e.message);
    
    // Fallback to LIKE: search for the individual words in title or content
    const words = searchQuery
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1);

    if (words.length === 0) {
      return [];
    }

    const clauses = [];
    const params = [];
    for (const word of words) {
      clauses.push('(title LIKE ? OR content_text LIKE ?)');
      params.push(`%${word}%`, `%${word}%`);
    }

    const sql = `
      SELECT id, title, date, content_text FROM posts 
      WHERE ${clauses.join(' OR ')} 
      LIMIT ?
    `;
    params.push(limit);
    return await all(sql, params);
  }
}

// Reset Database: empties all records
export async function resetDb() {
  await run('DELETE FROM posts');
  try {
    await run('DELETE FROM posts_fts');
  } catch (e) {
    console.error('Failed to reset FTS table, it might not exist:', e.message);
  }
}
