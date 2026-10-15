FROM node:22-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend ./backend
COPY --from=frontend /app/dist ./dist
ENV PYTHONPATH=/app/backend \
    PYTHONUNBUFFERED=1
CMD ["sh", "-c", "gunicorn --chdir /app/backend run:app --bind 0.0.0.0:${PORT:-10000} --timeout 120"]
