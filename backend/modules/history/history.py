# C:\...\backend\modules\history\history.py

import os
from datetime import date, datetime

from flask import Blueprint, jsonify, request, current_app, send_file, session

from backend.core import (
    login_required,
    get_db_connection,
)

history_bp = Blueprint("history_bp", __name__)

# -------------------------HISTORIAL BOTON--------------- #

# columnas que el grid envía (snakeCase)  ⇢  columna real en BD
# columnas que existen en AMBAS tablas (datapenal y datapenal_versioning)
COLUMNS_MAP = {
    "registro_ppu":           "`registro_ppu`",
    "abogado":                "`abogado`",
    "denunciado":             "`denunciado`",
    "origen":                 "`origen`",
    "nr_de_exp_completo":     "`nr de exp completo`",
    "fiscaliaOrigen":         "`fiscalia`",
    "fiscalia":               "`fiscalia`",
    "departamento":           "`departamento`",
    "juzgado":                "`juzgado`",
    "delito":                 "`delito`",
    "e_situacional":          "`e_situacional`",
    "informe_juridico":       "`informe_juridico`",
    "item":                   "`item`",
    "fecha_ingreso":          "`fecha_ingreso`",
    "etiqueta":               "`etiqueta`",
    "fecha_de_archivo":       "`fecha_de_archivo`",
    "razon_archivo":          "`razon_archivo`",
}

# columnas que existen SOLO en datapenal_versioning
VERSION_ONLY_COLUMNS = {
    "ruta": "`ruta`",
}


def _norm(v):
    """Quita mayúsc/minúsc, tildes y espacios para comparar."""
    import unidecode, re
    if v is None:
        return ""
    v = str(v).strip().lower()
    v = unidecode.unidecode(v)
    v = re.sub(r"\s+", " ", v)
    return v


# 1) ¿QUÉ CAMPOS CAMBIARON? ──────────────────────────────────
@history_bp.route("/busqueda_rapida_history_available", methods=["GET"])
@login_required
def history_available_penal():
    current_app.logger.debug(">> /history_available – inicio")
    ppu = request.args.get("ppu", "").strip()
    current_app.logger.debug("   parámetros → ppu='%s'", ppu)

    if not ppu:
        current_app.logger.warning("   ppu vacío; 400")
        return jsonify(success=False, fields=[]), 400

    conn = get_db_connection()
    if conn is None:
        current_app.logger.error("   conexión BD fallida; 500")
        return jsonify(success=False, fields=[]), 500

    cur = conn.cursor(dictionary=True)
    try:
        cols_versions = ",\n       ".join(
            [f"{col} AS {snake}" for snake, col in COLUMNS_MAP.items()] +
            [f"{col} AS {snake}" for snake, col in VERSION_ONLY_COLUMNS.items()]
        )

        sql_versions = f"""
            SELECT version_id,
                   {cols_versions}
              FROM datapenal_versioning
             WHERE registro_ppu = %s
             ORDER BY version_id
        """

        current_app.logger.debug("   SQL versiones:\n%s", sql_versions)
        cur.execute(sql_versions, (ppu,))
        versions = cur.fetchall()
        current_app.logger.debug("   versiones encontradas: %d", len(versions))

        if not versions:
            return jsonify(success=True, fields=[]), 200

        sql_current = f"""
            SELECT {', '.join(f"{col} AS {snake}"
                              for snake, col in COLUMNS_MAP.items())}
              FROM datapenal
             WHERE registro_ppu = %s
        """
        cur.execute(sql_current, (ppu,))
        current = cur.fetchone() or {}
        current_app.logger.debug("   fila actual obtenida")

        changed = []
        for snake in COLUMNS_MAP:
            cur_norm = _norm(current.get(snake))
            hist_norms = [_norm(v.get(snake)) for v in versions if v.get(snake) not in (None, "")]
            if any(h != cur_norm for h in hist_norms):
                changed.append(snake)

        current_app.logger.debug("   campos cambiados: %s", changed)
        return jsonify(success=True, fields=changed), 200

    except Exception:
        import traceback
        traceback.print_exc()
        current_app.logger.exception("   ERROR en /history_available")
        return jsonify(success=False, fields=[]), 500

    finally:
        try:
            cur.close()
        finally:
            conn.close()
        current_app.logger.debug("<< /history_available – fin")


# 1-bis) ¿QUÉ CAMPOS CAMBIARON? (varios PPU) ────────────────────────────
@history_bp.route("/busqueda_rapida_history_available_bulk", methods=["POST"])
@login_required
def history_available_bulk_penal():
    current_app.logger.debug(">> /history_available_bulk – inicio")

    ppus = request.get_json(silent=True) or []
    if not isinstance(ppus, list) or not ppus:
        current_app.logger.warning("   payload vacío o no-lista; 400")
        return jsonify({}), 400

    ppus = sorted({str(p).strip() for p in ppus if str(p).strip()})
    placeholders = ",".join(["%s"] * len(ppus))
    current_app.logger.debug("   ppus recibidos: %s", ppus)

    conn = get_db_connection()
    if conn is None:
        current_app.logger.error("   conexión BD fallida; 500")
        return jsonify({}), 500

    cur = conn.cursor(dictionary=True)
    try:
        cols_versions = ",\n       ".join(
            [f"{col} AS {snake}" for snake, col in COLUMNS_MAP.items()] +
            [f"{col} AS {snake}" for snake, col in VERSION_ONLY_COLUMNS.items()]
        )

        sql_versions = f"""
            SELECT registro_ppu,
                   version_id,
                   {cols_versions}
              FROM datapenal_versioning
             WHERE registro_ppu IN ({placeholders})
             ORDER BY registro_ppu, version_id
        """

        sql_current = f"""
            SELECT registro_ppu,
                   {', '.join(f"{col} AS {snake}" for snake, col in COLUMNS_MAP.items())}
              FROM datapenal
             WHERE registro_ppu IN ({placeholders})
        """

        current_app.logger.debug("   SQL versiones bulk:\n%s", sql_versions)
        cur.execute(sql_versions, ppus)
        all_versions = cur.fetchall()

        current_app.logger.debug("   SQL current bulk:\n%s", sql_current)
        cur.execute(sql_current, ppus)
        current_rows = cur.fetchall()

        current_map = {r["registro_ppu"]: r for r in current_rows}
        versions_map = {}
        for v in all_versions:
            versions_map.setdefault(v["registro_ppu"], []).append(v)

        result = {}
        for ppu in ppus:
            cur_row = current_map.get(ppu, {})
            versions = versions_map.get(ppu, [])

            if not versions:
                result[ppu] = []
                continue

            changed = []
            for snake in COLUMNS_MAP:
                cur_norm = _norm(cur_row.get(snake))
                hist_norms = [_norm(v.get(snake)) for v in versions if v.get(snake) not in (None, "")]
                if any(h != cur_norm for h in hist_norms):
                    changed.append(snake)

            result[ppu] = changed

        current_app.logger.debug("   resultado bulk listo")
        return jsonify(result), 200

    except Exception:
        import traceback
        traceback.print_exc()
        current_app.logger.exception("   ERROR en /history_available_bulk")
        return jsonify({}), 500

    finally:
        try:
            cur.close()
        finally:
            conn.close()
        current_app.logger.debug("<< /history_available_bulk – fin")


# 2) DETALLE DE UN CAMPO ─────────────────────────────────────
@history_bp.route("/busqueda_rapida_history", methods=["GET"])
@login_required
def busqueda_rapida_history_penal():
    current_app.logger.debug(">> /history_detail – inicio")
    ppu = request.args.get("ppu", "").strip()
    field = request.args.get("field", "").strip()
    current_app.logger.debug("   parámetros → ppu='%s', field='%s'", ppu, field)

    if not ppu or not field:
        current_app.logger.warning("   ppu o field faltantes; 400")
        return jsonify(success=False, message="ppu y field son obligatorios"), 400

    real_col = COLUMNS_MAP.get(field)
    if not real_col:
        current_app.logger.warning("   field desconocido: %s", field)
        return jsonify(success=False, message="Campo desconocido"), 400

    conn = get_db_connection()
    if conn is None:
        current_app.logger.error("   conexión BD fallida; 500")
        return jsonify(success=False, data=[]), 500

    cur = conn.cursor(dictionary=True)
    try:
        sql_current = f"""
            SELECT {real_col} AS cur_value
              FROM datapenal
             WHERE registro_ppu = %s
        """
        cur.execute(sql_current, (ppu,))
        cur_val = (cur.fetchone() or {}).get("cur_value")
        current_app.logger.debug("   valor actual = %s", cur_val)

        if field == "e_situacional":
            sql_versions = f"""
                SELECT version_id,
                       {real_col} AS old_value,
                       fecha_version,
                       usuario_modificacion,
                       `ruta` AS ruta
                  FROM datapenal_versioning
                 WHERE registro_ppu = %s
                   AND {real_col} IS NOT NULL
                   AND CAST({real_col} AS CHAR) <> ''
                 ORDER BY version_id
            """
        else:
            sql_versions = f"""
                SELECT version_id,
                       {real_col} AS old_value,
                       fecha_version,
                       usuario_modificacion
                  FROM datapenal_versioning
                 WHERE registro_ppu = %s
                   AND {real_col} IS NOT NULL
                   AND CAST({real_col} AS CHAR) <> ''
                 ORDER BY version_id
            """

        cur.execute(sql_versions, (ppu,))
        versions = cur.fetchall()
        current_app.logger.debug("   versiones encontradas: %d", len(versions))

        cur_norm = _norm(cur_val)

        if field == "e_situacional":
            different = [v for v in versions if _norm(v.get("old_value")) != cur_norm]
            same_list = [dict(v) for v in reversed(versions) if _norm(v.get("old_value")) == cur_norm]
            chosen_same = next((v for v in same_list if v.get("ruta")), None) or (same_list[0] if same_list else None)

            current_row = {
                "version_id": 0,
                "old_value": cur_val,
                "fecha_version": None,
                "usuario_modificacion": "(actual)",
            }

            rows = []
            if chosen_same:
                chosen_same["usuario_modificacion"] = "(actual)"
                rows.append(chosen_same)
            else:
                rows.append(current_row)

            rows.extend(different)
            filtered = rows

        else:
            different = [v for v in versions if _norm(v.get("old_value")) != cur_norm]
            if not different:
                return jsonify(success=True, data=[]), 200

            current_row = {
                "version_id": 0,
                "old_value": cur_val,
                "fecha_version": None,
                "usuario_modificacion": "(actual)",
            }
            filtered = [current_row] + different

        def _parse_dt(s):
            try:
                if isinstance(s, datetime):
                    return s
                if not s:
                    return None
                try:
                    return datetime.strptime(str(s), "%Y-%m-%d %H:%M:%S")
                except ValueError:
                    try:
                        return datetime.strptime(str(s), "%d-%m-%Y %H:%M:%S")
                    except ValueError:
                        return None
            except Exception:
                return None

        if field == "e_situacional":
            by_val = {}
            for v in filtered:
                ov_norm = _norm(v.get("old_value"))
                prev = by_val.get(ov_norm)
                if prev is None:
                    by_val[ov_norm] = v
                    continue

                prev_has = bool(prev.get("ruta"))
                v_has = bool(v.get("ruta"))

                if v_has and not prev_has:
                    by_val[ov_norm] = v
                    continue
                if prev_has and not v_has:
                    continue

                prev_dt = _parse_dt(prev.get("fecha_version"))
                v_dt = _parse_dt(v.get("fecha_version"))
                if prev_dt and v_dt:
                    if v_dt > prev_dt:
                        by_val[ov_norm] = v
                else:
                    try:
                        if int(v.get("version_id") or 0) > int(prev.get("version_id") or 0):
                            by_val[ov_norm] = v
                    except Exception:
                        pass

            unique = list(by_val.values())
        else:
            seen, unique = set(), []
            for v in filtered:
                ov_norm = _norm(v.get("old_value"))
                if ov_norm not in seen:
                    seen.add(ov_norm)
                    unique.append(v)

        result = unique[:1] if len(unique) == 1 else unique
        current_app.logger.debug("   valores devueltos: %d", len(result))

        def _fmt(x):
            if isinstance(x, (datetime, date)):
                return x.strftime("%d-%m-%Y %H:%M:%S")
            return "" if x is None else str(x)

        history = []
        for r in result:
            item = {
                "version_id":           r.get("version_id"),
                "old_value":            _fmt(r.get("old_value")),
                "fecha_version":        _fmt(r.get("fecha_version")),
                "usuario_modificacion": _fmt(r.get("usuario_modificacion")),
            }
            if field == "e_situacional" and "ruta" in r:
                item["ruta"] = r.get("ruta")
            history.append(item)

        return jsonify(success=True, data=history), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        current_app.logger.exception("   ERROR en /history_detail")
        return jsonify(success=False, message=str(e)), 500

    finally:
        try:
            cur.close()
        finally:
            conn.close()
        current_app.logger.debug("<< /history_detail – fin")


# Debe coincidir con la base real donde viven los PDFs
ALLOWED_BASE = r"\\agarciaf\NOTIFICACIONES RENIEC\MESA DE PARTES\PENAL\NOTIFICACIONES"


def _is_safe_path(path, base):
    p = os.path.normpath(path)
    b = os.path.normpath(base)
    try:
        return os.path.commonpath([p, b]) == b
    except Exception:
        return False


@history_bp.route("/open_pdf_by_ruta", methods=["GET"])
@login_required
def open_pdf_by_ruta():
    current_app.logger.info("[open_pdf_by_ruta] Cookie=%r", request.headers.get("Cookie"))
    current_app.logger.info("[open_pdf_by_ruta] session.keys=%s", list(session.keys()))
    ruta = request.args.get("ruta", "").strip()

    if not ruta:
        return jsonify({"error": "Parámetro 'ruta' es obligatorio"}), 400

    if not _is_safe_path(ruta, ALLOWED_BASE):
        return jsonify({"error": "Ruta fuera de la ubicación permitida"}), 403

    if not os.path.exists(ruta):
        current_app.logger.warning("Archivo no encontrado: %s", ruta)
        return jsonify({"error": "El archivo no existe en el servidor"}), 404

    try:
        return send_file(ruta, mimetype="application/pdf", as_attachment=False)
    except Exception:
        current_app.logger.exception("Error en /open_pdf_by_ruta")
        return jsonify({"error": "Error al abrir el PDF"}), 500

# -------------------------FIN-HISTORIAL BOTON--------------- #
