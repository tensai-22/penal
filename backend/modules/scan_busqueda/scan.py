# -*- coding: utf-8 -*-
from flask import Blueprint, jsonify, request
import os, re, hashlib, shutil, requests, traceback
from pathlib import Path
import logging
from flask import request as _flreq  # para reenviar cookies al backend

logging.basicConfig(level=logging.DEBUG)

scan_bp = Blueprint("scan_bp", __name__)

# ==================== CONFIG ====================
SOURCE_DIR = r"\\agarciaf\NOTIFICACIONES RENIEC\MESA DE PARTES\Correo\A pasar"
DEST_BASE = str(Path(SOURCE_DIR) / "HALLADO")  # todo dentro de A pasar

MOVE_FILES = True
DEDUP_BY_HASH = True
API_BASE_URL = "http://127.0.0.1:5001/api"
TIMEOUT_SEC = 15

# ==================== REGEX (capturan el PPU literal) ====================
# group(1) = PPU EXACTO como está en el nombre; group(2) = año
RX_DEN = re.compile(
    r"(?:^|[\s\-_])((?:D-\d{1,6})-(20\d{2})(?:-[A-Z]+)?)(?:$|[\s\-_.,])",
    re.IGNORECASE
)
RX_LEG = re.compile(
    r"(?:^|[\s\-_])((?:L\.?\s*|LEG-)\d{1,4}-(20\d{2})(?:-[A-Z]+)?)(?:$|[\s\-_.,])",
    re.IGNORECASE
)
RX_EXP  = re.compile(r"Exp\.\s*([0-9]{4,6}-20\d{2}-\d{1,2}-[A-Z0-9-]{3,})", re.IGNORECASE)
RX_CASO = re.compile(r"CASO[:\s]*([0-9]{3,6}-20\d{2})", re.IGNORECASE)

# ==================== HELPERS ====================
def _sha256(p: Path, chunk=1024*1024) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for b in iter(lambda: f.read(chunk), b""):
            h.update(b)
    return h.hexdigest()

def _safe_move_or_copy(src: Path, dst: Path) -> Path:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists() and DEDUP_BY_HASH:
        try:
            if _sha256(src) == _sha256(dst):
                return dst  # duplicado exacto → no mover
        except Exception:
            pass
        # versionar si difiere
        i = 1
        base, suf = dst.with_suffix(""), dst.suffix
        while True:
            alt = Path(f"{base}-{i}{suf}")
            if not alt.exists():
                dst = alt
                break
            i += 1
    shutil.move(str(src), str(dst)) if MOVE_FILES else shutil.copy2(str(src), str(dst))
    return dst

def _extract_from_filename(name: str):
    """Devuelve el PPU EXACTO del nombre; sin upper(), sin int(), sin formateos."""
    name = (name or "").strip()

    mD = RX_DEN.search(name)
    if mD:
        full = mD.group(1)   # p.ej. "D-282-2025"
        anio = mD.group(2)
        return {
            "tipo": "DENUNCIA",
            "ppu": full,      # ← tal cual
            "anio": anio,
            "expedienteParte": (RX_EXP.search(name).group(1) if RX_EXP.search(name) else "").strip(),
            "casoParte": (RX_CASO.search(name).group(1) if RX_CASO.search(name) else "").strip(),
        }

    mL = RX_LEG.search(name)
    if mL:
        full = mL.group(1)   # p.ej. "L. 68-2020" o "LEG-0068-2020"
        anio = mL.group(2)
        return {
            "tipo": "LEGAJO",
            "ppu": full,      # ← tal cual (sin normalizar a "L. 68-2020")
            "anio": anio,
            "expedienteParte": (RX_EXP.search(name).group(1) if RX_EXP.search(name) else "").strip(),
            "casoParte": (RX_CASO.search(name).group(1) if RX_CASO.search(name) else "").strip(),
        }

    return {
        "tipo": "DESCONOCIDO",
        "ppu": "",
        "anio": "",
        "expedienteParte": (RX_EXP.search(name).group(1) if RX_EXP.search(name) else "").strip(),
        "casoParte": (RX_CASO.search(name).group(1) if RX_CASO.search(name) else "").strip(),
    }

def _fetch_backend_rows(ppu: str):
    """
    Llama a /api/busqueda_rapida usando el PPU EXACTO y reenviando las cookies
    del request actual (para @login_required).
    """
    url = API_BASE_URL.rstrip("/") + "/busqueda_rapida"
    try:
        r = requests.get(
            url,
            params={"q": ppu},
            cookies=_flreq.cookies,  # reenvía sesión
            timeout=TIMEOUT_SEC,
            allow_redirects=False
        )
        if r.status_code in (401, 302):
            logging.warning("busqueda_rapida requiere login (status=%s)", r.status_code)
            return []
        r.raise_for_status()
        data = r.json()
        if isinstance(data, list):
            return data
        return [data] if data else []
    except Exception:
        logging.exception("fetch_backend_rows failed for %s", ppu)
        return []

# ==================== ENDPOINT ====================
@scan_bp.route("/busqueda_rapida_scan", methods=["POST"])  # ⬅ SIN /api aquí
def busqueda_rapida_scan():
    """
    Escanea la carpeta, detecta PPU por nombre de archivo, mueve PDFs a HALLADO,
    consulta el backend y devuelve filas para la grilla.
    """
    global MOVE_FILES

    body = request.get_json(silent=True) or {}
    move_opt = body.get("move", MOVE_FILES)
    recursive = body.get("recursive", True)
    MOVE_FILES = bool(move_opt)

    src = Path(SOURCE_DIR)
    dst = Path(DEST_BASE)
    if not src.exists():
        return jsonify({"error": f"No existe la ruta: {SOURCE_DIR}"}), 400
    dst.mkdir(parents=True, exist_ok=True)

    scanned, moved = 0, 0
    seen_ppu = set()
    rows_out = []

    def walker():
        if recursive:
            for root, _, files in os.walk(src):
                for fn in files:
                    if fn.lower().endswith(".pdf"):
                        yield Path(root) / fn
        else:
            for p in src.iterdir():
                if p.is_file() and p.suffix.lower() == ".pdf":
                    yield p

    for pdf in walker():
        scanned += 1
        info = _extract_from_filename(pdf.name)
        ppu = info["ppu"]  # ← EXACTO como aparece en el nombre

        try:
            if ppu:
                # mover o copiar
                dest = Path(dst) / pdf.name
                try:
                    _safe_move_or_copy(pdf, dest)
                    moved += 1
                except Exception:
                    pass  # no detiene el flujo

                if ppu not in seen_ppu:
                    seen_ppu.add(ppu)
                    filas = _fetch_backend_rows(ppu)
                    if filas:
                        rows_out.extend(filas)
                    else:
                        # fila placeholder si no existe en BD
                        origen = []
                        if info["expedienteParte"]:
                            origen.append(f"Exp. {info['expedienteParte']}")
                        if info["casoParte"]:
                            c = info["casoParte"]
                            origen.append(f"CASO {c}" if not re.match(r"^caso", c, re.I) else c)
                        rows_out.append({
                            "registro_ppu": ppu,
                            "abogado": "",
                            "denunciado": "",
                            "origen": ", ".join(origen),
                            "juzgado": "",
                            "departamento": "",
                            "nr_de_exp_completo": "",
                            "fiscaliaOrigen": "",
                            "delito": "",
                            "e_situacional": "",
                            "etiqueta": "",
                            "informeJuridico": "",
                            "item": "",
                            "fechaIngreso": None,
                            "fechaDeArchivo": None,
                            "razonArchivo": ""
                        })
        except Exception:
            traceback.print_exc()

    return jsonify({
        "scanned_count": scanned,
        "moved_count": moved,
        "ppus_count": len(seen_ppu),
        "rows": rows_out
    })
