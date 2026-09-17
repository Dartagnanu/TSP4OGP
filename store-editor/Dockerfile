FROM node:20

WORKDIR /usr/src/app

COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev

COPY docker-entrypoint.sh /docker-entrypoint.sh
COPY . .
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
