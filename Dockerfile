FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Clean install (no scripts, fresh lockfile)
RUN npm ci --ignore-scripts

# Copy source
COPY . .

# Build the app
RUN npm run build

# Production stage with nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
