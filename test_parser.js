import { initDb, getPosts, getStats } from './server/db.js';
import { parseMboxFile } from './server/parser.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mboxPath = path.join(__dirname, 'test-data', 'mock_posts.mbox');

async function runTest() {
  console.log('--- Testing SQLite Init & Migration ---');
  await initDb();
  
  console.log('\n--- Testing Streaming Parser ---');
  const results = await parseMboxFile(mboxPath, (progress) => {
    console.log('Parser Progress Event:', progress);
  });
  
  console.log('\nParser Results summary:', results);
  
  console.log('\n--- Reading Saved DB Records ---');
  const stats = await getStats();
  console.log('Database Stats after Import:', stats);
  
  const { posts } = await getPosts({});
  console.log(`\nRetrieved ${posts.length} Posts from SQLite:`);
  posts.forEach((p, idx) => {
    console.log(`[Post #${idx + 1}]`);
    console.log(`  Title:      "${p.title}"`);
    console.log(`  Date:       ${p.date}`);
    console.log(`  Category:   ${p.category}`);
    console.log(`  Tags:       ${JSON.stringify(p.tags)}`);
    console.log(`  Fav/Read:   Favorite=${p.is_favorite}, Read=${p.read_status}`);
  });
  
  console.log('\nParser Validation Test Successful!');
}

runTest().catch(err => {
  console.error('Test script failed:', err);
  process.exit(1);
});
