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
