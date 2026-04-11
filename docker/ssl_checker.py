import ssl
import socket
import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import urllib.parse
import os
import certifi
from cryptography import x509
from cryptography.hazmat.backends import default_backend

class SSLCheckHandler(BaseHTTPRequestHandler):
    def parse_cert_dict(self, cert):
        """Парсит дату из стандартного словаря Python (для валидных сертификатов)"""
        expire_date = datetime.datetime.strptime(cert['notAfter'], '%b %d %H:%M:%S %Y %Z')
        days_left = (expire_date - datetime.datetime.utcnow()).days
        return {"status": "ok", "days_left": days_left}

    def get_cert_expiry(self, hostname):
        # 1. Основная попытка: строгая проверка через certifi
        context = ssl.create_default_context(cafile=certifi.where())
        
        try:
            with socket.create_connection((hostname, 443), timeout=3) as sock:
                with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                    cert = ssock.getpeercert()
                    return self.parse_cert_dict(cert)
                    
        except ssl.SSLCertVerificationError:
            # 2. План Б: Цепочка разорвана. Читаем сертификат без проверки.
            context_insecure = ssl._create_unverified_context()
            try:
                with socket.create_connection((hostname, 443), timeout=3) as sock:
                    with context_insecure.wrap_socket(sock, server_hostname=hostname) as ssock:
                        # Получаем сырые байты
                        bin_cert = ssock.getpeercert(binary_form=True)
                        
                        # Парсим байты через библиотеку cryptography
                        parsed_cert = x509.load_der_x509_certificate(bin_cert, default_backend())
                        
                        # Получаем дату окончания (not_valid_after возвращает объект datetime)
                        expire_date = parsed_cert.not_valid_after
                        days_left = (expire_date - datetime.datetime.utcnow()).days
                        
                        return {"status": "ok", "days_left": days_left}
                        
            except Exception as e:
                return {"status": "error", "message": f"Fallback failed: {str(e)}"}
                
        except Exception as e:
            return {"status": "error", "message": str(e)}

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
                    results[clean_domain] = self.get_cert_expiry(clean_domain)
                    
            self.wfile.write(json.dumps(results).encode())
        else:
            self.wfile.write(json.dumps({"error": "No domains provided"}).encode())

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 9090))
    server = HTTPServer(('0.0.0.0', port), SSLCheckHandler)
    print(f"SSL Checker API running on port {port}")
    server.serve_forever()