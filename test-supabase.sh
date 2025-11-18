#!/bin/bash

echo "=== Testing orders table ==="
curl -X GET 'https://fqumpgpsxhzsqvfjqgzx.supabase.co/rest/v1/orders?select=*&limit=5' -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxdW1wZ3BzeGh6c3F2ZmpxZ3p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQyNjExMTAsImV4cCI6MjA1OTgzNzExMH0.sZQ2Yp0bgZegc2oSAWetb7eZrdD0lBcd8ynynjYxTdE" -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxdW1wZ3BzeGh6c3F2ZmpxZ3p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQyNjExMTAsImV4cCI6MjA1OTgzNzExMH0.sZQ2Yp0bgZegc2oSAWetb7eZrdD0lBcd8ynynjYxTdE"

echo -e "\n\n=== Testing comment_orders table ==="
curl -X GET 'https://fqumpgpsxhzsqvfjqgzx.supabase.co/rest/v1/comment_orders?select=*&limit=5' -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxdW1wZ3BzeGh6c3F2ZmpxZ3p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQyNjExMTAsImV4cCI6MjA1OTgzNzExMH0.sZQ2Yp0bgZegc2oSAWetb7eZrdD0lBcd8ynynjYxTdE" -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxdW1wZ3BzeGh6c3F2ZmpxZ3p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQyNjExMTAsImV4cCI6MjA1OTgzNzExMH0.sZQ2Yp0bgZegc2oSAWetb7eZrdD0lBcd8ynynjYxTdE"

echo -e "\n\n=== Testing users table ==="
curl -X GET 'https://fqumpgpsxhzsqvfjqgzx.supabase.co/rest/v1/users?select=user_id,login_id&limit=5' -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxdW1wZ3BzeGh6c3F2ZmpxZ3p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQyNjExMTAsImV4cCI6MjA1OTgzNzExMH0.sZQ2Yp0bgZegc2oSAWetb7eZrdD0lBcd8ynynjYxTdE" -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxdW1wZ3BzeGh6c3F2ZmpxZ3p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQyNjExMTAsImV4cCI6MjA1OTgzNzExMH0.sZQ2Yp0bgZegc2oSAWetb7eZrdD0lBcd8ynynjYxTdE"

echo -e "\n"
