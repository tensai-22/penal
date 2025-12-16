# backend/modules/data_penal/data_penal.py
# -*- coding: utf-8 -*-

import re
import difflib
from io import BytesIO
from datetime import date, datetime, timedelta
from flask_cors import cross_origin  # si aún no lo tienes

from collections import defaultdict

import pandas as pd
from flask import (
    Blueprint,
    current_app,
    request,
    jsonify,
    session,
    make_response,
)

from backend.core import (
    # Auth/decorators
    login_required, role_required,
    # DB y utilidades
    get_db_connection, normalize_text, query_to_regexp,
    # PPU helpers
    parse_ppu, parse_query_ppu, generar_variantes_ppu,
    # Expedientes
    normalizar_expediente,
    # PDF helpers y formato
    extract_pdf_pages, format_legajo,
    # Validación y lookups
    validate_expediente_juzgado, get_fiscalia_departamento,
)

# Si este mapping ya existe en otro módulo y lo importas desde ahí, puedes borrar esto
# y hacer: from backend.algo import username_to_abogado
try:
    from backend.core import username_to_abogado  # si existe en core
except ImportError:
    username_to_abogado = {}  # fallback por si acaso

# ---------------------------------------------------------------------
#  Blueprint
# ---------------------------------------------------------------------

datapenal_bp = Blueprint("datapenal", __name__)


# ---------------------------------------------------------------------
#  /api/new_search
# ---------------------------------------------------------------------

@datapenal_bp.route("/new_search", methods=["GET"])
@login_required
def new_search():
    query = request.args.get("query", "").strip()
    search_field = request.args.get("search_field", "").strip()
    current_app.logger.info(
        "new_search: 'query'='%s', 'search_field'='%s'",
        query,
        search_field,
    )

    if not query:
        current_app.logger.warning("new_search: Parámetro 'query' vacío")
        return jsonify({"error": "El parámetro 'query' es obligatorio"}), 400

    if not search_field:
        current_app.logger.warning("new_search: Parámetro 'search_field' vacío")
        return jsonify({"error": "El parámetro 'search_field' es obligatorio"}), 400

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        if connection is None:
            current_app.logger.error("new_search: Error al conectar con la base de datos")
            return jsonify({"error": "Error al conectar con la base de datos"}), 500

        cursor = connection.cursor(dictionary=True)

        # Se definen los patrones para búsquedas en campos relacionados a expedientes
        exp_pattern_1 = r'(\d{5}-\d{4}-\d{1,2}-\d{4}[A-Z]?-([A-Z]{2})-[A-Z]{2}-\d{1,2})'
        exp_pattern_2 = r'(\d{5}-\d{4}-\d{1,2}-[A-Z\d]+-[A-Z]{2}-[A-Z]{2}-\d{1,2})'

        # Mapeo de columnas en cada tabla
        field_map_datapenal = {
            "legajo": "registro_ppu",
            "casoFiscalCompleto": "`nr de exp completo`",
            "casoJudicial": "origen",
            "denunciado": "denunciado",
        }
        field_map_consulta = {
            "legajo": "consulta_ppu",
            "casoFiscalCompleto": "`nr de exp completo`",
            "casoJudicial": "origen",
            "denunciado": "denunciado",
        }

        if search_field not in field_map_datapenal:
            current_app.logger.warning(
                "new_search: 'search_field' no soportado: %s", search_field
            )
            return jsonify(
                {"error": f"Campo de búsqueda no soportado: {search_field}"}
            ), 400

        # Rama para el campo "legajo"
        if search_field == "legajo":
            pattern = build_legajo_regexp(query)
            if not pattern:
                current_app.logger.warning(
                    "new_search: Formato inválido en 'query' para 'legajo'"
                )
                return jsonify(
                    {"error": "Formato de búsqueda inválido para registro PPU"}
                ), 400

            sql_datapenal = f"""
                SELECT
                    *,
                    LENGTH({field_map_datapenal["legajo"]}) AS match_length,
                    'datapenal' AS source
                FROM datapenal
                WHERE {field_map_datapenal["legajo"]} REGEXP %s
                ORDER BY match_length ASC
                LIMIT 10
            """
            params_datapenal = (pattern,)
            sql_consulta = f"""
                SELECT
                    *,
                    LENGTH({field_map_consulta["legajo"]}) AS match_length,
                    'consulta' AS source
                FROM consulta_ppupenal
                WHERE {field_map_consulta["legajo"]} REGEXP %s
                ORDER BY match_length ASC
                LIMIT 10
            """
            params_consulta = (pattern,)
            cursor.execute(sql_datapenal, params_datapenal)
            results_datapenal = cursor.fetchall()
            cursor.execute(sql_consulta, params_consulta)
            results_consulta = cursor.fetchall()
            combined_results = results_datapenal + results_consulta

        # Rama para el campo "casoFiscalCompleto"
        elif search_field == "casoFiscalCompleto":
            query_sin_prefijo = query.upper().replace("CASO", "").strip()
            partes = query_sin_prefijo.split("-")
            if len(partes) >= 3 and partes[1].isdigit() and partes[2].isdigit():
                query_invertida = f"{partes[2]}-{partes[1]}"
            elif len(partes) == 2 and partes[0].isdigit() and partes[1].isdigit():
                query_invertida = f"{partes[1]}-{partes[0]}"
            else:
                query_invertida = query_sin_prefijo

            sql_datapenal = f"""
                SELECT
                    *,
                    LENGTH({field_map_datapenal["casoFiscalCompleto"]}) AS match_length,
                    'datapenal' AS source
                FROM datapenal
                WHERE {field_map_datapenal["casoFiscalCompleto"]} LIKE %s
                   OR {field_map_datapenal["casoFiscalCompleto"]} LIKE %s
                   OR origen LIKE %s
                   OR origen LIKE %s
            """
            params_datapenal = (
                f"%{query_sin_prefijo}%",
                f"%{query_invertida}%",
                f"%{query_sin_prefijo}%",
                f"%{query_invertida}%",
            )
            cursor.execute(sql_datapenal, params_datapenal)
            results_datapenal = cursor.fetchall()

            sql_consulta = f"""
                SELECT
                    *,
                    LENGTH({field_map_consulta["casoFiscalCompleto"]}) AS match_length,
                    'consulta' AS source
                FROM consulta_ppupenal
                WHERE {field_map_consulta["casoFiscalCompleto"]} LIKE %s
                   OR {field_map_consulta["casoFiscalCompleto"]} LIKE %s
                   OR origen LIKE %s
                   OR origen LIKE %s
            """
            params_consulta = (
                f"%{query_sin_prefijo}%",
                f"%{query_invertida}%",
                f"%{query_sin_prefijo}%",
                f"%{query_invertida}%",
            )
            cursor.execute(sql_consulta, params_consulta)
            results_consulta = cursor.fetchall()
            candidatos = results_datapenal + results_consulta

            patron_exp_flexible = r'\b\d{6,10}\s*-\s*\d{4}\s*-\s*\d{1,4}(?:\s*-\s*\d+)?\b'

            def partial_numeric_match_normal(candidate_value, query_value):
                try:
                    if "-" not in query_value:
                        m = re.fullmatch(r'\s*(\d+)\s*-\s*(\d+)\s*', candidate_value)
                        if not m:
                            return False
                        cand_first, cand_second = m.groups()
                        q_norm = str(int(query_value))
                        return (
                            cand_first.startswith(q_norm)
                            or cand_second.startswith(q_norm)
                        )
                    else:
                        q_parts = query_value.split("-")
                        if len(q_parts) != 2:
                            return False
                        q_first = str(int(q_parts[0]))
                        q_second = q_parts[1].strip()
                        m = re.fullmatch(r'\s*(\d+)\s*-\s*(\d+)\s*', candidate_value)
                        if not m:
                            return False
                        cand_first, cand_second = m.groups()
                        return (cand_first == q_first) and cand_second.startswith(
                            q_second
                        )
                except Exception:
                    return False

            def partial_numeric_match_inverted(candidate_value, query_value):
                try:
                    if "-" not in query_value:
                        m = re.fullmatch(r'\s*(\d+)\s*-\s*(\d+)\s*', candidate_value)
                        if not m:
                            return False
                        cand_first, cand_second = m.groups()
                        q_norm = str(int(query_value))
                        return (
                            cand_first.startswith(q_norm)
                            or cand_second.startswith(q_norm)
                        )
                    else:
                        q_parts = query_value.split("-")
                        if len(q_parts) != 2:
                            return False
                        q_first = q_parts[0].strip()
                        q_second = str(int(q_parts[1]))
                        m = re.fullmatch(r'\s*(\d+)\s*-\s*(\d+)\s*', candidate_value)
                        if not m:
                            return False
                        cand_first, cand_second = m.groups()
                        return cand_first.startswith(q_first) and (
                            cand_second == q_second
                        )
                except Exception:
                    return False

            def coincide_caso(row):
                campo_origen = row.get("origen") or ""
                segmentos_origen = [seg.strip() for seg in campo_origen.split(",")]
                valid_origen = []
                for seg in segmentos_origen:
                    if "CASO" in seg.upper():
                        m = re.search(r"(?i)CASO\s*([\d-]+)", seg)
                        if m:
                            valid_origen.append(m.group(1).strip().upper())
                match_origen = any(
                    partial_numeric_match_normal(seg, query_sin_prefijo)
                    or partial_numeric_match_inverted(seg, query_invertida)
                    for seg in valid_origen
                )
                campo_exp = row.get("nr de exp completo") or ""
                segmentos_exp = [seg.strip() for seg in campo_exp.split(",")]
                valid_exp = []
                for seg in segmentos_exp:
                    if re.fullmatch(patron_exp_flexible, seg):
                        partes_seg = [p.strip() for p in seg.split("-")]
                        if len(partes_seg) >= 4:
                            relevante = f"{partes_seg[-3]}-{partes_seg[-2]}".upper()
                        elif len(partes_seg) == 3:
                            relevante = f"{partes_seg[-2]}-{partes_seg[-1]}".upper()
                        else:
                            continue
                        valid_exp.append(relevante)
                match_exp = any(
                    partial_numeric_match_normal(seg, query_sin_prefijo)
                    or partial_numeric_match_inverted(seg, query_invertida)
                    for seg in valid_exp
                )
                return match_origen or match_exp

            filtrados = [r for r in candidatos if coincide_caso(r)]
            resultados_unicos = []
            vistos = set()
            for r in filtrados:
                clave = r.get("id")
                if clave is None:
                    clave = str(r)
                if clave not in vistos:
                    vistos.add(clave)
                    resultados_unicos.append(r)
            combined_results = resultados_unicos[:10]
            return jsonify(combined_results), 200

        # Rama para el campo "casoJudicial"
        elif search_field == "casoJudicial":
            sql_datapenal = """
                SELECT
                    *,
                    LENGTH(origen) AS match_length,
                    'datapenal' AS source
                FROM datapenal
                WHERE origen REGEXP %s OR origen REGEXP %s
            """
            params_datapenal = (exp_pattern_1, exp_pattern_2)
            cursor.execute(sql_datapenal, params_datapenal)
            results_datapenal = cursor.fetchall()
            sql_consulta = """
                SELECT
                    *,
                    LENGTH(origen) AS match_length,
                    'consulta' AS source
                FROM consulta_ppupenal
                WHERE origen REGEXP %s OR origen REGEXP %s
            """
            params_consulta = (exp_pattern_1, exp_pattern_2)
            cursor.execute(sql_consulta, params_consulta)
            results_consulta = cursor.fetchall()
            candidatos = results_datapenal + results_consulta

            def coincide_caso_judicial(row):
                exp_full = (
                    (row.get("origen") or "")
                    .replace("Exp.", "")
                    .replace("CASO", "")
                    .strip()
                )
                exp_parts = exp_full.split("-")
                if not exp_parts:
                    return False
                query_clean = query.strip().upper()
                query_fragments = query_clean.split("-")
                if not query_fragments:
                    return False
                if query_clean.endswith("-"):
                    if query_fragments[0].isdigit():
                        query_first = query_fragments[0].zfill(5)
                    else:
                        return False
                    return exp_parts[0] == query_first
                exp_first = exp_parts[0]
                query_first = query_fragments[0]
                if query_first.startswith("0"):
                    if not exp_first.upper().startswith(query_first):
                        return False
                else:
                    if not exp_first.lstrip("0").startswith(query_first):
                        return False
                for frag in query_fragments[1:]:
                    if not any(frag in part for part in exp_parts[1:]):
                        return False
                return True

            filtrados = [r for r in candidatos if coincide_caso_judicial(r)]
            combined_results = filtrados[:10]

        # Rama para el campo "denunciado"
        elif search_field == "denunciado":
            # Filtro preliminar: limitar la cantidad de registros solicitados a la base de datos.
            preliminary_query = f"%{query.upper()}%"
            sql_datapenal = """
                SELECT
                    *,
                    'datapenal' AS source
                FROM datapenal
                WHERE denunciado IS NOT NULL AND UPPER(denunciado) LIKE %s
                LIMIT 100
            """
            cursor.execute(sql_datapenal, (preliminary_query,))
            results_datapenal = cursor.fetchall()

            sql_consulta = """
                SELECT
                    *,
                    'consulta' AS source
                FROM consulta_ppupenal
                WHERE denunciado IS NOT NULL AND UPPER(denunciado) LIKE %s
                LIMIT 100
            """
            cursor.execute(sql_consulta, (preliminary_query,))
            results_consulta = cursor.fetchall()

            candidates = results_datapenal + results_consulta

            # Se intenta importar una versión optimizada de Levenshtein (rapidfuzz).
            try:
                from rapidfuzz.distance.Levenshtein import (
                    distance as levenshtein_distance,
                )
            except ImportError:
                # Si no está disponible, se utiliza la implementación propia en Python.
                def levenshtein_distance(s, t):
                    if s == t:
                        return 0
                    if len(s) == 0:
                        return len(t)
                    if len(t) == 0:
                        return len(s)
                    v0 = list(range(len(t) + 1))
                    for i in range(1, len(s) + 1):
                        v1 = [i] + [0] * len(t)
                        for j in range(1, len(t) + 1):
                            cost = 0 if s[i - 1] == t[j - 1] else 1
                            v1[j] = min(
                                v1[j - 1] + 1, v0[j] + 1, v0[j - 1] + cost
                            )
                        v0 = v1
                    return v0[len(t)]

            def _normalize(text):
                text = (text or "").upper().strip()
                replacements = {
                    "V": "B",
                    "Z": "S",
                    "Y": "I",
                }
                for old, new in replacements.items():
                    text = text.replace(old, new)
                return text

            normalized_query = _normalize(query)

            filtered = []
            for row in candidates:
                name = row.get("denunciado")
                if name:
                    # Se separa el campo en tokens, usando la coma como delimitador.
                    tokens = [token.strip() for token in name.split(",")]
                    min_distance = float("inf")
                    for token in tokens:
                        norm_token = _normalize(token)
                        # Se verifica si el término de búsqueda ya está contenido (coincidencia parcial).
                        if normalized_query in norm_token:
                            dist = 0
                        else:
                            dist = levenshtein_distance(
                                normalized_query, norm_token
                            )
                        if dist < min_distance:
                            min_distance = dist
                        if min_distance == 0:
                            break  # No es necesario seguir evaluando si se encontró una coincidencia exacta parcial.
                    threshold = 2
                    if min_distance <= threshold:
                        row["levenshtein"] = min_distance
                        filtered.append(row)

            filtered.sort(key=lambda x: x["levenshtein"])
            combined_results = filtered[:10]

        # Rama genérica para otros campos
        else:
            partial_pattern = f"%{query}%"
            where_clauses_datapenal = [
                f"{field_map_datapenal[search_field]} LIKE %s"
            ]
            params_datapenal_list = [partial_pattern]
            if re.search(exp_pattern_1, query) or re.search(exp_pattern_2, query):
                normalized = normalizar_expediente(query)
                where_clauses_datapenal.append(
                    f"{field_map_datapenal[search_field]} LIKE %s"
                )
                params_datapenal_list.append(f"%{normalized}%")
            sql_datapenal = f"""
                SELECT
                    *,
                    LENGTH({field_map_datapenal["search_field"]}) AS match_length,
                    'datapenal' AS source
                FROM datapenal
                WHERE {' OR '.join(where_clauses_datapenal)}
                ORDER BY match_length ASC
                LIMIT 10
            """
            params_datapenal = tuple(params_datapenal_list)
            cursor.execute(sql_datapenal, params_datapenal)
            results_datapenal = cursor.fetchall()
            where_clauses_consulta = [
                f"{field_map_consulta[search_field]} LIKE %s"
            ]
            params_consulta_list = [partial_pattern]
            if re.search(exp_pattern_1, query) or re.search(exp_pattern_2, query):
                normalized = normalizar_expediente(query)
                where_clauses_consulta.append(
                    f"{field_map_consulta[search_field]} LIKE %s"
                )
                params_consulta_list.append(f"%{normalized}%")
            sql_consulta = f"""
                SELECT
                    *,
                    LENGTH({field_map_consulta["search_field"]}) AS match_length,
                    'consulta' AS source
                FROM consulta_ppupenal
                WHERE {' OR '.join(where_clauses_consulta)}
                ORDER BY match_length ASC
                LIMIT 10
            """
            params_consulta = tuple(params_consulta_list)
            cursor.execute(sql_consulta, params_consulta)
            results_consulta = cursor.fetchall()
            combined_results = results_datapenal + results_consulta

        return jsonify(combined_results), 200

    except Exception as e:
        current_app.logger.error("Error en new_search: %s", e, exc_info=True)
        return jsonify({"error": "Error interno del servidor"}), 500

    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and hasattr(connection, "is_connected"):
            if connection.is_connected():
                connection.close()


# ---------------------------------------------------------------------
#  /api/years
# ---------------------------------------------------------------------

@datapenal_bp.route("/years", methods=["GET"])
@login_required
def get_years():
    """
    Devuelve la lista de años únicos extraídos de registro_ppu,
    ordenados de mayor a menor.
    """
    current_app.logger.debug("→ Entrando a /api/years")  # <--- LOG

    connection = get_db_connection()
    if connection is None:
        current_app.logger.error("get_years: No se pudo conectar a la base de datos")
        return jsonify({"error": "Error al conectar con la base de datos"}), 500

    cursor = None
    try:
        cursor = connection.cursor(dictionary=True)
        sql = """
            SELECT DISTINCT
              CAST(
                SUBSTRING_INDEX(
                  SUBSTRING_INDEX(registro_ppu, '-', 3),
                  '-',
                  -1
                ) AS UNSIGNED
              ) AS year
            FROM datapenal
            WHERE registro_ppu IS NOT NULL AND registro_ppu != ''
            ORDER BY year DESC
        """
        current_app.logger.debug("get_years: Ejecutando SQL:\n%s", sql)  # <--- LOG
        cursor.execute(sql)
        rows = cursor.fetchall()
        current_app.logger.debug(
            "get_years: Filas obtenidas: %d", len(rows)
        )  # <--- LOG

        años = [str(r["year"]) for r in rows if r.get("year") is not None]
        current_app.logger.debug(
            "get_years: Lista de años resultante → %s", años
        )  # <--- LOG
        return jsonify({"years": años})
    except Exception as e:
        current_app.logger.error("Error en /api/years: %s", e, exc_info=True)
        return jsonify({"error": "Error al obtener años"}), 500
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


#from datetime import date, datetime, timedelta
import re

from flask import Blueprint, jsonify, session, request, current_app
from flask_cors import cross_origin

# Asumo que ya existen en tu módulo:
# - datapenal_bp
# - login_required
# - get_db_connection()
# - username_to_abogado

def _safe_bool(v: str, default: bool = True) -> bool:
    if v is None:
        return default
    s = str(v).strip().lower()
    if s in ("1", "true", "t", "yes", "y", "si", "sí"):
        return True
    if s in ("0", "false", "f", "no", "n"):
        return False
    return default

def _first_day_of_month(d: date) -> date:
    return date(d.year, d.month, 1)

def _first_day_previous_month(d: date) -> date:
    if d.month == 1:
        return date(d.year - 1, 12, 1)
    return date(d.year, d.month - 1, 1)

def _parse_iso_date(s: str) -> date:
    # espera YYYY-MM-DD
    return datetime.strptime(s, "%Y-%m-%d").date()

def _norm(val):
    if val in (None, ''):
        return ''
    if isinstance(val, datetime):
        val = val.date()
    if isinstance(val, date):
        return val.isoformat()
    return str(val)

def _parse_registro_ppu(reg: str, fallback_year: int = -1):
    """
    Devuelve (kind, year, num, suffix, raw_norm)
      kind: 'D' (denuncia) | 'L' (legajo) | 'X' (desconocido)
    """
    raw = (reg or "").strip().upper()

    # DENUNCIA: D-####-YYYY(-A)?
    m = re.match(r"^D-(\d{1,4})-(\d{4})(?:-([A-Z]))?$", raw)
    if m:
        num = int(m.group(1))
        yr = int(m.group(2))
        sfx = m.group(3) or ""
        return ("D", yr, num, sfx, raw)

    # LEGAJO tipo L. ####-YYYY(-A)? (con o sin punto / espacios)
    m = re.match(r"^L\.?\s*(\d{1,4})-(\d{4})(?:-([A-Z]))?$", raw)
    if m:
        num = int(m.group(1))
        yr = int(m.group(2))
        sfx = m.group(3) or ""
        return ("L", yr, num, sfx, raw)

    # LEGAJO histórico: LEG-####-YYYY(-A)? o LEG-####-A (sin año explícito)
    m = re.match(r"^LEG-(\d{1,4})(?:-(\d{4}))?(?:-([A-Z]))?$", raw)
    if m:
        num = int(m.group(1))
        yr = int(m.group(2)) if m.group(2) else (fallback_year if fallback_year is not None else -1)
        sfx = m.group(3) or ""
        return ("L", yr, num, sfx, raw)

    return ("X", fallback_year if fallback_year is not None else -1, -1, "", raw)

def _suffix_key(sfx: str):
    # '' primero, luego A, B, C...
    if not sfx:
        return -1
    return ord(sfx[0]) - ord('A')

def _sort_and_interleave(rows, order_ppu: str = "desc", interleave: bool = True):
    """
    Orden por PPU (year, num, suffix) y si interleave=True:
      por cada año: D, L, D, L...
    """
    desc = (order_ppu or "desc").strip().lower() != "asc"

    enriched = []
    for idx, r in enumerate(rows):
        # fallback_year: si no puede extraer año del registro_ppu, usa fecha_ingreso (si existe)
        fy = -1
        try:
            fi = r.get("fecha_ingreso") or r.get("FECHA_INGRESO") or ""
            # puede venir como date/datetime/string
            fi_norm = _norm(fi)
            if fi_norm:
                fy = int(fi_norm[:4])
        except Exception:
            fy = -1

        kind, yr, num, sfx, raw = _parse_registro_ppu(r.get("registro_ppu") or "", fallback_year=fy)

        # rank para que D y L tengan prioridad sobre X
        kind_rank = 0 if kind == "D" else (1 if kind == "L" else 2)

        enriched.append({
            "row": r,
            "idx": idx,
            "kind": kind,
            "year": yr,
            "num": num,
            "sfx": sfx,
            "kind_rank": kind_rank,
            "sfx_key": _suffix_key(sfx),
            "raw": raw
        })

    # Orden base dentro de cada lista (D y L por separado si interleave)
    def sort_key(e):
        # year, num, suffix
        # desc: year desc, num desc, suffix desc
        if desc:
            return (-e["year"], e["kind_rank"], -e["num"], -e["sfx_key"], e["raw"], e["idx"])
        return (e["year"], e["kind_rank"], e["num"], e["sfx_key"], e["raw"], e["idx"])

    # Agrupar por año
    by_year = {}
    for e in enriched:
        by_year.setdefault(e["year"], []).append(e)

    years = sorted(by_year.keys(), reverse=desc)

    out = []
    for yr in years:
        bucket = by_year[yr]

        if not interleave:
            bucket_sorted = sorted(bucket, key=sort_key)
            out.extend([e["row"] for e in bucket_sorted])
            continue

        den = [e for e in bucket if e["kind"] == "D"]
        leg = [e for e in bucket if e["kind"] == "L"]
        other = [e for e in bucket if e["kind"] not in ("D", "L")]

        den = sorted(den, key=sort_key)
        leg = sorted(leg, key=sort_key)
        other = sorted(other, key=sort_key)

        # Intercalado: empieza con denuncia (como pediste)
        i = j = 0
        take_den = True
        while i < len(den) or j < len(leg):
            if take_den:
                if i < len(den):
                    out.append(den[i]["row"]); i += 1
                elif j < len(leg):
                    out.append(leg[j]["row"]); j += 1
                take_den = False
            else:
                if j < len(leg):
                    out.append(leg[j]["row"]); j += 1
                elif i < len(den):
                    out.append(den[i]["row"]); i += 1
                take_den = True

        # Los desconocidos al final del año
        out.extend([e["row"] for e in other])

    return out

# ---------------------------------------------------------------------
#  /api/datapenal/buscar  (versión mejorada: rango + orden PPU + intercalado)
# ---------------------------------------------------------------------
@datapenal_bp.route("/buscar", methods=["GET"])
@login_required
@cross_origin(origins=["http://10.50.5.49:3000"], supports_credentials=True)
def buscar():
    """
    Búsqueda en `datapenal`:

    - Siempre filtra por rango de fechas [from,to] usando `fecha_ingreso`.
      * Default: desde 1er día del mes anterior hasta hoy (mes actual + anterior).
      * Si el frontend quiere "global": from=1900-01-01&to=2100-12-31 (igual que Civil).

    - q/query: filtra por texto, PERO ya no ignora el rango (consistente con Civil).

    Orden:
    - Por defecto: ordena por patrón/PPU (year+num) y permite intercalado por año:
        D, L, D, L...
      Params:
        order_ppu=desc|asc   (default desc)
        interleave=true|false (default true)

    Mantiene:
    - abogado (según rol y ?abogado=)
    - mostrar_archivados (etiqueta != 'ARCHIVO')
    - paginación: page, limit
    """

    hoy = date.today()
    default_from = _first_day_previous_month(hoy)
    default_to = hoy

    # ---- Parámetros ----
    f_ini_raw = (request.args.get("from", "") or "").strip()
    f_fin_raw = (request.args.get("to", "") or "").strip()

    # compat: q o query
    q_raw = (request.args.get("q", "") or "").strip()
    if not q_raw:
        q_raw = (request.args.get("query", "") or "").strip()

    # Orden PPU
    order_ppu = (request.args.get("order_ppu", "") or "").strip().lower() or "desc"
    interleave = _safe_bool(request.args.get("interleave", "true"), default=True)

    # Paginación
    try:
        page = int(request.args.get("page", 1))
    except ValueError:
        page = 1
    page = max(page, 1)

    try:
        limit = int(request.args.get("limit", 200))
    except ValueError:
        limit = 200
    limit = max(1, min(limit, 10000))
    offset = (page - 1) * limit

    # Otros filtros
    mostrar_archivados = _safe_bool(request.args.get("mostrar_archivados", "true"), default=True)

    user_role = (session.get("role") or "").strip().lower()
    current_user = (session.get("username") or "").strip()

    # ✅ Lee el mapa desde app.config (evita import circular)
    map_user_to_abg = current_app.config.get("USERNAME_TO_ABOGADO", {}) or {}

    # Filtro abogado según rol
    if user_role == "user":
        # ✅ normaliza username para que calce con claves "imartinez", "jpolom", etc.
        key = current_user.strip().lower()
        abogado_filter = (map_user_to_abg.get(key) or "").strip().upper()

        # ✅ BLINDAJE: si es user y no tiene mapeo, NO debe ver todo
        if not abogado_filter:
            return jsonify({
                "error": f"Usuario '{current_user}' no tiene abogado asignado en username_to_abogado."
            }), 403

    else:
        raw_abogado = (request.args.get("abogado", "") or "").strip().upper()
        if ";" in raw_abogado:
            abogado_filter = raw_abogado.split(";")[-1].strip().upper()
        else:
            abogado_filter = raw_abogado


    # ---- Default de fechas (mes actual + anterior) ----
    if not f_ini_raw:
        f_ini_raw = default_from.isoformat()
    if not f_fin_raw:
        f_fin_raw = default_to.isoformat()

    # Validación fechas
    try:
        f_ini_dt = _parse_iso_date(f_ini_raw)
        f_fin_dt = _parse_iso_date(f_fin_raw)
    except Exception:
        return jsonify({"error": "Formato de fecha inválido. Usa YYYY-MM-DD en from/to."}), 400

    if f_fin_dt < f_ini_dt:
        return jsonify({"error": "Rango inválido: 'to' no puede ser menor que 'from'."}), 400

    current_app.logger.debug(
        "→ /api/datapenal/buscar params → from=%s, to=%s, q='%s', page=%d, limit=%d, "
        "abogado='%s', mostrar_archivados=%s, order_ppu=%s, interleave=%s, role=%s, user=%s",
        f_ini_raw, f_fin_raw, q_raw, page, limit,
        abogado_filter, mostrar_archivados, order_ppu, interleave,
        user_role, current_user,
    )

    # ---- Conexión a BD ----
    connection = get_db_connection()
    if connection is None:
        current_app.logger.error("buscar: No se pudo conectar a la base de datos")
        return jsonify({"error": "Error al conectar con la base de datos"}), 500

    cursor = None
    try:
        cursor = connection.cursor(dictionary=True)

        conditions = []
        params = []

        # 1) SIEMPRE aplicamos rango de fechas (consistente con Civil)
        conditions.append("d.fecha_ingreso BETWEEN %s AND %s")
        params.extend([f_ini_raw, f_fin_raw])

        # 2) Texto de búsqueda (si existe) dentro del rango
        if q_raw:
            q_like = f"%{q_raw}%"
            cols = [
                "abogado",
                "denunciado",
                "origen",
                "delito",
                "departamento",
                "fiscalia",
                "informe_juridico",
                "item",
                "e_situacional",
                "registro_ppu",
                "juzgado",
                "etiqueta",
            ]
            subconds = []
            for c in cols:
                subconds.append(
                    f"CONVERT(d.{c} USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE %s"
                )
                params.append(q_like)
            conditions.append("(" + " OR ".join(subconds) + ")")

        # 3) Excluir archivados si corresponde
        if not mostrar_archivados:
            conditions.append("(d.etiqueta IS NULL OR d.etiqueta <> %s)")
            params.append("ARCHIVO")

        # 4) Filtro abogado (usando parte final tras ';')
        if abogado_filter:
            conditions.append("UPPER(TRIM(SUBSTRING_INDEX(d.abogado, ';', -1))) = %s")
            params.append(abogado_filter)

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        # Traemos todo del rango para poder ordenar/intercalar correctamente
        sql = f"""
            SELECT d.*
            FROM datapenal d
            {where_clause}
        """

        current_app.logger.debug("buscar SQL:\n%s", sql)
        current_app.logger.debug("buscar params: %s", params)

        cursor.execute(sql, params)
        rows = cursor.fetchall()

        current_app.logger.debug("buscar: filas obtenidas desde BD (antes de ordenar/paginar): %d", len(rows))

        # Limpieza abogado + Nones
        for row in rows:
            abogado = row.get("abogado") or ""
            if ";" in abogado:
                row["abogado"] = abogado.split(";")[-1].strip()
            for k, v in list(row.items()):
                if v is None:
                    row[k] = ""

        # Orden por PPU + intercalado por año (D/L)
        rows_sorted = _sort_and_interleave(rows, order_ppu=order_ppu, interleave=interleave)

        total_records = len(rows_sorted)
        total_pages = (total_records + limit - 1) // limit
        data_page = rows_sorted[offset: offset + limit]

        respuesta = {
            "data": data_page,
            "page": page,
            "total_pages": total_pages,
            "total_records": total_records,
            "from": f_ini_raw,
            "to": f_fin_raw,
            "query": q_raw,
            "used_year": None,  # lo mantengo para no romper nada
            "order_ppu": order_ppu,
            "interleave": interleave,
        }
        return jsonify(respuesta), 200

    except Exception as e:
        current_app.logger.error("Error en /api/datapenal/buscar: %s", e, exc_info=True)
        return jsonify({"error": "Error al realizar la búsqueda"}), 500

    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and hasattr(connection, "close"):
            connection.close()




# ---------------------------------------------------------------------
#  /api/exportar_excel
#  Default: exporta TODO (sin filtrar por fecha_ingreso)
#  Opcional: si el front manda from & to => filtra por fecha_ingreso
# ---------------------------------------------------------------------

@datapenal_bp.route("/exportar_excel", methods=["GET"])
@login_required
def exportar_excel():
    """
    Exporta registros de datapenal a Excel con:
      - Limpieza de 'abogado' (solo parte tras ';')
      - Filtros:
          * (Opcional) from/to (fecha_ingreso)  -> SOLO si llegan ambos
          * búsqueda global (query/q)
          * filtro por abogado (según rol)
          * mostrar_archivados
          * tipo (ALL | LEGAJO | DENUNCIA)
          * (Compat) ppu_inicio/ppu_fin opcional como filtro extra
      - Métricas por año y totales
      - Formato avanzado: tablas de Excel, centrado, anchos inteligentes, filas prohibidas en rojo
      - ✅ Orden columnas: registro_ppu (1ra fija). fecha_ingreso NO es fija.
      - ✅ TODAS las columnas tipo fecha -> Excel Date real + formato dd-mm-aaaa (filtrable)
      - ✅ Ajuste “inteligente”: centrado y simétrico, pero sin reventar por textos largos (p.ej. 1500 palabras)
      - ✅ excluye columnas: item, fecha_e_situacional, last_modified
      - ✅ Métricas: gráfico profesional (Totales por abogado) + mini línea (Total por año)
      - ✅ NUEVO: SOLO si rango de fechas activo y NO histórico => hoja "CONSOLIDADO" con TODO ordenado por registro_ppu
    """

    # ── Params (compat con tu buildBuscarParams del front) ──
    f_ini_raw = (request.args.get("from", "") or "").strip()
    f_fin_raw = (request.args.get("to", "") or "").strip()

    # compat: query o q
    query = (request.args.get("query", "") or "").strip()
    if not query:
        query = (request.args.get("q", "") or "").strip()

    mostrar_archivados = (request.args.get("mostrar_archivados", "true").lower() == "true")
    tipo = (request.args.get("tipo", "ALL") or "ALL").strip().upper()

    # Compat opcional: rango PPU
    ppu_inicio = (request.args.get("ppu_inicio", "") or "").strip()
    ppu_fin = (request.args.get("ppu_fin", "") or "").strip()

    # ── Rol/usuario ──
    user_role = (session.get("role") or "").strip().lower()
    current_user = (session.get("username") or "").strip()

    # ✅ Lee el mapa desde app.config
    map_user_to_abg = current_app.config.get("USERNAME_TO_ABOGADO", {}) or {}

    # ── Filtro abogado según rol ──
    if user_role == "user":
        key = current_user.strip().lower()
        abogado_filter = (map_user_to_abg.get(key) or "").strip().upper()

        # ✅ BLINDAJE: user sin mapeo NO exporta todo
        if not abogado_filter:
            return jsonify({
                "error": f"Usuario '{current_user}' no tiene abogado asignado en username_to_abogado."
            }), 403
    else:
        raw_abogado = (request.args.get("abogado", "") or "").strip().upper()
        if ";" in raw_abogado:
            abogado_filter = raw_abogado.split(";")[-1].strip().upper()
        else:
            abogado_filter = raw_abogado

    # ── Fecha: por defecto NO se usa (exporta TODO) ──
    use_date_filter = bool(f_ini_raw and f_fin_raw)
    f_ini_dt = None
    f_fin_dt = None

    if use_date_filter:
        try:
            f_ini_dt = _parse_iso_date(f_ini_raw)  # debe devolver date
            f_fin_dt = _parse_iso_date(f_fin_raw)
        except Exception:
            return jsonify({"error": "Formato de fecha inválido. Usa YYYY-MM-DD en from/to."}), 400

        if f_fin_raw < f_ini_raw:
            return jsonify({"error": "Rango inválido: 'to' no puede ser menor que 'from'."}), 400

    # ✅ "Histórico" si el TO es anterior al 01-01 del año actual
    today = datetime.now().date()
    start_of_year = date(today.year, 1, 1)
    is_historico = bool(use_date_filter and f_fin_dt and f_fin_dt < start_of_year)

    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Error al conectar con la base de datos"}), 500

    cursor = None
    try:
        cursor = conn.cursor(dictionary=True)

        # ───────── WHERE dinámico ─────────
        conds, params = [], []

        # 1) Fecha SOLO si llegan from/to
        if use_date_filter:
            conds.append("fecha_ingreso BETWEEN %s AND %s")
            params.extend([f_ini_raw, f_fin_raw])

        # 2) Archivados
        if not mostrar_archivados:
            conds.append("(etiqueta IS NULL OR etiqueta <> %s)")
            params.append("ARCHIVO")

        # 3) Abogado
        if abogado_filter:
            conds.append("UPPER(TRIM(SUBSTRING_INDEX(abogado,';',-1))) = %s")
            params.append(abogado_filter)

        # 4) Búsqueda global
        if query:
            cols = [
                "abogado",
                "denunciado",
                "origen",
                "delito",
                "departamento",
                "fiscalia",
                "informe_juridico",
                "item",
                "e_situacional",
                "registro_ppu",
                "juzgado",
                "etiqueta",
            ]
            rx = query_to_regexp(query)
            sub = []
            for c in cols:
                sub.append(f"{c} REGEXP %s")
                params.append(rx)
            conds.append("(" + " OR ".join(sub) + ")")

        where = "WHERE " + " AND ".join(conds) if conds else ""

        cursor.execute(f"SELECT * FROM datapenal {where}", params)
        rows = cursor.fetchall()

        # Orden inicial
        rows.sort(key=lambda r: parse_ppu(r.get("registro_ppu")))

        # ── Filtro por rango PPU (SOLO si llega) ──
        if ppu_inicio or ppu_fin:
            start_t = parse_ppu(ppu_inicio) if ppu_inicio else (0, 0, 0, "")
            end_t = parse_ppu(ppu_fin) if ppu_fin else (999999, 9999, 9999, "ZZZZ")
            y_min, y_max = start_t[1], end_t[1]

            rows = [
                r for r in rows
                if y_min <= parse_ppu(r.get("registro_ppu"))[1] <= y_max
                and start_t <= parse_ppu(r.get("registro_ppu")) <= end_t
            ]

        final = rows

        # Tipo: LEGAJO / DENUNCIA
        if tipo == "LEGAJO":
            final = [
                r for r in final
                if not str(r.get("registro_ppu", "")).upper().startswith("D-")
            ]
        elif tipo == "DENUNCIA":
            final = [
                r for r in final
                if str(r.get("registro_ppu", "")).upper().startswith("D-")
            ]

        banned_kw = ["ACUM", "ACUMULADO", "SUSPENDIDO", "ANULADO", "DERIVADO", "DUPLICADO"]
        for r in final:
            ab = (r.get("abogado") or "").split(";")[-1].strip().upper()
            r["abogado"] = ab
            r["_prohibida"] = any(kw in ab for kw in banned_kw)

        # ── Agrupar por año de PPU ──
        data_by_year = defaultdict(list)
        for r in final:
            yr = parse_ppu(r.get("registro_ppu"))[1]
            data_by_year[yr].append(r)
        years = sorted(data_by_year.keys(), reverse=True)

        allowed = [
            "CUBA", "AGUILAR", "POLO", "MAU", "ASCURRA", "MARTINEZ",
            "FLORES", "PALACIOS", "POMAR", "ROJAS", "FRISANCHO", "NAVARRO",
        ]

        keys = [abogado_filter] if abogado_filter else (allowed + ["OTROS"])
        counts = {key: {str(y): 0 for y in years} | {"Total": 0} for key in keys}

        for r in final:
            if r.get("_prohibida"):
                continue
            ab = r.get("abogado", "")
            if abogado_filter and ab != abogado_filter:
                continue

            key = (
                ab if abogado_filter else
                (difflib.get_close_matches(ab, allowed, n=1, cutoff=0.8) or ["OTROS"])[0]
            )
            yr = str(parse_ppu(r.get("registro_ppu"))[1])
            counts.setdefault(key, {str(y): 0 for y in years} | {"Total": 0})
            if yr in counts[key]:
                counts[key][yr] += 1
            counts[key]["Total"] += 1

        metrics = []
        for key in keys:
            c = counts.get(key, {str(y): 0 for y in years} | {"Total": 0})
            row = {"Abogado": key}
            for y in years:
                row[str(y)] = c.get(str(y), 0)
            row["Total"] = c.get("Total", 0)
            metrics.append(row)

        # ── Excel ──
        output = BytesIO()
        fecha_cod = datetime.now().strftime("%d-%m-%Y %Hh%Mm")
        display = abogado_filter or "GENERAL"

        if use_date_filter:
            filename = f"Base de datos (from {f_ini_raw} to {f_fin_raw}) - {display} a la fecha de {fecha_cod}.xlsx"
        else:
            filename = f"Base de datos (GLOBAL) - {display} a la fecha de {fecha_cod}.xlsx"

        # Columnas a excluir SIEMPRE
        EXCLUDE_COLS = {"item", "fecha_e_situacional", "last_modified", "_prohibida", "id"}

        def _to_excel_date(v):
            if v is None or v == "":
                return None
            if isinstance(v, datetime):
                return v.date()
            if isinstance(v, date):
                return v
            s = str(v).strip()
            if not s:
                return None
            try:
                s2 = s.replace("Z", "")
                if "T" in s2:
                    s2 = s2.replace("T", " ")
                if " " in s2:
                    return datetime.fromisoformat(s2).date()
                return date.fromisoformat(s2)
            except Exception:
                return None

        def _looks_like_date_key(k: str) -> bool:
            kk = (k or "").strip().lower()
            if not kk:
                return False
            tokens = [
                "fecha", "fch", "date", "ingreso", "venc", "vence", "notifi", "audien",
                "plazo", "deriv", "recep", "remis", "emision", "cita", "acto",
            ]
            return any(t in kk for t in tokens)

        def _coerce_date_fields(rr: dict) -> dict:
            for k in list(rr.keys()):
                if _looks_like_date_key(k):
                    rr[k] = _to_excel_date(rr.get(k))
            return rr

        def _reorder_and_clean_for_excel(records):
            out = []
            for r in records:
                rr = dict(r)

                for k in list(rr.keys()):
                    if k in EXCLUDE_COLS:
                        rr.pop(k, None)

                rr = _coerce_date_fields(rr)

                ordered = {}
                if "registro_ppu" in rr:
                    ordered["registro_ppu"] = rr.get("registro_ppu")
                for k, v in rr.items():
                    if k != "registro_ppu":
                        ordered[k] = v

                out.append(ordered)
            return out

        def _safe_len(v) -> int:
            try:
                return len(str(v))
            except Exception:
                return 0

        def _pick_wrap_columns(df: pd.DataFrame):
            wrap_cols = set()
            if df is None or df.empty:
                return wrap_cols

            for c in df.columns:
                if str(c) == "registro_ppu":
                    continue

                max_len = 0
                for v in df[c].head(300).tolist():
                    L = _safe_len(v)
                    if L > max_len:
                        max_len = L
                    if max_len >= 220:
                        break

                if max_len >= 220:
                    wrap_cols.add(c)

            return wrap_cols

        def _date_to_datetime(v):
            if v is None or v == "":
                return None
            if isinstance(v, datetime):
                return v
            if isinstance(v, date):
                return datetime(v.year, v.month, v.day)
            try:
                s = str(v).strip().replace("Z", "")
                if "T" in s:
                    s = s.replace("T", " ")
                if " " in s:
                    return datetime.fromisoformat(s)
                d = date.fromisoformat(s)
                return datetime(d.year, d.month, d.day)
            except Exception:
                return None

        def _rewrite_date_columns_as_excel_dates(ws, df, startrow, startcol, date_cols, date_fmt):
            if df is None or df.empty or not date_cols:
                return

            for i in range(len(df)):
                excel_row = startrow + 1 + i  # +1 por header
                for col_name in date_cols:
                    if col_name not in df.columns:
                        continue
                    j = df.columns.get_loc(col_name)
                    excel_col = startcol + j
                    val = df.iat[i, j]
                    if pd.isna(val) or val is None or val == "":
                        continue
                    dt = _date_to_datetime(val)
                    if dt is None:
                        continue
                    ws.write_datetime(excel_row, excel_col, dt, date_fmt)

        with pd.ExcelWriter(output, engine="xlsxwriter", datetime_format="dd-mm-yyyy") as writer:
            wb = writer.book

            title_fmt = wb.add_format({
                "align": "center",
                "valign": "vcenter",
                "bold": True,
                "font_size": 14,
            })

            cell_fmt = wb.add_format({"align": "center", "valign": "vcenter", "text_wrap": False})
            date_fmt = wb.add_format({"num_format": "dd-mm-yyyy", "align": "center", "valign": "vcenter"})
            wrap_fmt = wb.add_format({"align": "center", "valign": "top", "text_wrap": True})

            red_fmt = wb.add_format({"bg_color": "#FFC7CE", "font_color": "#9C0006"})
            red_date_fmt = wb.add_format({
                "bg_color": "#FFC7CE",
                "font_color": "#9C0006",
                "num_format": "dd-mm-yyyy",
                "align": "center",
                "valign": "vcenter",
            })
            red_wrap_fmt = wb.add_format({
                "bg_color": "#FFC7CE",
                "font_color": "#9C0006",
                "align": "center",
                "valign": "top",
                "text_wrap": True,
            })

            # -----------------------------
            # Helper para escribir una hoja de datos con TODO el formato
            # -----------------------------
            def _write_data_sheet(sheet_name: str, ordered_rows: list, sheet_title: str):
                cleaned = _reorder_and_clean_for_excel(ordered_rows)
                df = pd.DataFrame(cleaned)

                df.to_excel(writer, sheet_name, startrow=1, startcol=1, index=False, header=True)
                wsx = writer.sheets[sheet_name]

                wsx.merge_range(
                    0, 1, 0, 1 + max(1, df.shape[1]) - 1,
                    sheet_title,
                    title_fmt,
                )

                nr2, nc2 = len(df), len(df.columns)
                if nc2 <= 0:
                    return

                wsx.add_table(
                    1, 1, 1 + nr2, 1 + nc2 - 1,
                    {"columns": [{"header": h} for h in df.columns], "style": "Table Style Medium 9"},
                )

                # Freeze: header + 1ra columna fija (registro_ppu)
                wsx.freeze_panes(2, 2)

                wrap_cols = _pick_wrap_columns(df)

                # widths inteligentes con caps
                col_widths = {}
                for col in df.columns:
                    if str(col) == "registro_ppu":
                        col_widths[col] = 20
                        continue

                    base = max(10, min(28, len(str(col)) + 2))

                    max_seen = 0
                    for v in df[col].head(250).tolist():
                        L = _safe_len(v)
                        if L > max_seen:
                            max_seen = L
                        if max_seen >= 120:
                            break

                    if _looks_like_date_key(str(col)):
                        col_widths[col] = 14
                    else:
                        if str(col) in wrap_cols:
                            col_widths[col] = min(40, max(base, 22))
                        else:
                            col_widths[col] = min(28, max(base, min(22, max_seen + 2)))

                # apply columns fmt
                for j, col in enumerate(df.columns):
                    excel_col = 1 + j

                    if str(col) == "registro_ppu":
                        wsx.set_column(excel_col, excel_col, col_widths[col], cell_fmt)
                        continue

                    if _looks_like_date_key(str(col)):
                        wsx.set_column(excel_col, excel_col, col_widths[col], date_fmt)
                        continue

                    if str(col) in wrap_cols:
                        wsx.set_column(excel_col, excel_col, col_widths[col], wrap_fmt)
                    else:
                        wsx.set_column(excel_col, excel_col, col_widths[col], cell_fmt)

                # fuerza fechas como Date real Excel
                date_cols = [c for c in df.columns if _looks_like_date_key(str(c))]
                _rewrite_date_columns_as_excel_dates(
                    wsx, df,
                    startrow=1, startcol=1,
                    date_cols=date_cols,
                    date_fmt=date_fmt,
                )

                # row heights con cap
                for idx in range(nr2):
                    row_vals = df.iloc[idx].to_dict()
                    max_len_row = 0
                    for c in wrap_cols:
                        if c in row_vals:
                            max_len_row = max(max_len_row, _safe_len(row_vals.get(c)))
                            if max_len_row >= 1200:
                                break

                    if max_len_row >= 220:
                        scaled = 30 + int(min(90, (max_len_row - 220) / 11))
                        wsx.set_row(2 + idx, min(120, max(30, scaled)))
                    else:
                        wsx.set_row(2 + idx, 18)

                # filas prohibidas rojo
                for idx, r in enumerate(ordered_rows):
                    if r.get("_prohibida"):
                        excel_row = 2 + idx
                        for col_idx, col_name in enumerate(df.columns):
                            val = df.iat[idx, col_idx]
                            excel_col = 1 + col_idx

                            if str(col_name) == "registro_ppu":
                                if pd.isna(val):
                                    wsx.write_blank(excel_row, excel_col, None, red_fmt)
                                else:
                                    wsx.write(excel_row, excel_col, val, red_fmt)
                                continue

                            if _looks_like_date_key(str(col_name)):
                                if pd.isna(val):
                                    wsx.write_blank(excel_row, excel_col, None, red_date_fmt)
                                else:
                                    dt = _date_to_datetime(val)
                                    if dt is None:
                                        wsx.write(excel_row, excel_col, str(val), red_fmt)
                                    else:
                                        wsx.write_datetime(excel_row, excel_col, dt, red_date_fmt)
                                continue

                            fmt = red_wrap_fmt if str(col_name) in wrap_cols else red_fmt
                            if pd.isna(val):
                                wsx.write_blank(excel_row, excel_col, None, fmt)
                            else:
                                wsx.write(excel_row, excel_col, val, fmt)

            # ─────────────────────────────────────────────
            # Hoja Métricas (con gráfico)
            # ─────────────────────────────────────────────
            dfm = pd.DataFrame(metrics)
            if years:
                dfm = dfm[["Abogado"] + [str(y) for y in years] + ["Total"]]

            if "Total" in dfm.columns and len(dfm) > 0:
                dfm = dfm.sort_values(by="Total", ascending=False).reset_index(drop=True)

            dfm.to_excel(writer, "Métricas", startrow=1, startcol=1, index=False, header=True)

            ws = writer.sheets["Métricas"]
            last_col = 1 + max(1, dfm.shape[1]) - 1
            ws.merge_range(0, 1, 0, last_col, f"Métricas de {display} al {fecha_cod}", title_fmt)

            nr, nc = len(dfm), len(dfm.columns)
            if nc > 0:
                ws.add_table(
                    1, 1, 1 + nr, 1 + nc - 1,
                    {"columns": [{"header": h} for h in dfm.columns], "style": "Table Style Medium 9"},
                )
                ws.set_column(1, 1 + nc - 1, 14, cell_fmt)
                ws.set_column(1, 1, 18, cell_fmt)
                ws.freeze_panes(2, 0)

                header_row = 1
                data_start_row = 2
                data_end_row = 1 + nr
                abg_col = 1
                total_col = 1 + (nc - 1)

                chart1 = wb.add_chart({"type": "column"})
                chart1.add_series({
                    "name":       ["Métricas", header_row, total_col],
                    "categories": ["Métricas", data_start_row, abg_col, data_end_row, abg_col],
                    "values":     ["Métricas", data_start_row, total_col, data_end_row, total_col],
                    "data_labels": {"value": True},
                })
                chart1.set_title({"name": "Totales por abogado"})
                chart1.set_legend({"none": True})
                chart1.set_y_axis({"major_gridlines": {"visible": True}})
                chart1.set_style(10)
                ws.insert_chart(1, 1 + nc + 2, chart1, {"x_scale": 1.25, "y_scale": 1.25})

                if years:
                    summary_row = 3 + nr
                    ws.write(summary_row, 1, "Año", cell_fmt)
                    ws.write(summary_row, 2, "Total", cell_fmt)

                    totals_by_year = []
                    for y in years:
                        col = str(y)
                        totals_by_year.append(int(dfm[col].sum()) if col in dfm.columns else 0)

                    for i, y in enumerate(years):
                        ws.write(summary_row + 1 + i, 1, str(y), cell_fmt)
                        ws.write(summary_row + 1 + i, 2, totals_by_year[i], cell_fmt)

                    chart2 = wb.add_chart({"type": "line"})
                    chart2.add_series({
                        "name":       "Total por año",
                        "categories": ["Métricas", summary_row + 1, 1, summary_row + len(years), 1],
                        "values":     ["Métricas", summary_row + 1, 2, summary_row + len(years), 2],
                        "marker":     {"type": "circle", "size": 6},
                        "data_labels": {"value": True},
                    })
                    chart2.set_title({"name": "Tendencia (Total por año)"})
                    chart2.set_legend({"none": True})
                    chart2.set_y_axis({"major_gridlines": {"visible": True}})
                    chart2.set_style(10)
                    ws.insert_chart(summary_row, 4, chart2, {"x_scale": 1.15, "y_scale": 1.0})

            # ─────────────────────────────────────────────
            # ✅ NUEVO: CONSOLIDADO (solo si rango activo y NO histórico)
            # ─────────────────────────────────────────────
            if use_date_filter and (not is_historico):
                consolidado_rows = sorted(final, key=lambda r: parse_ppu(r.get("registro_ppu")))
                _write_data_sheet(
                    "CONSOLIDADO",
                    consolidado_rows,
                    f"CONSOLIDADO (from {f_ini_raw} to {f_fin_raw}) - {display} a la fecha de {fecha_cod}",
                )

            # ─────────────────────────────────────────────
            # Hojas por año
            # ─────────────────────────────────────────────
            def tipo_ord(p): return 0 if str(p).upper().startswith("D-") else 1

            def sufijo(p):
                parts = str(p).upper().split("-")
                return parts[3] if len(parts) >= 4 else ""

            for y in years:
                ordered = sorted(
                    data_by_year[y],
                    key=lambda r: (
                        tipo_ord(r.get("registro_ppu")),
                        parse_ppu(r.get("registro_ppu"))[0],
                        sufijo(r.get("registro_ppu")),
                    ),
                )

                _write_data_sheet(
                    str(y),
                    ordered,
                    f"Base de datos del año {y} - {display} a la fecha de {fecha_cod}",
                )

        excel_data = output.getvalue()
        response = make_response(excel_data)
        response.headers.set("Content-Disposition", f'attachment; filename="{filename}"')
        response.headers.set(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        return response

    except Exception as e:
        current_app.logger.error("exportar_excel error: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500

    finally:
        if cursor is not None:
            cursor.close()
        conn.close()




# ---------------------------------------------------------------------
#  /api/historiales
# ---------------------------------------------------------------------

@datapenal_bp.route("/historiales", methods=["POST"])
@login_required
def obtener_historiales():
    data = request.json
    ppus = data.get("registro_ppu", [])
    if not ppus:
        return jsonify({"error": "No se proporcionaron registros PPU"}), 400

    connection = get_db_connection()
    if connection is None:
        return jsonify({"error": "Error al conectar con la base de datos"}), 500

    cursor = None
    try:
        cursor = connection.cursor(dictionary=True)
        format_strings = ",".join(["%s"] * len(ppus))
        sql = f"""
            SELECT registro_ppu, version_id, abogado, denunciado, origen, juzgado,
                   fiscalia, departamento, e_situacional,
                   DATE_FORMAT(fecha_version, '%d-%m-%Y') AS fecha_version,
                   usuario_modificacion, ruta
            FROM datapenal_versioning
            WHERE registro_ppu IN ({format_strings})
            ORDER BY registro_ppu, fecha_version DESC
        """
        cursor.execute(sql, tuple(ppus))
        rows = cursor.fetchall()

        rows_filtrados = [
            row
            for row in rows
            if row.get("ruta")
            and row["ruta"].strip()
            and row["ruta"].strip().upper() != "NULL"
        ]

        historiales = {}
        for row in rows_filtrados:
            ppu = row["registro_ppu"]
            historiales.setdefault(ppu, []).append(row)

        return jsonify({"historiales": historiales}), 200
    except Exception as e:
        return jsonify({"error": f"Error al obtener historiales: {str(e)}"}), 500
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


# ---------------------------------------------------------------------
#  /api/actualizar_caso
# ---------------------------------------------------------------------

@datapenal_bp.route("/actualizar_caso", methods=["POST"])
@login_required
def actualizar_caso():
    data = request.json
    registro_ppu = data.get("registro_ppu")
    updated_data = data.get("data")

    if not registro_ppu or not updated_data:
        return jsonify(
            {"error": "Registro PPU y datos a actualizar son requeridos"}
        ), 400

    user_role = session.get("role")

    if user_role == "admin":
        allowed_fields = [
            "abogado",
            "denunciado",
            "origen",
            "nr de exp completo",
            "delito",
            "departamento",
            "fiscalia",
            "juzgado",
            "informe_juridico",
            "item",
            "e_situacional",
            "etiqueta",
        ]
    elif user_role == "user":
        allowed_fields = ["etiqueta"]
    else:
        return jsonify({"error": "No autorizado"}), 403

    data_to_update = {
        key: value
        for key, value in updated_data.items()
        if key in allowed_fields
    }

    expediente_juzgado = data_to_update.pop("expediente_juzgado", None)
    if expediente_juzgado:
        if not isinstance(expediente_juzgado, dict):
            return jsonify(
                {"error": "El campo 'expediente_juzgado' debe ser un objeto."}
            ), 400

        errores = validate_expediente_juzgado(expediente_juzgado)
        if errores:
            return jsonify({"error": errores}), 400

        expediente_formateado = (
            f"Exp. {expediente_juzgado['campo1']}-"
            f"{expediente_juzgado['campo2']}-"
            f"{expediente_juzgado['campo3']}-"
            f"{expediente_juzgado['campo4']}-"
            f"{expediente_juzgado['campo5']}-"
            f"{expediente_juzgado['campo6']}-"
            f"{expediente_juzgado['campo7']}"
        )
        existing_origen = data_to_update.get("origen", "").strip()
        if existing_origen:
            existing_origen += f", {expediente_formateado}"
        else:
            existing_origen = expediente_formateado
        data_to_update["origen"] = existing_origen
    else:
        if "origen" in data_to_update and data_to_update["origen"]:
            if data_to_update["origen"][0].isdigit() and not data_to_update[
                "origen"
            ].startswith("CASO "):
                data_to_update["origen"] = "CASO " + data_to_update["origen"]

    data_to_update["last_modified"] = datetime.now()

    connection = get_db_connection()
    if connection is None:
        return jsonify({"error": "Error al conectar con la base de datos"}), 500

    cursor = None
    try:
        cursor = connection.cursor()
        current_user = session.get("username", "sistema")
        cursor.execute("SET @current_user = %s", (current_user,))

        set_clause = ", ".join(f"`{key}` = %s" for key in data_to_update.keys())
        values = tuple(data_to_update.values()) + (registro_ppu,)

        query_sql = f"UPDATE datapenal SET {set_clause} WHERE registro_ppu = %s"
        cursor.execute(query_sql, values)
        connection.commit()
        return jsonify({"message": "Caso actualizado exitosamente"}), 200
    except Exception as e:
        current_app.logger.error("Error al actualizar caso: %s", e, exc_info=True)
        return jsonify({"error": "Error al actualizar caso"}), 500
    finally:
        if cursor is not None:
            cursor.close()
        connection.close()
