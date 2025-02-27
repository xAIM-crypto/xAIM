FROM node:18-alpine

# Install bash and netcat (for waiting on dependencies)
RUN apk add --no-cache bash netcat-openbsd

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

# Run the script directly without creating a file
CMD set -e; \
    DB_HOST=${DATABASE_HOST:-db}; \
    echo "Waiting for PostgreSQL at ${DB_HOST}:25061..."; \
    while ! nc -z "$DB_HOST" 25061; do \
        >&2 echo "PostgreSQL is unavailable at $DB_HOST - sleeping"; \
        sleep 1; \
    done; \
    echo "PostgreSQL is up - continuing."; \
    echo "Running database migrations..."; \
    node migrate.js; \
    echo "Starting the app..."; \
    exec npm start
