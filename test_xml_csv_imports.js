import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runTests() {
  console.log('--- Testing WordPress XML and CSV Import Endpoints ---');

  // 1. Check current stats
  let statsBefore = {};
  try {
    const res = await fetch('http://localhost:5001/api/stats');
    statsBefore = await res.json();
    console.log('Stats before import:', statsBefore);
  } catch (err) {
    console.error('Failed to get stats. Is the backend server running at http://localhost:5001?', err.message);
    process.exit(1);
  }

  // 2. Test WordPress XML Import
  console.log('\n--- Uploading mock_wordpress.xml to /api/import/wordpress ---');
  const xmlPath = path.join(__dirname, 'test-data', 'mock_wordpress.xml');
  const xmlContent = fs.readFileSync(xmlPath);
  
  const xmlBlob = new Blob([xmlContent], { type: 'text/xml' });
  const wpFormData = new FormData();
  wpFormData.append('wordpress', xmlBlob, 'mock_wordpress.xml');

  try {
    const res = await fetch('http://localhost:5001/api/import/wordpress', {
      method: 'POST',
      body: wpFormData,
    });
    
    if (!res.ok) {
      console.error('WP Import failed:', res.status, await res.text());
    } else {
      const data = await res.json();
      console.log('WP Import Success Response:', data);
    }
  } catch (err) {
    console.error('WP Import Error:', err.message);
  }

  // 3. Test CSV Import
  console.log('\n--- Uploading mock_posts.csv to /api/import/csv ---');
  const csvPath = path.join(__dirname, 'test-data', 'mock_posts.csv');
  const csvContent = fs.readFileSync(csvPath);
  
  const csvBlob = new Blob([csvContent], { type: 'text/csv' });
  const csvFormData = new FormData();
  csvFormData.append('csv', csvBlob, 'mock_posts.csv');

  try {
    const res = await fetch('http://localhost:5001/api/import/csv', {
      method: 'POST',
      body: csvFormData,
    });
    
    if (!res.ok) {
      console.error('CSV Import failed:', res.status, await res.text());
    } else {
      const data = await res.json();
      console.log('CSV Import Success Response:', data);
    }
  } catch (err) {
    console.error('CSV Import Error:', err.message);
  }

  // 4. Check stats after import
  try {
    const res = await fetch('http://localhost:5001/api/stats');
    const statsAfter = await res.json();
    console.log('\nStats after import:', statsAfter);
    console.log(`Imported ${statsAfter.totalPosts - statsBefore.totalPosts} posts!`);
  } catch (err) {
    console.error('Failed to get stats after:', err.message);
  }

  // 5. Query posts to inspect categories and tags
  try {
    const res = await fetch('http://localhost:5001/api/posts?limit=5&sort=desc');
    const { posts } = await res.json();
    console.log('\nInspect latest posts:');
    posts.slice(0, 5).forEach((p) => {
      console.log(`- Title: "${p.title}"`);
      console.log(`  Date:  ${p.date}`);
      console.log(`  Cat:   ${p.category}`);
      console.log(`  Tags:  ${JSON.stringify(p.tags)}`);
    });
  } catch (err) {
    console.error('Failed to query posts:', err.message);
  }
}

runTests();
