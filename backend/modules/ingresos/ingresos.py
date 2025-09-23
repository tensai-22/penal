import logging
import os
import re
import hashlib
from datetime import datetime
from uuid import uuid4

from flask import Blueprint, request, jsonify, current_app
from werkzeug.utils import secure_filename
import mysql.connector

from backend.core import (
    get_db_connection, login_required, role_required,
    allowed_file, normalize_text, validate_expediente_juzgado
)

ingresos_bp = Blueprint("ingresos", __name__)
logger = logging.getLogger(__name__)






@ingresos_bp.route('/generar_registro', methods=['POST'])
@login_required
@role_required(['admin'])
def generar_registro():
    data = request.json
    tipo = data.get('tipo')
    year = data.get('year')
    caso_especial = data.get('caso_especial', False)

    if not tipo or not year:
        return jsonify({"error": "Tipo y año son requeridos"}), 400

    if caso_especial:
        numero = data.get('numero')
        sufijo = data.get('sufijo', '')
        if not numero:
            return jsonify({"error": "Número es requerido para casos especiales"}), 400
        if tipo == 'LEGAJO':
            if int(year) >= 2023:
                prefix = 'L. '
            else:
                prefix = 'LEG-'
            registro_ppu = f"{prefix}{numero}-{year}"
        elif tipo == 'DENUNCIA':
            registro_ppu = f"D-{numero}-{year}"
        else:
            return jsonify({"error": "Tipo inválido"}), 400
        if sufijo:
            registro_ppu += f"-{sufijo}"
        return jsonify({"registro_ppu": registro_ppu})

    else:
        connection = get_db_connection()
        if connection is None:
            return jsonify({"error": "Error al conectar con la base de datos"}), 500

        try:
            cursor = connection.cursor(dictionary=True)

            if tipo == 'LEGAJO':
                if int(year) >= 2023:
                    prefix = 'L. '
                    regex_pattern = r'^{}0*\d+-{}(?:-[A-Z]+)?$'.format(re.escape(prefix), year)
                else:
                    prefix = 'LEG-'
                    regex_pattern = r'^{}0*\d+-{}(?:-[A-Z]+)?$'.format(re.escape(prefix), year)
            elif tipo == 'DENUNCIA':
                prefix = 'D-'
                regex_pattern = r'^D-0*\d+-{}(?:-[A-Z]+)?$'.format(year)
            else:
                return jsonify({"error": "Tipo inválido"}), 400

            cursor.execute("""
                SELECT registro_ppu FROM datapenal
                WHERE registro_ppu REGEXP %s
            """, (regex_pattern,))
            registros = cursor.fetchall()

            numeros = []
            for reg in registros:
                registro_ppu = reg['registro_ppu']
                if tipo == 'LEGAJO':
                    if int(year) >= 2023:
                        match = re.match(r'^{}0*(\d+)-{}'.format(re.escape(prefix), year), registro_ppu)
                    else:
                        match = re.match(r'^{}0*(\d+)-{}'.format(re.escape(prefix), year), registro_ppu)
                else:
                    match = re.match(r'^D-0*(\d+)-{}'.format(year), registro_ppu)
                if match:
                    numero = int(match.group(1))
                    numeros.append(numero)

            if int(year) >= 2023:
                if numeros:
                    numeros.sort()
                    for i in range(1, len(numeros)):
                        if numeros[i] > numeros[i-1] + 1:
                            next_num = numeros[i-1] + 1
                            break
                    else:
                        next_num = max(numeros) + 1
                else:
                    next_num = 1
            else:
                if numeros:
                    next_num = max(numeros) + 1
                else:
                    next_num = 1

            max_length = len(str(next_num))
            registro_ppu = '{}{num:0{width}d}-{year}'.format(prefix, num=next_num, width=max_length, year=year)
            return jsonify({"registro_ppu": registro_ppu})

        except Exception as e:
            print(f"Error al generar registro: {e}")
            return jsonify({"error": f"Error al generar registro: {e}"}), 500
        finally:
            cursor.close()
            connection.close()
# —— patrones válidos de expediente judicial ——
PATTERNS_ORIGEN = [
    re.compile(r'\d{5}-\d{4}-\d{1,2}-\d{4}[A-Z-]*-[A-Z]{2}-[A-Z]{2}-\d{1,2}', re.I),
    re.compile(r'\d{5}-\d{4}-\d{1,2}-[A-Z\d-]+-[A-Z]{2}-[A-Z]{2}-\d{1,2}',    re.I),
]

# —— patrón flexible para ‘nr de exp completo’ ——
PATRON_NR_COMPLETO = re.compile(
    r'\b\d{6,10}\s*-\s*\d{4}\s*-\s*\d{1,4}(?:\s*-\s*\d+)?\b'
)

def extraer_exps(texto: str) -> set[str]:
    """Devuelve códigos de expediente judicial normalizados."""
    if not texto:
        return set()
    limpio = texto.upper().replace('EXP.', '').replace('EXP', '')
    resultados = set()
    for pat in PATTERNS_ORIGEN:
        resultados.update(pat.findall(limpio))
    return {r.strip().upper() for r in resultados}

def extraer_nr_completo(texto: str) -> set[str]:
    """Devuelve valores de ‘nr de exp completo’ según patrón flexible."""
    if not texto:
        return set()
    fragmentos = re.split(r'[;,]', texto.upper())
    resultados = set()
    for frag in fragmentos:
        m = PATRON_NR_COMPLETO.search(frag)
        if m:
            valor = re.sub(r'\s*-\s*', '-', m.group(0))
            resultados.add(valor)
    return resultados





@ingresos_bp.route('/agregar', methods=['POST'])
@login_required
@role_required(['admin'])
def agregar_caso():
    data               = request.json or {}
    expediente_juzgado = data.pop('expediente_juzgado', None)
    tipo_ingreso       = data.pop('tipo_ingreso', '').strip().upper()

    # ———► Aquí capturamos el registro_ppu que viene en el payload
    registro_ppu = (data.get('registro_ppu') or '').strip()
    if not registro_ppu:
        return jsonify(error="Falta el campo 'registro_ppu' en el payload"), 400
    # Lo añadimos a data para que se inserte en la tabla
    data['registro_ppu'] = registro_ppu

    # obtención del campo exacto
    raw_nr             = data.get('nr de exp completo') or data.get('nr_de_exp_completo') or ''
    nr_de_exp_completo = raw_nr.strip().upper()
    origen_bruto       = (data.get('origen') or '').strip()

    # 0️⃣ formato de origen
    if expediente_juzgado:
        if not isinstance(expediente_juzgado, dict):
            return jsonify(error="El campo 'expediente_juzgado' debe ser un objeto."), 400
        err = validate_expediente_juzgado(expediente_juzgado)
        if err:
            return jsonify(error=err), 400
        # Construimos la parte numérica en mayúsculas,
        # pero dejamos el prefijo con la capitalización correcta.
        body = (
            f"{expediente_juzgado['campo1']}-"
            f"{expediente_juzgado['campo2']}-"
            f"{expediente_juzgado['campo3']}-"
            f"{expediente_juzgado['campo4']}-"
            f"{expediente_juzgado['campo5']}-"
            f"{expediente_juzgado['campo6']}-"
            f"{expediente_juzgado['campo7']}"
        ).upper()

        exp_fmt = f"Exp. {body}"

        origen_final = f"{exp_fmt}, {origen_bruto}" if origen_bruto else exp_fmt
    else:
        origen_final = origen_bruto.upper()
    data['origen'] = origen_final

    conn = get_db_connection()
    if conn is None:
        logger.error("Error al conectar con la base de datos")
        return jsonify(error="Error al conectar con la base de datos"), 500

    try:
        cur = conn.cursor()

        # 1️⃣ duplicados en ‘nr de exp completo’
        if nr_de_exp_completo:
            nuevos_nr = extraer_nr_completo(nr_de_exp_completo)
            logger.info(f"nr_de_exp_completo recibido → {nuevos_nr}")
            cur.execute("SELECT `nr de exp completo`, registro_ppu FROM datapenal")
            for registro_bd, ppu_bd in cur.fetchall():
                dup = nuevos_nr & extraer_nr_completo(registro_bd or '')
                if dup:
                    etiqueta = ', '.join(sorted(dup))
                    logger.warning(f"[dup nr_exp] {etiqueta} en PPU {ppu_bd}")
                    return jsonify(
                        error=(
                            f"El número de expediente '{etiqueta}' "
                            f"ya está registrado en el PPU '{ppu_bd}'."
                        )
                    ), 400

        # 2️⃣ duplicados en ‘origen’
        nuevos_exps = extraer_exps(origen_final) if origen_final else set()
        if nuevos_exps:
            logger.info(f"Expedientes detectados en origen → {nuevos_exps}")
            cur.execute("SELECT origen, registro_ppu FROM datapenal")
            for origen_bd, ppu_bd in cur.fetchall():
                dup = nuevos_exps & extraer_exps(origen_bd or '')
                if dup:
                    etiqueta = ', '.join(sorted(dup))
                    logger.warning(f"[dup origen] {etiqueta} en PPU {ppu_bd}")
                    return jsonify(
                        error=(
                            f"El expediente '{etiqueta}' ya está registrado "
                            f"en el campo 'origen' del PPU '{ppu_bd}'."
                        )
                    ), 400

        # 3️⃣ metadatos de ingreso
        data['fecha_ingreso'] = datetime.now().date()
        if tipo_ingreso == 'INGRESO NUEVO':
            data['e_situacional'] = 'INGRESO NUEVO'
            data['etiqueta']      = 'EN GIRO'
        elif tipo_ingreso == 'CONSULTA':
            data['e_situacional'] = 'CONSULTA'
            anio = datetime.now().year
            cur.execute(
                "SELECT etiqueta FROM datapenal WHERE etiqueta LIKE %s",
                (f"CONSULTA-%-{anio}",)
            )
            usados = {
                int(e.split('-')[1])
                for (e,) in cur.fetchall()
                if e and e.startswith('CONSULTA-') and e.endswith(str(anio))
            }
            for n in range(1, 1000):
                if n not in usados:
                    data['etiqueta'] = f"CONSULTA-{n:03d}-{anio}"
                    break
            else:
                return jsonify(error="Límite de etiquetas CONSULTA alcanzado para este año."), 400

        # 4️⃣ inserción incluyendo el registro_ppu recibido
        cols         = ', '.join(f'`{k}`' for k in data.keys())
        placeholders = ', '.join('%s' for _ in data.values())
        vals         = tuple(data.values())
        sql          = f"INSERT INTO datapenal ({cols}) VALUES ({placeholders})"

        logger.info(f"Insertando nuevo caso con PPU {registro_ppu}: {data}")
        cur.execute(sql, vals)
        conn.commit()

        # — Respondemos sin tocar el registro_ppu
        logger.info(f"Caso agregado exitosamente con PPU {registro_ppu}")
        return jsonify(
            message="Caso agregado exitosamente",
            registro_ppu=registro_ppu
        ), 200

    except Exception as e:
        logger.exception(f"Error al agregar caso: {e}")
        return jsonify(error="Error al agregar caso"), 500

    finally:
        cur.close()
        conn.close()




@ingresos_bp.route('/eliminar', methods=['POST'])
@login_required
@role_required(['admin'])
def eliminar_caso():
    data = request.json
    registro_ppu = data.get('registro_ppu')

    if not registro_ppu:
        return jsonify({"error": "Registro PPU es requerido"}), 400

    connection = get_db_connection()
    if connection is None:
        return jsonify({"error": "Error al conectar con la base de datos"}), 500

    try:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM datapenal WHERE registro_ppu = %s", (registro_ppu,))
        connection.commit()
        return jsonify({"message": "Caso eliminado exitosamente"}), 200
    except Exception as e:
        print(f"Error al eliminar caso: {e}")
        return jsonify({"error": "Error al eliminar caso"}), 500
    finally:
        cursor.close()
        connection.close()





######################################
#### SUGERIR INFO EN INGRESOS NUEVOS
######################################






@ingresos_bp.route('/upload_and_suggest', methods=['POST'])
@login_required
@role_required(['admin'])
def upload_and_suggest():
    if 'file' not in request.files:
        return jsonify(error="No se encontró el archivo"), 400

    pdf = request.files['file']
    if pdf.filename == '':
        return jsonify(error="No se seleccionó ningún archivo"), 400
    if not allowed_file(pdf.filename):
        return jsonify(error="Archivo no permitido"), 400

    # Nombre original y extensión
    original = secure_filename(pdf.filename)
    ext = original.rsplit('.', 1)[1] if '.' in original else ''
    # Nombre único para guardar y luego pasar al frontend
    unique_name = f"{uuid4().hex}.{ext}"

    # Guardar el PDF con nombre único
    os.makedirs(current_app.config['UPLOAD_FOLDER'], exist_ok=True)
    temp_path = os.path.join(current_app.config['UPLOAD_FOLDER'], unique_name)

    pdf.save(temp_path)

    # Calcular SHA-256
    sha256 = hashlib.sha256()
    with open(temp_path, 'rb') as f:
        for chunk in iter(lambda: f.read(4096), b''):
            sha256.update(chunk)
    hash_sha = sha256.hexdigest()

    # Buscar sugerencia de juzgado
    suggested = ""
    try:
        cnx = mysql.connector.connect(
            host="localhost",
            database="monitoreo_descargas_sinoe",
            user="root",
            password="Manuel22",
            charset='utf8mb4'
        )
        cur = cnx.cursor()
        cur.execute(
            "SELECT juzgado_incompleto FROM conteo_exp WHERE codigo_unico=%s LIMIT 1",
            (hash_sha,)
        )
        row = cur.fetchone()
        suggested = row[0] if row and row[0] else ""
    except Exception:
        suggested = ""
    finally:
        if cur: cur.close()
        if cnx: cnx.close()

    return jsonify(
        originalName=original,
        fileName=unique_name,
        hash_sha=hash_sha,
        suggested_juzgado=suggested
    ), 200


######################################
#### SUGERIR INFO EN INGRESOS NUEVOS
######################################





# BUSQUEDA FISCALIAS PARA INGRESAR LEGAJOS Y DENUNCIAS NUEVAS:
@ingresos_bp.route('/get_fiscalias', methods=['GET'])
@login_required
def get_fiscalias():
    query = request.args.get('query', '').strip()

    if not query:
        return jsonify({"data": []})

    required_keywords = ['fcp', 'penal', 'trata de personas', 'corrupcion', 'crimen', 'mixta', 'drogas', 'sjl']

    query_normalized = normalize_text(query)
    query_terms = query_normalized.split()

    connection = get_db_connection()
    if connection is None:
        return jsonify({"error": "Error al conectar con la base de datos"}), 500

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT fiscalia, nr_de_exp_completo, departamento FROM dependencias_fiscales_mpfn")
        fiscalias = cursor.fetchall()

        results = []
        for fiscalia in fiscalias:
            fiscalia_name_normalized = normalize_text(fiscalia['fiscalia'])
            if all(term in fiscalia_name_normalized for term in query_terms):
                if any(keyword in fiscalia_name_normalized for keyword in required_keywords):
                    results.append(fiscalia)

        return jsonify({"data": results})

    except Exception as e:
        print(f"Error al obtener fiscalias: {e}")
        return jsonify({"error": f"Error al obtener fiscalias: {e}"}), 500
    finally:
        cursor.close()
        connection.close()