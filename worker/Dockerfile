FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY worker/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Optional for PDF export on the worker (disabled by default):
# RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-calc fonts-dejavu-core && rm -rf /var/lib/apt/lists/*

COPY . /app

ENV PORT=8080
EXPOSE 8080

CMD ["python", "worker/app.py"]
