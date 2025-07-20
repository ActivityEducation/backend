# Stage 1: Build the application
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
# If using yarn, use: COPY yarn.lock ./

RUN npm install --frozen-lockfile
# If using yarn, use: RUN yarn install --frozen-lockfile

COPY . .

RUN npm run build
# If using yarn, use: RUN yarn build

# Stage 2: Create the final production image
FROM node:20-alpine AS production

WORKDIR /app

# Copy package.json and package-lock.json for production dependencies install (though we'll copy node_modules)
COPY package*.json ./

# Explicitly copy node_modules from the build stage to the production stage
# This ensures all dependencies (including dev if necessary for runtime, though ideally not) are present.
COPY --from=build /app/node_modules ./node_modules

COPY --from=build /app/dist ./dist

EXPOSE 80

CMD ["node", "dist/main"]