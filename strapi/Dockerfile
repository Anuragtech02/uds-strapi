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

# Create ssl directory
RUN mkdir -p /app/ssl

# Build the Strapi application with a temporary dummy certificate for build
RUN echo "dummy certificate" > /app/ssl/dbcertificate.pem && \
    NODE_ENV=production yarn build && \
    rm /app/ssl/dbcertificate.pem

EXPOSE 1337

CMD ["yarn", "develop"]