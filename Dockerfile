FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --only=production

COPY index.js ./

EXPOSE 9417

CMD ["node", "index.js"]