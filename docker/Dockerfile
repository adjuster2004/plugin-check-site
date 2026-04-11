FROM python:3.11-alpine

WORKDIR /app

# Устанавливаем библиотеку certifi
RUN pip install --no-cache-dir certifi cryptography

COPY ssl_checker.py .

EXPOSE 9090
ENV PORT=9090

CMD ["python", "-u", "ssl_checker.py"]
