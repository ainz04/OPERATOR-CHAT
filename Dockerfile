FROM node:22-alpine

WORKDIR /app

# Install dependencies first (leverages Docker cache)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application sources
COPY . .

# Ensure data vault directory exists
RUN mkdir -p data/vault

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "server.js"]
