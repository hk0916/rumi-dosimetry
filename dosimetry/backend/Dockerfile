FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Prisma Client가 이미 생성된 경우 node_modules에 포함됨
# 컨테이너 내에서 외부 네트워크 접근 불가 시 로컬 생성된 클라이언트 사용
RUN npx prisma generate 2>/dev/null || echo "Prisma client using pre-generated files"

EXPOSE 4000
CMD ["npm", "run", "dev"]
