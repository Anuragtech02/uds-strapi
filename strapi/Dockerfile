# Creating multi-stage build for production
FROM node:18-alpine as build
RUN apk update && apk add --no-cache build-base gcc autoconf automake zlib-dev libpng-dev vips-dev git > /dev/null 2>&1
ENV NODE_ENV=production

WORKDIR /opt/
COPY package.json yarn.lock ./
RUN yarn global add node-gyp
RUN yarn config set network-timeout 600000 -g && yarn install --production
ENV PATH=/opt/node_modules/.bin:$PATH
WORKDIR /opt/app
COPY . .
RUN mkdir -p /opt/app/ssl && \
    echo "-----BEGIN CERTIFICATE-----MIIDjjCCAnagAwIBAgIURDLX47uk+jOb6rixvzUMRVZkEkAwDQYJKoZIhvcNAQELBQAwWDELMAkGA1UEBhMCVVMxDjAMBgNVBAgMBVN0YXRlMQ0wCwYDVQQHDARDaXR5MRUwEwYDVQQKDAxPcmdhbml6YXRpb24xEzARBgNVBAMMCkNvbW1vbk5hbWUwHhcNMjQxMTEwMDM0OTA4WhcNMzQwOTE5MDM0OTA4WjBYMQswCQYDVQQGEwJVUzEOMAwGA1UECAwFU3RhdGUxDTALBgNVBAcMBENpdHkxFTATBgNVBAoMDE9yZ2FuaXphdGlvbjETMBEGA1UEAwwKQ29tbW9uTmFtZTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAOsZC7hFDDP196loaEo6+hWC9T3nlvLsCGztc7HXVadiF9h8mgPBprJRINubRl8aiwSLPTnQxogF/TvtDSRJnYbMMiEvwnJ0HAsXR11FoJCOIw1n1bYPH6g7od/bbPA1aKF8O9l/piJdTbYccEhLXORJY0jC1x/rLC1lFzJn4oQlbACiGbn13PAl/M17CtlsiMU+0/glLJt2IHukr6iG5Uw8HqyLNNGvquTWsxRSgR6j162+vvuaD4lfEEMXdVmHOD3ZoBdfdWmWkCuILre+KpYsrrW9ldGW6tkwUlxUsnkV7FM6hPPmW9OpqUzDAuZEeBbHVtFvjjiK2zJurH7NwB8CAwEAAaNQME4wHQYDVR0OBBYEFFYk1nVKQzm9E/nfepS0EG+iiSB6MB8GA1UdIwQYMBaAFFYk1nVKQzm9E/nfepS0EG+iiSB6MAwGA1UdEwQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBABXInp8jMmT4TrkA7PMbyBiM0ad0CNShBAzS4zMRlYuig9mEbkpnQjuVnJNUqPw5sIJ4cyuDc15brY8lPLTj3vGP/gcx7I4IsHJlAi5sL0yV7beF00wyfnGLUiTC1HQzlhdX4fmY1jfxGdCHbqMjCGvKd/BaEbXYniCnSotVgFjSmE7Dd8iChVz7M0dXQuDfyDacENveyMBgr3NeSyqHs+1n8TA42Kghz257rzMjRLIgxnYJPLs0KdLGbJt5XSdfoxpu7D8i5Jc5RWNDExeQ+93BUXuua9kSOl12+ZGBkcaAsAe4MPG4qUZoJQZr88sK///pjS+mpfh9F+Fa2N65/cY=-----END CERTIFICATE-----" > /opt/app/ssl/dbcertificate.pem
RUN yarn build
# # Create ssl directory
# RUN mkdir -p /opt/app/ssl

# # Build the Strapi application with a temporary dummy certificate for build
# RUN echo "dummy certificate" > /opt/app/ssl/dbcertificate.pem 

# Creating final production image
FROM node:18-alpine
RUN apk add --no-cache vips-dev
ENV NODE_ENV=production

WORKDIR /opt/
COPY --from=build /opt/node_modules ./node_modules

WORKDIR /opt/app
COPY --from=build /opt/app ./

# Create ssl directory for runtime certificate with proper permissions
RUN mkdir -p /opt/app/ssl && \
    chown -R node:node /opt/app && \
    chmod -R 755 /opt/app && \
    chmod 777 /opt/app/ssl  # Make ssl directory writable

ENV PATH=/opt/node_modules/.bin:$PATH

RUN chown -R node:node /opt/app
USER node
EXPOSE 1337

CMD ["yarn", "start"]

