#!/bin/bash
# Bootstrap script to promote the first user to system_admin
# Usage: ./bootstrap-admin.sh <user_email> [environment]
# Example: ./bootstrap-admin.sh admin@example.com prod

EMAIL=$1
ENVIRONMENT=${2:-prod}
TABLE_NAME="ai-connective-${ENVIRONMENT}"

if [ -z "$EMAIL" ]; then
    echo "Usage: ./bootstrap-admin.sh <user_email> [environment]"
    echo "Example: ./bootstrap-admin.sh admin@example.com prod"
    exit 1
fi

echo "Looking for user with email: $EMAIL in table: $TABLE_NAME"

# Find user by email using GSI1
USER_DATA=$(aws dynamodb query \
    --table-name "$TABLE_NAME" \
    --index-name GSI1 \
    --key-condition-expression "GSI1PK = :pk" \
    --filter-expression "email = :email" \
    --expression-attribute-values '{":pk": {"S": "USERS"}, ":email": {"S": "'"$EMAIL"'"}}' \
    --output json)

USER_ID=$(echo "$USER_DATA" | jq -r '.Items[0].userId.S // empty')

if [ -z "$USER_ID" ]; then
    echo "Error: User not found with email: $EMAIL"
    exit 1
fi

echo "Found user: $USER_ID"
echo "Updating role to system_admin..."

# Update user role to system_admin
aws dynamodb update-item \
    --table-name "$TABLE_NAME" \
    --key '{"PK": {"S": "USER#'"$USER_ID"'"}, "SK": {"S": "META"}}' \
    --update-expression "SET #role = :role, updatedAt = :now" \
    --expression-attribute-names '{"#role": "role"}' \
    --expression-attribute-values '{":role": {"S": "system_admin"}, ":now": {"S": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}}' \
    --return-values ALL_NEW

echo ""
echo "Done! User $EMAIL is now a system_admin."
echo "Please log out and log back in to refresh your session."
