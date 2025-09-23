# backend/core.py
from __future__ import annotations

import os
import re
import logging
from functools import wraps
from typing import List, Set, Tuple, Optional

import mysql.connector
import unidecode
import pdfplumber
from flask import jsonify, session

logger = logging.getLogger(__name__)

# ---- Constantes/utilidades simples ----
ALLOWED_EXTENSIONS = {"pdf"}

def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def get_db_connection(database: Optional[str] = None):
    try:
        if database is None:
            database = "datappupenal"
        return mysql.connector.connect(
            host="localhost",
            database=database,
            user="root",
            password="Manuel22",
            charset="utf8mb4",
        )
    except mysql.connector.Error as err:
        logger.error("Error al conectar a MySQL: %s", err)
        return None

# ---- Normalización/búsqueda ----
def normalize_text(text: str) -> str:
    text = str(text).lower()
    text = unidecode.unidecode(text)
    text = re.sub(r"[^a-z0-9\s]", "", text)
    return " ".join(text.split())

def query_to_regexp(query: str) -> str:
    special = r"\.^$*+?{}[]|()"
    escaped = "".join(["\\" + c if c in special else c for c in query])
    def repl(m): return f"0*{m.group(0)}"
    return re.sub(r"\d+", repl, escaped)

# ---- PPU helpers ----
def parse_ppu(ppu_str: str) -> Tuple[int, int, int, str]:
    p = (ppu_str or "").upper().strip()
    if p.startswith("D-"):
        priority = 1
    elif p.startswith("LEG-"):
        priority = 2
    elif p.startswith("L."):
        priority = 3
    else:
        priority = 4

    nums = re.findall(r"\d+", p)
    number = int(nums[0]) if len(nums) >= 1 else 0
    year   = int(nums[1]) if len(nums) >= 2 else 0
    suffix = re.search(r"-[A-Z]+$", p)
    return (priority, year, number, suffix.group(0) if suffix else "")

def parse_query_ppu(query: str) -> Optional[dict]:
    pat = re.compile(r"^(?P<prefix>D-|LEG-|L\. ?|CONS-)?(?P<number>\d{1,4})(?:-(?P<year>\d{1,4}))?(?:-(?P<suffix>[A-Z]))?$")
    m = pat.match(query.strip().upper())
    if not m:
        return None
    parts = m.groupdict()
    parts["number_variants"] = [str(int(parts["number"])).zfill(n) for n in range(1, 5)]
    parts["year"] = (parts["year"] + "%") if parts["year"] else "%"
    parts["suffix"] = f"-{parts['suffix']}" if parts["suffix"] else "%"
    return parts

def generar_variantes_ppu(parsed: dict) -> List[str]:
    prefixes = [parsed["prefix"]] if parsed["prefix"] else ["D-", "LEG-", "L. ", "L.", "CONS-"]
    out = []
    for prefix in prefixes:
        for num in parsed["number_variants"]:
            out.append(f"{prefix}{num}-{parsed['year']}{parsed['suffix']}")
    return out

# ---- Expedientes ----
exp_pattern_1 = r"(\d{5}-\d{4}-\d{1,2}-\d{4}[A-Z]?-([A-Z]{2})-[A-Z]{2}-\d{1,2})"
exp_pattern_2 = r"(\d{5}-\d{4}-\d{1,2}-[A-Z\d]+-[A-Z]{2}-[A-Z]{2}-\d{1,2})"

def normalizar_expediente(expediente: str) -> str:
    return re.sub(r"-(\d{1,2})-", "-", expediente, count=1)

# ---- PDF helpers ----
def extract_pdf_pages(pdf_path: str) -> Optional[List[Tuple[int, str]]]:
    """
    Extrae texto normalizado de páginas 2 a 6.
    Devuelve lista de (nro_pagina, texto_normalizado) o None si falla.
    """
    pages: List[Tuple[int, str]] = []
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for i, page in enumerate(pdf.pages, start=1):
                if 2 <= i <= 6:
                    txt = page.extract_text() or ""
                    if txt:
                        pages.append((i, normalize_text(txt)))
        return pages
    except Exception as e:
        logger.error("No se pudo procesar %s: %s", pdf_path, e)
        return None

def format_legajo(legajo_str: str) -> str:
    try:
        return f"{int(legajo_str):03d}"
    except Exception:
        return legajo_str

# ---- Texto de “e_situacional” ----
def parse_predicted_label_and_number(predicted_value: str) -> Tuple[str, Optional[str]]:
    norm = normalize_text(predicted_value)
    m = re.search(r"^([a-zñ]+)(?:.*?([0-9]+))?", norm)
    if not m:
        return (norm, None)
    return (m.group(1), m.group(2) if m.group(2) else None)

def find_occurrence_in_situacional(e_situacional: str, keyword: str, numero_str: Optional[str] = None) -> bool:
    norm = normalize_text(e_situacional)
    if not keyword:
        return False
    if numero_str:
        pat = rf"\b{re.escape(keyword)}\b\s*(?:n|num)?[^a-z0-9]*{re.escape(numero_str)}\b"
    else:
        pat = rf"\b{re.escape(keyword)}\b"
    return re.search(pat, norm, re.IGNORECASE) is not None

# ---- Auth decorators (ligeros) ----
def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "username" not in session:
            return jsonify({"error": "Autenticación requerida"}), 401
        return f(*args, **kwargs)
    return wrapper

def role_required(roles: list[str]):
    def deco(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            if "username" not in session:
                return jsonify({"error": "Autenticación requerida"}), 401
            if session.get("role") not in roles:
                return jsonify({"error": "No autorizado"}), 403
            return f(*args, **kwargs)
        return wrapper
    return deco

def validate_expediente_juzgado(expediente: dict) -> dict:
    errors = {}
    c1 = (expediente.get("campo1") or "").strip()
    c2 = (expediente.get("campo2") or "").strip()
    c3 = (expediente.get("campo3") or "").strip()
    c4 = (expediente.get("campo4") or "").strip()
    c5 = (expediente.get("campo5") or "").strip()
    c6 = (expediente.get("campo6") or "").strip()
    c7 = (expediente.get("campo7") or "").strip()

    if not re.fullmatch(r"\d{5}", c1):
        errors["campo1"] = "Debe tener exactamente 5 dígitos."
    if not re.fullmatch(r"\d{4}", c2):
        errors["campo2"] = "Debe tener exactamente 4 dígitos."
    else:
        y = int(c2)
        if y < 1900 or y > 3000:
            errors["campo2"] = "Debe estar entre 1900 y 3000."
    if not re.fullmatch(r"\d{1,3}", c3):
        errors["campo3"] = "Debe tener entre 1 y 3 dígitos."
    if not re.fullmatch(r"\d{4}", c4):
        errors["campo4"] = "Debe tener exactamente 4 dígitos."
    if not re.fullmatch(r"[A-Z]{2}", c5):
        errors["campo5"] = "Debe tener exactamente 2 letras mayúsculas."
    if not re.fullmatch(r"[A-Z]{2}", c6):
        errors["campo6"] = "Debe tener exactamente 2 letras mayúsculas."
    if not re.fullmatch(r"\d{1,2}", c7):
        errors["campo7"] = "Debe tener entre 1 y 2 dígitos."
    return errors

# ---- Lookup auxiliar ----
def get_fiscalia_departamento(fiscalia: str) -> str:
    try:
        cnx = mysql.connector.connect(
            host="localhost", user="root", password="Manuel22", database="datappupenal"
        )
        cur = cnx.cursor(dictionary=True)
        cur.execute(
            "SELECT departamento FROM dependencias_fiscales_mpfn WHERE fiscalia = %s LIMIT 1",
            (fiscalia,),
        )
        row = cur.fetchone()
        return (row or {}).get("departamento") or "Departamento Desconocido"
    except mysql.connector.Error as err:
        logger.error("Error al obtener depto para fiscalía '%s': %s", fiscalia, err)
        return "Departamento Desconocido"
    finally:
        try:
            cur.close()
        except Exception:
            pass
        try:
            cnx.close()
        except Exception:
            pass

# ---- Export explícito (ayuda a Pylance) ----
__all__ = [
    "ALLOWED_EXTENSIONS",
    "allowed_file",
    "get_db_connection",
    "normalize_text",
    "query_to_regexp",
    "parse_ppu",
    "parse_query_ppu",
    "generar_variantes_ppu",
    "normalizar_expediente",
    "extract_pdf_pages",
    "format_legajo",
    "parse_predicted_label_and_number",
    "find_occurrence_in_situacional",
    "login_required",
    "role_required",
    "validate_expediente_juzgado",
    "get_fiscalia_departamento",
]
