import ssl
import socket
import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import urllib.parse
import urllib.request  # <-- Добавили для запросов к RDAP
import os
import certifi
from cryptography import x509
from cryptography.hazmat.backends import default_backend
import whois

class SSLCheckHandler(BaseHTTPRequestHandler):
    
    # --- БЛОК 1: Проверка SSL ---
    def parse_cert_dict(self, cert):
        expire_date = datetime.datetime.strptime(cert['notAfter'], '%b %d %H:%M:%S %Y %Z')
        return (expire_date - datetime.datetime.utcnow()).days

    def get_ssl_expiry(self, hostname):
        context = ssl.create_default_context(cafile=certifi.where())
        
        # Внутренняя функция для красивого форматирования ошибок
        def format_error(e):
            err_str = str(e).lower()
            if "timeout" in err_str or "timed out" in err_str:
                return {"status": "error", "message": "Сайт недоступен (таймаут)"}
            elif "refused" in err_str or "reset" in err_str:
                return {"status": "error", "message": "HTTPS (порт 443) закрыт"}
            else:
                # Все остальные сбои рукопожатия, версий и протоколов
                return {"status": "error", "message": "На сайте не используется HTTPS"}

        try:
            with socket.create_connection((hostname, 443), timeout=3) as sock:
                with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                    return {"status": "ok", "days_left": self.parse_cert_dict(ssock.getpeercert())}
        except ssl.SSLCertVerificationError:
            context_insecure = ssl._create_unverified_context()
            try:
                with socket.create_connection((hostname, 443), timeout=3) as sock:
                    with context_insecure.wrap_socket(sock, server_hostname=hostname) as ssock:
                        bin_cert = ssock.getpeercert(binary_form=True)
                        parsed_cert = x509.load_der_x509_certificate(bin_cert, default_backend())
                        days_left = (parsed_cert.not_valid_after - datetime.datetime.utcnow()).days
                        return {"status": "ok", "days_left": days_left}
            except Exception as e:
                return format_error(e)
        except Exception as e:
            return format_error(e)

    # --- БЛОК 2: Умный поиск домена (RDAP + WHOIS) ---
    def get_domain_expiry(self, domain):
        try:
            domain = domain.encode('idna').decode('utf-8')
        except Exception:
            pass

        parts = domain.split('.')
        
        for i in range(len(parts) - 1):
            check_domain = '.'.join(parts[i:])
            expiration_date = None
            
            # --- ПОПЫТКА 1: Современный протокол RDAP (как у ICANN) ---
            # Работает по HTTPS (порт 443) и возвращает строгий JSON
            try:
                url = f"https://rdap.org/domain/{check_domain}"
                req = urllib.request.Request(url, headers={'Accept': 'application/rdap+json', 'User-Agent': 'SSL-Monitor-Bot/1.0'})
                with urllib.request.urlopen(req, timeout=5) as response:
                    rdap_data = json.loads(response.read().decode())
                    
                    # Ищем событие expiration в структурированном JSON
                    for event in rdap_data.get('events', []):
                        action = event.get('eventAction', '').lower()
                        if action in ['expiration', 'registrar expiration', 'registry expiration']:
                            date_str = event.get('eventDate')
                            if date_str:
                                # Формат RDAP: "2026-06-08T04:52:35Z"
                                expiration_date = datetime.datetime.strptime(date_str[:10], '%Y-%m-%d')
                                break
            except urllib.error.HTTPError as e:
                # Если 404, значит это поддомен (например crm.site.com), идем на следующий круг
                pass
            except Exception:
                pass

            # --- ПОПЫТКА 2: Классическая библиотека (запасной вариант для старых зон) ---
            if not expiration_date:
                try:
                    w = whois.whois(check_domain)
                    if w.expiration_date:
                        expiration_date = w.expiration_date
                        if isinstance(expiration_date, list):
                            expiration_date = expiration_date[0]
                except Exception:
                    pass
            
            # --- Финализация ---
            if expiration_date:
                if hasattr(expiration_date, 'tzinfo') and expiration_date.tzinfo is not None:
                    expiration_date = expiration_date.replace(tzinfo=None)
                    
                days_left = (expiration_date - datetime.datetime.now()).days
                return {"status": "ok", "days_left": days_left}
                
        return {"status": "error", "message": "Не удалось определить срок (возможно, зона скрыта)"}

    # --- БЛОК 3: Маршрутизация и API ---
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

        query_components = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        
        if 'domains' in query_components:
            domains = query_components['domains'][0].split(',')
            results = {}
            for domain in domains:
                clean_domain = domain.strip()
                if clean_domain:
                    results[clean_domain] = {
                        "ssl": self.get_ssl_expiry(clean_domain),
                        "domain": self.get_domain_expiry(clean_domain)
                    }
            self.wfile.write(json.dumps(results).encode())
        else:
            self.wfile.write(json.dumps({"error": "No domains provided"}).encode())

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 9090))
    server = HTTPServer(('0.0.0.0', port), SSLCheckHandler)
    print(f"Monitor API running on port {port}")
    server.serve_forever()
