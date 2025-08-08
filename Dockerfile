# Stage 1: Build the application
# Use a slim, Debian-based image for full glibc compatibility
FROM node:20-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm install --frozen-lockfile

COPY . .
RUN npm run build

# Stage 2: Create the final production image
# Use the same slim image for the final stage
FROM node:20-slim AS production

WORKDIR /app

COPY package*.json ./

# Copy only the necessary build artifacts and production node_modules
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# The user's Dockerfile copied a 'static' directory, so we'll keep that.
COPY --from=build /app/static ./static

EXPOSE 80

CMD ["node", "dist/main"]