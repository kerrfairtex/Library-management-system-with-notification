SELECT relname, relrowsecurity 
FROM pg_class 
WHERE relnamespace = 'public'::regnamespace 
AND relkind = 'r'
AND relname IN ('users', 'books', 'members', 'loans', 'notifications', 'holds', 'settings', 'fines', 'book_items', 'circulation_rules')
ORDER BY relname;
