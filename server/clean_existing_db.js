import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'wisdom.db');

// Parse Subject to remove "Seth's Blog: " prefix
function cleanSubject(subject) {
  if (!subject) return 'Untitled Wisdom';
  let cleaned = subject.replace(/^seth's blog\s*:\s*/i, '');
  cleaned = cleaned.replace(/^seth's blog\s*-\s*/i, '');
  return cleaned.trim();
}

// Helper to remove any title headings matching the post's title from the HTML content
function stripTitleHeading(html, title) {
  if (!html) return '';
  let cleaned = html.trim();
  
  // Find all headings (h1, h2, h3)
  const headingRegex = /<(h1|h2|h3)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = headingRegex.exec(cleaned)) !== null) {
    const fullTag = match[0];
    const tagContent = match[2];
    const headerText = tagContent.replace(/<[^>]*>/g, '').toLowerCase().trim();
    const cleanTitleLower = title ? title.toLowerCase().trim() : '';
    
    // Check if the heading matches the title or contains the title, or is extremely short and similar
    const isTitleHeader = !title || 
                          headerText.includes(cleanTitleLower) || 
                          cleanTitleLower.includes(headerText) ||
                          headerText.replace(/[^a-z0-9]/g, '') === cleanTitleLower.replace(/[^a-z0-9]/g, '');
                          
    const tagIdx = match.index;
    if (isTitleHeader && tagIdx < 30000) {
      cleaned = cleaned.substring(tagIdx + fullTag.length).trim();
      break; // Sliced out everything before and including the title tag!
    }
  }
  
  return cleaned;
}

// Re-use cleanEmailBody logic for the migration
function cleanEmailBody(html, text, title) {
  let cleanedText = text || '';
  let cleanedHtml = html || '';

  const startIdx = cleanedHtml.indexOf('<!--BCStart-->');
  const stopIdx = cleanedHtml.indexOf('<!--BCStop-->');
  
  if (startIdx !== -1 && stopIdx !== -1) {
    let bodyHtml = cleanedHtml.substring(startIdx + 14, stopIdx).trim();
    
    // Remove the title heading inside the modern template boundaries if present
    bodyHtml = stripTitleHeading(bodyHtml, title);
    
    const truncatePatterns = [
      /<img[^>]*feeds\.feedblitz\.com/i,
      /<img[^>]*feedblitz\.com\/~\/i/i,
      /<div[^>]*clear\s*:\s*both\s*;\s*padding-top\s*:\s*0\.2em/i,
      /<div[^>]*title\s*=\s*["']Add to Any["']/i,
      /Email to a friend/i
    ];
    
    let truncateIdx = -1;
    for (const pattern of truncatePatterns) {
      const match = bodyHtml.search(pattern);
      if (match !== -1 && (truncateIdx === -1 || match < truncateIdx)) {
        truncateIdx = match;
      }
    }
    
    if (truncateIdx !== -1) {
      bodyHtml = bodyHtml.substring(0, truncateIdx).trim();
    }
    
    cleanedHtml = bodyHtml;
  } else {
    // Fallback: This is the older FeedBlitz template format!
    // Strip the title heading first, which naturally cleans up everything before it too
    const strippedHtml = stripTitleHeading(cleanedHtml, title);
    let bodyHtml = strippedHtml;
    
    // ONLY strip leading wrappers if we actually found and stripped a title heading!
    // (This prevents stripping legitimate paragraphs on subsequent migrations or imports)
    if (strippedHtml !== cleanedHtml) {
      bodyHtml = bodyHtml.replace(/^[\s\r\n\t]*<p[^>]*>/gi, '').trim();
      bodyHtml = bodyHtml.replace(/^[\s\r\n\t]*<div[^>]*>/gi, '').trim();
      bodyHtml = bodyHtml.replace(/^[\s\r\n\t]*&nbsp;/gi, '').trim();
    }
    
    // Now truncate the footer junk (feedflare, share bar, recent articles recap, subscription info)
    const truncatePatterns = [
      /<div[^>]*class=["']feedflare["']/i,
      /<div[^>]*clear\s*:\s*both\s*;/i,
      /<div[^>]*title\s*=\s*["']Like on Facebook["']/i,
      /Email to a friend/i,
      /<h3[^>]*>More Recent Articles/i,
      /<a[^>]*_recap/i,
      /You're getting this note because/i,
      /You are receiving this email because/i,
      /You&#39;re getting this note/i,
      /You&#39;re receiving this email/i,
      /Don't want to get this email anymore/i,
      /Don&#39;t want to get this/i,
      /<hr\s+class=["']dottedline["']/i
    ];
    
    let truncateIdx = -1;
    for (const pattern of truncatePatterns) {
      const match = bodyHtml.search(pattern);
      if (match !== -1 && (truncateIdx === -1 || match < truncateIdx)) {
        truncateIdx = match;
      }
    }
    
    if (truncateIdx !== -1) {
      bodyHtml = bodyHtml.substring(0, truncateIdx).trim();
    }
    
    // Clean up trailing dangling paragraphs, divs, or linebreaks
    bodyHtml = bodyHtml.replace(/<p\s*\/?>\s*$/i, '').trim();
    bodyHtml = bodyHtml.replace(/<p[^>]*>&nbsp;<\/p>\s*$/gi, '').trim();
    bodyHtml = bodyHtml.replace(/<\/div>\s*$/gi, '').trim();
    
    cleanedHtml = bodyHtml;
  }

  // Clean trailing line breaks, horizontal rules, and open tags
  cleanedHtml = cleanedHtml.replace(/<hr\s*\/?>\s*$/i, '').trim();
  cleanedHtml = cleanedHtml.trim();

  // 2. Clean Plain Text
  if (title) {
    const titleIdx = cleanedText.indexOf(title);
    if (titleIdx !== -1 && titleIdx < 500) {
      cleanedText = cleanedText.substring(titleIdx + title.length).trim();
      cleanedText = cleanedText.replace(/^[\s\r\n=\-_*#•]+/, '').trim();
    }
  }

  const textMarkers = [
    "You're receiving this email because",
    "You are receiving this email because",
    "unsubscribe from this list",
    "update subscription preferences",
    "This email was sent to",
    "Seth Godin's Blog",
    "Share this post",
    "Manage your subscription",
    "sent by seth godin",
    "seth godin |",
    "Share / Save",
    "Email to a friend",
    "powered by feedblitz"
  ];

  for (const marker of textMarkers) {
    const idx = cleanedText.toLowerCase().indexOf(marker.toLowerCase());
    if (idx !== -1) {
      cleanedText = cleanedText.substring(0, idx).trim();
    }
  }

  return { cleanedHtml, cleanedText };
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
    process.exit(1);
  }
  console.log('Connected to SQLite database to perform cleanup migration...');
});

db.serialize(() => {
  db.all('SELECT id, title, content_html, content_text FROM posts', [], (err, rows) => {
    if (err) {
      console.error('Error fetching rows:', err.message);
      db.close();
      return;
    }
    
    console.log(`Fetched ${rows.length} rows to clean. Running migration...`);
    
    db.run('BEGIN TRANSACTION');
    
    const stmt = db.prepare('UPDATE posts SET title = ?, content_html = ?, content_text = ? WHERE id = ?');
    
    let updatedCount = 0;
    
    for (const row of rows) {
      const cleanTitle = cleanSubject(row.title);
      const { cleanedHtml, cleanedText } = cleanEmailBody(row.content_html, row.content_text, cleanTitle);
      stmt.run(cleanTitle, cleanedHtml, cleanedText, row.id, (runErr) => {
        if (runErr) {
          console.error(`Error updating row ID ${row.id}:`, runErr.message);
        }
      });
      updatedCount++;
    }
    
    stmt.finalize();
    
    db.run('COMMIT', (commitErr) => {
      if (commitErr) {
        console.error('Failed to commit transaction:', commitErr.message);
      } else {
        console.log(`Successfully completed migration! Cleaned titles and bodies for ${updatedCount} posts in your Vault.`);
      }
      db.close();
    });
  });
});
