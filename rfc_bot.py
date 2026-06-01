#!/usr/bin/env python3
"""
Bot de generación de constancias fiscales - YODA
Uso: python3 rfc_bot.py <idcif> <rfc> <emision> <output_path>
"""

import sys
import requests
import re
import os

# Configuración
URL = "https://validacion-4.byethost3.com/rfc.php"
LOGIN_URL = "https://validacion-4.byethost3.com/login.php"
CREDENTIALS = {
    "email": "danaecom97@gmail.com",
    "password": "D2026"
}

def login(session):
    """Inicia sesión en el sitio YODA"""
    # Obtener página de login para cookies
    r = session.get(LOGIN_URL, timeout=30)
    
    # Extraer token CSRF si existe
    token_match = re.search(r'name=["\']?_token["\']?\s+value=["\']?([^"\']+)["\']?', r.text)
    token = token_match.group(1) if token_match else ""
    
    # Datos de login
    login_data = {
        "email": CREDENTIALS["email"],
        "password": CREDENTIALS["password"],
    }
    if token:
        login_data["_token"] = token
    
    # Enviar login
    r = session.post(LOGIN_URL, data=login_data, timeout=30, allow_redirects=True)
    
    # Verificar login exitoso (redirección o contenido)
    return "login" not in r.url.lower() or "Bienvenido" in r.text

def generar_constancia(idcif, rfc, emision, output_path):
    """Genera y descarga la constancia fiscal"""
    session = requests.Session()
    
    # Headers para parecer navegador móvil real
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-MX,es;q=0.9",
        "Origin": "https://validacion-4.byethost3.com",
        "Referer": "https://validacion-4.byethost3.com/rfc.php",
        "Connection": "keep-alive"
    })
    
    # Login
    if not login(session):
        return {"success": False, "error": "No se pudo iniciar sesión en YODA"}
    
    # Obtener formulario RFC
    r = session.get(URL, timeout=30)
    
    # Extraer token CSRF si existe
    token_match = re.search(r'name=["\']?_token["\']?\s+value=["\']?([^"\']+)["\']?', r.text)
    token = token_match.group(1) if token_match else ""
    
    # Enviar formulario de constancia
    form_data = {
        "idCIF": idcif,
        "RFC": rfc,
        "emision": emision,
    }
    if token:
        form_data["_token"] = token
    
    r = session.post(URL, data=form_data, timeout=60, allow_redirects=True)
    
    # Detectar tipo de respuesta
    content_type = r.headers.get('Content-Type', '')
    disposition = r.headers.get('Content-Disposition', '')
    
    # Determinar extensión del archivo
    if '.pdf' in disposition.lower():
        ext = '.pdf'
    elif '.docx' in disposition.lower():
        ext = '.docx'
    elif '.doc' in disposition.lower():
        ext = '.doc'
    else:
        # Por defecto, asumimos docx basado en lo que mencionaste
        ext = '.docx'
    
    # Guardar archivo
    file_path = output_path.replace('.pdf', ext).replace('.docx', ext)
    with open(file_path, 'wb') as f:
        f.write(r.content)
    
    # Verificar que se descargó algo
    if os.path.getsize(file_path) < 1000:  # Menos de 1KB probablemente es error
        os.remove(file_path)
        return {"success": False, "error": "El archivo descargado está vacío o es inválido"}
    
    return {
        "success": True,
        "filePath": file_path,
        "fileName": os.path.basename(file_path),
        "size": os.path.getsize(file_path)
    }

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("Uso: python3 rfc_bot.py <idcif> <rfc> <emision> <output_path>")
        sys.exit(1)
    
    idcif = sys.argv[1]
    rfc = sys.argv[2]
    emision = sys.argv[3]
    output_path = sys.argv[4]
    
    result = generar_constancia(idcif, rfc, emision, output_path)
    print(result)
