import ssl
import socket
import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import urllib.parse
import urllib.request
import os
import certifi
from cryptography import x509
from cryptography.hazmat.backends import default_backend
import whois
import re

class SSLCheckHandler(BaseHTTPRequestHandler):
    
    # --- БЛОК 1: Проверка SSL ---
    def parse_cert_dict(self, cert):
        expire_date = datetime.datetime.strptime(cert['notAfter'], '%b %d %H:%M:%S %Y %Z')
        return (expire_date - datetime.datetime.utcnow()).days

    def get_ssl_expiry(self, hostname):
        context = ssl.create_default_context(cafile=certifi.where())
        
        def format_error(e):
            err_str = str(e).lower()
            if "timeout" in err_str or "timed out" in err_str:
                return {"status": "error", "message": "Сайт недоступен (таймаут)"}
            elif "refused" in err_str or "reset" in err_str:
                return {"status": "error", "message": "HTTPS (порт 443) закрыт"}
            else:
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

    # --- БЛОК 2: Низкоуровневый WHOIS (План В) ---
    def get_raw_whois(self, domain, whois_server=None):
        if whois_server is None:
            tld = domain.split('.')[-1]
            whois_server = f"whois.nic.{tld}"
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(5)
                s.connect((whois_server, 43))
                s.send(f"{domain}\r\n".encode())
                response = b""
                while True:
                    data = s.recv(4096)
                    if not data:
                        break
                    response += data
            return response.decode('utf-8', errors='ignore')
        except:
            return ""

    # --- Функция для .рф через HTTP-интерфейс cctld.ru ---
    def get_cctld_expiry(self, domain):
        """
        Проверка доменов .рф через официальный whois-сервис cctld.ru (HTTP)
        domain должен быть в punycode или кириллицей (функция сама преобразует)
        """
        # Если домен уже в punycode (xn--...), преобразуем в читаемый вид для URL
        if domain.startswith('xn--'):
            try:
                domain_cyr = domain.encode('utf-8').decode('idna')
            except:
                domain_cyr = domain
        else:
            domain_cyr = domain

        # Кодируем кириллический домен для GET-параметра
        encoded_domain = urllib.parse.quote(domain_cyr)
        url = f"https://cctld.ru/service/whois/?domain={encoded_domain}"

        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=10) as response:
                html = response.read().decode('utf-8')
        except Exception as e:
            return {"status": "error", "message": f"Ошибка HTTP-запроса: {str(e)}"}

        # Ищем дату истечения в HTML
        patterns = [
            r'paid-till:\s*(\d{4}-\d{2}-\d{2})',
            r'expire-date:\s*(\d{4}-\d{2}-\d{2})',
            r'Срок регистрации:\s*(\d{2}\.\d{2}\.\d{4})',
            r'Registry Expiry Date:\s*(\d{4}-\d{2}-\d{2})',
            r'до\s+(\d{2}\.\d{2}\.\d{4})',
            r'(\d{4}-\d{2}-\d{2})\s*\(expir',
            r'(\d{2}\.\d{2}\.\d{4})'   # последнее средство – любая дата в формате дд.мм.гггг
        ]

        for pat in patterns:
            match = re.search(pat, html, re.IGNORECASE)
            if match:
                date_str = match.group(1)
                # Пробуем разные форматы
                for fmt in ('%Y-%m-%d', '%d.%m.%Y'):
                    try:
                        exp_date = datetime.datetime.strptime(date_str, fmt)
                        days_left = (exp_date - datetime.datetime.now()).days
                        return {"status": "ok", "days_left": days_left}
                    except ValueError:
                        continue
        return {"status": "error", "message": "Не удалось извлечь дату истечения из ответа cctld.ru"}

    def get_domain_expiry(self, domain):
        # Преобразуем IDN в punycode для запросов
        try:
            domain_puny = domain.encode('idna').decode('utf-8')
        except:
            domain_puny = domain

        # Специальная проверка для доменов .рф
        if domain_puny.endswith('.xn--p1ai') or domain.endswith('.рф'):
            result = self.get_cctld_expiry(domain_puny)
            if result["status"] == "ok":
                return result

        parts = domain_puny.split('.')
        for i in range(len(parts) - 1):
            check_domain = '.'.join(parts[i:])
            expiration_date = None
            
            # 1. RDAP
            try:
                url = f"https://rdap.org/domain/{check_domain}"
                req = urllib.request.Request(url, headers={'Accept': 'application/rdap+json'})
                with urllib.request.urlopen(req, timeout=5) as response:
                    rdap_data = json.loads(response.read().decode())
                    for event in rdap_data.get('events', []):
                        if event.get('eventAction', '').lower() in ['expiration', 'registrar expiration', 'registry expiration']:
                            expiration_date = datetime.datetime.strptime(event.get('eventDate')[:10], '%Y-%m-%d')
                            break
            except:
                pass

            # 2. Библиотека whois
            if not expiration_date:
                try:
                    w = whois.whois(check_domain)
                    if w.expiration_date:
                        expiration_date = w.expiration_date[0] if isinstance(w.expiration_date, list) else w.expiration_date
                except:
                    pass

            # 3. Raw whois (для обычных зон)
            if not expiration_date:
                raw_text = self.get_raw_whois(check_domain)
                match = re.search(r'(?i)(?:expiry date|expiration date|paid-till|expire date|valid until)[^\d]*(\d{4}[-./]\d{2}[-./]\d{2})', raw_text)
                if match:
                    try:
                        expiration_date = datetime.datetime.strptime(match.group(1).replace('.','-').replace('/','-'), '%Y-%m-%d')
                    except:
                        pass
            
            if expiration_date:
                if hasattr(expiration_date, 'tzinfo') and expiration_date.tzinfo is not None:
                    expiration_date = expiration_date.replace(tzinfo=None)
                days_left = (expiration_date - datetime.datetime.now()).days
                return {"status": "ok", "days_left": days_left}
                
        return {"status": "error", "message": "Не удалось определить срок"}

    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        if 'domains' in query:
            domains = query['domains'][0].split(',')
            results = {d.strip(): {"ssl": self.get_ssl_expiry(d.strip()), "domain": self.get_domain_expiry(d.strip())} for d in domains if d.strip()}
            self.wfile.write(json.dumps(results).encode())
        else:
            self.wfile.write(json.dumps({"error": "No domains"}).encode())

if __name__ == '__main__':
    server = HTTPServer(('0.0.0.0', int(os.environ.get('PORT', 9090))), SSLCheckHandler)
    server.serve_forever()
