# Use official Node.js 18 image
FROM node:18-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (including dev deps for building)
RUN npm install

# Copy source code
COPY src ./src

# Build TypeScript code
RUN npm run build

# Prune dev dependencies to save space
RUN npm prune --production

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "start"]
