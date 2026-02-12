#!/bin/bash

# Script to create E2E test user
# Usage: ./scripts/create-e2e-user.sh

BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "Creating E2E test user..."

RESPONSE=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin_e2e@example.com",
    "password": "password",
    "orgId": "e2e-test-org",
    "role": "admin"
  }')

HTTP_CODE=$(echo "$RESPONSE" | grep -o '"statusCode":[0-9]*' | grep -o '[0-9]*' || echo "200")

if echo "$RESPONSE" | grep -q "access_token"; then
  echo "✅ User created successfully!"
  echo ""
  echo "Credentials:"
  echo "  Email: admin_e2e@example.com"
  echo "  Password: password"
  echo "  Role: admin"
  echo "  Org ID: e2e-test-org"
  echo ""
  TOKEN=$(echo "$RESPONSE" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
  echo "  Token: ${TOKEN:0:50}..."
elif echo "$RESPONSE" | grep -q "already exists"; then
  echo "⚠️  User already exists. Logging in..."
  LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "admin_e2e@example.com",
      "password": "password"
    }')
  
  if echo "$LOGIN_RESPONSE" | grep -q "access_token"; then
    echo "✅ Login successful!"
    echo ""
    echo "Credentials:"
    echo "  Email: admin_e2e@example.com"
    echo "  Password: password"
  else
    echo "❌ Login failed"
    echo "$LOGIN_RESPONSE" | jq . 2>/dev/null || echo "$LOGIN_RESPONSE"
    exit 1
  fi
else
  echo "❌ Failed to create user"
  echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
  exit 1
fi

