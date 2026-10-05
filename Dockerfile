# AstroPilot as a container, for hosts other than Render (Fly.io, Railway, a VPS…).
#   docker build -t astropilot . && docker run -p 5000:5000 -e DATABASE_URL=… -e SESSION_SECRET=… astropilot
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production PORT=5000
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.cjs"]
