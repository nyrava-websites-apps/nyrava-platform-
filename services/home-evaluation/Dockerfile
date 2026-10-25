FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=5190 NODE_ENV=production
EXPOSE 5190
CMD ["node", "server.mjs"]
