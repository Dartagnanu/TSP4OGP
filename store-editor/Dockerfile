# Use official Node.js LTS image
FROM node:20

WORKDIR /usr/src/app

# Install server dependencies (express, mongoose, bcrypt, socket.io, etc.)
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev

# Copy store-editor app (client + server source)
COPY docker-entrypoint.sh /docker-entrypoint.sh
COPY . .
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

EXPOSE 42069

ENTRYPOINT ["/docker-entrypoint.sh"]
