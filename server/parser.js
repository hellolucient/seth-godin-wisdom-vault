import fs from 'fs';
import readline from 'readline';
import { simpleParser } from 'mailparser';
import { insertPost } from './db.js';

// Auto-categorize posts based on body text content keywords
export function categorizeAndTag(title, text) {
  const content = (title + ' ' + text).toLowerCase();
  const tags = [];
  let category = 'General';

  const rules = [
    {
      category: 'Marketing',
      keywords: ['marketing', 'brand', 'advertising', 'customer', 'positioning', 'sales', 'audience', 'storytelling', 'permission marketing'],
      tag: 'Marketing'
    },
    {
      category: 'Leadership',
      keywords: ['leader', 'team', 'management', 'culture', 'authority', 'responsibility', 'trust', 'hire', 'firing'],
      tag: 'Leadership'
    },
    {
      category: 'Creativity',
      keywords: ['creativity', 'create', 'write', 'art', 'artist', 'novelty', 'design', 'writer', 'ideas'],
      tag: 'Creativity'
    },
    {
      category: 'Strategy',
      keywords: ['strategy', 'tactics', 'systems', 'business model', 'pricing', 'value', 'distribution', 'competition'],
      tag: 'Strategy'
    },
    {
      category: 'Personal Growth',
      keywords: ['fear', 'resistance', 'lizard brain', 'practice', 'learning', 'habit', 'shipping', 'discipline', 'impostor'],
      tag: 'Personal Growth'
    }
  ];

  for (const rule of rules) {
    if (rule.keywords.some(kw => content.includes(kw))) {
      tags.push(rule.tag);
      // The first matching category becomes the main category
      if (category === 'General') {
        category = rule.category;
      }
    }
  }

  // Fallback tag if empty
  if (tags.length === 0) {
    tags.push('Wisdom');
  }

  return { category, tags };
}

// Helper to decode basic HTML entities in order to match titles containing smart quotes or accents
function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
    .replace(/&#x([a-f0-9]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ');
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
    
    // Decode HTML entities in the header tag content before matching
    const decodedContent = decodeHtmlEntities(tagContent);
    const headerText = decodedContent.replace(/<[^>]*>/g, '').toLowerCase().trim();
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

// Clean up standard newsletter footers, unsubscribe links, and sharing noise
export function cleanEmailBody(html, text, title) {
  let cleanedText = text || '';
  let cleanedHtml = html || '';

  // 1. Try FeedBlitz HTML / Feedburner targeted extraction if markers are present
  const startIdx = cleanedHtml.indexOf('<!--BCStart-->');
  const stopIdx = cleanedHtml.indexOf('<!--BCStop-->');
  
  if (startIdx !== -1 && stopIdx !== -1) {
    let bodyHtml = cleanedHtml.substring(startIdx + 14, stopIdx).trim();
    
    // Remove the title heading inside the modern template boundaries if present
    bodyHtml = stripTitleHeading(bodyHtml, title);
    
    // Find the start of the footer/share sections and truncate there
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
      // Strip any leading separator lines like dashes or equals signs
      cleanedText = cleanedText.replace(/^[\s\r\n=\-_*#•]+/, '').trim();
    }
  }

  // Strip generic footer markers from the bottom of plain text
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

// Parse Subject to remove "Seth's Blog: " prefix
export function cleanSubject(subject) {
  if (!subject) return 'Untitled Wisdom';
  let cleaned = subject.replace(/^seth's blog\s*:\s*/i, '');
  cleaned = cleaned.replace(/^seth's blog\s*-\s*/i, '');
  return cleaned.trim();
}

// Main parser function
export async function parseMboxFile(filePath, onProgress) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let currentMessageLines = [];
  let totalProcessed = 0;
  let importedCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  console.log(`Starting parsing for file: ${filePath}`);

  const processEmail = async (rawEmail) => {
    totalProcessed++;
    try {
      const parsed = await simpleParser(rawEmail);
      
      const title = cleanSubject(parsed.subject);
      const date = parsed.date ? parsed.date.toISOString() : new Date().toISOString();
      const message_id = parsed.messageId || `hash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const { cleanedHtml, cleanedText } = cleanEmailBody(parsed.html, parsed.text, title);
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
        duplicateCount++;
      } else {
        importedCount++;
      }

      if (onProgress && totalProcessed % 10 === 0) {
        onProgress({
          totalProcessed,
          imported: importedCount,
          duplicates: duplicateCount,
          errors: errorCount
        });
      }
    } catch (parseError) {
      console.error(`Error parsing message #${totalProcessed}:`, parseError.message);
      errorCount++;
    }
  };

  for await (const line of rl) {
    // Check for MBOX message separator: lines starting with 'From '
    // Note: MBOX spec says 'From ' must be preceded by an empty line (or start of file)
    // and followed by headers. We look for 'From ' at the start of a line.
    if (line.startsWith('From ') && currentMessageLines.length > 0) {
      const rawEmail = currentMessageLines.join('\n');
      currentMessageLines = [];
      await processEmail(rawEmail);
    }
    currentMessageLines.push(line);
  }

  // Process the final message in the file
  if (currentMessageLines.length > 0) {
    await processEmail(currentMessageLines.join('\n'));
  }

  console.log(`MBOX parse completed. Total: ${totalProcessed}, Imported: ${importedCount}, Duplicates: ${duplicateCount}, Errors: ${errorCount}`);
  
  return {
    totalProcessed,
    imported: importedCount,
    duplicates: duplicateCount,
    errors: errorCount
  };
}
