FROM python:3.11-alpine

WORKDIR /app

# Устанавливаем whois (системную утилиту) и python-библиотеки
RUN apk add --no-cache whois && \
    pip install --no-cache-dir certifi cryptography python-whois

COPY ssl_checker.py .

EXPOSE 9090
ENV PORT=9090

CMD ["python", "-u", "ssl_checker.py"]
