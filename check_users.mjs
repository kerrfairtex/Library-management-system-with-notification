import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
console.log('URL:', url?.substring(0, 50))
console.log('Key present:', !!key)

const supabase = createClient(url, key)
const { data, error } = await supabase.from('users').select('id, email, role, status, created_at').order('created_at', {ascending: false}).limit(20)
console.log('Users:', JSON.stringify(data, null, 2))
if (error) console.error('Error:', error)

const { data: members, error: merr } = await supabase.from('members').select('id, name, email, active, user_id').limit(20)
console.log('Members:', JSON.stringify(members, null, 2))
if (merr) console.error('Members Error:', merr)
