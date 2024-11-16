FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache build-base gcc autoconf automake zlib-dev libpng-dev vips-dev > /dev/null 2>&1

WORKDIR /app

# Copy package dependencies files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install

# Copy application files
COPY . .

# Build the Strapi application
RUN yarn build

EXPOSE 1337

CMD ["yarn", "start"]