// Use PostgREST API directly with CORRECT Supabase URL from .env
const SUPABASE_URL = 'https://wapnzuawqhekgkqpgphj.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhcG56dWF3cWhla2drcXBncGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMzE5NzY3OSwiZXhwIjoyMDQ4NzczNjc5fQ.sb_sec_NnlO';

async function query(table, select, options = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  if (select) url.searchParams.set('select', select);
  Object.entries(options).forEach(([k, v]) => url.searchParams.set(k, v));
  
  const res = await fetch(url, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'count=exact'
    }
  });
  return res.json();
}

async function main() {
  console.log('=== USERS ===');
  const users = await query('users', 'id,email,role,status,created_at', { 'order': 'created_at.desc', 'limit': 20 });
  console.log(JSON.stringify(users, null, 2));
  
  console.log('\n=== MEMBERS ===');
  const members = await query('members', 'id,name,email,active,user_id', { 'limit': 20 });
  console.log(JSON.stringify(members, null, 2));
  
  console.log('\n=== BOOKS ===');
  const books = await query('books', 'id,title,author,isbn,total_copies,available_copies', { 'limit': 20 });
  console.log(JSON.stringify(books, null, 2));
  
  console.log('\n=== HOLDS ===');
  const holds = await query('holds', 'id,book_id,member_id,kind,status,priority,placed_at', { 'limit': 20 });
  console.log(JSON.stringify(holds, null, 2));
}

main().catch(console.error);
