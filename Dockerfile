FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
COPY client/package*.json ./client/
COPY services/signaling/package*.json ./services/signaling/

RUN npm install

COPY . .

EXPOSE 3000
EXPOSE 8080

CMD ["npm", "run", "dev"]