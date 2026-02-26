# C:\...\backend\modules\busqueda_rapida\busqueda_rapida.py

import os
from datetime import date, datetime

from flask import Blueprint, jsonify, request, session, current_app, send_file

from backend.core import (
    login_required,
    get_db_connection,
)

busqueda_rapida_bp = Blueprint("busqueda_rapida_bp", __name__)


# -------------------------------------------------------------------- #
# ---------------------------------MODO BUSQUEDA ----------------------- #
# -------------------------------------------------------------------- #

@busqueda_rapida_bp.route("/busqueda_rapida", methods=["GET"])
@login_required
def busqueda_rapida():
    q       = request.args.get("q", "").strip()
    origen  = request.args.get("origen", "").strip()
    depto   = request.args.get("departamento", "").strip()

    if not q:
        return jsonify([])

    pattern = f"%{q}%"
    conn    = get_db_connection()
    if conn is None:
        return jsonify([]), 500

    cursor = None
    try:
        cursor = conn.cursor(dictionary=True)
        sql = """
         SELECT
            abogado                                   AS abogado,
            registro_ppu                              AS `registro_ppu`,
            registro_ppu                              AS registroPpu,
            denunciado                                AS denunciado,
            origen                                    AS origen,
            `nr de exp completo`                      AS nr_de_exp_completo,
            fiscalia                                  AS fiscaliaOrigen,
            departamento                              AS departamento,
            juzgado                                   AS juzgado,
            delito                                    AS delito,
            e_situacional                             AS e_situacional,
            informe_juridico                          AS informeJuridico,
            item                                      AS item,
            fecha_ingreso                             AS fechaIngreso,
            etiqueta                                  AS etiqueta,
            fecha_de_archivo                          AS fechaDeArchivo,
            razon_archivo                             AS razonArchivo
         FROM datapenal
         WHERE
            (registro_ppu         LIKE %s OR
             abogado              LIKE %s OR
             denunciado           LIKE %s OR
             origen               LIKE %s OR
             `nr de exp completo` LIKE %s OR
             fiscalia             LIKE %s OR
             departamento         LIKE %s OR
             juzgado              LIKE %s OR
             delito               LIKE %s OR
             e_situacional        LIKE %s OR
             informe_juridico     LIKE %s)
        """
        params = [pattern] * 11

        if origen:
            sql += " AND origen LIKE %s"
            params.append(f"%{origen}%")
        if depto:
            sql += " AND departamento LIKE %s"
            params.append(f"%{depto}%")

        sql += " ORDER BY registro_ppu LIMIT 50"

        cursor.execute(sql, params)
        rows = cursor.fetchall()

        # Normaliza fechas a ISO para el frontend (keys camelCase que la grilla espera)
        for r in rows:
            if r.get("fechaIngreso") and isinstance(r["fechaIngreso"], (date, datetime)):
                r["fechaIngreso"] = r["fechaIngreso"].strftime("%Y-%m-%d")
            if r.get("fechaDeArchivo") and isinstance(r["fechaDeArchivo"], (date, datetime)):
                r["fechaDeArchivo"] = r["fechaDeArchivo"].strftime("%Y-%m-%d")

        return jsonify(rows)

    except Exception:
        return jsonify([]), 500

    finally:
        try:
            if cursor is not None:
                cursor.close()
        finally:
            conn.close()


@busqueda_rapida_bp.route("/juzgado_incompleto", methods=["GET"])
@login_required
def juzgado_incompleto():
    pattern = request.args.get("pattern", "").strip()
    if not pattern:
        return jsonify([]), 400

    # Conecta a la BD monitoreo_descargas_sinoe
    conn = get_db_connection(database="monitoreo_descargas_sinoe")
    if conn is None:
        return jsonify([]), 500

    cursor = None
    try:
        cursor = conn.cursor(dictionary=True)
        sql = """
          SELECT juzgado_incompleto
          FROM conteo_exp
          WHERE nombre_original REGEXP %s
          LIMIT 1
        """
        cursor.execute(sql, (pattern,))
        row = cursor.fetchone()
        return jsonify([row] if row else [])
    except Exception:
        current_app.logger.error("juzgado_incompleto error:", exc_info=True)
        return jsonify([]), 500
    finally:
        try:
            if cursor is not None:
                cursor.close()
        finally:
            conn.close()


@busqueda_rapida_bp.route("/fiscalia_incompleto", methods=["GET"])
@login_required
def fiscalia_incompleto():
    pattern = request.args.get("pattern", "").strip()
    if not pattern:
        return jsonify([]), 400

    # Conecta a la BD que contiene la tabla dependencias_fiscales_mpfn
    conn = get_db_connection(database="datappupenal")
    if conn is None:
        return jsonify([]), 500

    cursor = None
    try:
        cursor = conn.cursor(dictionary=True)
        # Buscamos por las primeras 10 cifras exactas
        regexp = f"^{pattern}"
        sql = """
          SELECT nr_de_exp_completo, fiscalia, departamento
          FROM dependencias_fiscales_mpfn
          WHERE nr_de_exp_completo REGEXP %s
          LIMIT 1
        """
        cursor.execute(sql, (regexp,))
        row = cursor.fetchone()
        return jsonify([row] if row else [])
    except Exception:
        current_app.logger.error("fiscalia_incompleto error:", exc_info=True)
        return jsonify([]), 500
    finally:
        try:
            if cursor is not None:
                cursor.close()
        finally:
            conn.close()


# Campos que puede enviar el frontend (claves del payload)
ALL_FRONT_FIELDS = [
    # claves usadas por el front / existentes en datapenal
    "registroPpu",
    "abogado", "denunciado", "origen",
    "nrDeExpCompleto",      # ← alias camel de `nr de exp completo`
    "fiscaliaOrigen",       # ← alias del campo fiscalia
    "departamento", "juzgado", "delito",
    "informeJuridico", "item",
    "eSituacional",         # ← alias camel de e_situacional
    "fechaIngreso",
    "etiqueta",
    "fechaDeArchivo",       # ← nuevo: existe en la tabla
    "razonArchivo",
]


def _get_users_dict() -> dict:
    """
    Evita dependencia circular con app.py.
    En app.py debes setear: app.config["USERS"] = users
    """
    u = current_app.config.get("USERS")
    return u if isinstance(u, dict) else {}


def get_allowed_fields_for_user(username: str, users: dict) -> set:
    """
    Política de edición por usuario:
      - No admins: nada (solo ver).
      - Manuel (admin): todo.
      - agarcia (admin): nada (bloqueado).
      - jgranda (admin): todo MENOS eSituacional.
      - Resto de admins: todo.
    """
    info = users.get(username, {})
    role = info.get("role", "user")

    if role != "admin":
        return set()  # no admins no pueden editar nada

    if username == "Manuel":
        return set(ALL_FRONT_FIELDS)

    if username == "agarcia":
        return set()  # admin sin permisos de edición

    if username == "jgranda":
        return set([f for f in ALL_FRONT_FIELDS if f != "eSituacional"])

    # cualquier otro admin
    return set(ALL_FRONT_FIELDS)


@busqueda_rapida_bp.route("/me", methods=["GET"])
@login_required
def api_me():
    """
    Devuelve identidad, permisos y si el usuario puede editar algo.
    """
    username = session.get("username") or ""
    role = session.get("role") or "user"

    users = _get_users_dict()
    allowed_fields = get_allowed_fields_for_user(username, users)
    allowed_list = sorted(allowed_fields)

    return jsonify({
        "username": username,
        "role": role,
        "allowedFields": allowed_list,  # Lista de campos que puede editar
        "canEdit": bool(allowed_list)   # True si hay al menos un campo editable
    }), 200


@busqueda_rapida_bp.route("/busqueda_rapida_sync", methods=["POST"])
@login_required
def busqueda_rapida_sync():
    username = session.get("username")
    if not username:
        return jsonify(error="No autenticado"), 401

    users = _get_users_dict()
    allowed_fields = get_allowed_fields_for_user(username, users)
    if not allowed_fields:
        current_app.logger.warning(f"busqueda_rapida_sync: Acceso denegado para {username}")
        return jsonify(error="Acceso denegado"), 403

    rows = request.get_json() or []
    if not isinstance(rows, list):
        current_app.logger.warning("busqueda_rapida_sync: payload inválido, se esperaba lista de registros")
        return jsonify(updated=[]), 400

    conn = get_db_connection()
    if conn is None:
        current_app.logger.error("busqueda_rapida_sync: error al conectar a la base de datos")
        return jsonify(updated=[]), 500

    cursor = conn.cursor(dictionary=True)

    # Alinea el NOW() del trigger con hora de Lima (UTC-5)
    try:
        cursor.execute("SET time_zone = '-05:00'")
    except Exception:
        current_app.logger.warning("No se pudo fijar time_zone de sesión; se continúa con la del servidor.")

    updated_ppus = []

    # Normaliza cualquier tipo a string “segura” para comparar (no para escribir fechas)
    def _s(v):
        if v is None:
            return ""
        try:
            return str(v).strip()
        except Exception:
            return ""

    # Normaliza fechas a formato aceptado por MySQL o None (NULL)
    # Acepta: '', None, 'YYYY-MM-DD', 'YYYY-MM-DD HH:MM:SS', 'DD/MM/YYYY', 'DD-MM-YYYY'
    def _date_norm(v):
        if v is None:
            return None
        if isinstance(v, (datetime,)):
            return v.strftime("%Y-%m-%d")
        if isinstance(v, (date,)):
            return v.strftime("%Y-%m-%d")
        sv = str(v).strip()
        if not sv:
            return None
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
            try:
                dt = datetime.strptime(sv, fmt)
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                continue
        # Si no parsea, mejor enviar NULL que cadena vacía
        return None

    try:
        for idx, new_row in enumerate(rows, start=1):
            ppu = new_row.get("registroPpu")
            if not ppu:
                current_app.logger.warning(f"[Fila {idx}] Sin 'registroPpu', se omite")
                continue

            # 🔒 Defensa: ignorar cualquier intento de setear fechaDeArchivo desde el front
            if "fechaDeArchivo" in new_row:
                new_row.pop("fechaDeArchivo", None)

            current_app.logger.info(f"[Fila {idx}] ({username}) Datos recibidos (PPU: {ppu}): {new_row}")

            # 1) Traer valores actuales desde la base (todas las columnas que se comparan)
            cursor.execute("""
                SELECT
                    abogado,
                    denunciado,
                    origen,
                    `nr de exp completo`  AS nr_de_exp_completo,
                    fiscalia              AS fiscalia_origen,
                    departamento,
                    juzgado,
                    delito,
                    e_situacional,
                    informe_juridico,
                    item,
                    fecha_ingreso,
                    fecha_e_situacional,
                    etiqueta,
                    last_modified,
                    fecha_de_archivo,
                    razon_archivo         AS razon_archivo
                FROM datapenal
                WHERE registro_ppu = %s
            """, (ppu,))
            db_row = cursor.fetchone()
            if not db_row:
                current_app.logger.warning(f"[Fila {idx}] No se encontró registro en BD para PPU: {ppu}")
                continue

            # 2) Comparar campo a campo (solo los permitidos)
            diffs = {}

            # ⚠️ Quitamos 'fechaDeArchivo' del comparador. La maneja el TRIGGER en BD.
            comparadores = [
                ("abogado",            "abogado"),
                ("denunciado",         "denunciado"),
                ("origen",             "origen"),
                ("nrDeExpCompleto",    "nr_de_exp_completo"),
                ("fiscaliaOrigen",     "fiscalia_origen"),
                ("departamento",       "departamento"),
                ("juzgado",            "juzgado"),
                ("delito",             "delito"),
                ("informeJuridico",    "informe_juridico"),
                ("item",               "item"),
                ("eSituacional",       "e_situacional"),
                ("fechaIngreso",       "fecha_ingreso"),
                ("fechaESituacional",  "fecha_e_situacional"),
                ("etiqueta",           "etiqueta"),
                ("razonArchivo",       "razon_archivo"),
            ]

            # Solo fechas que el front puede modificar (NO incluir fecha_de_archivo ni last_modified)
            date_fields = {"fecha_ingreso", "fecha_e_situacional"}

            for front_key, db_key in comparadores:
                if front_key not in allowed_fields:
                    continue

                if db_key in date_fields:
                    new_val_norm = _date_norm(new_row.get(front_key))
                    old_raw = db_row.get(db_key)

                    if isinstance(old_raw, (datetime, date)):
                        old_val_norm = old_raw.strftime("%Y-%m-%d")
                    else:
                        old_val_norm = _date_norm(old_raw)

                    if new_val_norm != old_val_norm:
                        diffs[db_key] = new_val_norm  # None → NULL

                else:
                    new_val = _s(new_row.get(front_key))
                    old_val = _s(db_row.get(db_key))

                    if new_val != old_val:
                        if db_key == "nr_de_exp_completo":
                            diffs["`nr de exp completo`"] = new_val
                        elif db_key == "fiscalia_origen":
                            diffs["fiscalia"] = new_val
                        else:
                            diffs[db_key] = new_val

            # 3) Si hay diferencias permitidas, actualizar
            if diffs:
                # 🔒 Defensa extra: por si apareció por error
                diffs.pop("fecha_de_archivo", None)

                set_parts = [f"{col} = %s" for col in diffs.keys()]
                params = list(diffs.values()) + [ppu]
                sql = f"UPDATE datapenal SET {', '.join(set_parts)} WHERE registro_ppu = %s"
                cursor.execute(sql, params)

                updated_ppus.append(ppu)
                current_app.logger.info(f"[Fila {idx}] ({username}) Cambios aplicados PPU {ppu}: {list(diffs.keys())}")
            else:
                current_app.logger.info(f"[Fila {idx}] ({username}) Sin cambios (o sin permisos) para PPU: {ppu}")

        conn.commit()
        current_app.logger.info(f"busqueda_rapida_sync: total registros actualizados → {len(updated_ppus)} por {username}")
        return jsonify(updated=updated_ppus), 200

    except Exception:
        conn.rollback()
        current_app.logger.exception("busqueda_rapida_sync error", exc_info=True)
        return jsonify(updated=[]), 500

    finally:
        try:
            cursor.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


# -------------------------------------------------------------------- #
# ---------------------------------MODO BUSQUEDA ----------------------- #
# -------------------------------------------------------------------- #


import re
import unicodedata

# =========================
#  BUSCAR POR RUTA (SCAN)
# =========================

RUTA_SCAN_ROOTS = [
    r"\\jgranda\NOTIFICACIONES PENALES  (ABOGADOS)\NOTIFICACIONES PENALES AÑO 2023",
    r"\\jgranda\NOTIFICACIONES PENALES  (ABOGADOS)\NOTIFICACIONES PENALES AÑO 2024",
    r"\\jgranda\NOTIFICACIONES PENALES  (ABOGADOS)\NOTIFICACIONES PENALES AÑO 2025",
    r"\\jgranda\NOTIFICACIONES PENALES  (ABOGADOS)\NOTIFICACIONES PENALES AÑO 2026",
]

DATE_DIR_RE = re.compile(r"^\d{2}-\d{2}-\d{4}$")

def _parse_dd_mm_yyyy(folder_name: str):
    try:
        dd, mm, yyyy = folder_name.split("-")
        return datetime(int(yyyy), int(mm), int(dd))
    except Exception:
        return None

# Detectar “tiene PPU en el nombre” (EN CUALQUIER PARTE del nombre)
PPU_ANYWHERE_RE = re.compile(
    r"(\bL\.\s?\d{1,4}-20(?:2[3-9]|[3-9]\d)(?:-[A-Z])?\b)|"
    r"(\bLEG-\d{1,4}-(?:\d{4}(?:-[A-Z])?|[A-Z])\b)|"
    r"(\bD-\d{1,4}-(?:19\d{2}|20(?:0\d|1\d|2[0-6]))(?:-[A-Z])?\b)",
    re.IGNORECASE
)

def _has_ppu_in_name(filename: str) -> bool:
    base = os.path.splitext(os.path.basename(filename))[0]
    return bool(PPU_ANYWHERE_RE.search(base))

def _iter_date_dirs_fast(root: str):
    """
    Asume estructura típica:
      ROOT\ABOGADO\dd-mm-aaaa\...
    Retorna (dt, date_dir_path, abogado_name).
    """
    out = []
    try:
        with os.scandir(root) as abogados:
            for a in abogados:
                if not a.is_dir():
                    continue
                abogado_name = a.name
                try:
                    with os.scandir(a.path) as fechas:
                        for f in fechas:
                            if not f.is_dir():
                                continue
                            if not DATE_DIR_RE.match(f.name):
                                continue
                            dt = _parse_dd_mm_yyyy(f.name)
                            if dt:
                                out.append((dt, f.path, abogado_name))
                except Exception:
                    continue
    except Exception:
        return out
    return out

@busqueda_rapida_bp.route("/busqueda_ruta_scan", methods=["POST"])
@login_required
def busqueda_ruta_scan():
    """
    Devuelve máximo N PDFs (por defecto 10), ordenados por fecha (carpeta dd-mm-aaaa) desc.
    Trae solo PDFs cuyo nombre NO contiene patrón de PPU (D-..., L...., LEG-...).
    """
    body = request.get_json(silent=True) or {}
    limit = int(body.get("limit", 10) or 10)
    limit = max(1, min(limit, 50))  # tope defensivo

    candidates = []  # (dt, mtime, ruta, abogado_guess)

    # 1) Lista todas las carpetas dd-mm-aaaa de forma rápida
    date_dirs = []
    for root in RUTA_SCAN_ROOTS:
        date_dirs.extend(_iter_date_dirs_fast(root))

    # 2) Ordena por fecha desc y recorre hasta llenar LIMIT
    date_dirs.sort(key=lambda x: x[0], reverse=True)

    for (dt, date_dir_path, abogado_guess) in date_dirs:
        # Escanea PDFs debajo de esa carpeta de fecha (puede haber subcarpetas)
        for dirpath, _, filenames in os.walk(date_dir_path):
            for fn in filenames:
                if not fn.lower().endswith(".pdf"):
                    continue
                full = os.path.join(dirpath, fn)

                # filtro: NO debe tener PPU en el nombre
                if _has_ppu_in_name(fn):
                    continue

                try:
                    mtime = os.path.getmtime(full)
                except Exception:
                    mtime = 0

                candidates.append((dt, mtime, full, abogado_guess))

        # early-stop: si ya tenemos bastante, podemos cortar “suave”
        # (igual vamos a ordenar al final)
        if len(candidates) >= limit * 5:
            # suficiente pool para ordenar y cortar
            break

    # 3) Orden final: fecha carpeta desc, luego mtime desc
    candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)
    top = candidates[:limit]

    rows = []
    for i, (dt, mtime, ruta, abogado_guess) in enumerate(top):
        base = os.path.basename(ruta)
        rows.append({
            "id": i,
            "ruta_pdf": ruta,
            "nombre_original": base,
            "fecha_carpeta": dt.strftime("%Y-%m-%d"),  # para front
            "abogado_guess": abogado_guess or "",
            "mtime": mtime,
        })

    return jsonify(rows), 200


INVALID_WIN_CHARS_RE = re.compile(r'[<>:"/\\|?*\x00-\x1F]')
MULTI_SPACE_RE = re.compile(r"\s+")

def _sanitize_filename(name: str) -> str:
    # Normaliza unicode + limpia caracteres inválidos en Windows
    s = unicodedata.normalize("NFKC", name or "")
    s = INVALID_WIN_CHARS_RE.sub(" ", s)
    s = MULTI_SPACE_RE.sub(" ", s).strip()
    # Evita nombres vacíos
    return s or "SIN_NOMBRE"

def _keep_suffix_original(base_no_ext: str) -> str:
    """
    Tu regla “dejar las 6 últimas letras” la hago robusta así:
    - Si hay >= 2 palabras: conserva las ÚLTIMAS 2 palabras (tu ejemplo: "LO HICE")
    - Si no: conserva los últimos 6 caracteres del base
    """
    parts = [p for p in re.split(r"\s+", (base_no_ext or "").strip()) if p]
    if len(parts) >= 2:
        return " ".join(parts[-2:])
    s = (base_no_ext or "").strip()
    return s[-6:] if len(s) >= 6 else s

def _build_new_pdf_name(abogado: str, registro_ppu: str, origen: str, original_filename: str) -> str:
    abogado = (abogado or "").strip()
    registro_ppu = (registro_ppu or "").strip()
    origen = (origen or "").strip()

    base_new = f"{abogado} {registro_ppu} {origen}".strip()
    base_new = _sanitize_filename(base_new)

    orig_base = os.path.splitext(os.path.basename(original_filename or ""))[0]
    suffix = _keep_suffix_original(orig_base)
    suffix = _sanitize_filename(suffix)

    # Si suffix ya está incluido al final, no lo dupliques
    if suffix and not base_new.upper().endswith(suffix.upper()):
        base_new = f"{base_new} {suffix}".strip()

    return base_new + ".pdf"

def _unique_path_same_dir(dirpath: str, filename: str) -> str:
    """
    Si existe, agrega (1), (2), etc.
    """
    candidate = os.path.join(dirpath, filename)
    if not os.path.exists(candidate):
        return candidate

    base, ext = os.path.splitext(filename)
    n = 1
    while True:
        cand = os.path.join(dirpath, f"{base} ({n}){ext}")
        if not os.path.exists(cand):
            return cand
        n += 1

@busqueda_rapida_bp.route("/busqueda_ruta_sync", methods=["POST"])
@login_required
def busqueda_ruta_sync():
    """
    Payload: lista de filas, cada una trae:
      - rutaPdf (ruta del PDF)
      - nombreOriginal (opcional)
      - y los mismos campos de busqueda_rapida_sync (registroPpu, abogado, origen, etc.)
    Acción:
      1) actualiza BD (respetando allowed_fields)
      2) renombra PDF en su carpeta usando: "{abogado} {PPU} {origen} + sufijo_original"
    """
    username = session.get("username")
    if not username:
        return jsonify(error="No autenticado"), 401

    users = _get_users_dict()
    allowed_fields = get_allowed_fields_for_user(username, users)
    if not allowed_fields:
        current_app.logger.warning(f"busqueda_ruta_sync: Acceso denegado para {username}")
        return jsonify(updated=[], renamed=[], errors=["Acceso denegado"]), 403

    rows = request.get_json() or []
    if not isinstance(rows, list):
        return jsonify(updated=[], renamed=[], errors=["Payload inválido"]), 400

    conn = get_db_connection()
    if conn is None:
        return jsonify(updated=[], renamed=[], errors=["DB no disponible"]), 500

    cursor = conn.cursor(dictionary=True)
    try:
        try:
            cursor.execute("SET time_zone = '-05:00'")
        except Exception:
            pass

        updated_ppus = []
        renamed = []
        errors = []

        # helpers internos de tu sync original
        def _s(v):
            if v is None:
                return ""
            try:
                return str(v).strip()
            except Exception:
                return ""

        def _date_norm(v):
            if v is None:
                return None
            if isinstance(v, (datetime,)):
                return v.strftime("%Y-%m-%d")
            if isinstance(v, (date,)):
                return v.strftime("%Y-%m-%d")
            sv = str(v).strip()
            if not sv:
                return None
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
                try:
                    dt = datetime.strptime(sv, fmt)
                    return dt.strftime("%Y-%m-%d")
                except ValueError:
                    continue
            return None

        comparadores = [
            ("abogado",            "abogado"),
            ("denunciado",         "denunciado"),
            ("origen",             "origen"),
            ("nrDeExpCompleto",    "nr_de_exp_completo"),
            ("fiscaliaOrigen",     "fiscalia_origen"),
            ("departamento",       "departamento"),
            ("juzgado",            "juzgado"),
            ("delito",             "delito"),
            ("informeJuridico",    "informe_juridico"),
            ("item",               "item"),
            ("eSituacional",       "e_situacional"),
            ("fechaIngreso",       "fecha_ingreso"),
            ("fechaESituacional",  "fecha_e_situacional"),
            ("etiqueta",           "etiqueta"),
            ("razonArchivo",       "razon_archivo"),
        ]
        date_fields = {"fecha_ingreso", "fecha_e_situacional"}

        for idx, new_row in enumerate(rows, start=1):
            ppu = new_row.get("registroPpu") or new_row.get("registro_ppu")
            ruta_pdf = new_row.get("rutaPdf") or new_row.get("ruta_pdf") or ""
            nombre_original = new_row.get("nombreOriginal") or new_row.get("nombre_original") or (os.path.basename(ruta_pdf) if ruta_pdf else "")

            if not ppu:
                errors.append(f"[Fila {idx}] Falta registroPpu: se omite.")
                continue

            # 🔒 Defensa: nunca aceptar fechaDeArchivo desde front
            new_row.pop("fechaDeArchivo", None)
            new_row.pop("fecha_de_archivo", None)

            # 1) Leer fila actual
            cursor.execute("""
                SELECT
                    abogado,
                    denunciado,
                    origen,
                    `nr de exp completo`  AS nr_de_exp_completo,
                    fiscalia              AS fiscalia_origen,
                    departamento,
                    juzgado,
                    delito,
                    e_situacional,
                    informe_juridico,
                    item,
                    fecha_ingreso,
                    fecha_e_situacional,
                    etiqueta,
                    fecha_de_archivo,
                    razon_archivo         AS razon_archivo
                FROM datapenal
                WHERE registro_ppu = %s
            """, (ppu,))
            db_row = cursor.fetchone()
            if not db_row:
                errors.append(f"[Fila {idx}] PPU no existe en BD: {ppu}")
                continue

            # 2) Comparar y armar diffs (solo permitidos)
            diffs = {}

            for front_key, db_key in comparadores:
                if front_key not in allowed_fields:
                    continue

                if db_key in date_fields:
                    new_val_norm = _date_norm(new_row.get(front_key))
                    old_raw = db_row.get(db_key)
                    if isinstance(old_raw, (datetime, date)):
                        old_val_norm = old_raw.strftime("%Y-%m-%d")
                    else:
                        old_val_norm = _date_norm(old_raw)

                    if new_val_norm != old_val_norm:
                        diffs[db_key] = new_val_norm
                else:
                    new_val = _s(new_row.get(front_key))
                    old_val = _s(db_row.get(db_key))
                    if new_val != old_val:
                        if db_key == "nr_de_exp_completo":
                            diffs["`nr de exp completo`"] = new_val
                        elif db_key == "fiscalia_origen":
                            diffs["fiscalia"] = new_val
                        else:
                            diffs[db_key] = new_val

            # 3) Update si corresponde
            if diffs:
                diffs.pop("fecha_de_archivo", None)
                set_parts = [f"{col} = %s" for col in diffs.keys()]
                params = list(diffs.values()) + [ppu]
                sql = f"UPDATE datapenal SET {', '.join(set_parts)} WHERE registro_ppu = %s"
                cursor.execute(sql, params)
                updated_ppus.append(ppu)

            # 4) Renombrar PDF (si hay ruta)
            try:
                if ruta_pdf and os.path.exists(ruta_pdf):
                    dirpath = os.path.dirname(ruta_pdf)

                    abogado = new_row.get("abogado") or db_row.get("abogado") or ""
                    origen = new_row.get("origen") or db_row.get("origen") or ""

                    new_name = _build_new_pdf_name(abogado, ppu, origen, nombre_original or ruta_pdf)
                    new_path = _unique_path_same_dir(dirpath, new_name)

                    if os.path.normpath(new_path) != os.path.normpath(ruta_pdf):
                        os.replace(ruta_pdf, new_path)
                        renamed.append({"ppu": ppu, "from": ruta_pdf, "to": new_path})
                else:
                    # no es “error duro”: puede que el archivo se movió
                    pass
            except Exception as ex:
                current_app.logger.error("Error renombrando PDF", exc_info=True)
                errors.append(f"[Fila {idx}] Error renombrando PDF (PPU {ppu}): {ex}")

        conn.commit()
        return jsonify(updated=updated_ppus, renamed=renamed, errors=errors), 200

    except Exception:
        conn.rollback()
        current_app.logger.exception("busqueda_ruta_sync error", exc_info=True)
        return jsonify(updated=[], renamed=[], errors=["Error interno"]), 500

    finally:
        try:
            cursor.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass

# ============================================================
#  ABRIR PDF – MODO RUTA TEMPORAL (ENDPOINT INDEPENDIENTE)
# ============================================================

from urllib.parse import unquote
import os

ALLOWED_BASES_TMP = [
    r"\\agarciaf\NOTIFICACIONES RENIEC\MESA DE PARTES\PENAL\NOTIFICACIONES",
    r"\\jgranda\NOTIFICACIONES PENALES  (ABOGADOS)",
]

def _norm(p):
    return os.path.normcase(os.path.normpath(p))

@busqueda_rapida_bp.route("/open_pdf_tmp", methods=["GET"])
@login_required
def open_pdf_tmp():
    ruta = request.args.get("ruta", "")
    if not ruta:
        return jsonify({"error": "ruta requerida"}), 400

    ruta = _norm(unquote(ruta))

    # ✅ VALIDACIÓN CORRECTA PARA UNC (startswith)
    permitido = False
    for base in ALLOWED_BASES_TMP:
        base_n = _norm(base)
        if ruta.startswith(base_n + os.sep) or ruta == base_n:
            permitido = True
            break

    if not permitido:
        return jsonify({"error": "Ruta fuera de ubicación permitida"}), 403

    if not os.path.isfile(ruta):
        return jsonify({"error": "Archivo no existe"}), 404

    return send_file(ruta, mimetype="application/pdf", as_attachment=False)
